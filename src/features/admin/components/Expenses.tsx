'use client';

import { useState } from 'react';
import type { Expense } from '../admin.types';
import type { OutletListItem } from '@/features/super-admin/types';
import { today, dateLabel, money } from '../admin.data';
import { Card, Pill, Badge, EmptyState } from './ui';

export default function Expenses({
  readOnly = false,
  expenses,
  outlets,
  onNew,
  onPaid,
  onView,
  onEdit,
  onDelete
}: {
  readOnly?: boolean;
  expenses: Expense[];
  outlets: OutletListItem[];
  onNew: () => void;
  onPaid: (id: string) => void;
  onView: (expense: Expense) => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
}) {
  const [selectedOutlet, setSelectedOutlet] = useState<string | 'all' | 'org'>('all');
  
  const filteredExpenses = expenses.filter(e => {
    if (selectedOutlet === 'all') return true;
    if (selectedOutlet === 'org') return !e.outletId;
    return e.outletId === selectedOutlet;
  });

  return (
    <>
      <Card>
        <div className="row" style={{ gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
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
            firstUseAction={<button disabled={readOnly} type="button" className="btn btn-primary" onClick={onNew}>＋ Add expense</button>}
          />
        ) : !filteredExpenses.length ? (
          <EmptyState
            isFiltered
            icon="₹"
            filteredTitle="No matching records"
            filteredDescription="Try adjusting your filters to find what you are looking for."
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="grid expenses-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Outlet</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th className="num">Amount</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
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
                      <td className="mono">{dateLabel(e.due)}</td>
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
                      <td style={{ textAlign: 'right' }}><div className="expense-row-actions">
                        <button type="button" className="btn btn-secondary" aria-label={'View ' + e.title} onClick={() => onView(e)}>View</button>
                        <button disabled={readOnly} type="button" className="btn btn-secondary" aria-label={'Edit ' + e.title} onClick={() => onEdit(e)}>Edit</button>
                        <button disabled={readOnly} type="button" className="btn btn-secondary expense-delete" aria-label={'Delete ' + e.title} onClick={() => onDelete(e)}>Delete</button>
                        {!isPaid && (
                          <button disabled={readOnly} type="button" className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => onPaid(e.id)}>
                            Mark paid
                          </button>
                        )}
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="expenses-cards">{filteredExpenses.map(expense => <article key={expense.id} className="expense-card">
              <div className="row"><strong>{expense.title}</strong><strong>{money(expense.amount)}</strong></div>
              <p>{expense.category} · {expense.outletId ? outlets.find(outlet => outlet.id === expense.outletId)?.displayName ?? 'Unknown outlet' : 'Organization-wide'}</p>
              <p>Due {dateLabel(expense.due)}{expense.monthly && ' · Monthly'}</p>
              <Badge on={Boolean(expense.paid)} off={!expense.paid}>{expense.paid ? 'Paid' : expense.due < today() ? 'Overdue' : 'Due'}</Badge>
              <div className="expense-row-actions">
                <button type="button" className="btn btn-secondary" aria-label={'View ' + expense.title} onClick={() => onView(expense)}>View</button>
                <button disabled={readOnly} type="button" className="btn btn-secondary" aria-label={'Edit ' + expense.title} onClick={() => onEdit(expense)}>Edit</button>
                <button disabled={readOnly} type="button" className="btn btn-secondary expense-delete" aria-label={'Delete ' + expense.title} onClick={() => onDelete(expense)}>Delete</button>
                {!expense.paid && <button disabled={readOnly} type="button" className="btn btn-secondary" onClick={() => onPaid(expense.id)}>Mark paid</button>}
              </div>
            </article>)}</div>
          </div>
        )}
      </Card>
    </>
  );
}
