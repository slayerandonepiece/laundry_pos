import Link from 'next/link';
import { money, dateLabel, dateLabelFull } from '@/features/admin/admin.data';
import { today as getToday } from '@/features/admin/admin.data';
import { describeLifecycleState, type OrgLifecycleFacts } from '../lifecycle';
import Icon from './Icon';
import { dateTimeLabel, describeActivityEntry } from './StoreActivityTab';
import type { ActivityEntry, StoreDetail } from '../types';
import { initials, daysUntil } from '../utils';

export default function StoreOverviewTab({ store, members, lifecycle, activity }: {
  store: StoreDetail;
  members: { userId: string; name: string; username: string; active: boolean; role: 'OWNER' | 'EMPLOYEE' }[];
  lifecycle: OrgLifecycleFacts | null;
  activity: ActivityEntry[];
}) {
  const base = `/super-admin/stores/${store.id}`;
  const owner = members.find(m => m.role === 'OWNER');
  const preview = members.slice(0, 4);
  const today = getToday();
  const state = lifecycle?.state;
  const badge = state ? describeLifecycleState(state) : null;

  // The 4th stat tile (rightmost) adapts to the lifecycle state, per the
  // design: a "set terms" prompt when nothing's on file yet, the trial end
  // date during a trial, otherwise the renewal (paidThroughDate).
  let renewalTile: { label: string; value: string; sub: string } | { prompt: true };
  if (state === 'TERMS_NOT_SET') {
    renewalTile = { prompt: true };
  } else if ((state === 'TRIAL' || state === 'TRIAL_ENDING') && lifecycle?.trialEndsAt) {
    const days = daysUntil(lifecycle.trialEndsAt, today);
    renewalTile = { label: 'Trial ends', value: dateLabel(lifecycle.trialEndsAt), sub: days >= 0 ? `${days} day${days === 1 ? '' : 's'} left` : 'ended' };
  } else if (store.paidThroughDate) {
    const days = daysUntil(store.paidThroughDate, today);
    renewalTile = { label: 'Renews', value: dateLabel(store.paidThroughDate), sub: days >= 0 ? `${days} day${days === 1 ? '' : 's'} away` : `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue` };
  } else {
    renewalTile = { prompt: true };
  }

  return <>
    {state === 'ARCHIVED' && (
      <div className="notice" style={{ marginBottom: 18 }}>
        <Icon name="archive" size="s" />
        <span>Archived{lifecycle?.archivedAt ? ` on ${dateLabelFull(lifecycle.archivedAt)}` : ''} — removed from the directory. Order and payment history is kept. There is no restore option; the tabs below stay read-only for history.</span>
      </div>
    )}
    {state === 'LOCKED' && (
      <div className="notice" style={{ marginBottom: 18 }}>
        <Icon name="lock" size="s" />
        <span>Locked by Super Admin — the owner can still sign in, but every data request returns 403.</span>
      </div>
    )}
    {state === 'RESTRICTED' && (
      <div className="notice danger" style={{ marginBottom: 18 }}>
        <Icon name="alertTriangle" size="s" />
        <span>Writes blocked{store.paidThroughDate ? ` since ${dateLabelFull(store.paidThroughDate)}` : ''} — payment has lapsed, so every edit control for the owner and every employee is disabled until a payment is recorded. <Link href={`${base}/subscription`}>Record payment</Link></span>
      </div>
    )}
    {state === 'TRIAL_ENDING' && lifecycle?.trialEndsAt && (
      <div className="notice warn" style={{ marginBottom: 18 }}>
        <Icon name="clock" size="s" />
        <span>Trial ends in {Math.max(daysUntil(lifecycle.trialEndsAt, today), 0)} day{Math.max(daysUntil(lifecycle.trialEndsAt, today), 0) === 1 ? '' : 's'} ({dateLabelFull(lifecycle.trialEndsAt)}).</span>
      </div>
    )}
    {state === 'SUBSCRIPTION_ENDING' && store.paidThroughDate && (
      <div className="notice warn" style={{ marginBottom: 18 }}>
        <Icon name="clock" size="s" />
        <span>Renews in {Math.max(daysUntil(store.paidThroughDate, today), 0)} day{Math.max(daysUntil(store.paidThroughDate, today), 0) === 1 ? '' : 's'} ({dateLabelFull(store.paidThroughDate)}). <Link href={`${base}/subscription`}>Record payment</Link></span>
      </div>
    )}

    <div className="stats">
      <div className="stat">
        <div className="stat-top"><span>Outlets</span><span className="stat-ic"><Icon name="store" size="s" /></span></div>
        <strong className="num">{store.outletCount}</strong>
        <small>{store.outletCount > 0 ? 'all active' : 'no outlets yet'}</small>
      </div>
      <div className="stat">
        <div className="stat-top"><span>Team members</span><span className="stat-ic"><Icon name="users" size="s" /></span></div>
        <strong className="num">{members.length}</strong>
        <small>{members.filter(m => m.role === 'OWNER').length} owner · {members.filter(m => m.role === 'EMPLOYEE').length} employees</small>
      </div>
      <div className="stat">
        <div className="stat-top"><span>Deposit</span><span className="stat-ic"><Icon name="card" size="s" /></span></div>
        <strong className="num" style={{ fontSize: 19, marginTop: 14 }}>{money(store.depositAmount)}</strong>
        <small>{store.depositPaidAt ? `Paid ${dateLabel(store.depositPaidAt)}` : 'Not received'}</small>
      </div>
      {'prompt' in renewalTile ? (
        <div className="stat">
          <div className="stat-top"><span>Subscription</span><span className="stat-ic"><Icon name="clock" size="s" /></span></div>
          <strong className="num" style={{ fontSize: 14, marginTop: 14 }}><Link href={`${base}/subscription`}>Set subscription terms</Link></strong>
          <small>terms not set</small>
        </div>
      ) : (
        <div className="stat">
          <div className="stat-top"><span>{renewalTile.label}</span><span className="stat-ic"><Icon name="clock" size="s" /></span></div>
          <strong className="num" style={{ fontSize: 19, marginTop: 14 }}>{renewalTile.value}</strong>
          <small>{renewalTile.sub}</small>
        </div>
      )}
    </div>

    <div className="split">
      <div>
        <div className="card">
          <div className="card-head">
            <h2><Icon name="building" />Organization details</h2>
            {state !== 'ARCHIVED' && <Link className="btn outline sm" href={`${base}/edit`}><Icon name="edit" size="s" />Edit</Link>}
          </div>
          <div className="card-body" style={{ paddingTop: 6 }}>
            <div className="kv"><span>Organization name</span><strong>{store.name}</strong></div>
            <div className="kv"><span>Address</span><strong>{store.address || '—'}</strong></div>
            <div className="kv"><span>Phone</span><strong className="num">{store.phone || '—'}</strong></div>
            <div className="kv"><span>Email</span><strong>{store.email || '—'}</strong></div>
            <div className="kv"><span>Status</span>{badge ? <span className={'badge ' + badge.badgeClass}>{badge.label}</span> : <span className={'badge ' + (store.status === 'LOCKED' ? 'bad' : 'good')}>{store.status === 'LOCKED' ? 'Locked' : 'Active'}</span>}</div>
            <div className="kv"><span>Organization ID</span><strong className="num" style={{ fontSize: 12, color: 'var(--muted)' }}>{store.id}</strong></div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div><h2><Icon name="users" />Team</h2><p>Accounts with access to this organization</p></div>
            <Link className="btn outline sm" href={`${base}/users`}><Icon name="userPlus" size="s" />View all</Link>
          </div>
          {!preview.length ? (
            <div className="card-body"><div className="empty">
              <span className="ic l"><Icon name="users" size="l" /></span>
              <h3>No team members yet</h3>
              <p>Add a user to give them access to this organization.</p>
            </div></div>
          ) : (
            <table>
              <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th></tr></thead>
              <tbody>
                {preview.map(member => (
                  <tr key={member.userId}>
                    <td><div className="who"><span className="av">{initials(member.name)}</span><strong>{member.name}</strong></div></td>
                    <td>{member.username}</td>
                    <td><span className={'badge plain ' + (member.role === 'OWNER' ? 'info' : 'gray')}>{member.role === 'OWNER' ? 'Owner' : 'Employee'}</span></td>
                    <td><span className={'badge ' + (member.active ? 'good' : 'bad')}>{member.active ? 'Active' : 'Inactive'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div>
        <div className="card">
          <div className="card-head"><h3><Icon name="users" />Owner</h3></div>
          <div className="card-body">
            {owner ? (
              <>
                <div className="who" style={{ marginBottom: 14 }}>
                  <span className="av" style={{ width: 40, height: 40, fontSize: 14 }}>{initials(owner.name)}</span>
                  <span><b style={{ display: 'block', fontSize: 14 }}>{owner.name}</b><small style={{ color: 'var(--muted)', fontSize: 12 }}>@{owner.username}</small></span>
                </div>
                {(store.ownerEmail || store.ownerPhone) && (
                  <div style={{ marginBottom: 14 }}>
                    {store.ownerEmail && <div className="kv"><span>Email</span><strong>{store.ownerEmail}</strong></div>}
                    {store.ownerPhone && <div className="kv"><span>Phone</span><strong className="num">{store.ownerPhone}</strong></div>}
                  </div>
                )}
                <Link href={`/super-admin/users/${owner.userId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600 }}>
                  View in People <Icon name="externalLink" size="s" />
                </Link>
              </>
            ) : <p>No owner on record.</p>}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3><Icon name="card" />Subscription</h3>{badge && <span className={'badge ' + badge.badgeClass}>{badge.label}</span>}</div>
          <div className="card-body">
            <div className="kv"><span>Plan</span><strong>{store.planName ?? 'Custom terms'}</strong></div>
            <div className="kv"><span>Deposit</span><strong className="num">{money(store.depositAmount)}{store.depositPaidAt ? ' · Paid' : ' · Unpaid'}</strong></div>
            <div className="kv"><span>Annual fee</span><strong className="num">{money(store.annualFeeAmount)} / yr</strong></div>
            {lifecycle?.trialEndsAt && <div className="kv"><span>Trial ends</span><strong className="num">{dateLabel(lifecycle.trialEndsAt)}</strong></div>}
            <div className="kv"><span>Paid through</span><strong className="num">{store.paidThroughDate ? dateLabel(store.paidThroughDate) : '—'}</strong></div>
            <Link className="btn outline block" style={{ marginTop: 14 }} href={`${base}/subscription`}><Icon name="card" size="s" />Manage subscription</Link>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3><Icon name="history" />Recent activity</h3><Link href={`${base}/activity`}>View all</Link></div>
          <div className="card-body">
            {!activity.length ? <div className="empty" style={{ padding: '24px 12px' }}>
              <span className="ic l"><Icon name="history" size="l" /></span><h3>No activity recorded yet</h3><p>Edits, payments and outlet changes will appear here.</p>
            </div> : <div className="tl">
              {activity.slice(0, 3).map(entry => {
                const item = describeActivityEntry(entry);
                return <div className="tl-item" key={entry.id}>
                  <span className="tl-ic"><Icon name={item.icon} /></span>
                  <div className="tl-body"><b>{item.title}</b>{item.detail && <small>{item.detail}</small>}</div>
                  <span className="tl-time">{dateTimeLabel(entry.createdAt)}</span>
                </div>;
              })}
            </div>}
          </div>
        </div>
      </div>
    </div>
  </>;
}
