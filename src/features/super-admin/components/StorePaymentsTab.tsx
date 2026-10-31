'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/features/admin/components/Primitives';
import Icon from './Icon';
import { saveOrganizationPaymentsAction } from '../actions/org-settings.actions';
import { PAYMENT_STAGE_LABELS, allowedPaymentStages, type PaymentStageValue } from '../utils';
import type { OrganizationPaymentMethodDTO } from '@/server/services/platform-payment-methods';

interface Row { id: string; code: string; name: string; enabled: boolean; stage: PaymentStageValue }

const toRows = (methods: OrganizationPaymentMethodDTO[]): Row[] => methods.map(method => ({ id: method.id, code: method.code, name: method.name, enabled: method.enabled, stage: method.stage }));

function problem(rows: Row[]): string {
  const enabled = rows.filter(row => row.enabled);
  if (!enabled.length) return 'Enable at least one payment method.';
  if (!enabled.some(row => row.stage !== 'PRE_ORDER')) return 'Enable at least one method that appears after the order, so payment can be collected at delivery.';
  return '';
}

export default function StorePaymentsTab({ storeId, methods, locked, onSaved }: {
  storeId: string;
  methods: OrganizationPaymentMethodDTO[];
  locked: boolean;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => toRows(methods));
  const [saved, setSaved] = useState<Row[]>(() => toRows(methods));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(rows) !== JSON.stringify(saved);

  const patch = (id: string, change: Partial<Row>) => { setRows(current => current.map(row => (row.id === id ? { ...row, ...change } : row))); setError(''); setNotice(''); };

  function save() {
    const message = problem(rows);
    if (message) return setError(message);
    setBusy(true);
    setError('');
    saveOrganizationPaymentsAction(storeId, rows.map(row => ({ platformPaymentMethodId: row.id, enabled: row.enabled })))
      .then(result => {
        setBusy(false);
        if (!result.ok || !result.methods) { setError(result.error || 'Could not save payment methods. Try again.'); return; }
        const next = toRows(result.methods);
        setRows(next);
        setSaved(next);
        setNotice('Payment methods saved');
        onSaved();
        router.refresh();
      })
      .catch(() => { setBusy(false); setError('Could not save payment methods. Try again.'); });
  }

  const label = (row: Row) => (row.name.toLowerCase() === row.code.toLowerCase() && row.code.length <= 3 ? row.code : row.name);
  const atPunch = rows.filter(row => row.enabled && row.stage !== 'POST_ORDER');
  const atCollect = rows.filter(row => row.enabled && row.stage !== 'PRE_ORDER');

  return <div className="pm-layout">
    <div className="card pm-main">
      <div className="card-head">
        <div><h2><Icon name="card" />Payment methods</h2><p>Applies to every outlet. When a method is offered is set once in Payment methods and is the same for every organization. The owner can see this list but cannot change it.</p></div>
        <span className={'badge ' + (dirty ? 'warm' : 'gray')}>{dirty ? 'Unsaved changes' : 'No changes'}</span>
      </div>
      {locked && <p className="ad-help" role="status" style={{ margin: 0, padding: '10px 16px 0' }}>This organization is locked or archived; changes still apply when it is active again.</p>}
      <div className="pm-cols" aria-hidden="true"><span>Method</span><span>Offered</span><span>On</span></div>
      {rows.map(row => {
        const fixed = allowedPaymentStages(row.code).length === 1;
        return <div key={row.id} className={'pm-row' + (row.enabled ? '' : ' off')}>
          <div className="pm-name"><strong>{label(row)}</strong><span className="chip num">{row.code}</span>
            {fixed && <small>A promise to pay, so it is pre-order only. No payment is recorded for it.</small>}</div>
          <div className="pm-offered"><span className="chip">{PAYMENT_STAGE_LABELS[row.stage]}</span></div>
          <button type="button" role="switch" aria-checked={row.enabled} aria-label={`${row.enabled ? 'Disable' : 'Enable'} ${label(row)}`} className={'switch' + (row.enabled ? ' on' : '')} style={{ border: 0, padding: 0, cursor: 'pointer' }} onClick={() => patch(row.id, { enabled: !row.enabled })} />
        </div>;
      })}
      {(error || notice) && <div style={{ padding: '10px 16px 0' }}>
        {error && <p className="ad-error" role="alert" style={{ margin: 0 }}>{error}</p>}
        {notice && <p className="ad-help" role="status" style={{ margin: 0 }}>✓ {notice}</p>}
      </div>}
      <div className="pm-foot">
        <Button secondary type="button" disabled={!dirty || busy} onClick={() => { setRows(saved); setError(''); }}>Discard</Button>
        <Button type="button" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</Button>
      </div>
    </div>

    <aside className="card pm-preview" aria-label="What staff will see">
      <div className="card-head"><div><h2>What staff will see</h2><p>Updates as you change the list.</p></div></div>
      <div className="pm-step">
        <div className="pm-step-t"><span className="mt-step">1</span>When an order is punched</div>
        <div className="mt-chips">{atPunch.length ? atPunch.map(row => <span key={row.id} className="pm-pill">{label(row)}</span>) : <span className="pm-none">No method. Orders are placed unpaid.</span>}</div>
      </div>
      <div className="pm-step">
        <div className="pm-step-t"><span className="mt-step">2</span>When collecting payment or delivering</div>
        <div className="mt-chips">{atCollect.length ? atCollect.map(row => <span key={row.id} className="pm-pill">{label(row)}</span>) : <span className="pm-none pm-bad">No method. Staff cannot deliver an order with a balance.</span>}</div>
      </div>
      <p className="pm-note">Delivery needs at least one method offered after the order.</p>
    </aside>
  </div>;
}
