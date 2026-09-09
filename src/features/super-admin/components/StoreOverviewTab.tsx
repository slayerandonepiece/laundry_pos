import Link from 'next/link';
import { money, dateLabel } from '@/features/admin/admin.data';
import Icon from './Icon';
import type { StoreDetail } from '../types';

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || name.slice(0, 2).toUpperCase();
}

export default function StoreOverviewTab({ store, members }: {
  store: StoreDetail;
  members: { userId: string; name: string; username: string; active: boolean; role: 'OWNER' | 'EMPLOYEE' }[];
}) {
  const base = `/super-admin/stores/${store.id}`;
  const owner = members.find(m => m.role === 'OWNER');
  const preview = members.slice(0, 4);

  return <>
    <div className="stats" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
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
      <div className="stat">
        <div className="stat-top"><span>Subscription</span><span className="stat-ic"><Icon name="clock" size="s" /></span></div>
        <strong className="num" style={{ fontSize: 19, marginTop: 14 }}>{store.paidThroughDate ? dateLabel(store.paidThroughDate) : '—'}</strong>
        <small>{store.paidThroughDate ? 'next renewal due' : 'terms not set'}</small>
      </div>
    </div>

    <div className="split">
      <div>
        <div className="card">
          <div className="card-head">
            <h2><Icon name="building" />Store details</h2>
            <Link className="btn outline sm" href={`${base}/edit`}><Icon name="edit" size="s" />Edit</Link>
          </div>
          <div className="card-body" style={{ paddingTop: 6 }}>
            <div className="kv"><span>Store name</span><strong>{store.name}</strong></div>
            <div className="kv"><span>Address</span><strong>{store.address || '—'}</strong></div>
            <div className="kv"><span>Phone</span><strong className="num">{store.phone || '—'}</strong></div>
            <div className="kv"><span>Email</span><strong>{store.email || '—'}</strong></div>
            <div className="kv"><span>Status</span><span className={'badge ' + (store.status === 'LOCKED' ? 'bad' : 'good')}>{store.status === 'LOCKED' ? 'Locked' : 'Active'}</span></div>
            <div className="kv"><span>Store ID</span><strong className="num" style={{ fontSize: 12, color: 'var(--muted)' }}>{store.id}</strong></div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div><h2><Icon name="users" />Team</h2><p>Accounts with access to this store</p></div>
            <Link className="btn outline sm" href={`${base}/users`}><Icon name="userPlus" size="s" />View all</Link>
          </div>
          {!preview.length ? (
            <div className="card-body"><div className="empty">
              <span className="ic l"><Icon name="users" size="l" /></span>
              <h3>No team members yet</h3>
              <p>Add a user to give them access to this store.</p>
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
                  View in Users <Icon name="externalLink" size="s" />
                </Link>
              </>
            ) : <p>No owner on record.</p>}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3><Icon name="card" />Subscription</h3><span className={'badge ' + (store.status === 'LOCKED' ? 'bad' : 'good')}>{store.status === 'LOCKED' ? 'Locked' : 'Active'}</span></div>
          <div className="card-body">
            <div className="kv"><span>Plan</span><strong>{store.planName ?? 'Custom terms'}</strong></div>
            <div className="kv"><span>Deposit</span><strong className="num">{money(store.depositAmount)}{store.depositPaidAt ? ' · Paid' : ' · Unpaid'}</strong></div>
            <div className="kv"><span>Annual fee</span><strong className="num">{money(store.annualFeeAmount)} / yr</strong></div>
            <div className="kv"><span>Paid through</span><strong className="num">{store.paidThroughDate ? dateLabel(store.paidThroughDate) : '—'}</strong></div>
            <Link className="btn outline block" style={{ marginTop: 14 }} href={`${base}/subscription`}><Icon name="card" size="s" />Manage subscription</Link>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3><Icon name="history" />Recent activity</h3></div>
          <div className="card-body">
            <div className="empty" style={{ padding: '24px 12px' }}>
              <span className="ic l"><Icon name="history" size="l" /></span>
              <h3>Not tracked yet</h3>
              <p>An activity log for this store isn&apos;t built yet.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </>;
}
