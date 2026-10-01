import { isSubscriptionLapsed } from '@/lib/subscriptionAccess';
import 'server-only';
import { cookies } from 'next/headers';
import { prisma } from '@/server/db';
import { formatCalendarDate, todayIST, addDays } from '@/server/dates';
import type { Role, OutletStatus } from '@/generated/prisma/client';
import { generateSessionToken, isValidSessionToken } from './token';

const COOKIE_NAME = 'el_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Separate, lightweight cookies for "which store is this owner currently
// working in" (see Item 2, .agents/2026-09-brainstorm-plan.md). Neither
// carries any authorization on its own — every read of them here is
// re-validated against the caller's live, active StoreMembership rows before
// being trusted (see resolveStoreSelection/setSelectedStore below), the same
// way requireStoreSession() already re-verifies storeId server-side.
const STORE_SELECT_COOKIE = 'el_selected_store';
const DASHBOARD_ALL_COOKIE = 'el_dashboard_all_stores';
// The active physical outlet is independent from the legacy organization
// selector above. It is a convenience only: every read/write still verifies
// the outlet against live memberships through requireOutletSession().
const OUTLET_SELECT_COOKIE = 'el_selected_outlet';
const STORE_SELECT_TTL_MS = SESSION_TTL_MS;

// A user's identity only — role is per-store (see StoreSession) and
// Super Admin access is platform-level, unscoped to any store.
export interface SessionUser {
  id: string;
  name: string;
  phone: string;
  isSuperAdmin: boolean;
  /** Only populated for bearer-token sessions (mobile API); see requireApiAuth. */
  mustChangePassword?: boolean;
}

// A user's identity plus their role in one specific store.
export interface StoreSession extends SessionUser {
  storeId: string;
  storeName: string;
  storeRole: Role;
}

// A user's identity plus their role in one specific store and outlet.
export interface OutletSession extends StoreSession {
  outletId: string;
  outletCode: string;
  outletName: string;
}

export interface AllowedOutlet {
  id: string;
  outletCode: string;
  displayName: string;
  isDefault: boolean;
  status: OutletStatus;
}

export interface OutletSelection {
  outletId: string | null;
  options: AllowedOutlet[];
  allOutletsSelected: boolean;
}

export type SubscriptionAccessState =
  | 'ACTIVE'
  | 'TRIAL'
  | 'TRIAL_ENDING'
  | 'SUBSCRIPTION_ENDING'
  | 'RESTRICTED';

export async function createSessionRow(userId: string, credentialVersion: number): Promise<{ id: string; token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const token = generateSessionToken();
  const session = await prisma.session.create({ data: { userId, credentialVersion, expiresAt, token } });
  return { id: session.id, token: session.token, expiresAt };
}

export async function createSession(userId: string, credentialVersion: number): Promise<{ id: string; token: string }> {
  const session = await createSessionRow(userId, credentialVersion);

  try {
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: session.expiresAt,
    });
  } catch {
    // cookies() unavailable in non-request contexts
  }

  return { id: session.id, token: session.token };
}

export async function getSessionFromToken(token: string): Promise<SessionUser | null> {
  if (!isValidSessionToken(token)) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    select: {
      id: true,
      token: true,
      credentialVersion: true,
      expiresAt: true,
      user: { select: { id: true, name: true, phone: true, isSuperAdmin: true, active: true, credentialVersion: true, mustChangePassword: true } },
    },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) return null;
  if (!session.user.active) return null;
  if (session.credentialVersion !== session.user.credentialVersion) return null;

  return { id: session.user.id, name: session.user.name, phone: session.user.phone, isSuperAdmin: session.user.isSuperAdmin, mustChangePassword: session.user.mustChangePassword };
}

// Returns null for any invalid session (missing cookie, expired, deactivated
// user, or stale credentialVersion after a password change/deactivation).
export async function getSession(): Promise<SessionUser | null> {
  let sessionId: string | undefined;
  try {
    const cookieStore = await cookies();
    sessionId = cookieStore.get(COOKIE_NAME)?.value;
  } catch {
    return null;
  }
  if (!sessionId) return null;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      token: true,
      credentialVersion: true,
      expiresAt: true,
      user: { select: { id: true, name: true, phone: true, isSuperAdmin: true, active: true, credentialVersion: true } },
    },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) return null;
  if (!session.user.active) return null;
  if (session.credentialVersion !== session.user.credentialVersion) return null;

  return { id: session.user.id, name: session.user.name, phone: session.user.phone, isSuperAdmin: session.user.isSuperAdmin };
}

