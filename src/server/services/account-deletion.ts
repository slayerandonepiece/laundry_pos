import 'server-only';
import { prisma } from '@/server/db';
import { AuthError } from '@/server/auth/session';
import { ConflictError } from '@/server/errors';
import type { DeletionChannel, DeletionScope, DeletionStatus, Prisma, Role } from '@/generated/prisma/client';

// Account deletion: request -> grace period -> restore or permanent wipe.
// AccountDeletionRequest rows carry opaque ids and dates only (no FKs, no
// phone/name/email/organization name) so they survive the wipe as proof the
// request was honoured. See .agents/MOBILE-API-CONTRACT.md "Account deletion".

const DEFAULT_GRACE_DAYS = 90;
const DAY_MS = 86_400_000;
// A review-demo organization's pending requests are undone automatically.
export const DEMO_AUTO_RESTORE_MS = 24 * 60 * 60 * 1000;
const WIPE_TX = { timeout: 120_000, maxWait: 10_000 } as const;

export function deletionGraceDays(): number {
  const parsed = Number(process.env.DELETION_GRACE_DAYS);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_GRACE_DAYS;
}

export interface DeletionRequestDTO {
  status: DeletionStatus;
  scope: DeletionScope;
  requestedAt: string;
  scheduledFor: string;
}

type RequestRow = { status: DeletionStatus; scope: DeletionScope; requestedAt: Date; scheduledFor: Date };

const toDTO = (row: RequestRow): DeletionRequestDTO => ({
  status: row.status,
  scope: row.scope,
  requestedAt: row.requestedAt.toISOString(),
  scheduledFor: row.scheduledFor.toISOString(),
});

/**
 * Restores every matching PENDING request (clearing the organization lock for
 * ORGANIZATION scope). The status flip is a guarded update, so it serializes
 * against the wipe job's own guarded claim on the same row.
 */
async function restorePending(where: Prisma.AccountDeletionRequestWhereInput): Promise<number> {
  return prisma.$transaction(async tx => {
    const rows = await tx.accountDeletionRequest.findMany({ where: { ...where, status: 'PENDING' } });
    let restored = 0;
    for (const row of rows) {
      const claimed = await tx.accountDeletionRequest.updateMany({
        where: { id: row.id, status: 'PENDING' },
        data: { status: 'RESTORED', restoredAt: new Date() },
      });
      if (claimed.count !== 1) continue;
      restored += 1;
      if (row.scope === 'ORGANIZATION' && row.organizationId) {
        await tx.store.updateMany({ where: { id: row.organizationId }, data: { deletionScheduledFor: null } });
      }
    }
    return restored;
  });
}

/** Restore a demo organization's requests that have been pending 24h or more. */
async function autoRestoreDueDemoRequests(extra: Prisma.AccountDeletionRequestWhereInput): Promise<number> {
  const demos = await prisma.store.findMany({ where: { isReviewDemo: true }, select: { id: true } });
  if (!demos.length) return 0;
  return restorePending({
    ...extra,
    organizationId: { in: demos.map(demo => demo.id) },
    requestedAt: { lte: new Date(Date.now() - DEMO_AUTO_RESTORE_MS) },
  });
}

/** The caller's own PENDING request, if any. Lazily applies the demo 24h rule. */
export async function getPendingDeletion(userId: string): Promise<DeletionRequestDTO | null> {
  const row = await prisma.accountDeletionRequest.findFirst({
    where: { userId, status: 'PENDING' },
    orderBy: { requestedAt: 'asc' },
  });
  if (!row) return null;
  if (row.organizationId && Date.now() - row.requestedAt.getTime() >= DEMO_AUTO_RESTORE_MS) {
    if (await autoRestoreDueDemoRequests({ userId })) {
      const still = await prisma.accountDeletionRequest.findFirst({
        where: { userId, status: 'PENDING' },
        orderBy: { requestedAt: 'asc' },
      });
      return still ? toDTO(still) : null;
    }
  }
  return toDTO(row);
}

/**
 * True while an ORGANIZATION deletion is pending for this organization. A
 * demo organization past its 24h window is restored here and reports false.
 */
