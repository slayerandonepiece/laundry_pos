'use client';
import { useMemo, useState } from 'react';
import Icon from './Icon';
import RowMenu from './RowMenu';
import type { PlatformPaymentMethodDTO } from '@/server/services/platform-payment-methods';
import { formatDisplayDate, PAYMENT_STAGE_LABELS } from '../utils';

type Filter = 'all' | 'active' | 'inactive';

export default function PaymentMethodsTable({
  methods,
  onEdit,
  onToggleActive,
}: {
  methods: PlatformPaymentMethodDTO[];
  onEdit: (method: PlatformPaymentMethodDTO) => void;
  onToggleActive: (method: PlatformPaymentMethodDTO) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const counts = useMemo(() => ({
    all: methods.length,
    active: methods.filter(m => m.active).length,
    inactive: methods.filter(m => !m.active).length,
  }), [methods]);

  const searched = methods.filter(m =>
    (m.name + ' ' + m.code).toLowerCase().includes(search.trim().toLowerCase())
  );
  const filtered = filter === 'all' ? searched : searched.filter(m => filter === 'active' ? m.active : !m.active);
  const hasActiveFilter = filter !== 'all' || search.trim().length > 0;

  return <>
    <div className="stats cols-3">
      <div className="stat">
        <div className="stat-top"><span>Total methods</span><span className="stat-ic"><Icon name="card" /></span></div>
        <strong className="num">{counts.all}</strong><small>in global catalog</small>
      </div>
      <div className="stat">
        <div className="stat-top"><span>Active</span><span className="stat-ic" style={{ background: 'var(--good-bg)', color: 'var(--good-fg)' }}><Icon name="check" /></span></div>
        <strong className="num">{counts.active}</strong><small>available to organizations</small>
      </div>
      <div className="stat">
        <div className="stat-top"><span>Inactive</span><span className="stat-ic" style={{ background: 'var(--gray-bg)', color: 'var(--gray-fg)' }}><Icon name="lock" /></span></div>
        <strong className="num">{counts.inactive}</strong><small>disabled</small>
      </div>
    </div>

    <div className="filters">
      {([['all', 'All'], ['active', 'Active'], ['inactive', 'Inactive']] as [Filter, string][]).map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={'fpill' + (filter === value ? ' on' : '')}
          onClick={() => setFilter(value)}
          aria-pressed={filter === value}
        >
          {label} {counts[value]}
        </button>
      ))}
      <span className="ftools">
        <span className="fsearch">
          <Icon name="search" size="s" />
          <input
            aria-label="Search payment methods"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search method or code…"
            style={{ border: 0, background: 'transparent', padding: 0, height: 'auto', color: 'var(--ink)' }}
          />
        </span>
      </span>
    </div>

    {!filtered.length ? (
      <div className="card"><div className="empty">
        <span className="ic l"><Icon name="card" size="l" /></span>
        <h3>{hasActiveFilter ? `No matches${search.trim() ? ` for "${search.trim()}"` : ''}` : 'No payment methods yet'}</h3>
        <p>{hasActiveFilter ? 'No payment methods match this search or filter.' : 'Add the first payment method to the global catalog.'}</p>
        {hasActiveFilter && (
          <button type="button" className="btn outline sm" onClick={() => { setFilter('all'); setSearch(''); }}>
            Clear filters
          </button>
        )}
      </div></div>
    ) : (
      <div className="tablecard">
        <table>
          <thead>
            <tr>
              <th>Payment method</th>
              <th>Code</th>
              <th>Status</th>
              <th>New organizations</th>
              <th>Created</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(method => (
              <tr key={method.id}>
                <td>
                  <div className="who">
                    <span className="av sq"><Icon name="card" /></span>
                    <strong>{method.name}</strong>
                  </div>
                </td>
                <td>
                  <span className="chip num">{method.code}</span>
                </td>
                <td>
                  <span className={'badge ' + (method.active ? 'good' : 'gray')}>
                    {method.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>{method.enabledByDefault ? <span className="chip">On · {PAYMENT_STAGE_LABELS[method.defaultStage]}</span> : <span style={{ color: 'var(--muted)' }}>Off</span>}</td>
                <td className="num">{formatDisplayDate(method.createdAt)}</td>
                <td>
                  <div className="rowacts">
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Edit ${method.name}`}
                      onClick={() => onEdit(method)}
                    >
                      <Icon name="edit" />
                    </button>
                    <RowMenu items={[
                      { label: 'Edit method', icon: 'edit', onClick: () => onEdit(method) },
                      {
                        label: method.active ? 'Deactivate' : 'Activate',
                        icon: method.active ? 'lock' : 'check',
                        onClick: () => onToggleActive(method),
                        danger: method.active,
                      },
                    ]} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </>;
}
