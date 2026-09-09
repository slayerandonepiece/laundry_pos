'use client';
import { createContext, useContext, useEffect, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { rangeFor } from '../admin.data';
import { resolveUser } from '../admin.permissions';
import { loginAction, logoutAction, getSessionStatusAction } from '@/server/auth/actions';
import type { AccessDeniedReason } from '@/server/auth/session';
import type { DateRange, Session, AdminUser } from '../admin.types';

export interface PaymentWarning { paidThroughDate: string }

interface Context {
  period: string; setPeriod: Dispatch<SetStateAction<string>>;
  range: DateRange; setRange: Dispatch<SetStateAction<DateRange>>;
  user: AdminUser | null; authenticated: boolean; ready: boolean; storeLocked: boolean;
  blockedReason: AccessDeniedReason | undefined; blockedPaidThroughDate: string | undefined; paymentWarning: PaymentWarning | null;
  login: (username: string, password: string) => Promise<boolean>; logout: () => void;
}
const Ctx = createContext<Context | null>(null);
const KEY = 'express-laundry-admin-v1';
export function AdminProvider({ children }: { children: ReactNode }) {
  const [period, setPeriod] = useState('month'), [range, setRange] = useState<DateRange>(rangeFor('month'));
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [storeLocked, setStoreLocked] = useState(false);
  const [blockedReason, setBlockedReason] = useState<AccessDeniedReason | undefined>(undefined);
  const [blockedPaidThroughDate, setBlockedPaidThroughDate] = useState<string | undefined>(undefined);
  const [paymentWarning, setPaymentWarning] = useState<PaymentWarning | null>(null);
  const user = resolveUser(session);
  useEffect(() => {
    let rawSession: string | null = null;
    try { rawSession = sessionStorage.getItem(KEY + '-session'); } catch {}
    const localSession: Session | null = rawSession ? JSON.parse(rawSession) : null;

    // sessionStorage is per-tab, not shared across tabs — a fresh tab has
    // none of it even when a real (cookie-based) server session exists.
    // When we already have a local mirror, render from it immediately (fast
    // path) and reconcile with the server in the background; when we don't,
    // wait for the server's answer before deciding — otherwise a fresh tab
    // would wrongly bounce a signed-in user to /login before the
    // reconciliation below has a chance to correct it.
    if (localSession) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSession(localSession); setReady(true);
    }

    getSessionStatusAction().then(status => {
      if (!status.user || !status.user.storeRole) {
        if (localSession) { setSession(null); try { sessionStorage.removeItem(KEY + '-session'); } catch {} }
      } else {
        const isOwner = status.user.storeRole === 'OWNER';
        const next: Session = { id: isOwner ? 'owner' : status.user.id, role: isOwner ? 'owner' : 'employee', name: status.user.name };
        if (!localSession || localSession.id !== next.id) {
          setSession(next);
          try { sessionStorage.setItem(KEY + '-session', JSON.stringify(next)); } catch {}
        }
      }
      setStoreLocked(Boolean(status.storeLocked));
      setBlockedReason(status.blockedReason);
      setBlockedPaidThroughDate(status.paidThroughDate);
      setPaymentWarning(status.paymentWarning ?? null);
      setReady(true);
    }).catch(() => setReady(true));
  }, []);
  async function login(username: string, input: string) {
    const normalized = username.trim().toLowerCase();
    // Credentials are checked against the real database; this also sets an
    // HttpOnly server session cookie used by Server Actions. The client-side
    // session below is purely a mirror for routing/display.
    const result = await loginAction(normalized, input);
    if (!result.ok || !result.user) return false;
    // Super Admin has its own area (a later phase); this app is store-scoped,
    // so a Super Admin account with no store membership can't sign in here.
    if (!result.user.storeRole) return false;
    const isOwner = result.user.storeRole === 'OWNER';
    const next: Session = { id: isOwner ? 'owner' : result.user.id, role: isOwner ? 'owner' : 'employee', name: result.user.name };
    setSession(next); setPeriod('month'); setRange(rangeFor('month')); setStoreLocked(false); setBlockedReason(undefined); setBlockedPaidThroughDate(undefined); setPaymentWarning(null);
    try { sessionStorage.setItem(KEY + '-session', JSON.stringify(next)); } catch {}
    // The dashboard/screen render immediately from this optimistic session;
    // pick up the real block/warning state (if any) right after, same as a
    // reload would via the effect above, without waiting on it for login itself.
    getSessionStatusAction().then(status => {
      setStoreLocked(Boolean(status.storeLocked));
      setBlockedReason(status.blockedReason);
      setBlockedPaidThroughDate(status.paidThroughDate);
      setPaymentWarning(status.paymentWarning ?? null);
    }).catch(() => undefined);
    return true;
  }
  function logout() { setSession(null); setStoreLocked(false); setBlockedReason(undefined); setBlockedPaidThroughDate(undefined); setPaymentWarning(null); try { sessionStorage.removeItem(KEY + '-session'); } catch {} void logoutAction(); }
  return <Ctx.Provider value={{ period, setPeriod, range, setRange, user, authenticated: Boolean(user), ready, storeLocked, blockedReason, blockedPaidThroughDate, paymentWarning, login, logout }}>{children}</Ctx.Provider>;
}
export function useAdmin() { const value = useContext(Ctx); if (!value) throw new Error('AdminProvider required'); return value; }
