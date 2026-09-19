import Link from 'next/link';
import Icon from './Icon';
import { initials } from '../utils';

export default function StoreUsersTab({ members }: { members: { userId: string; name: string; username: string; active: boolean; role: 'OWNER' | 'EMPLOYEE'; outletsGranted: string }[] }) {
  if (!members.length) return <div className="card"><div className="empty">
    <span className="ic l"><Icon name="users" size="l" /></span>
    <h3>No one has access yet</h3>
    <p>Add a user to give them access to this organization.</p>
  </div></div>;

  return <div>
    <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted)', maxWidth: 560 }}>Accounts with access to this organization. Owners can be created only through onboarding or promoted from People — not from this tab.</p>
    <div className="tablecard">
      <table>
        <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Outlets granted</th><th>Status</th></tr></thead>
        <tbody>
          {members.map(member => (
            <tr key={member.userId}>
              <td><div className="who"><span className="av">{initials(member.name)}</span><Link href={`/super-admin/users/${member.userId}`}><strong>{member.name}</strong></Link></div></td>
              <td>@{member.username}</td>
              <td><span className={'badge plain ' + (member.role === 'OWNER' ? 'info' : 'gray')}>{member.role === 'OWNER' ? 'Owner' : 'Employee'}</span></td>
              <td>{member.outletsGranted}</td>
              <td><span className={'badge ' + (member.active ? 'good' : 'bad')}>{member.active ? 'Active' : 'Inactive'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>;
}
