'use client';

import { useState } from 'react';
import { restoreAccountDeletionAction } from '../actions/account-deletion.actions';

export default function RestoreDeletionButton({ label }: { label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function restore() {
    setBusy(true);
    setError('');
    try {
      const result = await restoreAccountDeletionAction();
      if (!result.ok) { setError(result.error || 'Could not restore. Try again.'); return; }
      window.location.reload();
    } catch {
      setError('Could not restore. Try again.');
    } finally {
      setBusy(false);
    }
  }
  return <div style={{ marginTop: 16 }}>
    <button type="button" className="ad-button" disabled={busy} onClick={restore}>{busy ? 'Restoring…' : label}</button>
    {error && <p className="ad-error" role="alert">{error}</p>}
  </div>;
}
