'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAdmin } from '../containers/AdminProvider';
import type { Role, Screen } from '../admin.types';
import type { StoreOption } from '@/server/auth/session';
import { homeFor } from '../admin.permissions';
import { lockBodyScroll } from '../admin.dialog';
import { selectStoreAction, selectDashboardAllStoresAction } from '@/server/auth/actions';
import StoreSwitcher from './StoreSwitcher';
import ConfirmationDialog, { type Confirmation } from './ConfirmationDialog';

const links = [['dashboard', '◧', 'Dashboard'], ['products', '◇', 'Products'], ['sales', '▤', 'Sales'], ['orders', '▥', 'Orders'], ['expenses', '₹', 'Expenses'], ['employees', '◎', 'Employees'], ['outlets', '◫', 'Outlets'], ['profile', '◍', 'Profile']];

function screenFromPathname(pathname: string): Screen {
  if (pathname === '/') return 'dashboard';
  const segment = pathname.split('/')[2];
  const known: Screen[] = ['products', 'sales', 'orders', 'expenses', 'employees', 'outlets', 'profile'];
  return (known as string[]).includes(segment) ? (segment as Screen) : 'dashboard';
}

function Navigation({ screen, role, brandName, storeName, multiStore, onNavigate, onLogout }: { screen: Screen; role: Role | undefined; brandName: string; storeName: string; multiStore: boolean; onNavigate?: () => void; onLogout: () => void }) {
  return <>
    <Link className="ad-logo" href={role ? homeFor(role) : '/'} onClick={onNavigate}><span className="ad-logo-mark">◎</span><span>{brandName}<small>STORE WORKSPACE</small></span></Link>
    <p className="ad-nav-label">WORKSPACE</p>
    <nav aria-label="Admin navigation">{role && links.filter(([id]) => role === 'owner' ? (screen === 'dashboard' || id !== 'orders') : ['sales', 'orders'].includes(id)).map(([id, icon, label]) => <Link key={id} aria-current={screen === id ? 'page' : undefined} className={screen === id ? 'active' : ''} href={id === 'dashboard' ? '/' : '/admin/' + id} onClick={onNavigate}><span aria-hidden="true">{icon}</span>{label}</Link>)}</nav>
    <div className="ad-sidebar-bottom"><div className="ad-store-note"><span className="ad-live-dot"/>{storeName}<small>{multiStore ? 'Switch stores from the header above.' : 'One store. Everything in view.'}</small></div><button onClick={onLogout}>Log out ↗</button></div>
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
  const { user, logout } = useAdmin();
  const router = useRouter();
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const screen = screenFromPathname(pathname);
  const role = user?.role;
  const name = user?.name ?? '';
  const multiStore = Boolean(storeOptions && storeOptions.length > 1);
  const brandName = storeName ?? 'Your store';
  const effectiveStoreName = screen === 'dashboard' && allStoresSelected ? 'All stores' : brandName;

  function confirmLogout() {
    setConfirmation({ title: 'Log out?', description: 'You can sign back in any time.', confirmLabel: 'Log out', onConfirm: () => { logout(); router.replace('/login'); } });
  }
  function selectStore(storeId: string) {
    selectStoreAction(storeId).then(result => { if (result.ok) router.refresh(); });
  }
  function selectAllStores() {
    selectDashboardAllStoresAction().then(result => { if (result.ok) router.refresh(); });
  }

  return <div className={"ad-root ad-app" + (screen === "dashboard" ? " ad-dashboard-shell" : "") + (role === "employee" && screen === "sales" ? " ad-counter" : "")}>
    <aside className="ad-sidebar ad-desktop-sidebar"><Navigation screen={screen} role={role} brandName={brandName} storeName={effectiveStoreName} multiStore={multiStore} onLogout={confirmLogout}/></aside>
    {menu && <MobileNavigation onClose={() => setMenu(false)}><Navigation screen={screen} role={role} brandName={brandName} storeName={effectiveStoreName} multiStore={multiStore} onNavigate={() => setMenu(false)} onLogout={() => { setMenu(false); confirmLogout(); }}/></MobileNavigation>}
    <div className="ad-workspace">
      <header className="ad-topbar"><div className="ad-row"><button className="ad-menu-toggle ad-icon-button" aria-label="Open navigation" aria-expanded={menu} onClick={() => setMenu(true)}>☰</button><span className="ad-breadcrumb">Workspace <span>/</span> {screen}</span>{multiStore && <StoreSwitcher options={storeOptions!} selectedStoreId={selectedStoreId} allStoresSelected={allStoresSelected} showAllStoresOption={screen === 'dashboard'} onSelectStore={selectStore} onSelectAllStores={selectAllStores}/>}</div><div className="ad-row">{screen === 'dashboard' && role === 'owner' && <div id="dashboard-outlet-control" />}<span className="ad-user-role">{name}{role && <> · {role === 'owner' ? 'Owner' : 'Employee'}</>}</span>{role === 'owner' ? <Link href="/admin/profile" className="ad-avatar" aria-label={'Profile: ' + name}>{name.slice(0, 1)}</Link> : <span className="ad-avatar" aria-label={name}>{name.slice(0, 1)}</span>}</div></header>
      <main className="ad-main">
        {children}
        <footer className="ad-bottom"><span className="ad-footer-brand">{brandName}</span><span>IST · INR ₹</span></footer>
      </main>
    </div>
    {confirmation && <ConfirmationDialog {...confirmation} onCancel={() => setConfirmation(null)} onConfirm={() => { const action = confirmation.onConfirm; setConfirmation(null); action(); }}/>}
  </div>;
}