export async function getSessionFromRequest(req: Request): Promise<SessionUser | null> {
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    return getSessionFromToken(token);
  }

  const cookieHeader = req.headers.get('cookie') ?? req.headers.get('Cookie');
  if (cookieHeader) {
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
    const sessionId = match ? decodeURIComponent(match[1]) : null;
    if (sessionId) {
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          token: true,
          credentialVersion: true,
          expiresAt: true,
          user: { select: { id: true, name: true, phone: true, isSuperAdmin: true, active: true, credentialVersion: true } },
        },
      });
      if (!session) return null;
      if (session.expiresAt < new Date()) return null;
      if (!session.user.active) return null;
      if (session.credentialVersion !== session.user.credentialVersion) return null;

      return { id: session.user.id, name: session.user.name, phone: session.user.phone, isSuperAdmin: session.user.isSuperAdmin };
    }
  }

  return getSession();
}

export async function destroySession(): Promise<void> {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(COOKIE_NAME)?.value;
    if (sessionId) {
      await prisma.session.delete({ where: { id: sessionId } }).catch(() => undefined);
    }
    cookieStore.delete(COOKIE_NAME);
  } catch {
    // Ignore if cookies() fails
  }
}

export async function destroySessionByToken(token: string): Promise<void> {
  if (isValidSessionToken(token)) {
    await prisma.session.delete({ where: { token } }).catch(() => undefined);
  }
}

// Call when a user is deactivated or their credentialVersion is bumped
// (e.g. password change) so every existing session for them stops working.
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

// Distinguishes *why* store access was withheld — a plain missing/wrong-role
// membership carries no reason (nothing to explain to the user beyond "no
// access"), while these four are all things the store workspace UI shows a
// specific message for (see AdminProvider/AdminScreenContainer). All are
// "FORBIDDEN" as far as callers checking `instanceof AuthError` are
// concerned; `reason` is additive.
export type AccessDeniedReason = 'membership_inactive' | 'store_locked' | 'store_archived' | 'payment_lapsed' | 'billing_pending';

export class AuthError extends Error {
  constructor(public readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN', public readonly reason?: AccessDeniedReason | 'must_change_password') {
    super(code);
  }
}

export async function requireSuperAdmin(sessionOverride?: SessionUser): Promise<SessionUser> {
  const session = sessionOverride ?? (await getSession());
  if (!session) throw new AuthError('UNAUTHENTICATED');
  if (!session.isSuperAdmin) throw new AuthError('FORBIDDEN');
  return session;
}

export async function requireSuperAdminFromRequest(req: Request): Promise<SessionUser> {
  const session = await getSessionFromRequest(req);
  if (!session) throw new AuthError('UNAUTHENTICATED');
  return requireSuperAdmin(session);
}

// Resolves the session plus the caller's role in a specific store. If
// storeId is omitted, falls back to the user's only *active* membership —
// an employee is constrained (by policy, not schema) to exactly one active
// membership at a time, so this remains unambiguous for them; an owner with
// more than one active membership and no storeId gets FORBIDDEN here (the
// store switcher that disambiguates that case is a separate, later item).
//
// Store-level access is fully computed on every call, never cached in a
// session/cookie: an inactive StoreMembership, an explicitly LOCKED store,
// an archived store, or a lapsed subscription (paidThroughDate in the past)
// all deny access live, and — because none of them touch the Session table —
// access at *other* stores the same person belongs to is unaffected, and
// access here resumes automatically the moment the underlying condition
// clears (membership reactivated, store unlocked, renewal recorded).
export interface StoreSessionOptions {
  allowRestricted?: boolean;
  /** Explicit opt-in for record browsing only. Mutation callers must not use this. */
  allowLockedReadOnly?: boolean;
}

