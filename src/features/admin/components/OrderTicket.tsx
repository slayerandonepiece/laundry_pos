'use client';
import type { Line } from '../admin.types';
import type { SaleDraft } from '../pos.types';
import { money } from '../admin.data';
import { Button } from './Primitives';
import CustomerBar from './CustomerBar';

// The order summary beside the services: outlet, customer, how much is selected and the total.
// Delivery and payment happen in the dialog that Proceed to pay opens. On narrow
// screens it collapses to a bar at the bottom.
export default function OrderTicket({ draft, lines, outlets, outletId, error, busy, open, onToggle, onOutlet, onChange, onClear, onProceed }: {
  draft: SaleDraft; lines: Line[];
  outlets: { id: string; name: string }[]; outletId: string;
  error: string; busy: boolean; open: boolean;
  onToggle: () => void; onOutlet: (id: string) => void; onChange: (patch: { phone?: string; name?: string }) => void; onClear: () => void; onProceed: () => void;
}) {
  const amount = lines.reduce((sum, line) => sum + line.amount, 0);
  const count = lines.length ? `${lines.length} service${lines.length > 1 ? 's' : ''} selected` : 'No services yet';
  return <aside className={'ad-ctr-ticket' + (open ? ' open' : '')} aria-label="Order summary">
    <button type="button" className="ad-ctr-ticket-bar" aria-expanded={open} disabled={!lines.length && !open} onClick={onToggle}>
      <span>{count}</span>
      <strong>{money(amount)}</strong>
      <span className="ad-ctr-ticket-bar-action">{open ? 'Hide' : lines.length ? 'View order' : 'Add services'}</span>
    </button>
    <div className="ad-ctr-ticket-body">
      <header className="ad-ctr-ticket-head"><h2>Order</h2>{(lines.length > 0 || draft.phone) && <button type="button" className="ad-text-link" onClick={onClear}>Clear</button>}</header>
      {outlets.length > 1 && <label className="ad-ctr-field">Outlet<select value={outletId} onChange={e => onOutlet(e.target.value)}><option value="">Choose outlet</option>{outlets.map(outlet => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}</select></label>}
      <CustomerBar phone={draft.phone} name={draft.name} disabled={busy} onChange={onChange}/>
      <div className="ad-ctr-total"><span>Total<small>{count}</small></span><strong>{money(amount)}</strong></div>
      {error && <p className="ad-error" role="alert" aria-live="polite">{error}</p>}
      <div className="ad-ctr-ticket-foot">
        <Button type="button" disabled={busy || !lines.length} onClick={onProceed}>Proceed to pay</Button>
      </div>
    </div>
  </aside>;
}
