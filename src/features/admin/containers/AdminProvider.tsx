'use client';
import { createContext, useContext, useEffect, useState, useRef, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { rangeFor } from '../admin.data';
import { SESSION_KEY, clearClientCaches, watchSessionMirror } from '../client-cache';
import { resolveUser } from '../admin.permissions';
import { loginAction, logoutAction, getSessionStatusAction } from '@/server/auth/actions';
import type { AccessDeniedReason } from '@/server/auth/session';
import type { DateRange, Session, AdminUser } from '../admin.types';

export interface TrialStatus { endsAt: string; endingSoon: boolean }

export interface PaymentWarning { paidThroughDate: string }

interface Context {
  period: string; setPeriod: Dispatch<SetStateAction<string>>;
  range: DateRange; setRange: Dispatch<SetStateAction<DateRange>>;
  sessionVerified: boolean; user: AdminUser | null; authenticated: boolean; ready: boolean; storeLocked: boolean;
  blockedReason: AccessDeniedReason | undefined; blockedPaidThroughDate: string | undefined; paymentWarning: PaymentWarning | null; trial: TrialStatus | null;
  login: (phone: string, password: string) => Promise<boolean>; logout: () => Promise<void>;
}
const Ctx = createContext<Context | null>(null);
export function AdminProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [period, setPeriod] = useState('month'), [range, setRange] = useState<DateRange>(rangeFor('month'));
  const [ready, setReady] = useState(false);
  const sessionEpoch = useRef(0);
  const [sessionVerified, setSessionVerified] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [storeLocked, setStoreLocked] = useState(false);
  const [blockedReason, setBlockedReason] = useState<AccessDeniedReason | undefined>(undefined);
  const [blockedPaidThroughDate, setBlockedPaidThroughDate] = useState<string | undefined>(undefined);
  const [paymentWarning, setPaymentWarning] = useState<PaymentWarning | null>(null);
  const [trial, setTrial] = useState<TrialStatus | null>(null);
  const user = resolveUser(session);
  useEffect(() => {
    let active = true;
    const epoch = ++sessionEpoch.current;
    let localSession: Session | null = null;
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      const value = raw ? JSON.parse(raw) : null;
      if (value && typeof value.id === 'string' && typeof value.name === 'string' && typeof value.storeId === 'string' && ['owner', 'employee'].includes(value.role)) localSession = value;
    } catch { /* Invalid or unavailable storage falls back to the server. */ }
    if (localSession) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSession(localSession); setReady(true);
    }
    const stopWatching = watchSessionMirror(() => {
      sessionEpoch.current += 1;
      setSession(null); setSessionVerified(false); setReady(true);
      setStoreLocked(false); setBlockedReason(undefined); setBlockedPaidThroughDate(undefined); setPaymentWarning(null); setTrial(null);
      router.replace('/login'); router.refresh();
    }, () => { setSessionVerified(false); void reconcile(++sessionEpoch.current); router.refresh(); });
    function reconcile(expectedEpoch: number) {
      return getSessionStatusAction().then(status => {
        if (!active || expectedEpoch !== sessionEpoch.current) return;
        if (!status.user?.storeRole || !status.user.storeId) {
          setSession(null); setSessionVerified(false); clearClientCaches();
          try { localStorage.removeItem(SESSION_KEY); } catch {}
        } else {
          const isOwner = status.user.storeRole === 'OWNER';
          const next: Session = { id: isOwner ? 'owner' : status.user.id, role: isOwner ? 'owner' : 'employee', name: status.user.name, storeId: status.user.storeId };
          setSession(next); setSessionVerified(true);
          try { localStorage.setItem(SESSION_KEY, JSON.stringify(next)); } catch {}
        }
        setStoreLocked(Boolean(status.storeLocked)); setBlockedReason(status.blockedReason);
        setBlockedPaidThroughDate(status.paidThroughDate); setPaymentWarning(status.paymentWarning ?? null); setTrial(status.trial ?? null); setReady(true);
      }).catch(() => { if (active && expectedEpoch === sessionEpoch.current) setReady(true); });
    }
    function onStoreChanged() { setTrial(null); setSessionVerified(false); void reconcile(++sessionEpoch.current); }
    void reconcile(epoch);
    window.addEventListener('el-store-changed', onStoreChanged);
    return () => { active = false; stopWatching(); window.removeEventListener('el-store-changed', onStoreChanged); };
  }, [router]);
  async function login(phone: string, input: string) {
    const normalized = phone.trim();
    // Credentials are checked against the real database; this also sets an
    // HttpOnly server session cookie used by Server Actions. The client-side
    // session below is purely a mirror for routing/display.
    const result = await loginAction(normalized, input);
    if (!result.ok || !result.user || !result.redirectTo) return false;
    if (result.user.isSuperAdmin) {
      sessionEpoch.current += 1; clearClientCaches(); setSessionVerified(false);
      setSession(null);
      try { localStorage.removeItem(SESSION_KEY); } catch {}
      router.replace(result.redirectTo);
      return true;
    }
    if (!result.user.storeRole || !result.user.storeId) return false;
    sessionEpoch.current += 1;
    const isOwner = result.user.storeRole === 'OWNER';
    const next: Session = { id: isOwner ? 'owner' : result.user.id, role: isOwner ? 'owner' : 'employee', name: result.user.name, storeId: result.user.storeId };
    setSession(next); setSessionVerified(true); setPeriod('month'); setRange(rangeFor('month')); setStoreLocked(false); setBlockedReason(undefined); setBlockedPaidThroughDate(undefined); setPaymentWarning(null); setTrial(null);
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(next)); } catch {}
    // The dashboard/screen render immediately from this optimistic session;
    // pick up the real block/warning state (if any) right after, same as a
    // reload would via the effect above, without waiting on it for login itself.
    const loginEpoch = sessionEpoch.current;
    getSessionStatusAction().then(status => {
      if (loginEpoch !== sessionEpoch.current) return;
      setStoreLocked(Boolean(status.storeLocked));
      setBlockedReason(status.blockedReason);
      setBlockedPaidThroughDate(status.paidThroughDate);
      setPaymentWarning(status.paymentWarning ?? null); setTrial(status.trial ?? null);
    }).catch(() => undefined);
    router.replace(result.redirectTo);
    return true;
  }
  async function logout() {
    await logoutAction();
    sessionEpoch.current += 1; clearClientCaches(); setSessionVerified(false);
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    setSession(null); setStoreLocked(false); setBlockedReason(undefined); setBlockedPaidThroughDate(undefined); setPaymentWarning(null); setTrial(null);
    try { sessionStorage.clear(); } catch {}
    try { localStorage.removeItem('el_draft'); } catch {}
  }
  return <Ctx.Provider value={{ sessionVerified, period, setPeriod, range, setRange, user, authenticated: Boolean(user), ready, storeLocked, blockedReason, blockedPaidThroughDate, paymentWarning, trial, login, logout }}>{children}</Ctx.Provider>;
}
export function useAdmin() { const value = useContext(Ctx); if (!value) throw new Error('AdminProvider required'); return value; }
