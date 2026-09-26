'use client';

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
  outlets,
  onSave,
  onClose,
}: {
  error?: string;
  outlets: OutletListItem[];
  onSave: (e: Expense) => void;
  onClose: () => void;
}) {
  const [monthly, setMonthly] = useState(false);
  const [appliesTo, setAppliesTo] = useState<string>(ORG_WIDE_VALUE);
  const [localError, setLocalError] = useState<string | null>(null);

  // Build options: org-wide first, then one per outlet
  const appliesToOptions = [
    { value: ORG_WIDE_VALUE, label: 'Organization-wide' },
    ...outlets.map((o) => ({ value: o.id, label: o.displayName })),
  ];

  return (
    <Dialog
      title="Add expense"
      onClose={onClose}
      warnOnChanges
      foot={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="expense-form" className="btn btn-primary">Save expense</button>
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

          onSave({
            id: crypto.randomUUID(),
            title,
            category: String(f.get('category')),
            amount: Math.round(amountRaw * 100),
            due: String(f.get('due')),
            monthly,
            paid: f.get('paid') === 'on' ? today() : undefined,
            outletId,
          });
        }}
      >
        <div className="field">
          <label htmlFor="exp-title">Title</label>
          <input
            id="exp-title"
            name="title"
            onInput={(e) => e.currentTarget.setCustomValidity('')}
            placeholder="e.g. Shop rent"
            required
            autoFocus
          />
        </div>

        <div className="row" style={{ gap: '12px' }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="exp-category">Category</label>
            <select id="exp-category" name="category">
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
          <input id="exp-due" name="due" type="date" defaultValue={today()} required />
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

        <div className="field">
          <label className="ad-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', minHeight: '40px' }}>
            <input
              type="checkbox"
              style={{ width: '15px', height: '15px', accentColor: 'var(--brand)' }}
              checked={monthly}
              onChange={(e) => setMonthly(e.target.checked)}
            />
            Repeat monthly
          </label>
        </div>
        {monthly && (
          <p className="hint">
            Creates monthly unpaid reminders with this amount. Missing reminders are generated
            when you open the expenses screen. Bills are never marked paid automatically.
          </p>
        )}

        <div className="field">
          <label className="ad-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', minHeight: '40px' }}>
            <input
              name="paid"
              type="checkbox"
              style={{ width: '15px', height: '15px', accentColor: 'var(--brand)' }}
            />
            Already paid today
          </label>
        </div>

        {(error || localError) && (
          <div className="field-error" role="alert">{error || localError}</div>
        )}
      </form>
    </Dialog>
  );
}
