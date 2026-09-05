'use client';
import { createContext, useContext, useEffect, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { withSeptemberDemoIncome } from '../admin.demo-income';
import { withDemoHistory } from '../admin.demo-history';
import { withRecurringExpenses } from '../admin.expenses';
import { seed, rangeFor } from '../admin.data';
import { migrateStore } from '../admin.migration';
import { resolveUser } from '../admin.permissions';
import type { Store, DateRange, Session, AdminUser } from '../admin.types';

interface Context {
  period: string; setPeriod: Dispatch<SetStateAction<string>>;
  range: DateRange; setRange: Dispatch<SetStateAction<DateRange>>;
  store: Store | null; setStore: Dispatch<SetStateAction<Store | null>>;
  user: AdminUser | null; authenticated: boolean; ready: boolean;
  login: (username: string, password: string) => boolean; logout: () => void;
  changePassword: (old: string, next: string) => boolean; storageError: string;
}
const Ctx = createContext<Context | null>(null);
const KEY = 'express-laundry-admin-v1';
function loadStore(raw: string | null) {
  const value = raw ? JSON.parse(raw) : null;
  return withSeptemberDemoIncome(withRecurringExpenses(withDemoHistory(migrateStore(value?.products && value?.orders && value?.expenses && value?.profile ? value : seed()))));
}
export function AdminProvider({ children }: { children: ReactNode }) {
  const [period, setPeriod] = useState('month'), [range, setRange] = useState<DateRange>(rangeFor('month'));
  const [store, setRawStore] = useState<Store | null>(null), [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null), [password, setPassword] = useState('admin@123$'), [storageError, setStorageError] = useState('');
  const user = resolveUser(session, store);
  const setStore: Context['setStore'] = update => setRawStore(previous => {
    const actor = resolveUser(session, previous);
    if (!actor || !previous) return previous;
    const next = typeof update === 'function' ? update(previous) : update;
    if (!next) return previous;
    // Employees can only mutate orders; owner data stays untouched if a handler misroutes.
    return actor.role === 'owner' ? withRecurringExpenses(next) : { ...previous, orders: next.orders };
  });
  useEffect(() => {
    try {
      // Browser storage hydrates after the server's loading render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRawStore(loadStore(localStorage.getItem(KEY)));
      setPassword(sessionStorage.getItem(KEY + '-password') || 'admin@123$');
      const rawSession = sessionStorage.getItem(KEY + '-session');
      setSession(rawSession === 'yes' ? { id: 'owner', role: 'owner' } : rawSession ? JSON.parse(rawSession) : null);
    } catch { setRawStore(withRecurringExpenses(seed())); setStorageError('Browser storage is unavailable. Changes will last for this visit only.'); }
    setReady(true);
    const sync = (event: StorageEvent) => {
      if (event.key !== KEY) return;
      try { setRawStore(loadStore(event.newValue)); } catch { setStorageError('Saved data could not be read. Refresh to try again.'); }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => {
    if (!store) return;
    try { localStorage.setItem(KEY, JSON.stringify(store)); }
    catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStorageError('Changes could not be saved to this browser. Keep this tab open.');
    }
  }, [store]);
  function login(username: string, input: string) {
    const normalized = username.trim().toLowerCase();
    const employee = store?.employees.find(person => person.active && person.username.toLowerCase() === normalized && person.password === input);
    const next: Session | null = normalized === 'admin' && input === password ? { id: 'owner', role: 'owner' }
      : employee ? { id: employee.id, role: 'employee', credentialVersion: employee.credentialVersion } : null;
    if (!next) return false;
    setSession(next); setPeriod('month'); setRange(rangeFor('month'));
    try { sessionStorage.setItem(KEY + '-session', JSON.stringify(next)); } catch {}
    return true;
  }
  function logout() { setSession(null); try { sessionStorage.removeItem(KEY + '-session'); } catch {} }
  function changePassword(old: string, next: string) {
    if (user?.role !== 'owner' || old !== password) return false;
    setPassword(next); try { sessionStorage.setItem(KEY + '-password', next); } catch {} return true;
  }
  return <Ctx.Provider value={{ period, setPeriod, range, setRange, store, setStore, user, authenticated: Boolean(user), ready, login, logout, changePassword, storageError }}>{children}</Ctx.Provider>;
}
export function useAdmin() { const value = useContext(Ctx); if (!value) throw new Error('AdminProvider required'); return value; }
