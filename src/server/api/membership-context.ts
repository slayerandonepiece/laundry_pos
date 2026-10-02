import { prisma } from '@/server/db';
import { getStoreAccessStatus, isBillingPending, resolveAllowedOutlets } from '@/server/auth/session';
import { formatCalendarDate, todayIST } from '@/server/dates';

/**
 * The store/outlet context every authenticated client needs.
 *
 * `stores` is the original flat shape kept for existing clients; `organizations`
 * adds the outlet context (allowed outlets and the caller's default) that
 * outlet-scoped requests need in order to send `X-Outlet-Id`. Login, session
 * status and the membership list all return the same thing, so a client can
 * refresh outlet access on a cold start instead of only at sign-in.
 */
export async function buildMembershipContext(userId: string) {
  const memberships = await prisma.storeMembership.findMany({
    where: { userId, active: true },
    include: { store: { select: { id: true, name: true, status: true, deletedAt: true, accessGrantedUntil: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const today = todayIST();

  const rows = await Promise.all(
    memberships.map(async m => {
      const access = await getStoreAccessStatus(userId, m.storeId);
      const { allowedOutlets, defaultOutletId } = await resolveAllowedOutlets(userId, m.storeId, m.role);
      const isLocked = access?.blockedReason === 'store_locked' || m.store.status === 'LOCKED';

      let blockedReason = access?.blockedReason ?? null;
      let subscriptionState = access?.subscriptionState ?? 'ACTIVE';

      if (isBillingPending({
        status: m.store.status, deletedAt: m.store.deletedAt,
        trialEndsAt: access?.trialEndsAt, paidThroughDate: access?.paidThroughDate,
        accessGrantedUntil: m.store.accessGrantedUntil ? formatCalendarDate(m.store.accessGrantedUntil) : undefined,
        today,
      })) {
        blockedReason = 'billing_pending';
        subscriptionState = 'RESTRICTED';
      }

      return {
        storeId: m.storeId,
        storeName: m.store.name,
        role: m.role,
        status: m.store.status,
        isLocked,
        blockedReason,
        paidThroughDate: access?.paidThroughDate ?? null,
        trialEndsAt: access?.trialEndsAt ?? null,
        subscriptionState,
        allowedOutlets,
        defaultOutletId,
      };
    }),
  );

  return {
    stores: rows.map(row => ({
      storeId: row.storeId,
      storeName: row.storeName,
      role: row.role,
      status: row.status,
      isLocked: row.isLocked,
      blockedReason: row.blockedReason,
      paidThroughDate: row.paidThroughDate,
      trialEndsAt: row.trialEndsAt,
      subscriptionState: row.subscriptionState,
      allowedOutlets: row.allowedOutlets,
      defaultOutletId: row.defaultOutletId,
    })),
    organizations: rows.map(row => ({
      id: row.storeId,
      name: row.storeName,
      role: row.role,
      status: row.status,
      isLocked: row.isLocked,
      blockedReason: row.blockedReason,
      paidThroughDate: row.paidThroughDate,
      trialEndsAt: row.trialEndsAt,
      subscriptionState: row.subscriptionState,
      allowedOutlets: row.allowedOutlets,
      defaultOutletId: row.defaultOutletId,
    })),
  };
}
