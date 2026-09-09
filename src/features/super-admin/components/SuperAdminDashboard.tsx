import Link from 'next/link';
import { money, dateLabel } from '@/features/admin/admin.data';
import Icon from './Icon';
import OnboardStoreAction from './OnboardStoreAction';
import UserAddAction from './UserAddAction';
import type { DashboardStats, PlatformUserListItem, StoreListItem, SubscriptionPlanListItem } from '../types';

const STATUS_BADGE: Record<StoreListItem['paymentState'], { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'good' },
  expiring: { label: 'Expiring', cls: 'warm' },
  locked: { label: 'Locked', cls: 'bad' },
  unset: { label: 'Terms not set', cls: 'gray' },
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || name.slice(0, 2).toUpperCase();
}

export default function SuperAdminDashboard({ stats, stores, users, plans, today }: {
  stats: DashboardStats;
  stores: StoreListItem[];
  users: PlatformUserListItem[];
  plans: SubscriptionPlanListItem[];
  today: string;
}) {
  const total = stats.totalStores || 1;
  const breakdown: [StoreListItem['paymentState'], number][] = [
    ['active', stats.activeStores],
    ['expiring', stats.expiringSoon],
    ['locked', stats.lockedStores],
    ['unset', stores.filter(s => s.paymentState === 'unset').length],
  ];

  const needsSetup = stores.filter(s => s.paymentState === 'unset').slice(0, 4);

  const owners = users.filter(u => u.memberships.some(m => m.role === 'OWNER')).length;
  const employees = users.filter(u => u.memberships.some(m => m.role === 'EMPLOYEE') && !u.memberships.some(m => m.role === 'OWNER')).length;
  const inactive = users.filter(u => !u.active).length;
  const userTotal = users.length || 1;
  const donutStyle = {
    background: `conic-gradient(var(--brand) 0 ${(owners / userTotal) * 100}%, #a8c7f8 ${(owners / userTotal) * 100}% ${((owners + employees) / userTotal) * 100}%, #e5e9ef ${((owners + employees) / userTotal) * 100}% 100%)`,
  };

  const upcoming = stores
    .filter(s => s.paidThroughDate)
    .sort((a, b) => (a.paidThroughDate! < b.paidThroughDate! ? -1 : 1))
    .slice(0, 3);
  const soonestDays = upcoming.length
    ? Math.round((new Date(upcoming[0].paidThroughDate!).getTime() - new Date(today).getTime()) / 86400000)
    : null;

  return <>
    <div className="stats">
      <div className="stat">
        <div className="stat-top"><span>Live stores</span><span className="stat-ic"><Icon name="store" size="s" /></span></div>
        <strong className="num">{stats.totalStores}</strong><small>onboarded so far</small>
      </div>
      <div className="stat">
        <div className="stat-top"><span>Active</span><span className="stat-ic"><Icon name="check" size="s" /></span></div>
        <strong className="num">{stats.activeStores}</strong><small>paid through</small>
      </div>
      <div className="stat">
        <div className="stat-top"><span>Expiring soon</span><span className="stat-ic" style={{ background: 'var(--warm-bg)', color: 'var(--warm-fg)' }}><Icon name="clock" size="s" /></span></div>
        <strong className="num">{stats.expiringSoon}</strong><small>renew soon</small>
      </div>
      <div className="stat">
        <div className="stat-top"><span>Locked</span><span className="stat-ic" style={{ background: 'var(--bad-bg)', color: 'var(--bad-fg)' }}><Icon name="lock" size="s" /></span></div>
        <strong className="num">{stats.lockedStores}</strong><small>past due</small>
      </div>
    </div>

    <div className="split">
      <div>
        <div className="card">
          <div className="card-head"><div><h2><Icon name="building" />Store status</h2><p>Where every store stands, right now</p></div></div>
          <div className="card-body">
            <div className="barh">
              {breakdown.map(([state, count]) => (
                <div className="barh-row" key={state}>
                  <span>{STATUS_BADGE[state].label}</span>
                  <div className="track"><i style={{ width: `${(count / total) * 100}%`, background: `var(--${STATUS_BADGE[state].cls === 'good' ? 'good-fg' : STATUS_BADGE[state].cls === 'warm' ? 'warm-fg' : STATUS_BADGE[state].cls === 'bad' ? 'bad-fg' : 'gray-fg'})` }} /></div>
                  <b className="num">{count}</b>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div><h2><Icon name="alertTriangle" />Needs attention</h2><p>Stores expiring soon or already locked</p></div>
            <Link href="/super-admin/stores" style={{ fontSize: 12.5, fontWeight: 600 }}>All stores →</Link>
          </div>
          {!stats.needsAttention.length ? (
            <div className="card-body"><div className="empty">
              <span className="ic l"><Icon name="check" size="l" /></span>
              <h3>Nothing here yet</h3>
              <p>Nothing needs attention right now.</p>
            </div></div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr><th>Store</th><th>Owner</th><th>Paid through</th><th className="right">Annual fee</th><th>Status</th></tr></thead>
                <tbody>
                  {stats.needsAttention.map(store => (
                    <tr key={store.id}>
                      <td><Link href={`/super-admin/stores/${store.id}`}><strong>{store.name}</strong></Link></td>
                      <td>{store.ownerName}</td>
                      <td className="num">{store.paidThroughDate ? dateLabel(store.paidThroughDate) : '—'}</td>
                      <td className="right num">{money(store.annualFeeAmount)}</td>
                      <td><span className={'badge ' + STATUS_BADGE[store.paymentState].cls}>{STATUS_BADGE[store.paymentState].label}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="card">
          <div className="card-head"><h3><Icon name="alertTriangle" />Finish setting up</h3>{needsSetup.length > 0 && <span className="badge warm">{needsSetup.length}</span>}</div>
          {!needsSetup.length ? (
            <div className="card-body"><div className="empty" style={{ padding: '24px 12px' }}>
              <span className="ic l"><Icon name="check" size="l" /></span>
              <h3>All caught up</h3>
              <p>Every store has subscription terms set.</p>
            </div></div>
          ) : (
            <div className="card-body" style={{ paddingTop: 6 }}>
              {needsSetup.map(store => (
                <div className="mini-row" key={store.id}>
                  <span className="av sq">{initials(store.name)}</span>
                  <span className="grow"><b>{store.name}</b><small>Subscription terms not set</small></span>
                  <Link className="btn outline sm" href={`/super-admin/stores/${store.id}/subscription`}>Set</Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head"><h3><Icon name="users" />Accounts</h3></div>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div className="donut" style={donutStyle}>
                <span><b className="num">{users.length}</b><small>users</small></span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="kv"><span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 3, background: 'var(--brand)', marginRight: 7 }} />Owners</span><strong className="num">{owners}</strong></div>
                <div className="kv"><span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 3, background: '#a8c7f8', marginRight: 7 }} />Employees</span><strong className="num">{employees}</strong></div>
                <div className="kv"><span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 3, background: '#e5e9ef', marginRight: 7 }} />Inactive</span><strong className="num">{inactive}</strong></div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Quick actions</h3></div>
          <div className="card-body stack" style={{ gap: 9 }}>
            <OnboardStoreAction plans={plans.filter(p => !p.archivedAt)} variant="block" />
            <UserAddAction stores={stores.map(s => ({ id: s.id, name: s.name }))} variant="block" />
            <Link className="btn outline block" style={{ justifyContent: 'flex-start' }} href="/super-admin/users"><Icon name="key" size="s" />Manage users</Link>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3><Icon name="history" />Recent activity</h3></div>
          <div className="card-body"><div className="empty" style={{ padding: '24px 12px' }}>
            <span className="ic l"><Icon name="history" size="l" /></span>
            <h3>Not tracked yet</h3>
            <p>A platform-wide activity log isn&apos;t built yet.</p>
          </div></div>
        </div>

        <div className="card">
          <div className="card-head"><h3><Icon name="card" />Next renewal</h3></div>
          <div className="card-body">
            {!upcoming.length ? <p>No stores have subscription terms set yet.</p> : (
              <>
                {upcoming.map(store => (
                  <div className="kv" key={store.id}><span>{store.name}</span><strong className="num">{dateLabel(store.paidThroughDate!)}</strong></div>
                ))}
                <p style={{ fontSize: 11.5, marginTop: 10 }}>
                  {soonestDays !== null && soonestDays <= 30
                    ? `Renewals are yearly — the earliest is in ${Math.max(soonestDays, 0)} day${soonestDays === 1 ? '' : 's'}.`
                    : 'Renewals are yearly — nothing is due in the next 30 days.'}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  </>;
}
