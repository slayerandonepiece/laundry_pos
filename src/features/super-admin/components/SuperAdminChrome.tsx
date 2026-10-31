'use client';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import WorkspaceAnnouncements from '@/components/WorkspaceAnnouncements';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { lockBodyScroll } from '@/features/admin/admin.dialog';
import { superAdminLogoutAction } from '../actions/auth.actions';
import Icon, { type IconName } from './Icon';
import { initials } from '../utils';
import CommandPalette from './CommandPalette';

const links: [string, IconName, string, string][] = [
  ['/super-admin', 'dashboard', 'Dashboard', 'Home'],
  ['/super-admin/stores', 'store', 'Organizations', 'Orgs'],
  ['/super-admin/users', 'users', 'People', 'People'],
  ['/super-admin/subscriptions', 'subscriptions', 'Subscriptions', 'Plans'],
  ['/super-admin/billing', 'card', 'Billing', 'Billing'],
  ['/super-admin/payment-methods', 'card', 'Payment methods', 'Pay'],
  ['/super-admin/message-templates', 'mail', 'Message templates', 'Msgs'],
  ['/super-admin/tools/import', 'export', 'Import history', 'Import'],
  ['/super-admin/tools/corrections', 'edit', 'Order corrections', 'Fixes'],
  ['/super-admin/announcements', 'bell', 'Announcements', 'News'],
  ['/super-admin/app-updates', 'bell', 'App updates', 'Updates'],
  ['/super-admin/activity', 'history', 'Activity', 'Activity'],
  ['/super-admin/deletion-requests', 'trash', 'Deletion requests', 'Deletes'],
  ['/super-admin/profile', 'users', 'Profile', 'Profile'],
];

const SIDE_KEY = 'soa-side';
const SIDE_EVENT = 'soa-side-change';
const subscribeSide = (notify: () => void) => { window.addEventListener(SIDE_EVENT, notify); window.addEventListener('storage', notify); return () => { window.removeEventListener(SIDE_EVENT, notify); window.removeEventListener('storage', notify); }; };
const readSide = () => { try { return localStorage.getItem(SIDE_KEY) !== 'open'; } catch { return true; } };

function Nav({ pathname, name, pendingDeletions = 0, onNavigate, rail = false }: { pathname: string; name: string; pendingDeletions?: number; onNavigate?: () => void; rail?: boolean }) {
  return <>
    <div className="brand">
      <span className="brand-mark"><Icon name="logo" size="l" /></span>
      <span><b>StoreOps</b><small>PLATFORM ADMIN</small></span>
    </div>
    <p className="nav-label">PLATFORM</p>
    <nav aria-label="Super Admin navigation">
      {links.map(([href, icon, label, short]) => {
        let active = false;
        if (href === '/super-admin') {
          active = pathname === '/super-admin';
        } else if (href === '/super-admin/subscriptions') {
          active = pathname === '/super-admin/subscriptions' || (pathname.startsWith('/super-admin/subscriptions/') && !pathname.startsWith('/super-admin/subscriptions/billing') && !pathname.startsWith('/super-admin/subscriptions/invoices'));
        } else if (href === '/super-admin/billing') {
          active = pathname === '/super-admin/billing' || pathname.startsWith('/super-admin/billing/') || pathname.startsWith('/super-admin/subscriptions/billing') || pathname.startsWith('/super-admin/subscriptions/invoices');
        } else {
          active = pathname === href || pathname.startsWith(href + '/');
        }
        return <Link key={href} href={href} aria-current={active ? 'page' : undefined} aria-label={rail ? label : undefined} title={rail ? label : undefined} className={active ? 'on' : ''} onClick={onNavigate}>
          <Icon name={icon} />{rail ? <span className="side-short">{short}</span> : label}
          {href === '/super-admin/deletion-requests' && pendingDeletions > 0 && <span className="badge warm plain" style={rail ? undefined : { marginLeft: 'auto' }} aria-label={`${pendingDeletions} pending`}>{pendingDeletions}</span>}
        </Link>;
      })}
    </nav>
    <div className="side-foot">
      <span className="av sq" style={{ background: 'var(--ink)' }}>{initials(name)}</span>
      <span><b>{name}</b><small>Super Admin</small></span>
    </div>
  </>;
}

