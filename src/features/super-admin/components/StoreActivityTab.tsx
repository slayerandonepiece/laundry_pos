import Icon, { type IconName } from './Icon';
import type { ActivityEntry } from '../types';

export function dateTimeLabel(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Maps the handful of AuditLog `action` values this app actually writes
// today to an icon + a plain-English description. Unrecognized actions
// (there will be more as other mutations start logging) fall back to a
// generic, still-honest description built from the raw action/entityType
// rather than being hidden.
export function describeActivityEntry(entry: ActivityEntry): { icon: IconName; iconTone?: 'good' | 'warm' | 'bad' | 'info' | 'gray'; title: string; detail?: string } {
  const actor = entry.actorName ?? 'Super Admin';
  const after = entry.afterJson as Record<string, string | number | null> | undefined;
  if (entry.action === 'ONBOARD_ORGANIZATION') {
    return {
      icon: 'edit',
      iconTone: 'good',
      title: `${actor} onboarded the organization`,
      detail: after?.ownerUsername ? `Owner @${after.ownerUsername}` : undefined,
    };
  }
  if (entry.action === 'UPDATE_ORGANIZATION') return { icon: 'edit', title: `${actor} edited organization details` };
  if (entry.action === 'LOCK_ORGANIZATION') {
    return {
      icon: 'lock',
      iconTone: 'bad',
      title: `${actor} locked organization access`,
      detail: after?.reason ? String(after.reason) : undefined,
    };
  }
  if (entry.action === 'UNLOCK_ORGANIZATION') return { icon: 'lock', iconTone: 'good', title: `${actor} unlocked organization access` };
  if (entry.action === 'ARCHIVE_ORGANIZATION') return { icon: 'archive', iconTone: 'bad', title: `${actor} archived the organization` };
  if (entry.action === 'CREATE_OUTLET') {
    return {
      icon: 'store',
      iconTone: 'info',
      title: `${actor} created outlet ${after?.displayName ?? ''}`.trim(),
      detail: after?.outletCode ? `Code: ${after.outletCode}` : undefined,
    };
  }
  if (entry.action === 'UPDATE_OUTLET') return { icon: 'edit', title: `${actor} edited an outlet` };
  if (entry.action === 'RELOCATE_OUTLET') return { icon: 'store', title: `${actor} relocated an outlet`, detail: after?.address ? String(after.address) : undefined };
  if (entry.action === 'CLOSE_OUTLET') return { icon: 'store', iconTone: 'bad', title: `${actor} closed an outlet` };
  if (entry.action === 'REOPEN_OUTLET') return { icon: 'store', iconTone: 'good', title: `${actor} reopened an outlet` };
  if (entry.action === 'CHANGE_SUBSCRIPTION_PLAN') return { icon: 'card', title: `${actor} changed the subscription plan` };
  if (entry.action === 'RECORD_SUBSCRIPTION_PAYMENT') {
    const amt = typeof after?.amount === 'number' ? `₹${(after.amount / 100).toLocaleString('en-IN')}` : '';
    const typeLabel = after?.type === 'DEPOSIT' ? 'deposit' : 'renewal';
    return {
      icon: 'check',
      iconTone: 'good',
      title: `${actor} recorded a ${typeLabel} payment${amt ? ` — ${amt}` : ''}`,
      detail: after?.invoiceSeq ? `Invoice #${after.invoiceSeq}` : undefined,
    };
  }
  if (entry.action === 'CREATE_PLATFORM_PAYMENT_METHOD') {
    return {
      icon: 'card',
      title: `${actor} created global payment method ${after?.name || after?.code || ''}`.trim(),
    };
  }
  if (entry.action === 'UPDATE_PLATFORM_PAYMENT_METHOD') {
    return {
      icon: 'card',
      title: `${actor} updated global payment method ${after?.name ?? ''}`.trim(),
    };
  }
  if (entry.action === 'RECONCILE_DAILY_ROLLUPS') {
    return {
      icon: 'history',
      title: `${actor} reconciled daily rollups for an outlet`,
      detail: after?.fromDate && after?.toDate ? `${after.daysReconciled ?? '?'} day(s), ${after.fromDate} – ${after.toDate}` : undefined,
    };
  }
  return {
    icon: 'history',
    title: `${actor} — ${entry.action.replace(/_/g, ' ').toLowerCase()} (${entry.entityType})`,
  };
}

export default function StoreActivityTab({ entries }: { entries: ActivityEntry[] }) {
  if (!entries.length) return <div className="card"><div className="empty">
    <span className="ic l"><Icon name="history" size="l" /></span>
    <h3>No activity recorded yet</h3>
    <p>Edits, payments and outlet changes for this organization will appear here as they happen.</p>
  </div></div>;

  return <div>
    <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted)' }}>Every logged edit, lock and status change to this organization, in order.</p>
    <div className="card">
      <div className="card-body" style={{ paddingTop: 0, paddingBottom: 0 }}>
        <div className="tl">
          {entries.map(entry => {
            const { icon, title, detail } = describeActivityEntry(entry);
            return <div className="tl-item" key={entry.id}>
              <span className="tl-ic"><Icon name={icon} /></span>
              <div className="tl-body">
                <b>{title}</b>
                {detail && <small>{detail}</small>}
              </div>
              <span className="tl-time">{dateTimeLabel(entry.createdAt)}</span>
            </div>;
          })}
        </div>
      </div>
    </div>
  </div>;
}