export async function isOrganizationDeletionLocked(store: {
  id: string; deletionScheduledFor: Date | null; isReviewDemo: boolean;
}): Promise<boolean> {
  if (!store.deletionScheduledFor) return false;
  if (!store.isReviewDemo) return true;
  await autoRestoreDueDemoRequests({ organizationId: store.id });
  const fresh = await prisma.store.findUnique({ where: { id: store.id }, select: { deletionScheduledFor: true } });
  return Boolean(fresh?.deletionScheduledFor);
}

/** True while this user has their own SELF request pending (employee deletion). */
export async function hasPendingSelfDeletion(userId: string): Promise<boolean> {
  return Boolean(await prisma.accountDeletionRequest.findFirst({
    where: { userId, status: 'PENDING', scope: 'SELF' },
    select: { id: true },
  }));
}

export async function requestAccountDeletion(input: {
  userId: string;
  storeId: string;
  via: DeletionChannel;
}): Promise<DeletionRequestDTO> {
  const membership = await prisma.storeMembership.findUnique({
    where: { userId_storeId: { userId: input.userId, storeId: input.storeId } },
  });
  if (!membership || !membership.active) throw new AuthError('FORBIDDEN');

  const role: Role = membership.role;
  const scope: DeletionScope = role === 'OWNER' ? 'ORGANIZATION' : 'SELF';
  if (scope === 'SELF') {
    const ownsAnything = await prisma.storeMembership.findFirst({
      where: { userId: input.userId, role: 'OWNER' },
      select: { id: true },
    });
    if (ownsAnything) throw new ConflictError('Delete your store first.');
  }

  const result = await prisma.$transaction(async tx => {
    // One request per (user, organization) even under concurrent calls.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`account-deletion:${input.userId}:${input.storeId}`}))`;
    const existing = await tx.accountDeletionRequest.findFirst({
      where: { userId: input.userId, organizationId: input.storeId, status: 'PENDING' },
    });
    if (existing) return existing;
    const scheduledFor = new Date(Date.now() + deletionGraceDays() * DAY_MS);
    const created = await tx.accountDeletionRequest.create({
      data: {
        userId: input.userId,
        organizationId: input.storeId,
        role,
        scope,
        scheduledFor,
        requestedVia: input.via,
      },
    });
    if (scope === 'ORGANIZATION') {
      await tx.store.update({ where: { id: input.storeId }, data: { deletionScheduledFor: scheduledFor } });
    }
    return created;
  });

  // They may sign in again (to restore); every existing session ends now.
  await prisma.session.deleteMany({ where: { userId: input.userId } });
  return toDTO(result);
}

/** The caller restores their own pending request(s). */
export async function restoreAccountDeletion(userId: string): Promise<void> {
  const restored = await restorePending({ userId });
  if (!restored) throw new ConflictError('No deletion request is pending for this account.');
}

// --- Super Admin ---------------------------------------------------------

export interface DeletionRequestListItem {
  id: string;
  status: DeletionStatus;
  scope: DeletionScope;
  role: Role;
  requestedAt: string;
  scheduledFor: string;
  restoredAt: string | null;
  completedAt: string | null;
  requestedVia: DeletionChannel;
  daysLeft: number | null;
  /** Null once the organization no longer exists. */
  organizationName: string | null;
  isReviewDemo: boolean;
}

export async function listDeletionRequests(): Promise<DeletionRequestListItem[]> {
  const rows = await prisma.accountDeletionRequest.findMany({ orderBy: { requestedAt: 'desc' }, take: 500 });
  const ids = [...new Set(rows.flatMap(row => (row.organizationId ? [row.organizationId] : [])))];
  const stores = ids.length
    ? await prisma.store.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, isReviewDemo: true } })
    : [];
  const byId = new Map(stores.map(store => [store.id, store]));
  const now = Date.now();
  return rows.map(row => {
    const store = row.organizationId ? byId.get(row.organizationId) : undefined;
    return {
      id: row.id,
      status: row.status,
      scope: row.scope,
      role: row.role,
      requestedAt: row.requestedAt.toISOString(),
      scheduledFor: row.scheduledFor.toISOString(),
      restoredAt: row.restoredAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      requestedVia: row.requestedVia,
      daysLeft: row.status === 'PENDING' ? Math.max(0, Math.ceil((row.scheduledFor.getTime() - now) / DAY_MS)) : null,
      organizationName: store?.name ?? null,
      isReviewDemo: store?.isReviewDemo ?? false,
    };
  });
}