export async function assertStoreWritable(storeId: string): Promise<void> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      status: true,
      deletedAt: true,
      accessGrantedUntil: true,
      subscription: { select: { paidThroughDate: true, trialEndsAt: true } },
    },
  });
  if (!store) throw new AuthError('FORBIDDEN');
  if (store.status === 'LOCKED') throw new AuthError('FORBIDDEN', 'store_locked');
  if (store.deletedAt) throw new AuthError('FORBIDDEN', 'store_archived');

  const paidThroughDate = store.subscription?.paidThroughDate
    ? formatCalendarDate(store.subscription.paidThroughDate)
    : undefined;
  const trialEndsAt = store.subscription?.trialEndsAt
    ? formatCalendarDate(store.subscription.trialEndsAt)
    : undefined;
  const today = todayIST();

  const overrideUntil = store.accessGrantedUntil ? formatCalendarDate(store.accessGrantedUntil) : undefined;
  const isLapsed = isSubscriptionLapsed(today, paidThroughDate, trialEndsAt, overrideUntil);

  if (isLapsed) {
    throw new AuthError('FORBIDDEN', 'payment_lapsed');
  }
}

export async function requireStoreSession(
  storeId?: string,
  role?: Role,
  sessionOverride?: SessionUser,
  options?: StoreSessionOptions,
): Promise<StoreSession> {
  const session = sessionOverride ?? (await getSession());
  if (!session) throw new AuthError('UNAUTHENTICATED');

  const membership = storeId
    ? await prisma.storeMembership.findUnique({ where: { userId_storeId: { userId: session.id, storeId } } })
    : await onlyActiveMembership(session.id);

  if (!membership) throw new AuthError('FORBIDDEN');
  if (role && membership.role !== role) throw new AuthError('FORBIDDEN');
  if (!membership.active) throw new AuthError('FORBIDDEN', 'membership_inactive');

  const store = await prisma.store.findUnique({
    where: { id: membership.storeId },
    select: {
      name: true,
      status: true,
      deletedAt: true,
      accessGrantedUntil: true,
      subscription: { select: { paidThroughDate: true, trialEndsAt: true } },
    },
  });
  if (!store) throw new AuthError('FORBIDDEN');
  if (store.status === 'LOCKED' && !options?.allowLockedReadOnly) throw new AuthError('FORBIDDEN', 'store_locked');
  if (store.deletedAt) throw new AuthError('FORBIDDEN', 'store_archived');

  const paidThroughDate = store.subscription?.paidThroughDate
    ? formatCalendarDate(store.subscription.paidThroughDate)
    : undefined;
  const trialEndsAt = store.subscription?.trialEndsAt
    ? formatCalendarDate(store.subscription.trialEndsAt)
    : undefined;
  const today = todayIST();

  const overrideUntil = store.accessGrantedUntil ? formatCalendarDate(store.accessGrantedUntil) : undefined;
  const isLapsed = isSubscriptionLapsed(today, paidThroughDate, trialEndsAt, overrideUntil);

  if (isLapsed && !options?.allowRestricted && !(store.status === 'LOCKED' && options?.allowLockedReadOnly)) {
    throw new AuthError('FORBIDDEN', 'payment_lapsed');
  }

  return { ...session, storeId: membership.storeId, storeName: store.name, storeRole: membership.role };
}

export async function requireStoreSessionFromRequest(
  req: Request,
  storeId?: string,
  role?: Role,
  options?: StoreSessionOptions,
): Promise<StoreSession> {
  const session = await getSessionFromRequest(req);
  if (!session) throw new AuthError('UNAUTHENTICATED');
  return requireStoreSession(storeId, role, session, options);
}

async function onlyActiveMembership(userId: string) {
  const memberships = await prisma.storeMembership.findMany({ where: { userId, active: true } });
  return memberships.length === 1 ? memberships[0] : null;
}

export interface StoreOption { storeId: string; storeName: string }

export interface StoreSelection {
  // The store to actually use for this request — always freshly re-derived
  // from the caller's own live active memberships (never trusted from the
  // cookie alone; see setSelectedStore below for the same rule on write).
  storeId: string;
  // True only when the caller holds more than one active StoreMembership —
  // this is what the header selector's visibility (and everything else in
  // Item 2) keys off. Per Item 1's design, an employee always has exactly
  // one, so this is only ever true for owners.
  multiStore: boolean;
  options: StoreOption[];
  // Dashboard-only: true when the owner has explicitly chosen "All stores"
  // for the dashboard aggregate view. Always false when resolveStoreSelection
  // is called with dashboard=false (every non-Dashboard screen).
  allStoresSelected: boolean;
}

