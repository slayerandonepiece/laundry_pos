'use client';
import Icon from '@/features/super-admin/components/Icon';

// Route-level error boundary for the Organizations screen, matching the
// v2.0 OrgListError design: nothing was changed by a failed read, so the
// copy says so, and the digest gives support a reference without exposing
// the raw error to the user.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="empty" role="alert">
    <span className="ic l" style={{ color: 'var(--bad-fg)' }}><Icon name="alertTriangle" size="l" /></span>
    <h3>Could not load organizations</h3>
    <p>Something went wrong loading this screen. Nothing was changed — your data is safe.</p>
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 4 }}>
      <button type="button" className="btn" onClick={() => reset()}>Try again</button>
      <a className="btn outline" href="mailto:support@storeops.app">Contact support</a>
    </div>
    {error.digest && <p style={{ marginTop: 12, fontSize: 11, color: 'var(--faint)' }}>Error ref: {error.digest}</p>}
  </div>;
}