export function countPendingDeletionRequests(): Promise<number> {
  return prisma.accountDeletionRequest.count({ where: { status: 'PENDING' } });
}

/** Super Admin restores on behalf of the user. */
export async function restoreDeletionRequestById(requestId: string): Promise<void> {
  const restored = await restorePending({ id: requestId });
  if (!restored) throw new ConflictError('That request is no longer pending.');
}

// --- Permanent wipe --------------------------------------------------------

class SkipWipe extends Error {}

export type WipeOutcome = 'completed' | 'skipped_demo' | 'skipped_not_pending' | 'skipped_owner';

export interface WipeCounts {
  organizations: number;
  orders: number;
  users: number;
  billingRecordsArchived: number;
}

const emptyCounts = (): WipeCounts => ({ organizations: 0, orders: 0, users: 0, billingRecordsArchived: 0 });

/**
 * Permanently wipes one request inside a single transaction. The first step is
 * a guarded claim (PENDING -> COMPLETED), so a concurrent restore or a second
 * cron run cannot also act on it; any later failure rolls the claim back and the
 * request stays PENDING, to be retried by the next run.
 *
 * ORGANIZATION: archives billing facts (see BillingRecordArchive), deletes the
 *   organization (cascading orders, order lines, payments, invoices, products,
 *   expenses, outlets, memberships, payment-method settings, summaries), its
 *   audit rows, and every member user left with no membership elsewhere.
 * SELF: deletes that user. Orders they handled stay with the organization;
 *   their status-event actor reference becomes null ("Former staff").
 */
