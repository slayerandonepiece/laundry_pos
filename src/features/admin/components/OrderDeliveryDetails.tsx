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
  const currentStepIndex = steps.findIndex(s => s.status === order.status || (s.status === 'Delivered' && (order.status as string) === 'Completed'));

  return <section className="ad-detail-section ad-delivery-section">
    <h3>Delivery & work progress</h3>
    <dl className="ad-delivery-facts">
      <div><dt>Expected delivery</dt><dd>{dateLabel(order.due)}</dd></div>
      <div><dt>Delivery commitment</dt><dd className={late ? 'ad-delivery-overdue' : ''}>{isDelivered ? 'Delivered to customer' : late ? 'Overdue — needs attention' : order.due === today() ? 'Due today' : 'Upcoming'}</dd></div>
      {order.completed && <div><dt>Completed on</dt><dd>{dateLabel(order.completed)}</dd></div>}
    </dl>
    <ol className="ad-delivery-steps" style={{ '--step-count': steps.length } as CSSProperties}>
      {steps.map((step, index) => {
        const isCompleted = currentStepIndex !== -1 && index < currentStepIndex;
        const isCurrent = currentStepIndex !== -1 ? index === currentStepIndex : (index === 0 && order.status === 'Pending');
        const state = isCompleted ? 'completed' : isCurrent ? 'current' : 'future';
        return (
          <li key={step.status} data-state={state} aria-current={isCurrent ? 'step' : undefined}>
            <span className="ad-step-indicator" />
            <strong>{isCompleted ? `✓ ${step.status}` : step.status}</strong>
            <small>{step.description}</small>
          </li>
        );
      })}
    </ol>
    <p className="ad-help">Work status and payment status are tracked separately.</p>
  </section>;
}
