'use client';
import DateInput from './DateInput';

import { useState } from 'react';
import type { Expense } from '../admin.types';
import type { OutletListItem } from '@/features/super-admin/types';
import { today } from '../admin.data';
import { Dialog, SingleSelectDropdown } from './ui';

// "Applies to" resolves to exactly one of:
//   '' (empty string) → org-wide (outletId = undefined on save)
//   '<outletId>'       → one specific outlet
const ORG_WIDE_VALUE = '';

export default function ExpenseEditor({
  error,
  expense,
  outlets,
  onSave,
  onClose,
}: {
  error?: string;
  expense?: Expense;
  outlets: OutletListItem[];
  onSave: (e: Expense) => Promise<void>;
  onClose: () => void;
}) {
  const [monthly, setMonthly] = useState(expense?.monthly ?? false);
  const [appliesTo, setAppliesTo] = useState<string>(expense?.outletId ?? ORG_WIDE_VALUE);
  const [localError, setLocalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Build options: org-wide first, then one per outlet
  const appliesToOptions = [
    { value: ORG_WIDE_VALUE, label: 'Organization-wide' },
    ...outlets.map((o) => ({ value: o.id, label: o.displayName })),
  ];

  return (
    <Dialog
      title={expense ? 'Edit expense' : 'Add expense'}
      onClose={onClose}
      warnOnChanges
      foot={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="expense-form" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save expense'}</button>
        </>
      }
    >
      <form
        id="expense-form"
        style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}
        onSubmit={(e) => {
          e.preventDefault();
          setLocalError(null);

          const f = new FormData(e.currentTarget);
          const title = String(f.get('title')).trim();
          if (!title) {
            const input = e.currentTarget.querySelector<HTMLInputElement>('[name="title"]');
            input?.setCustomValidity('Enter an expense title.');
            input?.reportValidity();
            return;
          }

          const amountRaw = Number(f.get('amount'));
          if (!Number.isFinite(amountRaw) || amountRaw <= 0) {
            const input = e.currentTarget.querySelector<HTMLInputElement>('[name="amount"]');
            input?.setCustomValidity('Enter a valid amount greater than zero.');
            input?.reportValidity();
            return;
          }

          // Resolve outletId: empty string = org-wide (undefined), otherwise the outlet id
          const outletId: string | undefined = appliesTo === ORG_WIDE_VALUE ? undefined : appliesTo;

          setSaving(true);
          onSave({
            id: expense?.id ?? crypto.randomUUID(),
            title,
            category: String(f.get('category')),
            amount: Math.round(amountRaw * 100),
            due: String(f.get('due')),
            monthly,
            paid: expense ? expense.paid : f.get('paid') === 'on' ? today() : undefined,
            outletId,
          }).catch(() => {}).finally(() => setSaving(false));
        }}
      >
        <div className="field">
          <label htmlFor="exp-title">Title</label>
          <input
            id="exp-title"
            name="title"
            defaultValue={expense?.title}
            onInput={(e) => e.currentTarget.setCustomValidity('')}
            placeholder="e.g. Shop rent"
            required
          />
        </div>

        <div className="row" style={{ gap: '12px' }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="exp-category">Category</label>
            <select id="exp-category" name="category" defaultValue={expense?.category}>
              {['Electricity', 'Salaries', 'Raw materials', 'Shop rent', 'Machine EMI', 'Supplies', 'Maintenance', 'Other'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="exp-amount">Amount (₹)</label>
            <input
              id="exp-amount"
              name="amount"
              defaultValue={expense ? expense.amount / 100 : undefined}
              type="number"
              min=".01"
              step=".01"
              placeholder="0.00"
              required
              onInput={(e) => e.currentTarget.setCustomValidity('')}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="exp-due">Due date</label>
          <DateInput id="exp-due" name="due" type="date" defaultValue={expense?.due ?? today()} required />
        </div>

        <div className="field" style={{ overflow: 'visible' }}>
          <label id="exp-applies-label">Applies to</label>
          <SingleSelectDropdown
            className="full-width"
            options={appliesToOptions}
            value={appliesTo}
            onChange={setAppliesTo}
            icon="◫"
            ariaLabel="Applies to"
          />
          <span className="hint">
            Select one outlet or leave as Organization-wide.
            Organization-wide expenses don&apos;t count against any single outlet&apos;s numbers.
          </span>
        </div>

        <div className="expense-options">
          <label className="expense-option">
            <input type="checkbox" checked={monthly} disabled={Boolean(expense)} onChange={e => setMonthly(e.target.checked)} />
            <span>Repeat monthly</span>
          </label>
          {!expense && <label className="expense-option">
            <input name="paid" type="checkbox" />
            <span>Already paid today</span>
          </label>}
        </div>
        {expense ? <p className="hint">Changes apply to this bill only.{expense.monthly && ' Keep its due date in the same month; other monthly reminders stay unchanged.'}{expense.paid && ' Its existing paid date is retained.'}</p> : monthly && <p className="hint">Creates monthly unpaid reminders with this amount. Bills are never marked paid automatically.</p>}

        {(error || localError) && (
          <div className="field-error" role="alert">{error || localError}</div>
        )}
      </form>
    </Dialog>
  );
}
