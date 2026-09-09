'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { lockBodyScroll } from '@/features/admin/admin.dialog';
import Icon from './Icon';

const links: [string, import('./Icon').IconName, string][] = [
  ['/super-admin', 'dashboard', 'Dashboard'],
  ['/super-admin/stores', 'store', 'Stores'],
  ['/super-admin/users', 'users', 'Users'],
  ['/super-admin/subscriptions', 'subscriptions', 'Subscriptions'],
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || name.slice(0, 2).toUpperCase();
}

function Nav({ pathname, name, onNavigate }: { pathname: string; name: string; onNavigate?: () => void }) {
  return <>
    <div className="brand">
      <span className="brand-mark"><Icon name="logo" size="l" /></span>
      <span><b>StoreOps</b><small>PLATFORM ADMIN</small></span>
    </div>
    <p className="nav-label">PLATFORM</p>
    <nav aria-label="Super Admin navigation">
      {links.map(([href, icon, label]) => {
        const active = href === '/super-admin' ? pathname === href : pathname === href || pathname.startsWith(href + '/');
        return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={active ? 'on' : ''} onClick={onNavigate}>
          <Icon name={icon} />{label}
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
// store workspace's MobileNavigation in features/admin/components/AdminShell.tsx.
function MobileNav({ pathname, name, onClose }: { pathname: string; name: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!, previous = document.activeElement as HTMLElement;
    const unlock = lockBodyScroll();
    dialog.showModal();
    return () => { dialog.close(); unlock(); if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 900px)');
    const resize = () => { if (query.matches) onClose(); };
    query.addEventListener('change', resize);
    return () => query.removeEventListener('change', resize);
  }, [onClose]);
  return <dialog ref={ref} className="side-dialog" aria-label="Navigation" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="side">
      <button className="icon-btn side-close" aria-label="Close navigation" onClick={onClose}><Icon name="close" /></button>
      <Nav pathname={pathname} name={name} onNavigate={onClose} />
    </div>
  </dialog>;
}

export default function SuperAdminShell({ title, subtitle, name, breadcrumb, action, hidePhead, children, onLogout }: {
  title: string;
  subtitle: string;
  name: string;
  breadcrumb?: ReactNode;
  action?: ReactNode;
  hidePhead?: boolean;
  children: ReactNode;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const activeLink = links.find(([href]) => href === '/super-admin' ? pathname === href : pathname === href || pathname.startsWith(href + '/'));
  const pageIcon = activeLink?.[1] ?? 'store';

  // The header search has no data of its own to search — each screen (Stores,
  // Users, Billing) already has a real, working search input. Cmd/Ctrl+K and
  // clicking the header search jump to whichever of those is on the current
  // page, rather than the control looking clickable while doing nothing.
  const focusPageSearch = () => {
    document.querySelector<HTMLInputElement>('.fsearch input')?.focus();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); focusPageSearch(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return <div className="app">
    <aside className="side">
      <Nav pathname={pathname} name={name} />
    </aside>
    {menu && <MobileNav pathname={pathname} name={name} onClose={() => setMenu(false)} />}
    <div className="workspace">
      <header className="top">
        <button className="menu-toggle icon-btn" aria-label="Open navigation" aria-expanded={menu} onClick={() => setMenu(true)}><Icon name="hamburger" /></button>
        <div className="crumb">
          {breadcrumb ?? <>Platform <Icon name="chevronRight" /> <b>{title}</b></>}
        </div>
        <button type="button" className="searchbar" onClick={focusPageSearch} aria-label="Jump to this page's search (Ctrl+K)">
          <Icon name="search" size="s" /><span>Search…</span><span className="kbd">⌘K</span>
        </button>
        <div className="top-right">
          <span className="icon-btn plain" aria-hidden="true" title="Notifications aren't built yet"><Icon name="bell" /></span>
          <button className="av" aria-label={`${name} · Log out`} onClick={onLogout} title="Log out">{initials(name)}</button>
        </div>
      </header>
      <main className="main">
        {!hidePhead && (
          <div className="phead">
            <div className="phead-l">
              <span className="phead-ic"><Icon name={pageIcon} /></span>
              <div><h1>{title}</h1><p>{subtitle}</p></div>
            </div>
            {action && <div className="phead-r">{action}</div>}
          </div>
        )}
        {children}
      </main>
    </div>
  </div>;
}