export async function wipeDeletionRequest(requestId: string): Promise<{ outcome: WipeOutcome; counts: WipeCounts }> {
  const counts = emptyCounts();
  try {
    await prisma.$transaction(async tx => {
      const row = await tx.accountDeletionRequest.findUnique({ where: { id: requestId } });
      if (!row || row.status !== 'PENDING') throw new SkipWipe('skipped_not_pending');

      const claimed = await tx.accountDeletionRequest.updateMany({
        where: { id: requestId, status: 'PENDING' },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      if (claimed.count !== 1) throw new SkipWipe('skipped_not_pending');

      const store = row.organizationId
        ? await tx.store.findUnique({ where: { id: row.organizationId }, select: { id: true, isReviewDemo: true } })
        : null;
      if (store?.isReviewDemo) throw new SkipWipe('skipped_demo');

      let deletable: string[];
      if (row.scope === 'ORGANIZATION') {
        const doomed = new Set<string>([row.userId]);
        if (store) {
          counts.organizations = 1;
          const members = await tx.storeMembership.findMany({ where: { storeId: store.id }, select: { userId: true } });
          members.forEach(member => doomed.add(member.userId));
          const invoices = await tx.subscriptionPayment.findMany({ where: { storeId: store.id } });
          const archived = await tx.billingRecordArchive.createMany({
            data: invoices.map(invoice => ({
              organizationId: store.id,
              invoiceSeq: invoice.invoiceSeq,
              type: invoice.type,
              amount: invoice.amount,
              method: invoice.method,
              paidAt: invoice.paidAt,
              coversFrom: invoice.coversFrom,
              coversTo: invoice.coversTo,
            })),
            skipDuplicates: true,
          });
          counts.billingRecordsArchived = archived.count;
          counts.orders = await tx.order.count({ where: { storeId: store.id } });
          // Audit rows hold free-form before/after JSON; they are not billing records.
          await tx.auditLog.deleteMany({ where: { storeId: store.id } });
          await tx.store.delete({ where: { id: store.id } });
        }
        // Memberships went with the organization: only users with nothing left
        // elsewhere, and never a platform admin, are removed.
        const survivors = await tx.user.findMany({
          where: { id: { in: [...doomed] }, isSuperAdmin: false, memberships: { none: {} } },
          select: { id: true },
        });
        deletable = survivors.map(user => user.id);
      } else {
        // Became an owner after requesting: leave it for support.
        const owns = await tx.storeMembership.findFirst({ where: { userId: row.userId, role: 'OWNER' }, select: { id: true } });
        if (owns) throw new SkipWipe('skipped_owner');
        const user = await tx.user.findFirst({ where: { id: row.userId, isSuperAdmin: false }, select: { id: true } });
        deletable = user ? [user.id] : [];
      }

      if (deletable.length) {
        await tx.auditLog.deleteMany({ where: { OR: [{ actorId: { in: deletable } }, { entityId: { in: deletable } }] } });
        const removed = await tx.user.deleteMany({ where: { id: { in: deletable } } });
        counts.users = removed.count;
      }
    }, WIPE_TX);
  } catch (error) {
    if (error instanceof SkipWipe) return { outcome: error.message as WipeOutcome, counts: emptyCounts() };
    throw error;
  }
  return { outcome: 'completed', counts };
}

/** Super Admin "Delete now": wipe a pending request immediately. */
export async function deleteRequestNow(requestId: string): Promise<WipeCounts> {
  const row = await prisma.accountDeletionRequest.findUnique({ where: { id: requestId } });
  if (!row || row.status !== 'PENDING') throw new ConflictError('That request is no longer pending.');
  if (row.organizationId) {
    const store = await prisma.store.findUnique({ where: { id: row.organizationId }, select: { isReviewDemo: true } });
    if (store?.isReviewDemo) throw new ConflictError('The review demo organization is protected and cannot be deleted.');
  }
  const { outcome, counts } = await wipeDeletionRequest(requestId);
  if (outcome !== 'completed') throw new ConflictError('That request could not be deleted. It may have just been restored.');
  console.info('[account-deletion] completed now', counts);
  return counts;
}

export interface DeletionRunSummary {
  completed: number;
  skipped: number;
  failed: number;
  autoRestoredDemo: number;
  counts: WipeCounts;
}

/**
 * Cron entry point: restore stale demo requests, then wipe due requests in
 * batches. Idempotent and resumable — each request is its own transaction and a
 * failure leaves it PENDING for the next run. Logs counts only.
 */
export async function runDueDeletions(options: { batchSize?: number; budgetMs?: number } = {}): Promise<DeletionRunSummary> {
  const batchSize = options.batchSize ?? 25;
  const deadline = Date.now() + (options.budgetMs ?? 45_000);
  const summary: DeletionRunSummary = { completed: 0, skipped: 0, failed: 0, autoRestoredDemo: 0, counts: emptyCounts() };

  summary.autoRestoredDemo = await autoRestoreDueDemoRequests({});

  const demos = await prisma.store.findMany({ where: { isReviewDemo: true }, select: { id: true } });
  const demoIds = demos.map(demo => demo.id);
  const seen: string[] = [];

  while (Date.now() < deadline) {
    const batch = await prisma.accountDeletionRequest.findMany({
      where: {
        status: 'PENDING',
        scheduledFor: { lte: new Date() },
        id: { notIn: seen },
        // Never select a review-demo organization's requests (NULL-safe).
        OR: [{ organizationId: null }, { organizationId: { notIn: demoIds } }],
      },
      orderBy: { scheduledFor: 'asc' },
      take: batchSize,
      select: { id: true },
    });
    if (!batch.length) break;
    for (const { id } of batch) {
      seen.push(id);
      try {
        const { outcome, counts } = await wipeDeletionRequest(id);
        if (outcome === 'completed') {
          summary.completed += 1;
          summary.counts.organizations += counts.organizations;
          summary.counts.orders += counts.orders;
          summary.counts.users += counts.users;
          summary.counts.billingRecordsArchived += counts.billingRecordsArchived;
        } else {
          summary.skipped += 1;
        }
      } catch (error) {
        summary.failed += 1;
        // Ids only; error text may embed row values.
        console.error('[account-deletion] wipe failed', { requestId: id, name: error instanceof Error ? error.name : 'Error' });
      }
    }
  }
  console.info('[account-deletion] run', summary);
  return summary;
}
