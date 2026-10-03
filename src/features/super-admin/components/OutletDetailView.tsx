'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { money } from '@/features/admin/admin.data';
import Icon from './Icon';
import { closeOutletAction, reopenOutletAction, relocateOutletAction, updateOutletAction } from '../actions/outlets.actions';
import type { OutletDetail, OutletStatus, StoreDetail } from '../types';

function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_BADGE: Record<OutletStatus, { label: string; cls: string }> = {
  ACTIVE: { label: 'Active', cls: 'good' },
  CLOSED: { label: 'Closed', cls: 'gray' },
  RELOCATED: { label: 'Relocated', cls: 'warm' },
};

export default function OutletDetailView({ store, outlet }: { store: StoreDetail; outlet: OutletDetail }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(outlet.displayName);
  const [address, setAddress] = useState(outlet.address);
  const [phone, setPhone] = useState(outlet.phone);
  const [relocateAddress, setRelocateAddress] = useState('');
  const [panel, setPanel] = useState<'relocate' | 'close' | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const badge = STATUS_BADGE[outlet.status];
  const base = `/super-admin/stores/${store.id}/outlets`;

  function flash(message: string) {
    setNotice(message);
    router.refresh();
    setTimeout(() => setNotice(''), 4000);
  }

  function saveEdit() {
    if (!displayName.trim()) return setError('Enter an outlet name.');
    setBusy(true);
    setError('');
    updateOutletAction(store.id, outlet.id, { displayName: displayName.trim(), address: address.trim(), phone: phone.trim() })
      .then(result => {
        setBusy(false);
        if (!result.ok) { setError(result.error || 'Could not save changes. Try again.'); return; }
        flash('Outlet updated');
      })
      .catch(() => { setError('Could not save changes. Try again.'); setBusy(false); });
  }

  function submitRelocate() {
    if (!relocateAddress.trim()) return setError('Enter the new address.');
    setBusy(true);
    setError('');
    relocateOutletAction(store.id, outlet.id, relocateAddress.trim())
      .then(result => {
        setBusy(false);
        if (!result.ok) { setError(result.error || 'Could not relocate this outlet. Try again.'); return; }
        setPanel(null);
        flash('Outlet relocated');
      })
      .catch(() => { setError('Could not relocate this outlet. Try again.'); setBusy(false); });
  }

  function confirmClose() {
    setBusy(true);
    setError('');
    closeOutletAction(store.id, outlet.id)
      .then(result => {
        setBusy(false);
        if (!result.ok) { setError(result.error || 'Could not close this outlet. Try again.'); return; }
        setPanel(null);
        flash('Outlet closed');
      })
      .catch(() => { setError('Could not close this outlet. Try again.'); setBusy(false); });
  }

  function reopen() {
    setBusy(true);
    setError('');
    reopenOutletAction(store.id, outlet.id)
      .then(result => {
        setBusy(false);
        if (!result.ok) { setError(result.error || 'Could not reopen this outlet. Try again.'); return; }
        flash('Outlet reopened');
      })
      .catch(() => { setError('Could not reopen this outlet. Try again.'); setBusy(false); });
  }

  return <>
    {notice && <div className="ad-toast" role="status">✓ {notice}</div>}
    <Link className="backlink" href={base}><Icon name="arrowLeft" size="s" />Back to outlets</Link>

    <div className="phead">
      <div className="phead-l">
        <span className="av sq" style={{ width: 46, height: 46, fontSize: 15 }}><Icon name="store" size="m" /></span>
        <div>
          <h1>{outlet.displayName} <span className={'badge ' + badge.cls}>{badge.label}</span></h1>
          <p>{store.name} · {outlet.outletCode} · opened {dateLabel(outlet.openedAt)}</p>
        </div>
      </div>
      <div className="phead-r">
        {outlet.status === 'CLOSED' ? (
          <button type="button" className="btn outline" onClick={reopen} disabled={busy}>Reopen outlet</button>
        ) : (
          <>
            <button type="button" className="btn outline" onClick={() => { setPanel(panel === 'relocate' ? null : 'relocate'); setError(''); }}>Relocate</button>
            <button type="button" className="btn danger-outline" onClick={() => { setPanel(panel === 'close' ? null : 'close'); setError(''); }}>Close outlet</button>
          </>
        )}
      </div>
    </div>

    {error && <p className="ad-error" role="alert">{error}</p>}

    <div className="grid2" style={{ marginTop: 4, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="stats cols-3" style={{ marginBottom: 0 }}>
          <div className="stat">
            <div className="stat-top"><span>Staff</span><span className="stat-ic"><Icon name="users" /></span></div>
            <strong className="num">{outlet.staffCount}</strong>
            <small>active members</small>
          </div>
          <div className="stat">
            <div className="stat-top"><span>Orders, 30d</span><span className="stat-ic"><Icon name="history" /></span></div>
            <strong className="num">{outlet.orders30d ?? 0}</strong>
            <small>placed here</small>
          </div>
          <div className="stat">
            <div className="stat-top"><span>Collected, 30d</span><span className="stat-ic"><Icon name="card" /></span></div>
            <strong className="num">{money(outlet.collected30d ?? 0)}</strong>
            <small>payments</small>
          </div>
        </div>

        <div className="card"><div className="card-body">
          <h3 style={{ marginBottom: 14 }}>Edit outlet</h3>
          <div className="ad-form">
            <label>Outlet code<input value={outlet.outletCode} disabled /></label>
            <p className="ad-help">Immutable once created — used in payment records and reports.</p>
            <label>Outlet name<input value={displayName} onChange={e => setDisplayName(e.target.value)} required /></label>
            <label>Address<input value={address} onChange={e => setAddress(e.target.value)} /></label>
            <label>Phone<input value={phone} onChange={e => setPhone(e.target.value)} /></label>
            <button type="button" className="btn" onClick={saveEdit} disabled={busy} style={{ alignSelf: 'flex-end' }}>{busy ? 'Saving…' : 'Save changes'}</button>
          </div>
        </div></div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card"><div className="card-body">
          <h4 style={{ marginBottom: 10, fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Status lifecycle</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span className="badge good">Active</span><small>Takes orders normally</small></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span className="badge gray">Closed</span><small>Hidden from switcher, history stays</small></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span className="badge warm">Relocated</span><small>New address, code unchanged</small></div>
          </div>
        </div></div>

        {panel === 'relocate' && (
          <div className="card"><div className="card-body">
            <h4>Relocate {outlet.displayName}</h4>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '4px 0 12px' }}>Same outlet, same code — only the address changes. Past orders keep the old address on their invoices.</p>
            <div className="ad-form">
              <label>New address<input value={relocateAddress} onChange={e => setRelocateAddress(e.target.value)} placeholder="e.g. New plot, same locality" /></label>
              <div className="ad-form-footer">
                <button type="button" className="btn outline" onClick={() => setPanel(null)} disabled={busy}>Cancel</button>
                <button type="button" className="btn" onClick={submitRelocate} disabled={busy}>{busy ? 'Saving…' : 'Confirm relocation'}</button>
              </div>
            </div>
          </div></div>
        )}

        {panel === 'close' && (
          <div className="card"><div className="card-body">
            <h4>Close {outlet.displayName}?</h4>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '4px 0 12px' }}>
              Its {outlet.staffCount} staff member{outlet.staffCount === 1 ? '' : 's'} lose the outlet from their switcher immediately. Order and payment history is kept, and the outlet code cannot be reused. This does not delete anything.
            </p>
            <div className="ad-form-footer">
              <button type="button" className="btn outline" onClick={() => setPanel(null)} disabled={busy}>Cancel</button>
              <button type="button" className="btn danger" onClick={confirmClose} disabled={busy}>{busy ? 'Closing…' : 'Close outlet'}</button>
            </div>
          </div></div>
        )}
      </div>
    </div>
  </>;
}
