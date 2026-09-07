'use client';
import { createContext, useContext, useEffect, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { rangeFor } from '../admin.data';
import { resolveUser } from '../admin.permissions';
import { loginAction, logoutAction } from '@/server/auth/actions';
import type { DateRange, Session, AdminUser } from '../admin.types';

interface Context {
  period: string; setPeriod: Dispatch<SetStateAction<string>>;
  range: DateRange; setRange: Dispatch<SetStateAction<DateRange>>;
  user: AdminUser | null; authenticated: boolean; ready: boolean;
  login: (username: string, password: string) => Promise<boolean>; logout: () => void;
}
const Ctx = createContext<Context | null>(null);
const KEY = 'express-laundry-admin-v1';
export function AdminProvider({ children }: { children: ReactNode }) {
  const [period, setPeriod] = useState('month'), [range, setRange] = useState<DateRange>(rangeFor('month'));
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const user = resolveUser(session);
  useEffect(() => {
    try {
      // Browser storage hydrates after the server's loading render.
      const rawSession = sessionStorage.getItem(KEY + '-session');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSession(rawSession ? JSON.parse(rawSession) : null);
    } catch {}
    setReady(true);
  }, []);
  async function login(username: string, input: string) {
    const normalized = username.trim().toLowerCase();
    // Credentials are checked against the real database; this also sets an
    // HttpOnly server session cookie used by Server Actions. The client-side
    // session below is purely a mirror for routing/display.
    const result = await loginAction(normalized, input);
    if (!result.ok || !result.user) return false;
    const isOwner = result.user.role === 'OWNER';
    const next: Session = { id: isOwner ? 'owner' : result.user.id, role: isOwner ? 'owner' : 'employee', name: result.user.name };
    setSession(next); setPeriod('month'); setRange(rangeFor('month'));
    try { sessionStorage.setItem(KEY + '-session', JSON.stringify(next)); } catch {}
    return true;
  }
  function logout() { setSession(null); try { sessionStorage.removeItem(KEY + '-session'); } catch {} void logoutAction(); }
  return <Ctx.Provider value={{ period, setPeriod, range, setRange, user, authenticated: Boolean(user), ready, login, logout }}>{children}</Ctx.Provider>;
}
export function useAdmin() { const value = useContext(Ctx); if (!value) throw new Error('AdminProvider required'); return value; }
