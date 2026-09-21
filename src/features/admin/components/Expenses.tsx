'use client';

import { useState } from 'react';
import type { Expense } from '../admin.types';
import type { OutletListItem } from '@/features/super-admin/types';
import { today, dateLabel, money } from '../admin.data';
import { Card, Pill, Badge, EmptyState } from './ui';

export default function Expenses({
  expenses,
  outlets,
  onNew,
  onPaid
}: {
  expenses: Expense[];
  outlets: OutletListItem[];
  onNew: () => void;
  onPaid: (id: string) => void;
}) {
  const [selectedOutlet, setSelectedOutlet] = useState<string | 'all' | 'org'>('all');
  
  const filteredExpenses = expenses.filter(e => {
    if (selectedOutlet === 'all') return true;
    if (selectedOutlet === 'org') return !e.outletId;
    return e.outletId === selectedOutlet;
  });

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: '8px' }}>
        <div>
          <h1 style={{ fontSize: '22px' }}>Expenses</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '13px' }}>
            Per-outlet and organization-wide costs, side by side
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onNew}>
          ＋ Add expense
        </button>
      </div>

      <Card>
        <div className="row" style={{ gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          <Pill active={selectedOutlet === 'all'} onClick={() => setSelectedOutlet('all')}>
            All
          </Pill>
          <Pill active={selectedOutlet === 'org'} onClick={() => setSelectedOutlet('org')}>
            Organization-wide
          </Pill>
          {outlets.map(o => (
            <Pill
              key={o.id}
              active={selectedOutlet === o.id}
              onClick={() => setSelectedOutlet(o.id)}
            >
              {o.displayName}
            </Pill>
          ))}
        </div>

        {!expenses.length ? (
          <EmptyState
            icon="₹"
            firstUseTitle="No expenses yet"
            firstUseDescription="Add your first bill to start tracking organization and outlet expenses."
            firstUseAction={<button type="button" className="btn btn-primary" onClick={onNew}>＋ Add expense</button>}
          />
        ) : !filteredExpenses.length ? (
          <EmptyState
            isFiltered
            icon="₹"
            filteredTitle="No matching records"
            filteredDescription="Try adjusting your filters to find what you are looking for."
          />
        ) : (
          <table className="grid">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Outlet</th>
                <th>Due</th>
                <th>Status</th>
                <th className="num">Amount</th>
                <th className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map(e => {
                const outletName = e.outletId ? outlets.find(o => o.id === e.outletId)?.displayName || 'Unknown' : 'Organization-wide';
                const isOrg = !e.outletId;
                const isPaid = !!e.paid;
                const isOverdue = !isPaid && e.due < today();
                
                return (
                  <tr key={e.id}>
                    <td>
                      <strong>{e.title}</strong>
                      {e.monthly && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>↻ Monthly</div>}
                    </td>
                    <td>{e.category}</td>
                    <td>
                      {isOrg ? (
                        <span className="badge" style={{ background: 'var(--tint)', color: 'var(--brand-ink)' }}>
                          Organization-wide
                        </span>
                      ) : (
                        outletName
                      )}
                    </td>
                    <td>{dateLabel(e.due)}</td>
                    <td>
                      {isPaid ? (
                        <Badge on>Paid</Badge>
                      ) : isOverdue ? (
                        <Badge warn>Overdue</Badge>
                      ) : (
                        <Badge off>Due</Badge>
                      )}
                    </td>
                    <td className="num mono">{money(e.amount)}</td>
                    <td className="num">
                      {!isPaid && (
                        <button type="button" className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => onPaid(e.id)}>
                          Mark paid
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
