'use client';
import DateInput from './DateInput';
import type { Line, PaymentMethodOption } from '../admin.types';
import type { SaleDraft } from '../pos.types';
import { money, today } from '../admin.data';
import { Button } from './Primitives';
import { Dialog } from './ui';

function tomorrow() {
  const date = new Date(today() + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Second step of the counter: the bill with its price calculation on the left, delivery and payment on the right. */
export default function OrderPaymentDialog({ draft, lines, paymentMethods, cod, error, storageNote, busy, onChange, onClose, onSubmit }: {
  draft: SaleDraft; lines: Line[]; paymentMethods: PaymentMethodOption[]; cod: boolean;
  error: string; storageNote?: string; busy: boolean;
  onChange: (patch: Partial<SaleDraft>) => void; onClose: () => void; onSubmit: () => void;
}) {
  const amount = lines.reduce((sum, line) => sum + line.amount, 0);
  const due = [['Today', today()], ['Tomorrow', tomorrow()]] as const;
  const received = cod ? 0 : Math.round(Number(draft.received) * 100) || 0;
  const balance = Math.max(amount - received, 0);
  return <Dialog title="Review and pay" wide className="ad-ctr-pay" onClose={() => { if (!busy) onClose(); }} foot={<>
    <Button type="button" secondary disabled={busy} onClick={onClose}>Back</Button>
    <Button type="submit" form="ad-ctr-pay-form" disabled={busy || !lines.length}>{busy ? 'Placing order…' : `Place order · ${money(amount)}`}</Button>
  </>}>
    <form id="ad-ctr-pay-form" className="ad-ctr-pay-grid" onSubmit={e => { e.preventDefault(); onSubmit(); }}>
      <section className="ad-ctr-pay-bill" aria-label="Order items">
        <h3>Items</h3>
        <table>
          <thead><tr><th>Service</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
          <tbody>{lines.map(line => <tr key={line.productId}>
            <td>{line.name}</td>
            <td>{line.unit === 'kg' ? `${line.quantity} kg` : `${line.quantity} pcs`}</td>
            <td>{line.unit === 'kg' ? 'Slab pricing' : `${money(Math.round(line.amount / line.quantity))} / pc`}</td>
            <td>{money(line.amount)}</td>
          </tr>)}</tbody>
        </table>
        <dl className="ad-ctr-pay-sums">
          <div><dt>Order total</dt><dd>{money(amount)}</dd></div>
          {!cod && received > 0 && <div><dt>Received now</dt><dd>{money(received)}</dd></div>}
          <div className="due"><dt>Balance due</dt><dd>{money(cod ? amount : balance)}</dd></div>
        </dl>
      </section>
      <section className="ad-ctr-pay-side" aria-label="Delivery and payment">
        <fieldset className="ad-ctr-group"><legend>Delivery</legend><div className="ad-ctr-chips">
          {due.map(([label, value]) => <button type="button" key={label} aria-pressed={draft.due === value} onClick={() => onChange({ due: value })}>{label}</button>)}
          <DateInput aria-label="Delivery date" required min={today()} value={draft.due} onChange={e => onChange({ due: e.target.value })}/>
        </div></fieldset>
        {paymentMethods.length > 0 ? <fieldset className="ad-ctr-group"><legend>Payment method</legend><div className="ad-ctr-chips">
          {paymentMethods.map(method => <button type="button" key={method.id} aria-pressed={draft.method === method.name} onClick={() => onChange(method.code === 'COD' ? { method: method.name, received: '0' } : { method: method.name })}>{method.name}</button>)}
        </div>
          {cod ? <p className="ad-help">Cash on delivery: nothing is collected now.</p> : <div className="ad-ctr-received">
            <label>Received (₹)<input data-autofocus type="text" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" required value={draft.received} onChange={e => onChange({ received: e.target.value })}/></label>
            <button type="button" className="ad-button ad-secondary" disabled={!amount} onClick={() => onChange({ received: String(amount / 100) })}>Full {money(amount)}</button>
          </div>}
        </fieldset> : <p className="ad-help">No payment methods are enabled for before-delivery payment. The order is saved unpaid.</p>}
        <label className="ad-ctr-field">Notes<textarea rows={2} placeholder="Stains, folding preferences…" value={draft.notes} onChange={e => onChange({ notes: e.target.value })}/></label>
        {storageNote && <p className="ad-help" role="alert">{storageNote}</p>}
        {error && <p className="ad-error" role="alert" aria-live="polite">{error}</p>}
      </section>
    </form>
  </Dialog>;
}
