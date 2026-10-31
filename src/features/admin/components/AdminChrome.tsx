'use client';
import Link from 'next/link';
import WorkspaceNotice from '@/components/WorkspaceNotice';
import WorkspaceAnnouncements from '@/components/WorkspaceAnnouncements';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useAdmin } from '../containers/AdminProvider';
import type { Role, Screen } from '../admin.types';
import type { StoreOption } from '@/server/auth/session';
import { homeFor } from '../admin.permissions';
import { lockBodyScroll } from '../admin.dialog';
import { selectStoreAction, selectDashboardAllStoresAction } from '@/server/auth/actions';
import StoreSwitcher from './StoreSwitcher';
import ConfirmationDialog, { type Confirmation } from './ConfirmationDialog';
import Icon, { type IconName } from '@/features/super-admin/components/Icon';
import { initials } from '@/features/super-admin/utils';

const links: [Screen, IconName, string][] = [
  ['dashboard', 'dashboard', 'Dashboard'],
  ['products', 'archive', 'Products'],
  ['orders', 'card', 'Orders'],
  ['sales', 'card', 'Sales'],
  ['expenses', 'card', 'Expenses'],
  ['employees', 'users', 'Employees'],
  ['outlets', 'store', 'Outlets'],
  ['profile', 'key', 'Profile'],
];

// Desktop sidebar collapse, remembered per browser (same pattern as SuperAdminChrome).
const SIDE_KEY = 'el-side';
const SIDE_EVENT = 'el-side-change';
const subscribeSide = (notify: () => void) => { window.addEventListener(SIDE_EVENT, notify); window.addEventListener('storage', notify); return () => { window.removeEventListener(SIDE_EVENT, notify); window.removeEventListener('storage', notify); }; };
const readSide = () => { try { return localStorage.getItem(SIDE_KEY) === 'rail'; } catch { return false; } };

function screenFromPathname(pathname: string): Screen {
  if (pathname === '/') return 'dashboard';
  const segment = pathname.split('/')[2];
  const known: Screen[] = ['products', 'sales', 'orders', 'expenses', 'employees', 'outlets', 'profile'];
  return (known as string[]).includes(segment) ? (segment as Screen) : 'dashboard';
}

function Navigation({ screen, role, name, brandName, storeName, multiStore, onNavigate, onLogout, rail = false }: { screen: Screen; role: Role | undefined; name: string; brandName: string; storeName: string; multiStore: boolean; onNavigate?: () => void; onLogout: () => void; rail?: boolean }) {
  return <>
    <Link className="ad-logo" href={role ? homeFor(role) : '/'} onClick={onNavigate}>
      <span className="ad-logo-mark"><Icon name="logo" size="l" /></span>
      <span><b>{brandName}</b><small style={{ fontSize: '11px', letterSpacing: '0.1em' }}>STORE WORKSPACE</small></span>
    </Link>
    <p className="ad-nav-label" style={{ fontSize: '11px', letterSpacing: '0.12em' }}>WORKSPACE</p>
    <nav aria-label="Admin navigation">
      {role && links.filter(([id]) => role === 'owner' || ['sales', 'orders', 'profile'].includes(id)).map(([id, icon, label]) => (
        <Link key={id} aria-current={screen === id ? 'page' : undefined} aria-label={rail ? label : undefined} title={rail ? label : undefined} className={screen === id ? 'active' : ''} href={id === 'dashboard' ? '/' : '/admin/' + id} onClick={onNavigate}>
          <Icon name={icon} />{rail ? <span className="ad-side-short">{label}</span> : label}
        </Link>
      ))}
    </nav>
    <div className="ad-sidebar-bottom">
      <span className="ad-side-av" title={rail ? name : undefined} aria-hidden="true">{initials(name || '?')}</span>
      <span className="ad-side-who"><b>{name}</b><small><span className="ad-live-dot"/>{role === 'owner' ? 'Owner' : role === 'employee' ? 'Employee' : ''}{storeName ? ' · ' + storeName : ''}</small>{multiStore && <small>Switch stores from the header.</small>}</span>
      <button type="button" className="ad-side-logout" onClick={onLogout} aria-label="Log out" title="Log out"><Icon name="logout" /></button>
    </div>
  </>;
}

function MobileNavigation({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!, previous = document.activeElement as HTMLElement;
    const unlock = lockBodyScroll();
    dialog.showModal();
    return () => { dialog.close(); unlock(); if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const resize = () => { if (query.matches) onClose(); };
    query.addEventListener('change', resize);
    return () => query.removeEventListener('change', resize);
  }, [onClose]);
  return <dialog ref={ref} className="ad-root ad-mobile-navigation" aria-label="Navigation" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div className="ad-sidebar ad-mobile-sidebar"><button className="ad-icon-button ad-nav-close" aria-label="Close navigation" onClick={onClose}>×</button>{children}</div></dialog>;
}

