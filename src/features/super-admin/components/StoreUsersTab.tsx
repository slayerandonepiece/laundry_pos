import Link from 'next/link';
import Icon from './Icon';

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || name.slice(0, 2).toUpperCase();
}

export default function StoreUsersTab({ members }: { members: { userId: string; name: string; username: string; active: boolean; role: 'OWNER' | 'EMPLOYEE' }[] }) {
  if (!members.length) return <div className="card"><div className="empty">
    <span className="ic l"><Icon name="users" size="l" /></span>
    <h3>No one has access yet</h3>
    <p>Add a user to give them access to this store.</p>
  </div></div>;

  return <div className="tablecard">
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th></tr></thead>
        <tbody>
          {members.map(member => (
            <tr key={member.userId}>
              <td><div className="who"><span className="av">{initials(member.name)}</span><Link href={`/super-admin/users/${member.userId}`}><strong>{member.name}</strong></Link></div></td>
              <td>@{member.username}</td>
              <td><span className={'badge plain ' + (member.role === 'OWNER' ? 'info' : 'gray')}>{member.role === 'OWNER' ? 'Owner' : 'Employee'}</span></td>
              <td><span className={'badge ' + (member.active ? 'good' : 'bad')}>{member.active ? 'Active' : 'Inactive'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>;
}