// Resolves which store a signed-in owner is currently working in, for
// screens that must disambiguate when a person holds more than one active
// StoreMembership (Item 2). Returns null when there's no session or no
// active membership at all — callers should fall through to
// requireStoreSession()'s existing generic-FORBIDDEN handling in that case,
// exactly as before this item (nothing changes for single-store owners or
// employees, who always resolve to multiStore: false here).
export async function resolveStoreSelection(dashboard = false): Promise<StoreSelection | null> {
  const session = await getSession();
  if (!session) return null;

  const memberships = await prisma.storeMembership.findMany({
    where: { userId: session.id, active: true },
    orderBy: { createdAt: 'asc' },
    include: { store: { select: { id: true, name: true } } },
  });
  if (memberships.length === 0) return null;

  const options: StoreOption[] = memberships.map(membership => ({ storeId: membership.storeId, storeName: membership.store.name }));
  if (memberships.length === 1) {
    return { storeId: options[0].storeId, multiStore: false, options, allStoresSelected: false };
  }

  const cookieStore = await cookies();
  const requested = cookieStore.get(STORE_SELECT_COOKIE)?.value;
  const requestedIsValid = Boolean(requested) && options.some(option => option.storeId === requested);
  // Auto-pick the oldest active membership (first store this person joined)
  // when there's no prior choice, or the cookie names a store they're no
  // longer an active member of — never a blocking "choose a store" prompt.
  const storeId = requestedIsValid ? requested! : options[0].storeId;
  const allStoresSelected = dashboard && cookieStore.get(DASHBOARD_ALL_COOKIE)?.value === '1';

  return { storeId, multiStore: true, options, allStoresSelected };
}

// Persists the owner's chosen store for future requests, across reloads.
// Re-verifies storeId against this session's own active memberships before
// writing anything — a client-supplied storeId is a request, never an
// authorization; the actual authorization check still happens independently
// on every subsequent requireStoreSession() call regardless of this cookie.
// Explicitly choosing one store also exits Dashboard's "All stores" view,
// since only Dashboard ever offers that option.
export async function setSelectedStore(storeId: string): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  const membership = await prisma.storeMembership.findUnique({ where: { userId_storeId: { userId: session.id, storeId } } });
  if (!membership || !membership.active) return false;

  const cookieStore = await cookies();
  cookieStore.set(STORE_SELECT_COOKIE, storeId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: STORE_SELECT_TTL_MS / 1000,
  });
  cookieStore.delete(DASHBOARD_ALL_COOKIE);
  return true;
}

// Dashboard-only "All stores" aggregate toggle. Kept as its own cookie
// (rather than folded into STORE_SELECT_COOKIE) so navigating away from
// Dashboard's "All stores" view to any other screen still lands on the last
// specific store chosen, per Item 2's requirement that only Dashboard ever
// aggregates and every other screen always requires one specific store.
export async function setDashboardAllStores(allStores: boolean): Promise<void> {
  const cookieStore = await cookies();
  if (allStores) {
    cookieStore.set(DASHBOARD_ALL_COOKIE, '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: STORE_SELECT_TTL_MS / 1000,
    });
  } else {
    cookieStore.delete(DASHBOARD_ALL_COOKIE);
  }
}

/**
 * Resolves the active outlet for the current organization. Owners start on
 * the organization-wide dashboard; all operational screens select a concrete
 * outlet. Employees always resolve to one of their assigned outlets.
 */
export async function resolveOutletSelection(
  storeSession: StoreSession,
  dashboard = false,
): Promise<OutletSelection> {
  const { allowedOutlets, defaultOutletId } = await resolveAllowedOutlets(
    storeSession.id,
    storeSession.storeId,
    storeSession.storeRole,
  );
  const cookieStore = await cookies();
  const requested = cookieStore.get(OUTLET_SELECT_COOKIE)?.value;
  const outletId = requested && allowedOutlets.some(outlet => outlet.id === requested)
    ? requested
    : defaultOutletId;
  return {
    outletId,
    options: allowedOutlets,
    allOutletsSelected: dashboard && storeSession.storeRole === 'OWNER' && !requested,
  };
}

/** Persist a requested outlet only after validating current organization access. */
export async function setSelectedOutlet(outletId: string): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  const selection = await resolveStoreSelection(false);
  if (!selection) return false;
  let storeSession: StoreSession;
  try {
    storeSession = await requireStoreSession(selection.storeId, undefined, session, { allowRestricted: true, allowLockedReadOnly: true });
  } catch {
    return false;
  }
  const { allowedOutlets } = await resolveAllowedOutlets(session.id, storeSession.storeId, storeSession.storeRole);
  if (!allowedOutlets.some(outlet => outlet.id === outletId)) return false;
  const cookieStore = await cookies();
  cookieStore.set(OUTLET_SELECT_COOKIE, outletId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: STORE_SELECT_TTL_MS / 1000,
  });
  return true;
}

