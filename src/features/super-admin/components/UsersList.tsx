'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import RowMenu from './RowMenu';
import type { PlatformUserListItem } from '../types';
import { initials } from '../utils';

function OrgsCell({ memberships }: { memberships: PlatformUserListItem['memberships'] }) {
  if (!memberships.length) return <span className="muted">No organization access</span>;
  const [first, ...rest] = memberships;
  return <span className="chip">{first.storeName}{rest.length > 0 ? ` +${rest.length}` : ''}</span>;
}

type RoleFilter = 'all' | 'OWNER' | 'EMPLOYEE';
type StatusFilter = 'all' | 'active' | 'inactive';

export default function UsersList({ users, search, onSearch, onReset, onDeactivate }: {
  users: PlatformUserListItem[];
  search: string;
  onSearch: (value: string) => void;
  onReset: (user: PlatformUserListItem) => void;
  onDeactivate: (user: PlatformUserListItem) => void;
}) {
  const router = useRouter();
  const [role, setRole] = useState<RoleFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');

  const counts = useMemo(() => ({
    total: users.length,
    owners: users.filter(u => u.memberships.some(m => m.role === 'OWNER')).length,
    employees: users.filter(u => u.memberships.some(m => m.role === 'EMPLOYEE') && !u.memberships.some(m => m.role === 'OWNER')).length,
    inactive: users.filter(u => !u.active).length,
  }), [users]);

  const filtered = users.filter(u => {
    if (role !== 'all' && !u.memberships.some(m => m.role === role)) return false;
    if (status === 'active' && !u.active) return false;
    if (status === 'inactive' && u.active) return false;
    if (search.trim() && !(u.name + ' ' + u.username).toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });
  const hasActiveFilter = role !== 'all' || status !== 'all' || search.trim().length > 0;

  if (!users.length) return <div className="card"><div className="empty">
    <span className="ic l"><Icon name="users" size="l" /></span>
    <h3>No users yet</h3>
    <p>Add your first user to get started.</p>
  </div></div>;

  return <>
    <div className="stats">
      <div className="stat">
        <div className="stat-top"><span>Total users</span><span className="stat-ic"><Icon name="users" size="s" /></span></div>
        <strong className="num">{counts.total}</strong><small>across the platform</small>
      </div>
      <div className="stat">
        <div className="stat-top"><span>Owners</span><span className="stat-ic"><Icon name="key" size="s" /></span></div>
        <strong className="num">{counts.owners}</strong><small>organization owners</small>
      </div>
      <div className="stat">
        <div className="stat-top"><span>Employees</span><span className="stat-ic"><Icon name="users" size="s" /></span></div>
        <strong className="num">{counts.employees}</strong><small>organization-scoped access</small>
      </div>
      <div className="stat">
        <div className="stat-top"><span>Inactive</span><span className="stat-ic" style={{ background: 'var(--bad-bg)', color: 'var(--bad-fg)' }}><Icon name="lock" size="s" /></span></div>
        <strong className="num">{counts.inactive}</strong><small>sign-in blocked</small>
      </div>
    </div>

    <div className="filters">
      <button type="button" className={'fpill' + (role === 'all' ? ' on' : '')} onClick={() => setRole('all')} aria-pressed={role === 'all'}>All roles</button>
      <button type="button" className={'fpill' + (role === 'OWNER' ? ' on' : '')} onClick={() => setRole('OWNER')} aria-pressed={role === 'OWNER'}>Owners</button>
      <button type="button" className={'fpill' + (role === 'EMPLOYEE' ? ' on' : '')} onClick={() => setRole('EMPLOYEE')} aria-pressed={role === 'EMPLOYEE'}>Employees</button>
      <button type="button" className={'fpill' + (status === 'active' ? ' on' : '')} onClick={() => setStatus(status === 'active' ? 'all' : 'active')} aria-pressed={status === 'active'}>Active</button>
      <button type="button" className={'fpill' + (status === 'inactive' ? ' on' : '')} onClick={() => setStatus(status === 'inactive' ? 'all' : 'inactive')} aria-pressed={status === 'inactive'}>Inactive</button>
      <span className="ftools">
        <span className="fsearch"><Icon name="search" size="s" /><input aria-label="Search users" value={search} onChange={e => onSearch(e.target.value)} placeholder="Search name or username…" style={{ border: 0, background: 'transparent', padding: 0, height: 'auto', color: 'var(--ink)' }} /></span>
      </span>
    </div>

    {!filtered.length ? (
      <div className="card"><div className="empty">
        <span className="ic l"><Icon name="users" size="l" /></span>
        <h3>No matches{search.trim() ? ` for "${search.trim()}"` : ''}</h3>
        <p>No users match this search or filter.</p>
        {hasActiveFilter && <button type="button" className="btn outline sm" onClick={() => { setRole('all'); setStatus('all'); onSearch(''); }}>Clear filters</button>}
      </div></div>
    ) : (
      <div className="tablecard">
        <table>
          <thead><tr><th>User</th><th>Username</th><th>Role</th><th>Organizations</th><th>Status</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {filtered.map(user => {
              const primaryRole = user.memberships.some(m => m.role === 'OWNER') ? 'OWNER' : user.memberships[0]?.role;
              return <tr key={user.id}>
                <td><div className="who"><span className="av">{initials(user.name)}</span><strong onClick={() => router.push(`/super-admin/users/${user.id}`)} style={{ cursor: 'pointer' }}>{user.name}</strong></div></td>
                <td className="num">@{user.username}</td>
                <td>{primaryRole ? <span className={'badge plain ' + (primaryRole === 'OWNER' ? 'info' : 'gray')}>{primaryRole === 'OWNER' ? 'Owner' : 'Employee'}</span> : '—'}</td>
                <td><OrgsCell memberships={user.memberships} /></td>
                <td><span className={'badge ' + (user.active ? 'good' : 'bad')}>{user.active ? 'Active' : 'Inactive'}</span></td>
                <td>
                  <div className="rowacts">
                    <RowMenu items={[
                      { label: 'View profile', icon: 'eye', onClick: () => router.push(`/super-admin/users/${user.id}`) },
                      { label: 'Reset password', icon: 'key', onClick: () => onReset(user) },
                      { label: user.active ? 'Deactivate' : 'Reactivate', icon: 'lock', onClick: () => onDeactivate(user), danger: user.active },
                    ]} />
                  </div>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    )}
  </>;
}