// A native <dialog> gives us a real focus trap and background inert-ness for
// free (showModal()), and — critically — is only mounted while open, so its
// links never sit in the tab order behind a CSS-hidden drawer. Mirrors the
// store workspace's MobileNavigation in features/admin/components/AdminChrome.tsx.
function MobileNav({ pathname, name, pendingDeletions, onClose }: { pathname: string; name: string; pendingDeletions: number; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!, previous = document.activeElement as HTMLElement;
    const unlock = lockBodyScroll();
    dialog.showModal();
    return () => { dialog.close(); unlock(); if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 769px)');
    const resize = () => { if (query.matches) onClose(); };
    query.addEventListener('change', resize);
    return () => query.removeEventListener('change', resize);
  }, [onClose]);
  return <dialog ref={ref} className="side-dialog" aria-label="Navigation" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="side">
      <button className="icon-btn side-close" aria-label="Close navigation" onClick={onClose}><Icon name="close" /></button>
      <Nav pathname={pathname} name={name} pendingDeletions={pendingDeletions} onNavigate={onClose} />
    </div>
  </dialog>;
}

// The persistent app frame (sidebar/topbar), rendered once from
// src/app/super-admin/(shell)/layout.tsx so it stays mounted across
// navigations — each page's own title/subtitle/action heading now renders
// as part of its own content instead, inside {children}, alongside the
// per-route loading.tsx fallback.
export default function SuperAdminChrome({ name, pendingDeletions = 0, children }: { name: string; pendingDeletions?: number; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [palette, setPalette] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPalette(open => !open); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // Collapsed by default; the choice is remembered per browser.
  const collapsed = useSyncExternalStore(subscribeSide, readSide, () => true);
  const toggleSide = () => { try { localStorage.setItem(SIDE_KEY, collapsed ? 'open' : 'rail'); } catch {} window.dispatchEvent(new Event(SIDE_EVENT)); };

  function logout() {
    superAdminLogoutAction().then(() => {
      try { sessionStorage.clear(); } catch {}
      try { localStorage.removeItem('el_draft'); } catch {}
      router.replace('/login');
    });
  }

  const activeLink = links.find(([href]) => href === '/super-admin' ? pathname === href : pathname === href || pathname.startsWith(href + '/'));
  const crumbLabel = activeLink?.[2] ?? 'Dashboard';

  return <div className="app">
    <aside className={'side' + (collapsed ? ' rail' : '')}>
      <Nav pathname={pathname} name={name} pendingDeletions={pendingDeletions} rail={collapsed} />
    </aside>
    <CommandPalette open={palette} onClose={() => setPalette(false)} />
    {menu && <MobileNav pathname={pathname} name={name} pendingDeletions={pendingDeletions} onClose={() => setMenu(false)} />}
    <div className="workspace">
      <header className="top">
        <button className="collapse-toggle icon-btn" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={toggleSide}><Icon name="hamburger" /></button>
        <button className="menu-toggle icon-btn" aria-label="Open navigation" aria-expanded={menu} onClick={() => setMenu(true)}><Icon name="hamburger" /></button>
        <div className="crumb">Platform <Icon name="chevronRight" /> <b>{crumbLabel}</b></div>
        <button type="button" className="searchbar" aria-haspopup="dialog" onClick={() => setPalette(true)}>
          <Icon name="search" size="s" /><span>Search or jump to…</span><kbd className="kbd">⌘K</kbd>
        </button>
        <div className="top-right">
          <span className="icon-btn plain" aria-hidden="true" title="Notifications aren't built yet"><Icon name="bell" /></span>
          <Link className="av" href="/super-admin/profile" aria-label={`Profile: ${name}`} title="Profile">{initials(name)}</Link>
          <button className="btn outline" onClick={logout}>Log out</button>
        </div>
      </header>
      <WorkspaceAnnouncements audience="platform" />
      <main className="main">
        {children}
      </main>
    </div>
  </div>;
}
