'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
export default function Login({ onSubmit, error }: { onSubmit: (u: string, p: string) => Promise<void> | void; error: string }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  // One sign-in at a time: the button and fields lock until the server answers.
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try { await onSubmit(String(f.get('phone')), String(f.get('password'))); } finally { setBusy(false); }
  }
  return <main className="ad-root ad-login"><section className="ad-login-brand"><Link href="/" className="ad-logo"><span className="ad-logo-mark">◎</span><span>MyShop</span></Link><div><p className="ad-eyebrow">THE BUSINESS BEHIND THE CARE</p><h1>A little clarity.<br/>A better<br/><em>everyday.</em></h1><p>Your orders, your numbers, your store.<br/>All in one place.</p></div><small>Local care. Thoughtfully managed.</small></section><section className="ad-login-form"><div><span className="ad-demo">STORE WORKSPACE</span><h2>Welcome back.</h2><p>Sign in with your platform admin, owner or employee account.</p><form onSubmit={submit} aria-busy={busy}>{busy && <div className="login-progress" role="status" aria-label="Signing in" />}<label>Phone number<input name="phone" type="tel" inputMode="numeric" autoComplete="tel" placeholder="Enter your phone number" required disabled={busy}/></label><label>Password<div className="login-pw"><input name="password" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" required disabled={busy}/><button type="button" className="login-pw-toggle" onClick={() => setShow(!show)} disabled={busy} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>{show
  ? <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c5 0 8.5 4 9.5 6a12.6 12.6 0 0 1-2.9 3.6"/><path d="M6.4 6.9A12.6 12.6 0 0 0 2.5 12c1 2 4.5 6 9.5 6 1.5 0 2.8-.4 4-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>
  : <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 12C3.5 10 7 6 12 6s8.5 4 9.5 6c-1 2-4.5 6-9.5 6s-8.5-4-9.5-6z"/><circle cx="12" cy="12" r="3"/></svg>}</button></div></label>{error && <p className="ad-error" role="alert">{error}</p>}<button className="ad-button" type="submit" disabled={busy}>{busy ? <><span className="login-spin" aria-hidden="true" />Signing in…</> : 'Sign in to workspace'}</button></form><div className="ad-demo-help"><strong>Sign in</strong><p>Use the account created for your workspace.</p></div><p style={{ fontSize: 12 }}><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link></p></div></section></main>;
}
