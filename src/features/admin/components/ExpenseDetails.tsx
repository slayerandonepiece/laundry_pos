'use client';
import type { Expense } from '../admin.types';
import { dateLabel, money } from '../admin.data';
import { Dialog } from './ui';

export default function ExpenseDetails({ readOnly = false, expense, outletName, onClose, onEdit, onDelete }: { readOnly?: boolean; expense: Expense; outletName: string; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  return <Dialog title="Expense details" onClose={onClose} foot={<><button disabled={readOnly} type="button" className="btn btn-secondary" onClick={onDelete}>Delete</button><button disabled={readOnly} type="button" className="btn btn-primary" onClick={onEdit}>Edit expense</button></>}>
    <dl className="expense-detail-facts">
      <div><dt>Title</dt><dd>{expense.title}</dd></div><div><dt>Category</dt><dd>{expense.category}</dd></div>
      <div><dt>Outlet</dt><dd>{outletName}</dd></div><div><dt>Amount</dt><dd>{money(expense.amount)}</dd></div>
      <div><dt>Due date</dt><dd>{dateLabel(expense.due)}</dd></div><div><dt>Status</dt><dd>{expense.paid ? 'Paid on ' + dateLabel(expense.paid) : 'Unpaid'}</dd></div>
      <div><dt>Recurrence</dt><dd>{expense.monthly ? 'Monthly bill' : 'One-time bill'}</dd></div>
    </dl>
  </Dialog>;
}
