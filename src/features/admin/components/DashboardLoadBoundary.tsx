'use client';
import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorBanner } from './ui';

/** Keep the last successful presentation visible when a refresh fails. */
export default function DashboardLoadBoundary({ failed, children }: { failed: boolean; children: ReactNode }) {
  const [lastGood, setLastGood] = useState<ReactNode>(failed ? null : children);
  const [retrying, startTransition] = useTransition();
  const router = useRouter();
  // React permits a guarded render-time adjustment for state derived from a
  // previous render. The child identity stabilizes after this one rerender.
  if (!failed && lastGood !== children) setLastGood(children);
  if (!failed) return children;
  return <div className="dashboard-load-error">
    {!lastGood && <div className="dashboard dashboard-heading"><h1>Dashboard</h1></div>}
    <ErrorBanner message={lastGood ? 'Could not refresh the dashboard. Showing the previous successful view.' : 'Could not load the dashboard. Please try again.'}
      retryLabel={retrying ? 'Retrying…' : 'Retry'} onRetry={() => { if (!retrying) startTransition(() => router.refresh()); }} />
    {lastGood && <div className="dashboard-stale" inert aria-hidden="true">{lastGood}</div>}
  </div>;
}
