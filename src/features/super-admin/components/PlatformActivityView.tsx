'use client';

import { useState } from 'react';
import Link from 'next/link';
import Icon from './Icon';
import { describeActivityEntry } from './StoreActivityTab';
import type { PlatformActivityEntry, StoreListItem } from '../types';

type ActivityCategory = 'all' | 'onboarding' | 'billing' | 'access' | 'outlets';

const CATEGORY_ACTIONS: Record<ActivityCategory, string[] | null> = {
  all: null,
  onboarding: ['ONBOARD_ORGANIZATION'],
  billing: ['CHANGE_SUBSCRIPTION_PLAN', 'RECORD_SUBSCRIPTION_PAYMENT'],
  access: ['LOCK_ORGANIZATION', 'UNLOCK_ORGANIZATION', 'ARCHIVE_ORGANIZATION'],
  outlets: ['CREATE_OUTLET', 'UPDATE_OUTLET', 'RELOCATE_OUTLET', 'CLOSE_OUTLET', 'REOPEN_OUTLET', 'RECONCILE_DAILY_ROLLUPS'],
};

function formatActivityTime(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const month = d.toLocaleString('en-IN', { month: 'short' });
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} ${month}, ${time}`;
}

export default function PlatformActivityView({
  entries,
  stores = [],
}: {
  entries: PlatformActivityEntry[];
  stores?: StoreListItem[];
}) {
  const [category, setCategory] = useState<ActivityCategory>('all');
  const [selectedOrgId, setSelectedOrgId] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = entries.filter(entry => {
    const allowedActions = CATEGORY_ACTIONS[category];
    if (allowedActions && !allowedActions.includes(entry.action)) return false;
    if (selectedOrgId !== 'all' && entry.storeId !== selectedOrgId) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const text = [
        entry.action,
        entry.entityType,
        entry.actorName ?? '',
        entry.actorPhone ?? '',
        entry.storeName ?? '',
        entry.outletName ?? '',
        entry.outletCode ?? '',
      ].join(' ').toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  const selectedStore = selectedOrgId !== 'all' ? stores.find(s => s.id === selectedOrgId) : null;
  const hasActiveFilter = category !== 'all' || selectedOrgId !== 'all' || search.trim().length > 0;

  return <>
    <div className="filters">
      {([
        ['all', 'All'],
        ['onboarding', 'Onboarding'],
        ['billing', 'Billing'],
        ['access', 'Lock / Archive'],
        ['outlets', 'Outlets'],
      ] as [ActivityCategory, string][]).map(([val, label]) => (
        <button
          key={val}
          type="button"
          className={'fpill' + (category === val ? ' on' : '')}
          onClick={() => setCategory(val)}
          aria-pressed={category === val}
        >
          {label}
        </button>
      ))}

      <span className="ftools">
        <select
          aria-label="Filter by organization"
          value={selectedOrgId}
          onChange={e => setSelectedOrgId(e.target.value)}
          className="fpill"
          style={{
            cursor: 'pointer',
            paddingRight: 24,
            fontWeight: 500,
            color: 'var(--ink)',
            background: 'var(--surface-1)',
            borderColor: 'var(--line)',
          }}
        >
          <option value="all">Every organization</option>
          {stores.map(store => (
            <option key={store.id} value={store.id}>{store.name}</option>
          ))}
        </select>
        <span className="fsearch">
          <Icon name="search" size="s" />
          <input
            aria-label="Search activity"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search activity…"
            style={{ border: 0, background: 'transparent', padding: 0, height: 'auto', color: 'var(--ink)' }}
          />
        </span>
      </span>
    </div>

    {!filtered.length ? (
      selectedStore ? (
        <div style={{ marginTop: 24 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>
            Empty — filtered to a quiet organization
          </p>
          <div className="card" style={{ borderStyle: 'dashed', background: '#fafbfc' }}>
            <div style={{ padding: '24px 28px' }}>
              <h4 style={{ margin: '0 0 6px', fontSize: 14, color: 'var(--ink)' }}>No activity for {selectedStore.name} yet</h4>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>
                It was onboarded but its subscription terms are still unset — nothing else has happened.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="card"><div className="empty">
          <span className="ic l"><Icon name="history" size="l" /></span>
          <h3>{hasActiveFilter ? `No matches${search.trim() ? ` for "${search.trim()}"` : ''}` : 'No platform activity recorded yet'}</h3>
          <p>{hasActiveFilter ? 'No events match this search or filter.' : 'Audited platform events and mutations will appear here in chronological order.'}</p>
          {hasActiveFilter && (
            <button type="button" className="btn outline sm" onClick={() => { setCategory('all'); setSelectedOrgId('all'); setSearch(''); }}>
              Clear filters
            </button>
          )}
        </div></div>
      )
    ) : (
      <div className="card">
        <div className="card-body" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <div className="tl">
            {filtered.map(entry => {
              const { icon, iconTone, title, detail } = describeActivityEntry(entry);
              return <div className="tl-item" key={entry.id}>
                <span className={`tl-ic${iconTone ? ` ${iconTone}` : ''}`}><Icon name={icon} /></span>
                <div className="tl-body">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                    <b>{title}</b>
                    {entry.storeName && (
                      <Link href={`/super-admin/stores/${entry.storeId}`} className="chip" style={{ fontSize: 11, padding: '2px 8px' }}>
                        <Icon name="building" size="s" />
                        {entry.storeName}
                      </Link>
                    )}
                    {entry.outletName && (
                      <span className="chip" style={{ fontSize: 11, padding: '2px 8px' }}>
                        {entry.outletName}
                      </span>
                    )}
                  </div>
                  {detail && <small>{detail}</small>}
                </div>
                <span className="tl-time">{formatActivityTime(entry.createdAt)}</span>
              </div>;
            })}
          </div>
        </div>
      </div>
    )}
  </>;
}
