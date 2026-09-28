'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { saveMyProfileAction, changeMyPasswordAction } from '../actions/profile.actions';

export default function MyProfile({ profile }: { profile: { name: string; phone: string; email: string | null } }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [email, setEmail] = useState(profile.email ?? '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<'profile' | 'password' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy('profile'); setError(''); setNotice('');
    try {
      const result = await saveMyProfileAction({ name, phone, email });
      if (!result.ok) { setError(result.error); return; }
      if (result.signInAgain) { router.replace('/login'); router.refresh(); return; }
      setEditing(false); setNotice('Profile saved.'); router.refresh();
    } catch { setError('Could not save your profile. Try again.'); }
    finally { setBusy(null); }
  }

  async function password(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('');
    if (next !== confirm) { setError('New passwords do not match.'); return; }
    if (current === next) { setError('Choose a different new password.'); return; }
    setBusy('password');
    try {
      const result = await changeMyPasswordAction(current, next);
      if (!result.ok) { setError(result.error); return; }
      router.replace('/login'); router.refresh();
    } catch { setError('Could not change your password. Try again.'); }
    finally { setBusy(null); }
  }

  return <>
    {error && <p className="ad-error" role="alert">{error}</p>}
    {notice && <p className="my-profile-notice" role="status">{notice}</p>}
    <div className="my-profile-grid">
      <section className="card">
        <div className="card-head"><h2>Account details</h2>{!editing && <button className="btn outline" onClick={() => { setName(profile.name); setPhone(profile.phone); setEmail(profile.email ?? ''); setEditing(true); setError(''); }}>Edit</button>}</div>
        <div className="card-body">
          {editing ? <form className="ad-form" onSubmit={save}>
            <label>Name<input value={name} onChange={e => setName(e.target.value)} minLength={2} required autoComplete="name" /></label>
            <label>Login phone<input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required autoComplete="tel" /></label>
            <label>Email (optional)<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>
            <p>Changing your login phone signs you out of all sessions.</p>
            <div className="my-profile-actions"><button type="button" className="btn outline" disabled={!!busy} onClick={() => setEditing(false)}>Cancel</button><button className="btn" disabled={!!busy}>{busy === 'profile' ? 'Saving…' : 'Save changes'}</button></div>
          </form> : <dl className="my-profile-details"><div><dt>Name</dt><dd>{profile.name}</dd></div><div><dt>Login phone</dt><dd>{profile.phone}</dd></div><div><dt>Email</dt><dd>{profile.email || '—'}</dd></div><div><dt>Role</dt><dd>Super Admin</dd></div></dl>}
        </div>
      </section>
      <section className="card">
        <div className="card-head"><h2>Security</h2></div>
        <div className="card-body"><form className="ad-form" onSubmit={password}>
          <label>Current password<input type={showPassword ? 'text' : 'password'} value={current} onChange={e => setCurrent(e.target.value)} required autoComplete="current-password" /></label>
          <label>New password<input type={showPassword ? 'text' : 'password'} value={next} onChange={e => setNext(e.target.value)} minLength={8} required autoComplete="new-password" /></label>
          <label>Confirm new password<input type={showPassword ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} minLength={8} required autoComplete="new-password" /></label>
          <label className="ad-checkbox"><input type="checkbox" checked={showPassword} onChange={e => setShowPassword(e.target.checked)} />Show passwords</label>
          <p>Use at least 8 characters. After changing your password, sign in again on all devices.</p>
          <div className="my-profile-actions"><button className="btn" disabled={!!busy}>{busy === 'password' ? 'Changing…' : 'Change password'}</button></div>
        </form></div>
      </section>
    </div>
  </>;
}
