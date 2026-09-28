'use client';
import { useState } from 'react';
import type { Expense } from '../admin.types';
import { Dialog } from './ui';

export default function DeleteExpenseDialog({ expense, onClose, onDelete }: { expense: Expense; onClose: () => void; onDelete: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <Dialog title="Delete expense?" onClose={() => { if (!busy) onClose(); }} foot={<><button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={async () => {
    setBusy(true); setError('');
    try { await onDelete(); } catch { setError('Could not delete this expense. Try again.'); } finally { setBusy(false); }
  }}>{busy ? 'Deleting…' : 'Delete expense'}</button></>}>
    <p>Delete “{expense.title}”? This cannot be undone.{expense.paid && ' Its amount will be removed from paid expense totals.'}</p>
    {expense.monthly && <p>Future reminders for this series will stop. Other bills already recorded in the series will remain.</p>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </Dialog>;
}
