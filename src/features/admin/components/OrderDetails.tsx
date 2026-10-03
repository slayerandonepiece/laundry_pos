'use client';
import type { Order, StorePaymentMethod, WorkStatus } from '../admin.types';
import { Button, usePanelClose } from './Primitives';
import OrderDeliveryDetails from './OrderDeliveryDetails';
import OrderPaymentSummary from './OrderPaymentSummary';
import { Dialog } from './ui';

const statuses: WorkStatus[] = ['Pending', 'In Progress', 'Ready', 'Delivered'];

export default function OrderDetails({ 
  order, 
  paymentMethods, 
  onStatus, 
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
  paymentMethods: StorePaymentMethod[]; 
  onStatus: (status: WorkStatus) => void; 
  onPayment: (amount: number, method: string) => void; 
  error: string;
  asDialog?: boolean;
  onClose?: () => void;
}) {
  const panelClose = usePanelClose();
  const handleClose = onClose || panelClose;

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
      <label>Update work status<select disabled={readOnly} value={order.status} aria-label="Work status" onChange={e => onStatus(e.target.value as WorkStatus)}>{statuses.map(status => <option key={status}>{status}</option>)}</select></label>
      <Button secondary onClick={handleClose}>Close</Button>
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