/** Return an owner to the organization-wide Dashboard view. */
export async function setDashboardAllOutlets(): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  const selection = await resolveStoreSelection(false);
  if (!selection) return false;
  try {
    await requireStoreSession(selection.storeId, 'OWNER', session, { allowRestricted: true, allowLockedReadOnly: true });
  } catch {
    return false;
  }
  const cookieStore = await cookies();
  cookieStore.delete(OUTLET_SELECT_COOKIE);
  return true;
}

// Days before paidThroughDate that the store workspace should start showing
// an owner/employee warning banner (see Item 3, .agents/2026-09-brainstorm-plan.md).
// Store teams and super admins need a month of notice before access changes.
export const PAYMENT_WARNING_DAYS = 30;

// Days before trialEndsAt that the store workspace should start showing a
// "free trial ends soon" banner. Kept shorter than PAYMENT_WARNING_DAYS since
// a trial is a shorter commitment than a paid subscription term.
export const TRIAL_WARNING_DAYS = 7;

export interface StoreAccessStatus {
  storeId: string;
  storeRole: Role;
  // Set when requireStoreSession would currently deny access for this store.
  blockedReason?: AccessDeniedReason;
  // The subscription's paidThroughDate (if any), regardless of blocked state —
  // callers use this to decide whether to show the pre-expiry warning banner.
  paidThroughDate?: string;
  trialEndsAt?: string;
  subscriptionState?: SubscriptionAccessState;
}

// Non-throwing sibling of requireStoreSession, for UI surfaces (the client
// session mirror, warning banners) that need to know *why* access is or
// isn't withheld without treating it as an error. Mirrors the same
// active-membership resolution and the same blocking checks, live — no
// cached/stored lock state. storeId is optional and only meaningful for a
// multi-store owner (see resolveStoreSelection) — when given, it's
// re-verified as one of the caller's own active memberships here, exactly
// like requireStoreSession does, rather than trusted as-is.
export async function getStoreAccessStatus(userId: string, storeId?: string): Promise<StoreAccessStatus | null> {
  const membership = storeId
    ? await prisma.storeMembership.findUnique({ where: { userId_storeId: { userId, storeId } } })
    : await onlyActiveMembership(userId);
  if (!membership || !membership.active) return null;

  const store = await prisma.store.findUnique({
    where: { id: membership.storeId },
    select: { status: true, deletedAt: true, accessGrantedUntil: true, subscription: { select: { paidThroughDate: true, trialEndsAt: true } } },
  });
  if (!store) return null;

  const paidThroughDate = store.subscription?.paidThroughDate ? formatCalendarDate(store.subscription.paidThroughDate) : undefined;
  const trialEndsAt = store.subscription?.trialEndsAt ? formatCalendarDate(store.subscription.trialEndsAt) : undefined;
  const today = todayIST();

  let subscriptionState: SubscriptionAccessState = 'ACTIVE';
  if (trialEndsAt) {
    if (today > trialEndsAt) {
      if (!paidThroughDate || today > paidThroughDate) {
        subscriptionState = 'RESTRICTED';
      } else if (paidThroughDate <= addDays(today, PAYMENT_WARNING_DAYS)) {
        subscriptionState = 'SUBSCRIPTION_ENDING';
      } else {
        subscriptionState = 'ACTIVE';
      }
    } else if (trialEndsAt <= addDays(today, TRIAL_WARNING_DAYS)) {
      subscriptionState = 'TRIAL_ENDING';
    } else {
      subscriptionState = 'TRIAL';
    }
  } else if (paidThroughDate) {
    if (today > paidThroughDate) {
      subscriptionState = 'RESTRICTED';
    } else if (paidThroughDate <= addDays(today, PAYMENT_WARNING_DAYS)) {
      subscriptionState = 'SUBSCRIPTION_ENDING';
    } else {
      subscriptionState = 'ACTIVE';
    }
  }

  const overrideUntil = store.accessGrantedUntil ? formatCalendarDate(store.accessGrantedUntil) : undefined;
  if (overrideUntil && overrideUntil >= today && subscriptionState === 'RESTRICTED') subscriptionState = 'ACTIVE';
  let blockedReason: AccessDeniedReason | undefined;
  if (store.status === 'LOCKED') blockedReason = 'store_locked';
  else if (store.deletedAt) blockedReason = 'store_archived';
  else if (subscriptionState === 'RESTRICTED') blockedReason = 'payment_lapsed';
  else if (isSubscriptionLapsed(today, paidThroughDate, trialEndsAt, overrideUntil)) blockedReason = 'payment_lapsed';

  return { storeId: membership.storeId, storeRole: membership.role, blockedReason, paidThroughDate, trialEndsAt, subscriptionState };
}

