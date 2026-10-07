'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon, { type IconName } from './Icon';
import { searchPaletteOrganizationsAction, type PaletteOrganization } from '../actions/palette.actions';

interface Command { id: string; label: string; hint: string; href: string; icon: IconName; keywords: string; group: 'Quick actions' | 'Go to' }

const COMMANDS: Command[] = [
  { id: 'add-org', label: 'Add organization', hint: 'Onboard a new laundry', href: '/super-admin/stores?new=1', icon: 'plus', keywords: 'new onboard create organization store', group: 'Quick actions' },
  { id: 'view-orgs', label: 'View organizations', hint: 'All organizations and their billing standing', href: '/super-admin/stores', icon: 'store', keywords: 'organizations stores list tenants', group: 'Quick actions' },
  { id: 'add-person', label: 'Add person', hint: 'Create an owner or employee account', href: '/super-admin/users?new=1', icon: 'plus', keywords: 'user people owner employee create account', group: 'Quick actions' },
  { id: 'new-plan', label: 'Create plan', hint: 'Reusable subscription terms', href: '/super-admin/subscriptions?new=1', icon: 'plus', keywords: 'subscription plan pricing new', group: 'Quick actions' },
  { id: 'record-payment', label: 'Record subscription payment', hint: 'Billing and renewals', href: '/super-admin/billing', icon: 'card', keywords: 'payment renewal invoice billing deposit', group: 'Quick actions' },
  { id: 'import', label: 'Import past orders', hint: 'Add old months of orders and amounts', href: '/super-admin/tools/import', icon: 'export', keywords: 'import history orders excel migrate', group: 'Quick actions' },
  { id: 'corrections', label: 'Correct a delivered order', hint: 'Fix a customer or payment', href: '/super-admin/tools/corrections', icon: 'edit', keywords: 'correction fix order payment customer', group: 'Quick actions' },
  { id: 'templates', label: 'Edit message templates', hint: 'Default order status messages', href: '/super-admin/message-templates', icon: 'mail', keywords: 'message template whatsapp ready delivered', group: 'Quick actions' },
  { id: 'go-dashboard', label: 'Dashboard', hint: '/super-admin', href: '/super-admin', icon: 'dashboard', keywords: 'home overview', group: 'Go to' },
  { id: 'go-people', label: 'People', hint: '/super-admin/users', href: '/super-admin/users', icon: 'users', keywords: 'users accounts', group: 'Go to' },
  { id: 'go-plans', label: 'Plans', hint: '/super-admin/subscriptions', href: '/super-admin/subscriptions', icon: 'subscriptions', keywords: 'subscriptions pricing', group: 'Go to' },
  { id: 'go-billing', label: 'Billing', hint: '/super-admin/billing', href: '/super-admin/billing', icon: 'card', keywords: 'invoices payments', group: 'Go to' },
  { id: 'go-payment-methods', label: 'Payment methods', hint: '/super-admin/payment-methods', href: '/super-admin/payment-methods', icon: 'card', keywords: 'cash upi cod catalogue', group: 'Go to' },
  { id: 'go-announcements', label: 'Announcements', hint: '/super-admin/announcements', href: '/super-admin/announcements', icon: 'bell', keywords: 'notice banner message', group: 'Go to' },
  { id: 'go-activity', label: 'Activity', hint: '/super-admin/activity', href: '/super-admin/activity', icon: 'history', keywords: 'audit log history', group: 'Go to' },
  { id: 'go-deletions', label: 'Deletion requests', hint: '/super-admin/deletion-requests', icon: 'trash', href: '/super-admin/deletion-requests', keywords: 'delete account restore', group: 'Go to' },
  { id: 'go-profile', label: 'My profile', hint: '/super-admin/profile', href: '/super-admin/profile', icon: 'users', keywords: 'account password', group: 'Go to' },
];

interface Entry { key: string; label: string; hint: string; href: string; icon: IconName }

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [orgs, setOrgs] = useState<{ for: string; rows: PaletteOrganization[] }>({ for: '', rows: [] });

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) { el.showModal(); input.current?.focus(); }
    if (!open && el.open) el.close();
  }, [open]);

  const text = query.trim();
  useEffect(() => {
    if (!open || text.length < 2) return;
    let stale = false;
    const timer = setTimeout(() => {
      searchPaletteOrganizationsAction(text).then(rows => { if (!stale) setOrgs({ for: text, rows }); }).catch(() => undefined);
    }, 200);
    return () => { stale = true; clearTimeout(timer); };
  }, [text, open]);

  const sections = useMemo(() => {
    const needle = text.toLowerCase();
    const match = (command: Command) => !needle || `${command.label} ${command.keywords}`.toLowerCase().includes(needle);
    const toEntry = (command: Command): Entry => ({ key: command.id, label: command.label, hint: command.hint, href: command.href, icon: command.icon });
    const out: { title: string; entries: Entry[] }[] = [];
    const found = orgs.for === text ? orgs.rows : [];
    if (found.length) out.push({ title: 'Organizations', entries: found.map(org => ({ key: `org-${org.id}`, label: org.name, hint: `View organization · ${org.orgCode}`, href: `/super-admin/stores/${org.id}`, icon: 'store' as IconName })) });
    for (const group of ['Quick actions', 'Go to'] as const) {
      const entries = COMMANDS.filter(command => command.group === group && match(command)).map(toEntry);
      if (entries.length) out.push({ title: group, entries });
    }
    return out;
  }, [text, orgs]);
  const flat = sections.flatMap(section => section.entries);
  const current = Math.min(active, Math.max(flat.length - 1, 0));

  function close() { setQuery(''); setActive(0); onClose(); }
  function go(entry: Entry | undefined) { if (!entry) return; close(); router.push(entry.href.replace('new=1', `new=${++seq.current}`)); }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(Math.min(current + 1, flat.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(Math.max(current - 1, 0)); }
    else if (event.key === 'Enter') { event.preventDefault(); go(flat[current]); }
  }

  let index = -1;
  return <dialog ref={dialog} className="cmdk" aria-label="Search and commands" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="cmdk-box" onKeyDown={onKeyDown}>
      <div className="cmdk-input"><Icon name="search" size="s" />
        <input ref={input} value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} placeholder="Type a command or search organizations…" autoComplete="off" role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-activedescendant={flat[current] ? `cmdk-${flat[current].key}` : undefined} />
        <kbd className="kbd">Esc</kbd></div>
      <div id="cmdk-list" className="cmdk-list" role="listbox">
        {sections.map(section => <div key={section.title} role="group" aria-label={section.title}>
          <div className="cmdk-title">{section.title}</div>
          {section.entries.map(entry => {
            index += 1;
            const mine = index;
            return <button key={entry.key} id={`cmdk-${entry.key}`} type="button" role="option" aria-selected={mine === current} className={'cmdk-item' + (mine === current ? ' on' : '')} onMouseEnter={() => setActive(mine)} onClick={() => go(entry)}>
              <span className="cmdk-ic"><Icon name={entry.icon} size="s" /></span>
              <span className="cmdk-text"><b>{entry.label}</b><small>{entry.hint}</small></span>
              {mine === current && <span className="cmdk-go">Enter ↵</span>}
            </button>;
          })}
        </div>)}
        {!flat.length && <p className="cmdk-empty">Nothing matches &ldquo;{text}&rdquo;. Try an organization name or a task like &ldquo;import&rdquo;.</p>}
      </div>
      <div className="cmdk-foot"><span><kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> navigate</span><span><kbd className="kbd">↵</kbd> open</span><span><kbd className="kbd">Esc</kbd> close</span></div>
    </div>
  </dialog>;
}
