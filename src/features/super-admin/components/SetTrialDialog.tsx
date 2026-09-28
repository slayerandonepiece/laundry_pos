'use client';
import { useState } from 'react';
import { today } from '@/features/admin/admin.data';
import { Button } from '@/features/admin/components/Primitives';
import { setTrialDatesAction, grantTemporaryAccessAction } from '../actions/stores.actions';
import { DialogFooter, useDialogClose } from './Dialog';

export default function SetTrialDialog({ storeId, temporary = false, onSaved }: { storeId: string; temporary?: boolean; onSaved: () => void }) {
  const close = useDialogClose();
  const [startDate, setStartDate] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const afterDays = (days: number) => new Date(new Date(today() + 'T00:00:00Z').getTime() + days * 86400000).toISOString().slice(0, 10);
  async function submit() {
    if (!date || date < today() || (temporary && date > afterDays(30))) return setError('Choose a valid end date.');
    if (!temporary && startDate && startDate >= date) return setError('Trial start date must be before the end date.');
    setBusy(true); setError('');
    try {
      const result = temporary
        ? await grantTemporaryAccessAction(storeId, date)
        : await setTrialDatesAction(storeId, date, startDate || undefined);
      if (!result.ok) { setError(result.error || 'Could not update access.'); setBusy(false); return; }
      onSaved();
    } catch { setError('Could not update access. Try again.'); setBusy(false); }
  }
  return <div className="ad-form">
    {!temporary && <>
      <label>Trial start date (optional)<input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></label>
      <p className="ad-help">Leave blank to start immediately.</p>
    </>}
    <label>{temporary ? 'Access granted until' : 'Trial end date'}<input type="date" min={today()} max={temporary ? afterDays(30) : undefined} value={date} onChange={e => setDate(e.target.value)} /></label>
    <div className="ad-row">{(temporary ? [7, 14, 30] : [7, 14, 30, 60, 90]).map(days => <button type="button" className="btn outline sm" key={days} onClick={() => setDate(afterDays(days))}>{days} days</button>)}</div>
    <p className="ad-help">{temporary ? 'Temporary access lasts at most 30 days. It does not change billing or unlock a locked organization.' : 'Extend free access without recording a payment.'}</p>
    {error && <p className="ad-error" role="alert">{error}</p>}
    <DialogFooter><Button secondary type="button" onClick={close} disabled={busy}>Cancel</Button><Button type="button" onClick={submit} disabled={busy}>{busy ? 'Saving…' : temporary ? 'Grant temporary access' : 'Set trial period'}</Button></DialogFooter>
  </div>;
}
