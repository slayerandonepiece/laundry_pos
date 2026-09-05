import type { Order } from '../admin.types';
import { dateLabel, money, paymentStatus } from '../admin.data';
import { Badge } from './Primitives';

export default function OrderDetailsHeader({ order }: { order: Order }) {
  return <div className="ad-details-header">
    <div className="ad-order-title-row"><small>ORDER</small><h2>{order.id}</h2><Badge>{order.status}</Badge><Badge>{paymentStatus(order)}</Badge></div>
    <div><small>Customer</small><strong>{order.name || 'Walk-in customer'}</strong><a href={'tel:' + order.phone}>{order.phone}</a></div>
    <div><small>Expected delivery</small><strong>{dateLabel(order.due)}</strong><span>Created {dateLabel(order.date)}</span></div>
    <div><small>Order total</small><strong>{money(order.lines.reduce((sum, line) => sum + line.amount, 0))}</strong><span>{order.lines.length} services</span></div>
  </div>;
}
