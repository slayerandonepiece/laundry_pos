import { effectiveSubscriptionTerms, planDepositAmount } from '@/server/subscription-terms';
import 'server-only';
import { z } from 'zod';
import { unstable_cache, revalidateTag } from 'next/cache';
import { prisma } from '@/server/db';
import { ValidationError } from '@/server/errors';
import { formatCalendarDate, todayIST } from '@/server/dates';
import type { PlanInput, SubscriptionPlanDetail, SubscriptionPlanListItem } from '@/features/super-admin/types';

type PlanRow = Awaited<ReturnType<typeof findAllPlans>>[number];

function findAllPlans() {
  return prisma.subscriptionPlan.findMany({
    include: { _count: { select: { subscriptions: true, outlets: true } } },
    orderBy: { name: 'asc' },
  });
}

function toDTO(row: PlanRow): SubscriptionPlanListItem {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    amount: row.kind === 'ONE_TIME' ? row.depositAmount : row.annualFeeAmount,
    depositAmount: row.depositAmount,
    annualFeeAmount: row.annualFeeAmount,
    billingCycle: row.billingCycle,
    depositWaivedByDefault: row.depositWaivedByDefault,
    defaultTrialDays: row.defaultTrialDays,
    notes: row.notes,
    archivedAt: row.archivedAt?.toISOString(),
    createdAt: formatCalendarDate(row.createdAt),
    storeCount: row.kind === 'ONE_TIME' ? row._count.subscriptions : row._count.outlets,
  };
}

export const listPlans = unstable_cache(
  async (): Promise<SubscriptionPlanListItem[]> => {
    const rows = await findAllPlans();
    return rows.map(toDTO);
  },
  ['list-plans'],
  { revalidate: 60, tags: ['plans'] },
);

export async function getPlan(planId: string): Promise<SubscriptionPlanDetail | null> {
  const row = await prisma.subscriptionPlan.findUnique({
    where: { id: planId },
    include: {
      _count: { select: { subscriptions: true, outlets: true } },
      subscriptions: {
        include: { plan: true, store: { include: { memberships: { where: { role: 'OWNER' }, include: { user: true }, orderBy: { createdAt: 'asc' } } } } },
      },
    },
  });
  if (!row) return null;
  // A recurring plan is attached to outlets, so its organizations are the owners of those outlets.
  const outletOrgs = row.kind === 'RECURRING' ? await prisma.outlet.findMany({
    where: { planId },
    select: { store: { select: { id: true, name: true, onboardedAt: true, status: true, subscription: { include: { plan: true } }, memberships: { where: { role: 'OWNER' }, include: { user: true }, orderBy: { createdAt: 'asc' } } } } },
  }) : [];
  const orgs = [...new Map(outletOrgs.map(o => [o.store.id, o.store])).values()];
  const stores = [...row.subscriptions.map(s => ({
    id: s.store.id,
    name: s.store.name,
    ownerName: s.store.memberships[0]?.user.name ?? '—',
    onboardedAt: formatCalendarDate(s.store.onboardedAt),
    depositAmount: effectiveSubscriptionTerms(s).depositAmount,
    status: s.store.status,
  })), ...orgs.map(store => ({
    id: store.id,
    name: store.name,
    ownerName: store.memberships[0]?.user.name ?? '—',
    onboardedAt: formatCalendarDate(store.onboardedAt),
    depositAmount: effectiveSubscriptionTerms(store.subscription).depositAmount,
    status: store.status,
  }))];
  const lastUsedAt = stores.length ? stores.reduce((latest, s) => s.onboardedAt > latest ? s.onboardedAt : latest, stores[0].onboardedAt) : undefined;
  return { ...toDTO(row), stores, lastUsedAt };
}

// Lightweight lookup for the Archive dialog — which stores are actually on
// this plan, by name and owner, not just a count.
export async function listPlanStores(planId: string): Promise<{ id: string; name: string; ownerName: string }[]> {
  const owner = { memberships: { where: { role: 'OWNER' as const }, include: { user: true }, orderBy: { createdAt: 'asc' as const } } };
  const [subscriptions, outlets] = await Promise.all([
    prisma.subscription.findMany({ where: { planId }, include: { store: { include: owner } } }),
    prisma.outlet.findMany({ where: { planId }, include: { store: { include: owner } } }),
  ]);
  const stores = new Map([...subscriptions.map(s => s.store), ...outlets.map(o => o.store)].map(store => [store.id, store]));
  return [...stores.values()].map(store => ({ id: store.id, name: store.name, ownerName: store.memberships[0]?.user.name ?? '—' }));
}

