'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { superAdminLoginAction } from '../actions/auth.actions';

export default function SuperAdminLoginForm() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const router = useRouter();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    superAdminLoginAction(String(f.get('username')), String(f.get('password')))
      .then(result => {
        if (!result.ok) { setError(result.error || 'Invalid username or password'); setBusy(false); return; }
        router.push('/super-admin');
      })
      .catch(() => { setError('Something went wrong. Try again.'); setBusy(false); });
  }

  return <main className="ad-root ad-login">
    <section className="ad-login-brand">
      <Link href="/" className="ad-logo"><span className="ad-logo-mark">◎</span><span>StoreOps<small>PLATFORM ADMIN</small></span></Link>
      <div><p className="ad-eyebrow">RUNS THE NETWORK BEHIND THE CARE</p><h1>Every store.<br />One place<br /><em>to run it.</em></h1><p>Onboard owners, track subscriptions,<br />keep every tenant in view.</p></div>
      <small>Platform admin only.</small>
    </section>
    <section className="ad-login-form">
      <div>
        <span className="ad-demo">PLATFORM ADMIN</span>
        <h2>Sign in.</h2>
        <p>This area is for platform admins only — store owners and employees should use the regular sign-in.</p>
        <form onSubmit={submit}>
          <label>Username<input name="username" autoComplete="username" placeholder="Enter your username" required /></label>
          <label>Password<div className="ad-password"><input name="password" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" required /><button type="button" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button></div></label>
          {error && <p className="ad-error" role="alert">{error}</p>}
          <button className="ad-button" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in to StoreOps ↗'}</button>
        </form>
        <div className="ad-demo-help"><strong>Looking for the store workspace?</strong><p>Owners and employees sign in at <Link href="/login">the regular login</Link>.</p></div>
      </div>
    </section>
  </main>;
}
