'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import Dialog from './Dialog';
import AddOutletDialog from './AddOutletDialog';
import type { OutletListItem, OutletStatus } from '../types';

function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_BADGE: Record<OutletStatus, { label: string; cls: string }> = {
  ACTIVE: { label: 'Active', cls: 'good' },
  CLOSED: { label: 'Closed', cls: 'gray' },
  RELOCATED: { label: 'Relocated', cls: 'warm' },
};

export default function StoreOutletsTab({
  storeId,
  outlets,
  initialAddOpen = false,
  onRefresh,
}: {
  storeId: string;
  outlets: OutletListItem[];
  initialAddOpen?: boolean;
  onRefresh?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(initialAddOpen);

  return <>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', maxWidth: 480 }}>Physical branches for this organization. Super Admin assigns each permanent code.</p>
      <button type="button" className="btn" onClick={() => setOpen(true)}><Icon name="plus" size="s" />Add outlet</button>
    </div>

    {!outlets.length ? (
      <div className="card"><div className="empty">
        <div className="empty-icon-wrap" aria-hidden="true">
          <Icon name="store" size="l" />
        </div>
        <h3>No outlets yet</h3>
        <p>Create the first outlet before staff begin outlet-scoped work. The owner cannot take orders until at least one outlet exists.</p>
        <button type="button" className="btn" onClick={() => setOpen(true)}><Icon name="plus" size="s" />Add outlet</button>
      </div></div>
    ) : (
      <div className="tablecard">
        <table>
          <thead><tr><th>Outlet</th><th>Code</th><th>Status</th><th>Opened</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {outlets.map(outlet => {
              const badge = STATUS_BADGE[outlet.status];
              return <tr key={outlet.id}>
                <td>
                  <div style={{ fontSize: 13, fontWeight: 600 }}><Link href={`/super-admin/stores/${storeId}/outlets/${outlet.id}`}>{outlet.displayName}</Link></div>
                  {outlet.address && <small style={{ display: 'block', color: 'var(--muted)' }}>{outlet.address}</small>}
                </td>
                <td className="num">{outlet.outletCode}</td>
                <td><span className={'badge ' + badge.cls}>{badge.label}</span></td>
                <td className="num">{dateLabel(outlet.openedAt)}</td>
                <td className="right">
                  <Link className="icon-btn" href={`/super-admin/stores/${storeId}/outlets/${outlet.id}`} aria-label={`Edit ${outlet.displayName}`}><Icon name="edit" /></Link>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    )}

    {open && (
      <Dialog title="Add outlet" description="Assign the permanent branch code and contact details. Billing and due-date decisions remain manual." onClose={() => setOpen(false)} warnOnChanges>
        <AddOutletDialog storeId={storeId} onSaved={() => {
          setOpen(false);
          try {
            sessionStorage.removeItem(`storeops_org_tab_cache_${storeId}`);
          } catch {}
          onRefresh?.();
          router.refresh();
        }} />
      </Dialog>
    )}
  </>;
}