const BILLING_CYCLES = ['ANNUAL', 'HALF_YEARLY', 'QUARTERLY', 'MONTHLY'] as const;

// A plan is a name, an amount, and whether it is charged once (one time) or every cycle (recurring).
// The older deposit/annual-fee fields are still accepted so existing callers keep working.
const planSchema = z.object({
  name: z.string().trim().min(1, 'Enter a plan name.'),
  kind: z.enum(['ONE_TIME', 'RECURRING']).default('RECURRING'),
  amount: z.number().int().nonnegative().optional(),
  depositAmount: z.number().int().nonnegative().optional(),
  annualFeeAmount: z.number().int().nonnegative().optional(),
  billingCycle: z.enum(BILLING_CYCLES).default('ANNUAL'),
  depositWaivedByDefault: z.boolean().optional(),
  defaultTrialDays: z.number().int().min(0).nullable().optional(),
  notes: z.string().trim().default(''),
});

function planData(parsed: z.infer<typeof planSchema>) {
  const { amount, depositAmount, annualFeeAmount, depositWaivedByDefault, kind, ...rest } = parsed;
  if (amount !== undefined) {
    return { ...rest, kind, depositAmount: kind === 'ONE_TIME' ? amount : 0, annualFeeAmount: kind === 'RECURRING' ? amount : 0, depositWaivedByDefault: false };
  }
  const waived = depositWaivedByDefault ?? false;
  return { ...rest, kind, depositAmount: waived ? 0 : depositAmount ?? 0, annualFeeAmount: annualFeeAmount ?? 0, depositWaivedByDefault: waived };
}

export async function createPlan(input: PlanInput): Promise<SubscriptionPlanListItem> {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  const data = planData(parsed.data);
  const row = await prisma.subscriptionPlan.create({ data, include: { _count: { select: { subscriptions: true, outlets: true } } } });
  revalidateTag('plans', { expire: 0 });
  revalidateTag('stores', { expire: 0 });
  return toDTO(row);
}

export async function updatePlan(planId: string, input: PlanInput): Promise<SubscriptionPlanListItem> {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  const data = planData(parsed.data);
  const existing = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!existing || existing.archivedAt) throw new ValidationError('Plan not found.');
  const row = await prisma.subscriptionPlan.update({ where: { id: planId }, data, include: { _count: { select: { subscriptions: true, outlets: true } } } });
  revalidateTag('plans', { expire: 0 });
  revalidateTag('stores', { expire: 0 });
  return toDTO(row);
}

// A copy with no stores attached and no archive state — a fast starting
// point for "another plan like this one, slightly different terms."
export async function duplicatePlan(planId: string): Promise<SubscriptionPlanListItem> {
  const existing = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!existing) throw new ValidationError('Plan not found.');
  const row = await prisma.subscriptionPlan.create({
    data: {
      name: `${existing.name} (copy)`,
      kind: existing.kind,
      billingCycle: existing.billingCycle,
      depositAmount: existing.depositWaivedByDefault ? 0 : existing.depositAmount,
      annualFeeAmount: existing.annualFeeAmount,
      depositWaivedByDefault: existing.depositWaivedByDefault,
      defaultTrialDays: existing.defaultTrialDays,
      notes: existing.notes,
    },
    include: { _count: { select: { subscriptions: true, outlets: true } } },
  });
  revalidateTag('plans', { expire: 0 });
  revalidateTag('stores', { expire: 0 });
  return toDTO(row);
}

// Hard delete — only reachable once zero stores reference the plan, so no
// billing history is ever lost. Archiving (above) is the reversible,
// always-safe action; this is the separate, harder-to-reach one.
export async function deletePlan(planId: string): Promise<void> {
  const existing = await prisma.subscriptionPlan.findUnique({ where: { id: planId }, include: { _count: { select: { subscriptions: true, outlets: true } } } });
  if (!existing) throw new ValidationError('Plan not found.');
  if (existing._count.subscriptions > 0 || existing._count.outlets > 0) throw new ValidationError('Move every store off this plan before deleting it.');
  await prisma.subscriptionPlan.delete({ where: { id: planId } });
  revalidateTag('plans', { expire: 0 });
  revalidateTag('stores', { expire: 0 });
}