/**
 * Resolves active outlets available to a user in an organization.
 * Owners can access all active outlets. Employees can only access outlets
 * where they hold an active OutletMembership.
 */
export async function resolveAllowedOutlets(
  userId: string,
  storeId: string,
  role: Role,
): Promise<{ allowedOutlets: AllowedOutlet[]; defaultOutletId: string | null }> {
  if (role === 'OWNER') {
    const outlets = await prisma.outlet.findMany({
      where: { storeId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    const allowedOutlets: AllowedOutlet[] = outlets.map((o, idx) => ({
      id: o.id,
      outletCode: o.outletCode,
      displayName: o.displayName,
      isDefault: idx === 0,
      status: o.status,
    }));
    return {
      allowedOutlets,
      defaultOutletId: allowedOutlets[0]?.id ?? null,
    };
  }

  const memberships = await prisma.outletMembership.findMany({
    where: {
      userId,
      active: true,
      outlet: { storeId, status: 'ACTIVE' },
    },
    include: {
      outlet: true,
    },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });

  const allowedOutlets: AllowedOutlet[] = memberships.map(m => ({
    id: m.outlet.id,
    outletCode: m.outlet.outletCode,
    displayName: m.outlet.displayName,
    isDefault: m.isDefault,
    status: m.outlet.status,
  }));

  const defaultOutlet = allowedOutlets.find(o => o.isDefault) ?? allowedOutlets[0];
  return {
    allowedOutlets,
    defaultOutletId: defaultOutlet?.id ?? null,
  };
}

/**
 * Enforces organization and outlet-scoped authorization.
 * Validates:
 * 1. Outlet exists, is ACTIVE, and matches storeId (if storeId is provided).
 * 2. Caller has an active StoreMembership for the outlet's organization.
 * 3. If caller is an OWNER: automatically permitted across all active outlets in their store.
 * 4. If caller is an EMPLOYEE: must hold an active OutletMembership for that specific outlet.
 * 5. Re-verifies organization status (not locked, not archived, active subscription).
 */
export async function requireOutletSession(
  storeId: string | undefined,
  outletId: string | undefined,
  role?: Role,
  sessionOverride?: SessionUser,
  options?: StoreSessionOptions,
): Promise<OutletSession> {
  if (!outletId || !outletId.trim()) {
    throw new AuthError('FORBIDDEN');
  }
  const cleanOutletId = outletId.trim();

  const outlet = await prisma.outlet.findUnique({
    where: { id: cleanOutletId },
  });
  if (!outlet || outlet.status !== 'ACTIVE') {
    throw new AuthError('FORBIDDEN');
  }

  if (storeId && outlet.storeId !== storeId) {
    throw new AuthError('FORBIDDEN');
  }

  const storeSession = await requireStoreSession(outlet.storeId, role, sessionOverride, options);

  if (storeSession.storeRole === 'EMPLOYEE') {
    const membership = await prisma.outletMembership.findUnique({
      where: {
        userId_outletId: {
          userId: storeSession.id,
          outletId: outlet.id,
        },
      },
    });
    if (!membership || !membership.active) {
      throw new AuthError('FORBIDDEN', 'membership_inactive');
    }
  }

  return {
    ...storeSession,
    outletId: outlet.id,
    outletCode: outlet.outletCode,
    outletName: outlet.displayName,
  };
}

export async function requireOutletSessionFromRequest(
  req: Request,
  storeId?: string,
  outletId?: string,
  role?: Role,
  options?: StoreSessionOptions,
): Promise<OutletSession> {
  const session = await getSessionFromRequest(req);
  if (!session) throw new AuthError('UNAUTHENTICATED');
  return requireOutletSession(storeId, outletId, role, session, options);
}
