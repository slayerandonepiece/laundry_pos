import type { Order } from '../admin.types';
import { dateLabel, money, paymentStatus } from '../admin.data';
import { Badge } from './Primitives';
import OrderInvoiceActions from './OrderInvoiceActions';
import OrderMessageShare from './OrderMessageShare';

export default function OrderDetailsHeader({ order, outletName, readOnly = false }: { order: Order; outletName?: string; readOnly?: boolean }) {
  const serviceCount = order.lines.length;
  const serviceText = serviceCount === 1 ? '1 service' : `${serviceCount} services`;

  const showShare = !readOnly && !order.imported;
  const showInvoice = order.status === 'Delivered' && paymentStatus(order) === 'Paid' && !order.imported;
  const showActions = showShare || showInvoice;

  return <div className="ad-details-header">
    <div className="ad-order-title-row"><small>ORDER</small><h2>{order.id}</h2><Badge>{order.status}</Badge><Badge>{paymentStatus(order)}</Badge>{showActions && <div className="ad-details-actions">{showShare && <OrderMessageShare key={order.status} orderCode={order.id} status={order.status}/>}{showInvoice && <div className="ad-details-invoice"><OrderInvoiceActions disabled={readOnly} key={order.id} orderCode={order.id}/></div>}</div>}</div>
    <div className="ad-order-summary-card"><small>Customer</small><strong>{order.name || 'Walk-in customer'}</strong><a href={'tel:' + order.phone}>{order.phone}</a></div>
    <div className="ad-order-summary-card"><small>Outlet</small><strong>{order.outletId ? outletName ?? '—' : 'Organization-wide'}</strong></div>
    <div className="ad-order-summary-card"><small>Expected delivery</small><strong>{dateLabel(order.due)}</strong><span>Created {dateLabel(order.date)}</span></div>
    <div className="ad-order-summary-card"><small>Order total</small><strong>{money(order.lines.reduce((sum, line) => sum + line.amount, 0))}</strong><span>{serviceText}</span></div>
  </div>;
}
