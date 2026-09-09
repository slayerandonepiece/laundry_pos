'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { money, dateLabel, dateLabelFull } from '@/features/admin/admin.data';
import Icon from './Icon';
import RowMenu from './RowMenu';
import type { StoreListItem } from '../types';

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || name.slice(0, 2).toUpperCase();
}

const STATUS_BADGE: Record<StoreListItem['paymentState'], { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'good' },
  expiring: { label: 'Expiring', cls: 'warm' },
  locked: { label: 'Locked', cls: 'bad' },
  unset: { label: 'Terms not set', cls: 'gray' },
};

type Filter = 'all' | StoreListItem['paymentState'];

export default function StoresDirectory({ stores, search, onSearch, onEdit, onLockToggle, onDelete }: {
  stores: StoreListItem[];
  search: string;
  onSearch: (value: string) => void;
  onEdit: (store: StoreListItem) => void;
  onLockToggle: (store: StoreListItem) => void;
  onDelete: (store: StoreListItem) => void;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');

  const counts = useMemo(() => ({
    all: stores.length,
    active: stores.filter(s => s.paymentState === 'active').length,
    expiring: stores.filter(s => s.paymentState === 'expiring').length,
    locked: stores.filter(s => s.paymentState === 'locked').length,
  }), [stores]);

  const searched = stores.filter(s => (s.name + ' ' + s.ownerName + ' ' + s.ownerUsername).toLowerCase().includes(search.trim().toLowerCase()));
  const filtered = filter === 'all' ? searched : searched.filter(s => s.paymentState === filter);
  const hasActiveFilter = filter !== 'all' || search.trim().length > 0;

  return <>
    <div className="stats">
      <div className="stat">
        <div className="stat-top"><span>Live stores</span><span className="stat-ic"><Icon name="store" /></span></div>
        <strong className="num">{counts.all}</strong><small>onboarded so far</small>
      </div>
      <div className="stat">
        <div className="stat-top"><span>Active</span><span className="stat-ic" style={{ background: 'var(--good-bg)', color: 'var(--good-fg)' }}><Icon name="check" /></span></div>
        <strong className="num">{counts.active}</strong><small>paid through</small>
      </div>
      <div className="stat">
        <div className="stat-top"><span>Expiring soon</span><span className="stat-ic" style={{ background: 'var(--warm-bg)', color: 'var(--warm-fg)' }}><Icon name="clock" /></span></div>
        <strong className="num">{counts.expiring}</strong><small>renew soon</small>
      </div>
      <div className="stat">
        <div className="stat-top"><span>Locked</span><span className="stat-ic" style={{ background: 'var(--bad-bg)', color: 'var(--bad-fg)' }}><Icon name="lock" /></span></div>
        <strong className="num">{counts.locked}</strong><small>past due</small>
      </div>
    </div>

    <div className="filters">
      {([['all', 'All stores'], ['active', 'Active'], ['expiring', 'Expiring'], ['locked', 'Locked'], ['unset', 'Terms not set']] as [Filter, string][]).map(([value, label]) => (
        <button key={value} type="button" className={'fpill' + (filter === value ? ' on' : '')} onClick={() => setFilter(value)} aria-pressed={filter === value}>{label}</button>
      ))}
      <span className="ftools">
        <span className="fsearch"><Icon name="search" size="s" /><input aria-label="Search stores" value={search} onChange={e => onSearch(e.target.value)} placeholder="Search store, owner, or username…" style={{ border: 0, background: 'transparent', padding: 0, height: 'auto', color: 'var(--ink)' }} /></span>
      </span>
    </div>

    {!filtered.length ? (
      <div className="card"><div className="empty">
        <span className="ic l"><Icon name="store" size="l" /></span>
        <h3>{hasActiveFilter ? `No matches${search.trim() ? ` for "${search.trim()}"` : ''}` : 'Nothing here yet'}</h3>
        <p>{hasActiveFilter ? 'No stores match this search or filter.' : 'Onboard your first store to get started.'}</p>
        {hasActiveFilter && <button type="button" className="btn outline sm" onClick={() => { setFilter('all'); onSearch(''); }}>Clear filters</button>}
      </div></div>
    ) : (
      <div className="tablecard">
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Store</th><th>Owner</th><th className="right">Deposit</th><th className="right">Annual fee</th><th>Paid through</th><th>Status</th><th className="right">Actions</th></tr></thead>
            <tbody>
              {filtered.map(store => {
                const badge = STATUS_BADGE[store.paymentState];
                return <tr key={store.id}>
                  <td>
                    <div className="who">
                      <span className="av sq">{initials(store.name)}</span>
                      <span><Link href={`/super-admin/stores/${store.id}`}><strong>{store.name}</strong></Link>{store.address && <small>{store.address}</small>}</span>
                    </div>
                  </td>
                  <td>{store.ownerName}<small>@{store.ownerUsername}</small></td>
                  <td className="right num"><strong>{money(store.depositAmount)}</strong><small style={{ color: store.depositPaidAt ? 'var(--good-fg)' : 'var(--bad-fg)' }}>{store.depositPaidAt ? `Paid ${dateLabel(store.depositPaidAt)}` : 'Not received'}</small></td>
                  <td className="right num">{money(store.annualFeeAmount)}</td>
                  <td className="num">{store.paidThroughDate ? dateLabelFull(store.paidThroughDate) : '—'}</td>
                  <td><span className={'badge ' + badge.cls}>{badge.label}</span></td>
                  <td>
                    <div className="rowacts">
                      <Link className="icon-btn" href={`/super-admin/stores/${store.id}/edit`} aria-label={`Edit ${store.name}`} onClick={e => { e.preventDefault(); onEdit(store); }}><Icon name="edit" /></Link>
                      <RowMenu items={[
                        { label: 'View store detail', icon: 'eye', onClick: () => router.push(`/super-admin/stores/${store.id}`) },
                        { label: store.status === 'LOCKED' ? 'Unlock store' : 'Lock store', icon: 'lock', onClick: () => onLockToggle(store) },
                        { label: 'Delete store', icon: 'trash', onClick: () => onDelete(store), danger: true },
                      ]} />
                    </div>
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>
    )}
  </>;
}
