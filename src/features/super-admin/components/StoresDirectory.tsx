'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { money, dateLabel, dateLabelFull } from '@/features/admin/admin.data';
import Icon from './Icon';
import RowMenu from './RowMenu';
import type { StoreListItem } from '../types';
import { initials, PAYMENT_STATE_BADGE } from '../utils';

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
    trial: stores.filter(s => s.paymentState === 'trial').length,
    trial_ending: stores.filter(s => s.paymentState === 'trial_ending').length,
    unset: stores.filter(s => s.paymentState === 'unset').length,
  }), [stores]);

  const searched = stores.filter(s => (s.name + ' ' + s.ownerName + ' ' + s.ownerPhone).toLowerCase().includes(search.trim().toLowerCase()));
  const filtered = filter === 'all' ? searched : searched.filter(s => s.paymentState === filter);
  const hasActiveFilter = filter !== 'all' || search.trim().length > 0;

  return <>
    <div className="stats">
      <div className="stat">
        <div className="stat-top"><span>Organizations</span><span className="stat-ic"><Icon name="store" /></span></div>
        <strong className="num">{counts.all}</strong><small>{stores.reduce((sum, s) => sum + s.outletCount, 0)} outlets total</small>
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
      {([
        ['all', 'All'],
        ['active', 'Active'],
        ['expiring', 'Expiring'],
        ['locked', 'Locked'],
        ['trial', 'Trial'],
        ['trial_ending', 'Trial ending'],
        ['unset', 'Terms not set'],
      ] as [Filter, string][]).map(([value, label]) => (
        <button key={value} type="button" className={'fpill' + (filter === value ? ' on' : '')} onClick={() => setFilter(value)} aria-pressed={filter === value}>{label} {counts[value]}</button>
      ))}
      <span className="ftools">
        <span className="fsearch"><Icon name="search" size="s" /><input aria-label="Search organizations" value={search} onChange={e => onSearch(e.target.value)} placeholder="Organization, owner or phone…" style={{ border: 0, background: 'transparent', padding: 0, height: 'auto', color: 'var(--ink)' }} /></span>
      </span>
    </div>

    {!filtered.length ? (
      <div className="card"><div className="empty">
        <span className="ic l"><Icon name="store" size="l" /></span>
        <h3>{hasActiveFilter ? `No matches${search.trim() ? ` for "${search.trim()}"` : ''}` : 'No organizations yet'}</h3>
        <p>{hasActiveFilter ? 'No organizations match this search or filter.' : 'Onboard the first laundry business to start tracking outlets, staff and billing.'}</p>
        {hasActiveFilter && <button type="button" className="btn outline sm" onClick={() => { setFilter('all'); onSearch(''); }}>Clear filters</button>}
      </div></div>
    ) : (
      <div className="tablecard">
        <table>
          <thead><tr><th>Organization</th><th>Owner</th><th className="right">Outlets</th><th className="right">Deposit</th><th className="right">Annual fee</th><th>Paid through</th><th>Status</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {filtered.map(store => {
              const badge = PAYMENT_STATE_BADGE[store.paymentState];
              return <tr key={store.id}>
                <td>
                  <div className="who">
                    <span className="av sq">{initials(store.name)}</span>
                    <span><Link href={`/super-admin/stores/${store.id}`}><strong>{store.name}</strong></Link>{store.address && <small>{store.address}</small>}</span>
                  </div>
                </td>
                <td>{store.ownerName}<small>{store.ownerPhone}</small></td>
                <td className="right num" style={store.outletCount === 0 ? { color: 'var(--bad-fg)' } : undefined}>{store.outletCount}</td>
                <td className="right num"><strong>{money(store.depositAmount)}</strong><small style={{ color: store.depositPaidAt ? 'var(--good-fg)' : 'var(--bad-fg)' }}>{store.depositPaidAt ? `Paid ${dateLabel(store.depositPaidAt)}` : 'Not received'}</small></td>
                <td className="right num">{money(store.annualFeeAmount)}</td>
                <td className="num">{store.paidThroughDate ? dateLabelFull(store.paidThroughDate) : '—'}</td>
                <td><span className={'badge ' + badge.cls}>{badge.label}</span></td>
                <td>
                  <div className="rowacts">
                    <Link className="icon-btn" href={`/super-admin/stores/${store.id}/edit`} aria-label={`Edit ${store.name}`} onClick={e => { e.preventDefault(); onEdit(store); }}><Icon name="edit" /></Link>
                    <RowMenu items={[
                      { label: 'View organization detail', icon: 'eye', onClick: () => router.push(`/super-admin/stores/${store.id}`) },
                      { label: store.status === 'LOCKED' ? 'Unlock organization' : 'Lock organization', icon: 'lock', onClick: () => onLockToggle(store) },
                      { label: 'Archive organization', icon: 'trash', onClick: () => onDelete(store), danger: true },
                    ]} />
                  </div>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    )}
  </>;
}
