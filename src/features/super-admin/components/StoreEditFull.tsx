'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/features/admin/components/Primitives';
import { updateStoreAction, setReviewDemoAction, updateStoreNumberingAction } from '../actions/stores.actions';
import Icon from './Icon';
import LockStoreDialog from './LockStoreDialog';
import DeleteStoreDialog from './DeleteStoreDialog';
import type { StoreDetail } from '../types';
import type { ArchiveEligibility, OrgLifecycleFacts } from '@/server/services/store-lifecycle';

export default function StoreEditFull({ store, lifecycle, eligibility }: {
  store: StoreDetail;
  lifecycle: OrgLifecycleFacts | null;
  eligibility: ArchiveEligibility | null;
}) {
  const router = useRouter();
  const archived = lifecycle?.state === 'ARCHIVED';
  const [name, setName] = useState(store.name);
  const [address, setAddress] = useState(store.address);
  const [phone, setPhone] = useState(store.phone);
  const [email, setEmail] = useState(store.email);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [orgCode, setOrgCode] = useState(store.orgCode);
  const [orderBase, setOrderBase] = useState(String(store.orderSeqBase));
  const [numberingError, setNumberingError] = useState('');
  const [numberingBusy, setNumberingBusy] = useState(false);

  function toggleReviewDemo() {
    setDemoBusy(true);
    setError('');
    setReviewDemoAction(store.id, !store.isReviewDemo)
      .then(result => {
        setDemoBusy(false);
        if (!result.ok) { setError(result.error || 'Could not update this setting. Try again.'); return; }
        setNotice(store.isReviewDemo ? 'Review demo turned off' : 'Review demo turned on');
        router.refresh();
        setTimeout(() => setNotice(''), 4000);
      })
      .catch(() => { setDemoBusy(false); setError('Could not update this setting. Try again.'); });
  }

  function saveNumbering() {
    const base = Number(orderBase.replace(/\s/g, ''));
    setNumberingError('');
    setNumberingBusy(true);
    updateStoreNumberingAction(store.id, {
      ...(orgCode.trim() !== store.orgCode ? { orgCode: orgCode.trim() } : {}),
      ...(Number.isFinite(base) && base !== store.orderSeqBase ? { orderSeqBase: base } : {}),
    })
      .then(result => {
        setNumberingBusy(false);
        if (!result.ok) { setNumberingError(result.error || 'Could not save numbering. Try again.'); return; }
        setNotice('Numbering saved');
        router.refresh();
        setTimeout(() => setNotice(''), 4000);
      })
      .catch(() => { setNumberingBusy(false); setNumberingError('Could not save numbering. Try again.'); });
  }

  function submit() {
    if (!name.trim()) return setError('Enter an organization name.');
    setBusy(true);
    setError('');
    updateStoreAction(store.id, { name: name.trim(), address: address.trim(), phone: phone.trim(), email: email.trim() })
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

    {archived && (
      <div className="notice" style={{ marginBottom: 16 }}>
        <Icon name="archive" size="s" />
        <span>{store.name} is archived and removed from the directory. It&apos;s read-only — there is no restore option, so details and the danger zone below no longer apply.</span>
      </div>
    )}

    <div className="grid2">
      <div className="card">
        <div className="card-head"><h2><Icon name="building" />Organization details</h2></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field"><label htmlFor="organization-name">Organization name</label><input id="organization-name" type="text" value={name} onChange={e => setName(e.target.value)} disabled={archived} required /></div>
          <div className="field"><label htmlFor="organization-address">Address</label><input id="organization-address" type="text" value={address} onChange={e => setAddress(e.target.value)} disabled={archived} placeholder="Optional" /></div>
          <div className="field"><label htmlFor="organization-phone">Phone</label><input id="organization-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} disabled={archived} placeholder="Optional" /></div>
          <div className="field"><label htmlFor="organization-email">Email (optional)</label><input id="organization-email" type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={archived} placeholder="Optional" /></div>
          {error && <p className="ad-error" role="alert">{error}</p>}
          {!archived && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button type="button" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
            </div>
          )}
        </div>
      </div>


      {!archived && (
        <div className="card">
          <div className="card-head"><h2><Icon name="building" />Document numbering</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field">
              <label htmlFor="organization-code">Organization code</label>
              <input id="organization-code" type="text" inputMode="numeric" value={orgCode} onChange={e => setOrgCode(e.target.value)} disabled={store.numberingLocked} maxLength={5} />
              <p className="ad-help">{store.numberingLocked ? 'Locked because documents have been issued.' : '3 to 5 digits. Appears in invoice and receipt numbers and cannot change after the first order.'}</p>
            </div>
            <div className="field">
              <label htmlFor="order-base">Next order number starts at</label>
              <input id="order-base" type="text" inputMode="numeric" value={orderBase} onChange={e => setOrderBase(e.target.value)} />
              <p className="ad-help">Whole number from 1000000001. It can only be raised.</p>
            </div>
            <p className="ad-help">Examples: invoice IN{orgCode || '001'}/27/0000001, receipt RC{orgCode || '001'}/27/0000001.</p>
            {numberingError && <p className="ad-error" role="alert">{numberingError}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="button" onClick={saveNumbering} disabled={numberingBusy}>{numberingBusy ? 'Saving…' : 'Save numbering'}</Button>
            </div>
          </div>
        </div>
      )}

      {!archived && (
        <div className="card">
          <div className="card-head"><h2><Icon name="lock" />App-store review demo</h2></div>
          <div className="card-body">
            <div className="switch-row" style={{ alignItems: 'flex-start' }}>
              <div>
                <b>{store.isReviewDemo ? 'This is a protected review demo organization' : 'Mark as review demo organization'}</b>
                <small>A review demo is never wiped by the deletion job, never blocked by subscription expiry, and its pending deletion requests restore themselves after 24 hours.</small>
              </div>
              <Button secondary type="button" onClick={toggleReviewDemo} disabled={demoBusy} style={{ flexShrink: 0 }}>{store.isReviewDemo ? 'Turn off' : 'Turn on'}</Button>
            </div>
          </div>
        </div>
      )}

      {!archived && (
        <div className="card" style={{ borderColor: '#f0cfcd' }}>
          <div className="card-head" style={{ background: 'var(--bad-bg)', borderBottomColor: '#f3d3d0' }}>
            <h2 style={{ color: 'var(--bad-fg)', textTransform: 'uppercase', fontSize: 12, letterSpacing: '.08em' }}>Danger zone</h2>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div className="switch-row" style={{ alignItems: 'flex-start' }}>
              <div>
                <b>{store.status === 'LOCKED' ? 'Unlock this organization' : 'Lock this organization'}</b>
                <small>{store.status === 'LOCKED'
                  ? 'Restores data access for the owner and every employee.'
                  : <>Every data request returns 403 for the owner and every employee. <strong>Sign-in itself keeps working</strong> — the owner still sees this warning, just no data.</>}</small>
              </div>
              <Button secondary type="button" onClick={() => setLockDialogOpen(true)} style={{ flexShrink: 0 }}>{store.status === 'LOCKED' ? 'Unlock organization' : 'Lock organization'}</Button>
            </div>

            <div style={{ paddingTop: 16, marginTop: 4, borderTop: '1px solid var(--line)' }}>
              <b style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>Archive this organization</b>
              <p style={{ fontSize: 12, marginBottom: 12 }}>Removes it from the directory. Order and payment history is kept — never hard-deleted. There is currently no restore UI; treat this as permanent.</p>
              <Button secondary type="button" onClick={() => setArchiveDialogOpen(true)}>Archive organization</Button>
            </div>
          </div>
        </div>
      )}
    </div>

    {lockDialogOpen && (
      <LockStoreDialog
        store={store}
        mode={store.status === 'LOCKED' ? 'unlock' : 'lock'}
        onCancel={() => setLockDialogOpen(false)}
        onDone={() => { setLockDialogOpen(false); setNotice(store.status === 'LOCKED' ? 'Organization unlocked' : 'Organization locked'); router.refresh(); setTimeout(() => setNotice(''), 4000); }}
      />
    )}
    {archiveDialogOpen && (
      <DeleteStoreDialog
        store={store}
        eligibility={eligibility ?? undefined}
        onCancel={() => setArchiveDialogOpen(false)}
        onDone={() => router.push('/super-admin/stores')}
      />
    )}
  </>;
}
