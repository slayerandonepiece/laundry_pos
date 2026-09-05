'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Role, Screen } from '../admin.types';
import { homeFor } from '../admin.permissions';
import { lockBodyScroll } from '../admin.dialog';

const links = [['dashboard', '▦', 'Dashboard'], ['products', '◇', 'Products'], ['sales', '↗', 'Sales'], ['orders', '▤', 'Orders'], ['expenses', '▤', 'Expenses'], ['employees', '♧', 'Employees'], ['profile', '○', 'Profile']];

function Navigation({ screen, role, onNavigate, onLogout }: { screen: Screen; role: Role; onNavigate?: () => void; onLogout: () => void }) {
  return <>
    <Link className="ad-logo" href={homeFor(role)} onClick={onNavigate}><span className="ad-logo-mark">◎</span><span>Express Laundry<small>STORE WORKSPACE</small></span></Link>
    <p className="ad-nav-label">WORKSPACE</p>
    <nav aria-label="Admin navigation">{links.filter(([id]) => role === 'owner' ? id !== 'orders' : ['sales', 'orders'].includes(id)).map(([id, icon, label]) => <Link key={id} aria-current={screen === id ? 'page' : undefined} className={screen === id ? 'active' : ''} href={'/admin/' + id} onClick={onNavigate}><span aria-hidden="true">{icon}</span>{label}</Link>)}</nav>
    <div className="ad-sidebar-bottom"><div className="ad-store-note"><span className="ad-live-dot"/>Chinnappanahalli<small>One store. Everything in view.</small></div><Link href="/" onClick={onNavigate}>Visit public website ↗</Link><button onClick={onLogout}>Log out ↗</button></div>
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

export default function AdminShell({ screen, name, role, children, onLogout, onNew }: { screen: Screen; name: string; role: Role; children: ReactNode; onLogout: () => void; onNew: () => void }) {
  const [menu, setMenu] = useState(false);
  return <div className={"ad-root ad-app" + (role === "employee" && screen === "sales" ? " ad-counter" : "")}>
    <aside className="ad-sidebar ad-desktop-sidebar"><Navigation screen={screen} role={role} onLogout={onLogout}/></aside>
    {menu && <MobileNavigation onClose={() => setMenu(false)}><Navigation screen={screen} role={role} onNavigate={() => setMenu(false)} onLogout={() => { setMenu(false); onLogout(); }}/></MobileNavigation>}
    <div className="ad-workspace">
      <header className="ad-topbar"><div className="ad-row"><button className="ad-menu-toggle ad-icon-button" aria-label="Open navigation" aria-expanded={menu} onClick={() => setMenu(true)}>☰</button><span className="ad-breadcrumb">Workspace <span>/</span> {screen}</span></div><div className="ad-row"><span className="ad-user-role">{name} · {role === 'owner' ? 'Owner' : 'Employee'}</span>{role === 'owner' ? <Link href="/admin/profile" className="ad-avatar" aria-label={'Profile: ' + name}>{name.slice(0, 1)}</Link> : <span className="ad-avatar" aria-label={name}>{name.slice(0, 1)}</span>}</div></header>
      <main className="ad-main">
        <div className="ad-page-heading"><div><p className="ad-eyebrow">EXPRESS LAUNDRY WORKSPACE</p><h1>{screen.charAt(0).toUpperCase() + screen.slice(1)}</h1><p>{screen === 'dashboard' ? 'Your orders, sales and upcoming deliveries.' : { products: role === 'owner' ? 'Manage your services and prices.' : 'View the services available for orders.', sales: role === 'employee' ? 'Choose services, add customer details and punch an order.' : 'Track orders from drop-off to handover.', orders: 'Find orders and update their progress.', expenses: 'Track bills and payments.', employees: 'Manage your team and their access.', profile: 'Your account and store details.' }[screen as 'products']}</p></div>{screen === 'sales' && role === 'owner' && <button className="ad-button" onClick={onNew}>＋ New sale</button>}</div>
        <div className="ad-screen-content">{children}</div>
        <footer className="ad-bottom"><span className="ad-footer-brand">Express Laundry</span><span>Demo data · stored only in this browser</span></footer>
      </main>
    </div>
  </div>;
}