// The persistent app frame (sidebar/topbar), rendered once from
// src/app/(workspace)/layout.tsx so it stays mounted across navigations —
// each screen's own heading/content now renders inside {children}, alongside
// the shared route-level loading.tsx fallback. Reads name/role from the
// existing client session context instead of page props, and derives the
// active nav item from the URL instead of a `screen` prop.
export default function AdminChrome({ storeName, storeOptions, selectedStoreId, allStoresSelected, children }: {
  storeName?: string; storeOptions?: StoreOption[]; selectedStoreId?: string; allStoresSelected?: boolean;
  children: ReactNode;
}) {
  const { user, logout, trial, sessionVerified, blockedReason } = useAdmin();
  const router = useRouter();
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const collapsed = useSyncExternalStore(subscribeSide, readSide, () => false);
  const toggleSide = () => { try { localStorage.setItem(SIDE_KEY, collapsed ? 'open' : 'rail'); } catch {} window.dispatchEvent(new Event(SIDE_EVENT)); };
  const screen = screenFromPathname(pathname);
  const role = user?.role;
  const name = user?.name ?? '';
  const multiStore = Boolean(storeOptions && storeOptions.length > 1);
  const brandName = storeName ?? 'Your store';
  const effectiveStoreName = screen === 'dashboard' && allStoresSelected ? 'All stores' : brandName;

  function confirmLogout() {
    setConfirmation({ title: 'Log out?', description: 'You can sign back in any time.', confirmLabel: 'Log out', onConfirm: async () => { await logout(); router.replace('/login'); } });
  }
  function selectStore(storeId: string) {
    selectStoreAction(storeId).then(result => { if (result.ok) { window.dispatchEvent(new Event('el-store-changed')); router.refresh(); } });
  }
  function selectAllStores() {
    selectDashboardAllStoresAction().then(result => { if (result.ok) { window.dispatchEvent(new Event('el-store-changed')); router.refresh(); } });
  }

  return <div className={"ad-root ad-app" + (screen === "dashboard" ? " ad-dashboard-shell" : "") + (screen === "orders" ? " ad-counter" : "") + (collapsed ? " ad-side-rail" : "")}>
    <aside className={'ad-sidebar ad-desktop-sidebar' + (collapsed ? ' rail' : '')}><Navigation screen={screen} role={role} name={name} brandName={brandName} storeName={effectiveStoreName} multiStore={multiStore} onLogout={confirmLogout} rail={collapsed}/></aside>
    {menu && <MobileNavigation onClose={() => setMenu(false)}><Navigation screen={screen} role={role} name={name} brandName={brandName} storeName={effectiveStoreName} multiStore={multiStore} onNavigate={() => setMenu(false)} onLogout={() => { setMenu(false); confirmLogout(); }}/></MobileNavigation>}
    <div className="ad-workspace">
      <header className="ad-topbar"><div className="ad-row"><button type="button" className="ad-collapse-toggle ad-icon-button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={toggleSide}><Icon name="hamburger" /></button><button className="ad-menu-toggle ad-icon-button" aria-label="Open navigation" aria-expanded={menu} onClick={() => setMenu(true)}>☰</button><span className="ad-breadcrumb">Workspace <span>/</span> {screen}</span>{multiStore && <StoreSwitcher options={storeOptions!} selectedStoreId={selectedStoreId} allStoresSelected={allStoresSelected} showAllStoresOption={screen === 'dashboard'} onSelectStore={selectStore} onSelectAllStores={selectAllStores}/>}</div><div className="ad-row">{screen === 'dashboard' && role === 'owner' && <div id="dashboard-outlet-control" />}<span className="ad-user-role">{name}{role && <> · {role === 'owner' ? 'Owner' : 'Employee'}</>}</span><Link href="/admin/profile" className="ad-avatar" aria-label={'Profile: ' + name}>{name.slice(0, 1)}</Link></div></header>
      {sessionVerified && blockedReason === 'store_locked' && <WorkspaceNotice label="Store access" tone="warning"><strong>Store locked · Read-only</strong> · You can view your records. Changes are disabled; contact your platform administrator to restore access.</WorkspaceNotice>}
      {sessionVerified && blockedReason !== 'store_locked' && trial && <WorkspaceNotice label="Subscription status" tone={trial.endingSoon ? 'warning' : 'info'} action={role === 'owner' ? { href: '/admin/profile', label: 'Subscription details →' } : undefined}>
        <strong>Free trial</strong> · Ends {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(trial.endsAt + 'T00:00:00+05:30'))}
      </WorkspaceNotice>}
      <WorkspaceAnnouncements audience="store" contextKey={`${user?.id ?? ''}:${user?.storeId ?? ''}`} />
      <main className="ad-main">
        {children}
      </main>
      <footer className="ad-bottom"><span className="ad-footer-brand">{brandName}</span><span><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · IST · INR ₹</span></footer>
    </div>
    {confirmation && <ConfirmationDialog {...confirmation} onCancel={() => setConfirmation(null)} onConfirm={() => { const action = confirmation.onConfirm; setConfirmation(null); action(); }}/>}
  </div>;
}
