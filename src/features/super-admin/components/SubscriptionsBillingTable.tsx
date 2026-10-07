'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { money, dateLabelFull } from '@/features/admin/admin.data';
import Icon from './Icon';
import RowMenu from './RowMenu';
import InvoicePdfViewer from './InvoicePdfViewer';
import type { CollectedThisYearStats, StoreListItem } from '../types';
import { initials, PAYMENT_STATE_BADGE } from '../utils';

type Filter = 'all' | StoreListItem['paymentState'];

export default function SubscriptionsBillingTable({ stores, collectedThisYear, search, onSearch, onRecordPayment }: {
  stores: StoreListItem[];
  collectedThisYear: CollectedThisYearStats;
  search: string;
  onSearch: (value: string) => void;
  onRecordPayment: (store: StoreListItem) => void;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [viewingInvoiceSeq, setViewingInvoiceSeq] = useState<number | null>(null);

  const counts = useMemo(() => ({
    active: stores.filter(s => s.paymentState === 'active').length,
    expiring: stores.filter(s => s.paymentState === 'expiring'),
    locked: stores.filter(s => s.paymentState === 'locked'),
    unset: stores.filter(s => s.paymentState === 'unset').length,
  }), [stores]);

  const dueSoonAmount = counts.expiring.reduce((sum, s) => sum + s.annualFeeAmount, 0);
  const overdueAmount = counts.locked.reduce((sum, s) => sum + s.annualFeeAmount, 0);

  const searched = stores.filter(s => (s.name + ' ' + s.ownerName).toLowerCase().includes(search.trim().toLowerCase()));
  const filtered = filter === 'all' ? searched : searched.filter(s => s.paymentState === filter);
  const hasActiveFilter = filter !== 'all' || search.trim().length > 0;

  function exportCsv() {
    const header = ['Organization', 'Owner', 'Plan', 'Deposit', 'Annual fee', 'Paid through', 'Status', 'Last invoice'];
    const rows = filtered.map(s => [
      s.name, s.ownerName, s.planName ?? 'No plan yet', String(s.depositAmount / 100), String(s.annualFeeAmount / 100),
      s.paidThroughDate ?? '', PAYMENT_STATE_BADGE[s.paymentState].label, s.lastInvoiceSeq ? `INV-${String(s.lastInvoiceSeq).padStart(6, '0')}` : '',
    ]);
    const csv = [header, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `subscriptions-billing-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!stores.length) return <div className="card"><div className="empty">
    <span className="ic l"><Icon name="card" size="l" /></span>
    <h3>No organizations yet</h3>
    <p>Once an organization is onboarded, its billing shows up here.</p>
  </div></div>;

  return <>
    <div className="stats cols-5">
      <div className="stat">
        <div className="stat-top"><span>Collected this year</span><span className="stat-ic"><Icon name="card" size="s" /></span></div>
        <strong className="num">{money(collectedThisYear.amount)}</strong>
        <small>
          {collectedThisYear.fyLabel}
          {collectedThisYear.deltaPercent !== undefined && (
            <> · <span className={'delta ' + (collectedThisYear.deltaPercent >= 0 ? 'up' : 'down')}>{collectedThisYear.deltaPercent >= 0 ? '+' : ''}{collectedThisYear.deltaPercent}%</span> vs last year</>
          )}
        </small>
      </div>
      <div className="stat">
        <div className="stat-top"><span>Active</span><span className="stat-ic"><Icon name="check" size="s" /></span></div>
        <strong className="num">{counts.active}</strong><small>paid through their term</small>
      </div>
      <div className="stat">
        <div className="stat-top"><span>Due in 30 days</span><span className="stat-ic" style={{ background: 'var(--warm-bg)', color: 'var(--warm-fg)' }}><Icon name="clock" size="s" /></span></div>
        <strong className="num">{money(dueSoonAmount)}</strong><small>across {counts.expiring.length} organization{counts.expiring.length === 1 ? '' : 's'}</small>
      </div>
      <div className="stat">
        <div className="stat-top"><span>Overdue</span><span className="stat-ic" style={{ background: 'var(--bad-bg)', color: 'var(--bad-fg)' }}><Icon name="alertTriangle" size="s" /></span></div>
        <strong className="num">{money(overdueAmount)}</strong><small>across {counts.locked.length} organization{counts.locked.length === 1 ? '' : 's'}</small>
      </div>
      <div className="stat">
        <div className="stat-top"><span>Awaiting payment</span><span className="stat-ic"><Icon name="filter" size="s" /></span></div>
        <strong className="num">{counts.unset}</strong><small>need onboarding</small>
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
        ['unset', 'Awaiting payment'],
      ] as [Filter, string][]).map(([value, label]) => (
        <button key={value} type="button" className={'fpill' + (filter === value ? ' on' : '')} onClick={() => setFilter(value)} aria-pressed={filter === value}>{label}</button>
      ))}
      <span className="ftools">
        <span className="fsearch"><Icon name="search" size="s" /><input aria-label="Search organization or owner" value={search} onChange={e => onSearch(e.target.value)} placeholder="Search organization or owner…" style={{ border: 0, background: 'transparent', padding: 0, height: 'auto', color: 'var(--ink)' }} /></span>
        <button type="button" className="btn outline sm" onClick={exportCsv}><Icon name="download" size="s" />Export</button>
      </span>
    </div>

    {!filtered.length ? (
      <div className="card"><div className="empty">
        <span className="ic l"><Icon name="card" size="l" /></span>
        <h3>No matches{search.trim() ? ` for "${search.trim()}"` : ''}</h3>
        <p>No organizations match this search or filter.</p>
        {hasActiveFilter && <button type="button" className="btn outline sm" onClick={() => { setFilter('all'); onSearch(''); }}>Clear filters</button>}
      </div></div>
    ) : (
      <div className="tablecard">
        <table>
          <thead><tr><th>Organization</th><th>Owner</th><th>Plan</th><th className="right">Deposit</th><th className="right">Annual fee</th><th>Paid through</th><th>Last invoice</th><th>Status</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {filtered.map(store => {
              const badge = PAYMENT_STATE_BADGE[store.paymentState];
              return <tr key={store.id}>
                <td><div className="who"><span className="av sq">{initials(store.name)}</span><Link href={`/super-admin/stores/${store.id}/subscription`}><strong>{store.name}</strong></Link></div></td>
                <td>{store.ownerName}</td>
                <td className="plan-cell">{store.planName
                  ? <span className="chip" title={store.planName}>{store.planName.replace(/\s+plan$/i, '')}</span>
                  : store.paymentState === 'trial' || store.paymentState === 'trial_ending' ? <span className="chip info">Free trial</span>
                  : <span className="chip" style={{ color: 'var(--faint)' }}>Custom</span>}
                  {store.annualFeeAmount > 0 && store.paymentState !== 'trial' && store.paymentState !== 'trial_ending' && <span className="tag annual">Annual</span>}</td>
                <td className="right num dep-cell">{money(store.depositAmount)}{store.depositAmount > 0 && <span className={'tag ' + (store.depositPaidAt ? 'paid' : 'due')}>{store.depositPaidAt ? 'Paid' : 'Unpaid'}</span>}</td>
                <td className="right num">{money(store.annualFeeAmount)}</td>
                <td className="num">{store.paidThroughDate ? dateLabelFull(store.paidThroughDate) : '—'}</td>
                <td className="num">
                  {store.lastInvoiceSeq ? (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => setViewingInvoiceSeq(store.lastInvoiceSeq ?? null)}
                      title="View invoice PDF in dialog"
                    >
                      INV-{String(store.lastInvoiceSeq).padStart(6, '0')}
                    </button>
                  ) : '—'}
                </td>
                <td><span className={'badge ' + badge.cls}>{badge.label}</span></td>
                <td>
                  <div className="rowacts">
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Record payment for ${store.name}`}
                      title="Record payment"
                      onClick={() => onRecordPayment(store)}
                    >
                      <Icon name="card" />
                    </button>
                    <RowMenu items={[
                      { label: 'Record payment', icon: 'card', onClick: () => onRecordPayment(store) },
                      ...(store.lastInvoiceSeq ? [{ label: 'View last invoice', icon: 'eye' as const, onClick: () => setViewingInvoiceSeq(store.lastInvoiceSeq!) }] : []),
                      { label: 'View subscription', icon: 'subscriptions', onClick: () => router.push(`/super-admin/stores/${store.id}/subscription`) },
                      { label: 'View organization', icon: 'building', onClick: () => router.push(`/super-admin/stores/${store.id}`) },
                    ]} />
                  </div>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    )}
    {viewingInvoiceSeq !== null && (
      <InvoicePdfViewer invoiceSeq={viewingInvoiceSeq} onClose={() => setViewingInvoiceSeq(null)} />
    )}
  </>;
}
