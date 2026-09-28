'use client';

import { useState } from 'react';
import { today } from '../admin.data';
import { Dialog, ErrorBanner } from './ui';
import DateInput from './DateInput';

export default function MarkExpensePaidDialog({ onClose, onSave }: { onClose: () => void; onSave: (date: string) => Promise<void> }) {
  const [date, setDate] = useState(today());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return <Dialog title="Mark expense paid?" onClose={() => { if (!saving) onClose(); }} foot={<>
    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
    <button type="submit" form="expense-paid-form" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Mark paid'}</button>
  </>}>
    <form id="expense-paid-form" onSubmit={async event => {
      event.preventDefault();
      if (saving) return;
      setSaving(true); setError('');
      try { await onSave(date); } catch { setError('Could not mark this expense paid. Check the date and try again.'); setSaving(false); }
    }}>
      <div className="field"><label htmlFor="expense-paid-date">Paid date</label><DateInput id="expense-paid-date" value={date} max={today()} required disabled={saving} onChange={event => setDate(event.target.value)} /></div>
      {error && <ErrorBanner message={error} />}
    </form>
  </Dialog>;
}
