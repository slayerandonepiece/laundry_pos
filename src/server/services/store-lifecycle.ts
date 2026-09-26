import 'server-only';
import { prisma } from '@/server/db';
import { formatCalendarDate, todayIST, addDays } from '@/server/dates';
import { PAYMENT_WARNING_DAYS, TRIAL_WARNING_DAYS } from '@/server/auth/session';

// The Organization Overview/Edit screens (Super Admin v2.0) need a richer,
// real 9-value lifecycle than the list screen's crude PaymentState
// ('active'|'expiring'|'locked'|'unset' — see stores.ts's paymentStateFor).
// This is additive: it reuses the same real thresholds that already gate
// owner/employee access (PAYMENT_WARNING_DAYS/TRIAL_WARNING_DAYS in
// src/server/auth/session.ts) rather than inventing new ones, but is kept in
// its own file so it never has to touch stores.ts's shared toDTO/
// paymentStateFor (used by the already-migrated Organizations list).
//
// There is no persisted "being created" state here — that only exists
// mid-onboarding-wizard, never on a saved Store row.
export type {
  OrgLifecycleState,
  LifecycleDescription,
  OrgLifecycleFacts,
} from '@/features/super-admin/lifecycle';
export { describeLifecycleState } from '@/features/super-admin/lifecycle';
import type { OrgLifecycleState, OrgLifecycleFacts } from '@/features/super-admin/lifecycle';

export interface StoreLifecycleFacts {
  status: 'ACTIVE' | 'LOCKED';
  deletedAt: Date | null;
  paidThroughDate: Date | null;
  trialEndsAt: Date | null;
}

// Precedence: ARCHIVED > LOCKED > TERMS_NOT_SET > TRIAL/TRIAL_ENDING >
// RESTRICTED > SUBSCRIPTION_ENDING > ACTIVE. The trial/payment-lapse branch
// below mirrors getStoreAccessStatus()'s subscriptionState computation in
// session.ts exactly (same real thresholds, same precedence between a live
// trial and a paid term) — the only divergence is that a store with neither
// trialEndsAt nor paidThroughDate set is surfaced here as TERMS_NOT_SET
// (a Super-Admin-only distinction) instead of defaulting to ACTIVE.
export function computeOrgLifecycleState(facts: StoreLifecycleFacts, today: string = todayIST()): OrgLifecycleState {
  if (facts.deletedAt) return 'ARCHIVED';
  if (facts.status === 'LOCKED') return 'LOCKED';

  const paidThroughDate = facts.paidThroughDate ? formatCalendarDate(facts.paidThroughDate) : undefined;
  const trialEndsAt = facts.trialEndsAt ? formatCalendarDate(facts.trialEndsAt) : undefined;

  if (!trialEndsAt && !paidThroughDate) return 'TERMS_NOT_SET';

  if (trialEndsAt) {
    if (today > trialEndsAt) {
      if (!paidThroughDate || today > paidThroughDate) return 'RESTRICTED';
      if (paidThroughDate <= addDays(today, PAYMENT_WARNING_DAYS)) return 'SUBSCRIPTION_ENDING';
      return 'ACTIVE';
    }
    return trialEndsAt <= addDays(today, TRIAL_WARNING_DAYS) ? 'TRIAL_ENDING' : 'TRIAL';
  }

  // paidThroughDate is set, no trialEndsAt.
  if (today > paidThroughDate!) return 'RESTRICTED';
  if (paidThroughDate! <= addDays(today, PAYMENT_WARNING_DAYS)) return 'SUBSCRIPTION_ENDING';
  return 'ACTIVE';
}

// Fetches the raw facts (deletedAt, subscription dates) the Overview/Edit
// screens need for the 9-state lifecycle, without touching stores.ts's
// getStore()/StoreDetail (which don't carry deletedAt or trialEndsAt).
export async function getOrgLifecycleFacts(storeId: string): Promise<OrgLifecycleFacts | null> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      status: true,
      deletedAt: true,
      subscription: { select: { paidThroughDate: true, trialEndsAt: true } },
    },
  });
  if (!store) return null;

  const state = computeOrgLifecycleState({
    status: store.status,
    deletedAt: store.deletedAt,
    paidThroughDate: store.subscription?.paidThroughDate ?? null,
    trialEndsAt: store.subscription?.trialEndsAt ?? null,
  });

  return {
    state,
    paidThroughDate: store.subscription?.paidThroughDate ? formatCalendarDate(store.subscription.paidThroughDate) : undefined,
    trialEndsAt: store.subscription?.trialEndsAt ? formatCalendarDate(store.subscription.trialEndsAt) : undefined,
    archivedAt: store.deletedAt ? formatCalendarDate(store.deletedAt) : undefined,
  };
}

export interface ArchiveEligibility {
  canArchive: boolean;
  activeOutletCount: number;
  openOrderCount: number;
}

// "Blocked" archive state for the Edit screen's danger zone: an organization
// still running active outlets or carrying open (not-yet-delivered) orders
// shouldn't disappear from the directory out from under them. Both counts are
// real, schema-backed signals (Outlet.status, Order.status) — not invented.
export async function getArchiveEligibility(storeId: string): Promise<ArchiveEligibility> {
  const [activeOutletCount, openOrderCount] = await Promise.all([
    prisma.outlet.count({ where: { storeId, status: 'ACTIVE' } }),
    prisma.order.count({ where: { storeId, status: { in: ['PENDING', 'IN_PROGRESS', 'READY'] } } }),
  ]);
  return { canArchive: activeOutletCount === 0 && openOrderCount === 0, activeOutletCount, openOrderCount };
}
