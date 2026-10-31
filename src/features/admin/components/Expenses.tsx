'use client';

import { useState, type ReactNode } from 'react';
import type { Expense } from '../admin.types';
import type { OutletListItem } from '@/features/super-admin/types';
import { today, dateLabel, money } from '../admin.data';
import { Card, Badge, EmptyState, SingleSelectDropdown, RowActionsMenu } from './ui';

export default function Expenses({
  readOnly = false,
  expenses,
  outlets,
  periodFilter,
  onNew,
  onPaid,
  onView,
  onEdit,
  onDelete
}: {
  readOnly?: boolean;
  expenses: Expense[];
  outlets: OutletListItem[];
  /** Reporting-period control, rendered at the start of the card toolbar. */
  periodFilter?: ReactNode;
  onNew: () => void;
  onPaid: (id: string) => void;
  onView: (expense: Expense) => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
}) {
  const [selectedOutlet, setSelectedOutlet] = useState<string | 'all' | 'org'>('all');
  const current = today();

  const filteredExpenses = expenses.filter(e => {
    if (selectedOutlet === 'all') return true;
    if (selectedOutlet === 'org') return !e.outletId;
    return e.outletId === selectedOutlet;
  });

  const isOverdue = (e: Expense) => !e.paid && e.due < current;
  const totalAmount = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const overdueAmount = filteredExpenses.filter(isOverdue).reduce((sum, e) => sum + e.amount, 0);
  const outletName = (e: Expense) => e.outletId ? outlets.find(o => o.id === e.outletId)?.displayName ?? 'Unknown outlet' : 'Organization-wide';
  const status = (e: Expense) => e.paid ? <Badge on>Paid</Badge> : isOverdue(e) ? <Badge warn>Overdue</Badge> : <Badge off>Due</Badge>;

  const actions = (e: Expense) => (
    // Keep action clicks from also opening the row's View dialog.
    <div className="expense-row-actions" onClick={event => event.stopPropagation()}>
      {!e.paid && <button disabled={readOnly} type="button" className="btn btn-secondary expense-paid-btn" aria-label={'Mark ' + e.title + ' paid'} onClick={() => onPaid(e.id)}>Mark paid</button>}
      <RowActionsMenu label={'More actions for ' + e.title} actions={[
        { label: 'View', onSelect: () => onView(e) },
        { label: 'Edit', onSelect: () => onEdit(e), disabled: readOnly },
        { label: 'Delete', onSelect: () => onDelete(e), disabled: readOnly, danger: true },
      ]} />
    </div>
  );

  return (
    <Card className="expenses-card">
      <div className="expenses-toolbar">
        {periodFilter}
        <SingleSelectDropdown
          ariaLabel="Outlet"
          className="expenses-outlet-filter"
          value={selectedOutlet}
          onChange={setSelectedOutlet}
          options={[
            { value: 'all', label: 'All outlets' },
            { value: 'org', label: 'Organization-wide' },
            ...outlets.map(o => ({ value: o.id, label: o.displayName })),
          ]}
        />
        {filteredExpenses.length > 0 && (
          <p className="expenses-summary" aria-live="polite">
            {filteredExpenses.length} {filteredExpenses.length === 1 ? 'bill' : 'bills'} · {money(totalAmount)}
            {overdueAmount > 0 && <> · <span className="expenses-summary-overdue">{money(overdueAmount)} overdue</span></>}
          </p>
        )}
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
        <>
          <div className="expenses-table-wrap">
            <table className="grid expenses-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Outlet</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th className="num">Amount</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map(e => (
                  <tr key={e.id} className="expense-row" onClick={() => onView(e)}>
                    <td>
                      <button type="button" className="expense-title" onClick={event => { event.stopPropagation(); onView(e); }}>{e.title}</button>
                      {e.monthly && <div className="expense-sub">↻ Monthly</div>}
                    </td>
                    <td>{e.category}</td>
                    <td>
                      {e.outletId ? outletName(e) : (
                        <span className="badge" style={{ background: 'var(--tint)', color: 'var(--brand-ink)' }}>
                          Organization-wide
                        </span>
                      )}
                    </td>
                    <td className="mono">{dateLabel(e.due)}</td>
                    <td>{status(e)}</td>
                    <td className="num mono">{money(e.amount)}</td>
                    <td>{actions(e)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="expenses-cards">{filteredExpenses.map(expense => (
            <article key={expense.id} className="expense-card" onClick={() => onView(expense)}>
              <div className="row">
                <button type="button" className="expense-title" onClick={event => { event.stopPropagation(); onView(expense); }}>{expense.title}</button>
                <strong>{money(expense.amount)}</strong>
              </div>
              <p>{expense.category} · {outletName(expense)}</p>
              <p>Due {dateLabel(expense.due)}{expense.monthly && ' · Monthly'}</p>
              <div className="expense-card-foot">
                {status(expense)}
                {actions(expense)}
              </div>
            </article>
          ))}</div>
        </>
      )}
    </Card>
  );
}