export async function archivePlan(planId: string, reassignToPlanId?: string): Promise<void> {
  const existing = await prisma.subscriptionPlan.findUnique({ where: { id: planId }, include: { _count: { select: { subscriptions: true, outlets: true } } } });
  if (!existing || existing.archivedAt) throw new ValidationError('Plan not found.');

  // Any store still on this plan is either reassigned (reassignToPlanId set)
  // or detached to custom terms (left unset) — both are deliberate choices
  // the caller's UI already forces before calling this, not an omission to
  // block on.
  if (reassignToPlanId) {
    const target = await prisma.subscriptionPlan.findUnique({ where: { id: reassignToPlanId } });
    if (!target || target.archivedAt) throw new ValidationError('Target plan not found.');
    if (target.kind !== existing.kind) throw new ValidationError('Move them to a plan of the same type (one time or recurring).');
  }

  await prisma.$transaction(async tx => {
    if (existing._count.outlets > 0) {
      await tx.outlet.updateMany({ where: { planId }, data: { planId: reassignToPlanId ?? null } });
    }
    if (existing._count.subscriptions > 0) {
      if (!reassignToPlanId) {
        // Detached to custom terms: write down the price they follow today, or they would drop to zero.
        const attached = await tx.subscription.findMany({ where: { planId } });
        for (const sub of attached) {
          const terms = effectiveSubscriptionTerms({ ...sub, plan: existing });
          await tx.subscription.update({ where: { id: sub.id }, data: { depositAmount: terms.depositAmount, annualFeeAmount: terms.annualFeeAmount, planId: null } });
        }
      } else {
        await tx.subscription.updateMany({ where: { planId }, data: { planId: reassignToPlanId } });
      }
    }
    await tx.subscriptionPlan.update({ where: { id: planId }, data: { archivedAt: new Date() } });
  });
  revalidateTag('plans', { expire: 0 });
  revalidateTag('stores', { expire: 0 });
}

const changeStorePlanSchema = z.object({
  planId: z.string().min(1).nullable(),
  depositAmount: z.number().int().nonnegative().optional(),
  annualFeeAmount: z.number().int().nonnegative().optional(),
  discountAmount: z.number().int().nonnegative().optional(),
  reason: z.string().trim().max(500).optional(),
});

export interface ChangeStorePlanInput {
  planId: string | null;
  depositAmount?: number;
  annualFeeAmount?: number;
  discountAmount?: number;
  reason?: string;
}

// paidThroughDate is deliberately left untouched — a plan change applies at
// the next renewal, not retroactively (confirmed product decision, not an
// engineering default). "Effective immediately, with the current term's
// balance recalculated" (as shown in the design canvas) would need real
// proration logic that doesn't exist yet — not built here rather than faked.
export async function changeStorePlan(storeId: string, input: ChangeStorePlanInput): Promise<void> {
  const data = changeStorePlanSchema.parse(input);
  const subscription = await prisma.subscription.findUnique({ where: { storeId } });
  if (!subscription) throw new ValidationError('This store has no subscription yet.');

  let plan = null;
  if (data.planId) {
    plan = await prisma.subscriptionPlan.findUnique({ where: { id: data.planId } });
    if (!plan || plan.archivedAt) throw new ValidationError('Plan not found.');
  }

  const notes = data.reason
    ? `${subscription.notes ? subscription.notes + '\n' : ''}[Plan changed ${todayIST()}] ${data.reason}`
    : subscription.notes;

  // On a plan, an amount is stored only when it differs from the plan's own (a negotiated override);
  // otherwise it stays empty and follows the plan. A deposit that was already paid stays frozen.
  const currentPlan = subscription.planId ? await prisma.subscriptionPlan.findUnique({ where: { id: subscription.planId } }) : null;
  const current = effectiveSubscriptionTerms({ ...subscription, plan: currentPlan });
  const stored = (explicit: number | undefined, fromPlan: number | undefined, existing: number): number | null => {
    if (fromPlan === undefined) return explicit ?? existing; // custom terms: always an explicit number
    return explicit === undefined || explicit === fromPlan ? null : explicit;
  };
  const deposit = subscription.depositPaidAt ? current.depositAmount : stored(data.depositAmount, plan ? planDepositAmount(plan) : undefined, current.depositAmount);
  await prisma.subscription.update({
    where: { storeId },
    data: {
      planId: data.planId,
      depositAmount: deposit,
      annualFeeAmount: stored(data.annualFeeAmount, plan?.annualFeeAmount, current.annualFeeAmount),
      discountAmount: data.discountAmount ?? subscription.discountAmount,
      notes,
    },
  });
  revalidateTag('plans', { expire: 0 });
  revalidateTag('stores', { expire: 0 });
}
