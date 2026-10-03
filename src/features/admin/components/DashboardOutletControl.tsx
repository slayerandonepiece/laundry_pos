'use client';
import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { selectOutletAction, selectDashboardAllOutletsAction } from '@/server/auth/actions';
import { OutletSwitcher, ErrorBanner } from './ui';
import type { DashboardOutlet } from './Dashboard';

/** Render the page's resolved outlet selection inside the persistent chrome. */
export default function DashboardOutletControl({ outlets, selectedOutletId, allOutletsSelected }: {
  outlets: DashboardOutlet[]; selectedOutletId?: string; allOutletsSelected?: boolean;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  useEffect(() => {
    // Synchronize the portal with the shell's DOM slot after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTarget(document.getElementById('dashboard-outlet-control'));
  }, []);
  if (!target || !outlets.length) return null;
  function select(id: string | null) {
    setError(false);
    startTransition(async () => {
      try {
        const result = id === null ? await selectDashboardAllOutletsAction() : await selectOutletAction(id);
        if (!result.ok) { setError(true); return; }
        router.refresh();
      } catch { setError(true); }
    });
  }
  return createPortal(<div className="dashboard-outlet-control" aria-busy={pending}>
    {outlets.length === 1 ? <span className="switcher-trigger dashboard-outlet-label">📍 {outlets[0].displayName}</span> :
      <fieldset disabled={pending}><OutletSwitcher outlets={outlets.map(outlet => ({ id: outlet.id, name: outlet.displayName, code: outlet.outletCode }))}
        selectedOutletId={allOutletsSelected ? null : selectedOutletId} onSelect={select} showAllOption /></fieldset>}
    {pending && <span className="dashboard-sr-only" role="status">Switching outlet…</span>}
    {error && <ErrorBanner message="Could not switch outlets. Please try again." />}
  </div>, target);
}
