import type { CSSProperties } from 'react';
import type { Order, WorkStatus } from '../admin.types';
import { dateLabel, today } from '../admin.data';

const steps: { status: WorkStatus; description: string }[] = [
  { status: 'Pending', description: 'Waiting to start' },
  { status: 'In Progress', description: 'Work underway' },
  { status: 'Ready', description: 'Ready for pickup' },
  { status: 'Delivered', description: 'Handed over to customer' },
];

export default function OrderDeliveryDetails({ order }: { order: Order }) {
  const isDelivered = order.status === 'Delivered' || (order.status as string) === 'Completed';
  const late = !isDelivered && order.due < today();
  return <section className="ad-detail-section ad-delivery-section">
    <h3>Delivery & work progress</h3>
    <dl className="ad-delivery-facts">
      <div><dt>Expected delivery</dt><dd>{dateLabel(order.due)}</dd></div>
      <div><dt>Delivery commitment</dt><dd className={late ? 'ad-delivery-overdue' : ''}>{isDelivered ? 'Delivered to customer' : late ? 'Overdue — needs attention' : order.due === today() ? 'Due today' : 'Upcoming'}</dd></div>
      {order.completed && <div><dt>Completed on</dt><dd>{dateLabel(order.completed)}</dd></div>}
    </dl>
    <ol className="ad-delivery-steps" style={{ '--step-count': steps.length } as CSSProperties}>{steps.map(step => <li key={step.status} aria-current={order.status === step.status ? 'step' : undefined}><span className="ad-step-indicator"/><strong>{step.status}</strong><small>{step.description}</small></li>)}</ol>
    <p className="ad-help">Work status and payment status are tracked separately.</p>
  </section>;
}
