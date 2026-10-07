'use client';
import { useState } from 'react';
import type { Order, PaymentMethodOption, WorkStatus } from '../admin.types';
import { usePanelClose } from './Primitives';
import OrderDeliveryDetails from './OrderDeliveryDetails';
import OrderPaymentSummary from './OrderPaymentSummary';
import { Dialog } from './ui';
import DeliverOrderDialog from './DeliverOrderDialog';
import CancelOrderDialog from './CancelOrderDialog';

const statuses: WorkStatus[] = ['Pending', 'In Progress', 'Ready', 'Delivered'];

export default function OrderDetails({ 
  order, 
  paymentMethods, 
  onStatus, 
  onDeliver,
  deliverBusy = false,
  canCancel = false,
  onCancelOrder,
  onPayment, 
  error, 
  readOnly = false,
  canRecordPayment = true,
  asDialog = false,
  onClose
}: { 
  readOnly?: boolean;
  canRecordPayment?: boolean; 
  order: Order; 
  paymentMethods: PaymentMethodOption[]; 
  onStatus: (status: WorkStatus) => void; 
  onDeliver: (method?: string) => void;
  deliverBusy?: boolean;
  canCancel?: boolean;
  onCancelOrder?: (reason: string) => Promise<string | null>;
  onPayment: (amount: number, method: string) => void; 
  error: string;
  asDialog?: boolean;
  onClose?: () => void;
}) {
  const panelClose = usePanelClose();
  const handleClose = onClose || panelClose;
  const [delivering, setDelivering] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // Orders only move forward and Delivered is final, so earlier statuses are not offered.
  const forward = statuses.slice(statuses.indexOf(order.status));
  const final = order.status === 'Delivered';

  const content = (
    <div className="ad-order-detail-content">
      <div className="ad-detail-columns">
        <OrderDeliveryDetails order={order}/>
        <OrderPaymentSummary order={order} paymentMethods={paymentMethods} canRecordPayment={canRecordPayment} onPayment={onPayment}/>
        <section className="ad-detail-section ad-detail-audit">
          <h3>Status history</h3>
          {order.history?.length ? <ol className="ad-status-history">{[...order.history].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).map((event, index, events) => <li key={event.at + index} aria-current={index === events.length - 1 ? 'step' : undefined}>
            <strong>{event.status}</strong><span>{event.by}</span><time dateTime={event.at}>{new Date(event.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} IST</time>
          </li>)}</ol> : <p>History was not recorded for this older order.</p>}
        </section>
        <section className="ad-detail-section ad-detail-note"><h3>Care instructions</h3><p className="ad-detail-notes">{order.notes || 'No special instructions added to this order.'}</p></section>
      </div>
    </div>
  );

  const footer = (
    <div className="ad-detail-footer" style={{ width: '100%' }}>
      {error && <p className="ad-error" role="alert">{error}</p>}
      <label>Update work status<select disabled={readOnly || final} value={order.status} aria-label="Work status" onChange={e => { const next = e.target.value as WorkStatus; if (next === 'Delivered') setDelivering(true); else onStatus(next); }}>{forward.map(status => <option key={status}>{status}</option>)}</select>{final && <small className="ad-help">Delivered orders are final.</small>}</label>
      {canCancel && onCancelOrder && !final && !order.imported && <button type="button" className="ad-button ad-secondary ad-cancel-order" onClick={() => setCancelling(true)}><svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>Cancel order</button>}
      {cancelling && onCancelOrder && <CancelOrderDialog order={order} onClose={() => setCancelling(false)} onCancelOrder={onCancelOrder} />}
      {delivering && <DeliverOrderDialog order={order} paymentMethods={paymentMethods} busy={deliverBusy} onCancel={() => setDelivering(false)} onConfirm={method => { setDelivering(false); onDeliver(method); }} />}
    </div>
  );

  if (asDialog) {
    return (
      <Dialog isOpen={true} onClose={() => handleClose?.()} title={order.id} wide={true} foot={footer}>
         {content}
      </Dialog>
    );
  }

  return (
    <div className="ad-order-detail">
      {content}
      {footer}
    </div>
  );
}
