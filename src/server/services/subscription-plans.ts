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
    include: { _count: { select: { subscriptions: true } } },
    orderBy: { name: 'asc' },
  });
}

function toDTO(row: PlanRow): SubscriptionPlanListItem {
  return {
    id: row.id,
    name: row.name,
    depositAmount: row.depositAmount,
    annualFeeAmount: row.annualFeeAmount,
    billingCycle: row.billingCycle,
    depositWaivedByDefault: row.depositWaivedByDefault,
    defaultTrialDays: row.defaultTrialDays,
    notes: row.notes,
    archivedAt: row.archivedAt?.toISOString(),
    createdAt: formatCalendarDate(row.createdAt),
    storeCount: row._count.subscriptions,
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
      _count: { select: { subscriptions: true } },
      subscriptions: {
        include: { plan: true, store: { include: { memberships: { where: { role: 'OWNER' }, include: { user: true }, orderBy: { createdAt: 'asc' } } } } },
      },
    },
  });
  if (!row) return null;
  const stores = row.subscriptions.map(s => ({
    id: s.store.id,
    name: s.store.name,
    ownerName: s.store.memberships[0]?.user.name ?? '—',
    onboardedAt: formatCalendarDate(s.store.onboardedAt),
    depositAmount: effectiveSubscriptionTerms(s).depositAmount,
    status: s.store.status,
  }));
  const lastUsedAt = stores.length ? stores.reduce((latest, s) => s.onboardedAt > latest ? s.onboardedAt : latest, stores[0].onboardedAt) : undefined;
  return { ...toDTO(row), stores, lastUsedAt };
}

// Lightweight lookup for the Archive dialog — which stores are actually on
// this plan, by name and owner, not just a count.
export async function listPlanStores(planId: string): Promise<{ id: string; name: string; ownerName: string }[]> {
  const subscriptions = await prisma.subscription.findMany({
    where: { planId },
    include: { store: { include: { memberships: { where: { role: 'OWNER' }, include: { user: true }, orderBy: { createdAt: 'asc' } } } } },
  });
  return subscriptions.map(s => ({ id: s.store.id, name: s.store.name, ownerName: s.store.memberships[0]?.user.name ?? '—' }));
}

const BILLING_CYCLES = ['ANNUAL', 'HALF_YEARLY', 'QUARTERLY', 'MONTHLY'] as const;

const planSchema = z.object({
  name: z.string().trim().min(1),
  depositAmount: z.number().int().nonnegative(),
  annualFeeAmount: z.number().int().nonnegative(),
  billingCycle: z.enum(BILLING_CYCLES).default('ANNUAL'),
  depositWaivedByDefault: z.boolean().default(false),
  defaultTrialDays: z.number().int().min(0).nullable().optional(),
  notes: z.string().trim().default(''),
});

export async function createPlan(input: PlanInput): Promise<SubscriptionPlanListItem> {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  const data = { ...parsed.data, depositAmount: parsed.data.depositWaivedByDefault ? 0 : parsed.data.depositAmount };
  const row = await prisma.subscriptionPlan.create({ data, include: { _count: { select: { subscriptions: true } } } });
  revalidateTag('plans', { expire: 0 });
  revalidateTag('stores', { expire: 0 });
  return toDTO(row);
}

export async function updatePlan(planId: string, input: PlanInput): Promise<SubscriptionPlanListItem> {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  const data = { ...parsed.data, depositAmount: parsed.data.depositWaivedByDefault ? 0 : parsed.data.depositAmount };
  const existing = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!existing || existing.archivedAt) throw new ValidationError('Plan not found.');
  const row = await prisma.subscriptionPlan.update({ where: { id: planId }, data, include: { _count: { select: { subscriptions: true } } } });
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
      depositAmount: existing.depositWaivedByDefault ? 0 : existing.depositAmount,
      annualFeeAmount: existing.annualFeeAmount,
      depositWaivedByDefault: existing.depositWaivedByDefault,
      defaultTrialDays: existing.defaultTrialDays,
      notes: existing.notes,
    },
    include: { _count: { select: { subscriptions: true } } },
  });
  revalidateTag('plans', { expire: 0 });
  revalidateTag('stores', { expire: 0 });
  return toDTO(row);
}

// Hard delete — only reachable once zero stores reference the plan, so no
// billing history is ever lost. Archiving (above) is the reversible,
// always-safe action; this is the separate, harder-to-reach one.
export async function deletePlan(planId: string): Promise<void> {
  const existing = await prisma.subscriptionPlan.findUnique({ where: { id: planId }, include: { _count: { select: { subscriptions: true } } } });
  if (!existing) throw new ValidationError('Plan not found.');
  if (existing._count.subscriptions > 0) throw new ValidationError('Move every store off this plan before deleting it.');
  await prisma.subscriptionPlan.delete({ where: { id: planId } });
  revalidateTag('plans', { expire: 0 });
  revalidateTag('stores', { expire: 0 });
}

export async function archivePlan(planId: string, reassignToPlanId?: string): Promise<void> {
  const existing = await prisma.subscriptionPlan.findUnique({ where: { id: planId }, include: { _count: { select: { subscriptions: true } } } });
  if (!existing || existing.archivedAt) throw new ValidationError('Plan not found.');

  // Any store still on this plan is either reassigned (reassignToPlanId set)
  // or detached to custom terms (left unset) — both are deliberate choices
  // the caller's UI already forces before calling this, not an omission to
  // block on.
  if (reassignToPlanId) {
    const target = await prisma.subscriptionPlan.findUnique({ where: { id: reassignToPlanId } });
    if (!target || target.archivedAt) throw new ValidationError('Target plan not found.');
  }

  await prisma.$transaction(async tx => {
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
