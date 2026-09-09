'use server';

import type { Role } from '@/generated/prisma/client';
import { prisma } from '@/server/db';
import { verifyPassword } from './password';
import {
  createSession,
  destroySession,
  getSession,
  getStoreAccessStatus,
  resolveStoreSelection,
  setSelectedStore,
  setDashboardAllStores,
  PAYMENT_WARNING_DAYS,
  type AccessDeniedReason,
} from './session';
import { addDays, todayIST } from '@/server/dates';

export interface LoginResult {
  ok: boolean;
  error?: string;
  user?: { id: string; name: string; isSuperAdmin: boolean; storeRole?: Role };
}

export async function loginAction(username: string, password: string): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { username: username.trim().toLowerCase() } });
  if (!user || !user.active) return { ok: false, error: 'Invalid username or password' };

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return { ok: false, error: 'Invalid username or password' };

  await createSession(user.id, user.credentialVersion);

  // Resolve role from the user's active membership(s) — a stale inactive
  // membership at a previous store (see Item 1: an employee can move stores
  // over time on the same login) must not make this ambiguous. An employee
  // is constrained by policy to exactly one active membership, so a single
  // row always resolves unambiguously; more than one active membership is
  // only ever an owner working multiple stores (Item 2) — the store
  // switcher (resolveStoreSelection) disambiguates *which* store per
  // request from here on, this just needs to know the role to route them in.
  const memberships = await prisma.storeMembership.findMany({ where: { userId: user.id, active: true } });
  const storeRole =
    memberships.length === 1 ? memberships[0].role : memberships.length > 1 && memberships.every(membership => membership.role === 'OWNER') ? 'OWNER' : undefined;

  return { ok: true, user: { id: user.id, name: user.name, isSuperAdmin: user.isSuperAdmin, storeRole } };
}

export async function logoutAction(): Promise<void> {
  await destroySession();
}

export interface SessionStatusResult {
  // Present only when a valid server session exists — used to hydrate the
  // client-side session mirror on mount (a new tab has no sessionStorage of
  // its own, so without this it wrongly redirects a signed-in user to
  // /login instead of picking up their existing server session).
  user?: { id: string; name: string; isSuperAdmin: boolean; storeRole?: Role };
  // True when the signed-in user's store access is currently withheld
  // (explicit admin lock, archived store, an inactive membership at this
  // store, or a lapsed subscription) — kept as a plain boolean for existing
  // callers; `blockedReason` carries which one, for messaging.
  storeLocked?: boolean;
  blockedReason?: AccessDeniedReason;
  // The subscription's paidThroughDate, when a payment-lapse block is the
  // reason — lets the owner-facing blocking screen show the exact date
  // (employees still only ever see the generic wording, decided in the UI
  // component since role is already known client-side).
  paidThroughDate?: string;
  // Present (and not blocked) when the subscription's paidThroughDate falls
  // within the pre-expiry warning window — the store workspace shows a
  // banner in this case. exactDate is only meant to be shown to owners;
  // employees get a generic "billing is due" message instead (decided by
  // the UI component, not here, since role is already known client-side).
  paymentWarning?: { paidThroughDate: string } | null;
}

export async function getSessionStatusAction(): Promise<SessionStatusResult> {
  const session = await getSession();
  if (!session) return {};

  // dashboard=false here on purpose: the block/warning banner reflects the
  // caller's currently *selected specific store* regardless of whether the
  // Dashboard screen happens to be showing its own "All stores" aggregate
  // right now (Item 2) — that toggle is Dashboard-display-only and doesn't
  // change what store a person is "in" for banner/routing purposes.
  const selection = await resolveStoreSelection(false);
  const status = await getStoreAccessStatus(session.id, selection?.multiStore ? selection.storeId : undefined);
  const user = { id: session.id, name: session.name, isSuperAdmin: session.isSuperAdmin, storeRole: status?.storeRole };
  if (!status) return { user };

  const warningCutoff = addDays(todayIST(), PAYMENT_WARNING_DAYS);
  const paymentWarning =
    !status.blockedReason && status.paidThroughDate && status.paidThroughDate <= warningCutoff ? { paidThroughDate: status.paidThroughDate } : null;

  return {
    user,
    storeLocked: Boolean(status.blockedReason),
    blockedReason: status.blockedReason,
    paidThroughDate: status.blockedReason === 'payment_lapsed' ? status.paidThroughDate : undefined,
    paymentWarning,
  };
}

// The header store selector's mutations (Item 2). Both are plain
// success/failure signals — the client re-fetches server-rendered data via
// router.refresh() after either succeeds, same pattern as every other
// mutation in this app. setSelectedStore() re-verifies storeId against the
// caller's own active memberships before persisting anything.
export async function selectStoreAction(storeId: string): Promise<{ ok: boolean }> {
  return { ok: await setSelectedStore(storeId) };
}

export async function selectDashboardAllStoresAction(): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };
  await setDashboardAllStores(true);
  return { ok: true };
}
