'use client';
import { isValidPhone } from '@/lib/contactValidation';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { updateUserAction } from '../actions/users.actions';
import Icon from './Icon';
import ResetPasswordDialog from './ResetPasswordDialog';
import DeactivateUserDialog from './DeactivateUserDialog';
import type { PlatformRole, PlatformUserDetail } from '../types';
import { initials } from '../utils';

export default function UserDetail({ user, stores }: { user: PlatformUserDetail; stores: { id: string; name: string }[] }) {
  const router = useRouter();
  const currentMembership = user.memberships[0];
  const [name, setName] = useState(user.name);
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
    if (!name.trim() || !isValidPhone(phone)) {
      return setError('Enter a name and a valid phone number (8–15 digits).');
    }
    setBusy(true);
    setError('');
    updateUserAction(user.id, {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      storeId: storeId || undefined,
      role: storeId ? role : undefined,
    })
      .then(result => {
        setBusy(false);
        if (!result.ok) { setError(result.error || 'Could not save changes. Try again.'); return; }
        setNotice('Changes saved');
        router.refresh();
        setTimeout(() => setNotice(''), 4000);
      })
      .catch(() => { setBusy(false); setError('Could not save changes. Try again.'); });
  }

  return <>
    {notice && <div className="ad-toast" role="status">✓ {notice}</div>}
    <Link className="backlink" href="/super-admin/users"><Icon name="arrowLeft" size="s" />Back to people</Link>

    <div className="phead">
      <div className="phead-l">
        <span className="av sq" style={{ width: 46, height: 46, fontSize: 15 }}>{initials(user.name)}</span>
        <div>
          <h1>{user.name} <span className={'badge ' + (user.active ? 'good' : 'bad')}>{user.active ? 'Active' : 'Inactive'}</span></h1>
          <p>
            {user.phone}
            {user.lastSignInAt
              ? ` · Last sign-in ${new Date(user.lastSignInAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`
              : ' · Never signed in'}
          </p>
        </div>
      </div>
      <div className="phead-r">
        <button type="button" className="btn outline" onClick={() => setResetOpen(true)}>
          <Icon name="key" size="s" />Reset password
        </button>
        <button
          type="button"
          className={'btn ' + (user.active ? 'danger-outline' : 'outline')}
          onClick={() => setDeactivateOpen(true)}
        >
          <Icon name="lock" size="s" />{user.active ? 'Deactivate account' : 'Reactivate account'}
        </button>
      </div>
    </div>

    <div className="grid2" style={{ alignItems: 'start' }}>
      <div className="card">
        <div className="card-head"><h2><Icon name="users" />Profile</h2></div>
        <div className="card-body stack">
          <div className="field">
            <label htmlFor="user-name">Full name</label>
            <input id="user-name" type="text" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="user-email">Email (optional)</label>
            <input id="user-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" />
          </div>
          <div className="field">
            <label htmlFor="user-phone">Phone number</label>
            <input id="user-phone" type="tel" inputMode="numeric" required value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91…" />
          </div>

          {error && <p className="ad-error" role="alert">{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button type="button" className="btn" onClick={submit} disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2><Icon name="building" />Organization access</h2></div>
        <div className="card-body stack">
          <div className="field">
            <label htmlFor="user-org">Organization</label>
            <select id="user-org" value={storeId} onChange={e => setStoreId(e.target.value)}>
              <option value="">No organization</option>
              {stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </div>

          {storeId && (
            <div className="field">
              <label htmlFor="user-role">Role</label>
              <select id="user-role" value={role} onChange={e => setRole(e.target.value as PlatformRole)}>
                <option value="EMPLOYEE">Employee</option>
                <option value="OWNER">Owner</option>
              </select>
            </div>
          )}

          {currentMembership && (
            <div className="notice" style={{ marginTop: 4 }}>
              <Icon name="building" size="s" />
              <span>
                Currently assigned to <strong>{currentMembership.storeName}</strong> ({currentMembership.role.toLowerCase()}).{' '}
                <Link href={`/super-admin/stores/${currentMembership.storeId}`}>View organization →</Link>
              </span>
            </div>
          )}

          {user.memberships.length > 1 && (
            <div className="notice warn">
              <Icon name="alertTriangle" size="s" />
              <span>This person holds {user.memberships.length} organization memberships. Saving changes here replaces all of them with the single selection above.</span>
            </div>
          )}
        </div>
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
        onDone={updated => { setDeactivateOpen(false); setNotice(updated.active ? 'Account reactivated' : 'Account deactivated'); router.refresh(); setTimeout(() => setNotice(''), 4000); }}
      />
    )}
  </>;
}
