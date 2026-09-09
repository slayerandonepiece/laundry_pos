'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button } from '@/features/admin/components/Primitives';
import { updateUserAction } from '../actions/users.actions';
import ResetPasswordDialog from './ResetPasswordDialog';
import DeactivateUserDialog from './DeactivateUserDialog';
import type { PlatformRole, PlatformUserDetail } from '../types';

export default function UserDetail({ user, stores }: { user: PlatformUserDetail; stores: { id: string; name: string }[] }) {
  const router = useRouter();
  const currentMembership = user.memberships[0];
  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email ?? '');
  const [phone, setPhone] = useState(user.phone ?? '');
  const [storeId, setStoreId] = useState(currentMembership?.storeId ?? '');
  const [role, setRole] = useState<PlatformRole>(currentMembership?.role ?? 'EMPLOYEE');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  function submit() {
    if (!name.trim() || !/^[a-z0-9._-]{3,40}$/.test(username)) return setError('Enter a name and a username with 3–40 letters, numbers, dots, underscores or hyphens.');
    setBusy(true);
    setError('');
    updateUserAction(user.id, { name: name.trim(), username, email: email.trim(), phone: phone.trim(), storeId: storeId || undefined, role: storeId ? role : undefined })
      .then(result => {
        setBusy(false);
        if (!result.ok) { setError(result.error || 'Could not save changes. Try again.'); return; }
        setNotice('Changes saved');
        router.refresh();
        setTimeout(() => setNotice(''), 4000);
      })
      .catch(() => { setBusy(false); setError('Could not save changes. Try again.'); });
  }

  return <section className="ad-card">
    {notice && <div className="ad-toast" role="status">✓ {notice}</div>}
    <div className="ad-card-heading">
      <div>
        <h2>{user.name} <Badge>{user.active ? 'Active' : 'Inactive'}</Badge></h2>
        <p>{user.username}</p>
      </div>
      <Link className="ad-button ad-secondary" href="/super-admin/users">← Back to users</Link>
    </div>

    <div className="ad-form">
      <h3>Profile</h3>
      <label>Name<input value={name} onChange={e => setName(e.target.value)} required /></label>
      <label>Username<input value={username} onChange={e => setUsername(e.target.value.toLowerCase())} required /></label>
      <label>Email (optional)<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="owner@example.com" /></label>
      <label>Phone (optional)<input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91…" /></label>

      <h3>Store access</h3>
      <label>Store
        <select value={storeId} onChange={e => setStoreId(e.target.value)}>
          <option value="">No store</option>
          {stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
        </select>
      </label>
      {storeId && <label>Role<select value={role} onChange={e => setRole(e.target.value as PlatformRole)}>
        <option value="EMPLOYEE">Employee</option>
        <option value="OWNER">Owner</option>
      </select></label>}
      {currentMembership && <p className="ad-help"><Link className="ad-text-link" href={`/super-admin/stores/${currentMembership.storeId}`}>View {currentMembership.storeName} →</Link></p>}
      {user.memberships.length > 1 && <p className="ad-help">This user has {user.memberships.length} store memberships. Saving here replaces all of them with the single selection above.</p>}

      {error && <p className="ad-error" role="alert">{error}</p>}
      <Button type="button" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>

      <h3>Security</h3>
      <p className="ad-help">Last sign-in: {user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never'}</p>
      <div className="ad-row">
        <Button secondary type="button" onClick={() => setResetOpen(true)}>Reset password</Button>
        <Button secondary type="button" onClick={() => setDeactivateOpen(true)}>{user.active ? 'Deactivate user' : 'Reactivate user'}</Button>
      </div>
    </div>

    {resetOpen && (
      <ResetPasswordDialog
        userId={user.id}
        userName={user.name}
        onCancel={() => setResetOpen(false)}
        onDone={() => { setResetOpen(false); setNotice('Password reset'); router.refresh(); setTimeout(() => setNotice(''), 4000); }}
      />
    )}
    {deactivateOpen && (
      <DeactivateUserDialog
        user={user}
        onCancel={() => setDeactivateOpen(false)}
        onDone={updated => { setDeactivateOpen(false); setNotice(updated.active ? 'User reactivated' : 'User deactivated'); router.refresh(); setTimeout(() => setNotice(''), 4000); }}
      />
    )}
  </section>;
}
