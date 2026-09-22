import type { Order } from '../admin.types';
import { money, paid, total } from '../admin.data';
import { Metric } from './Primitives';
import OrderTable from './OrderTable';

import { Card, CardHeading, SingleSelectDropdown } from './ui';

interface Props {
  orders: Order[]; matching: Order[]; employee: boolean; attentionOnly: boolean;
  query: string; status: string; payment: string;
  onQuery: (value: string) => void; onStatus: (value: string) => void; onPayment: (value: string) => void;
  onClear: () => void; onSelect: (order: Order) => void;
  delivery: string; onDelivery: (value: string) => void;
}
export default function Sales({ orders, matching, employee, attentionOnly, query, status, payment, onQuery, onStatus, onPayment, onClear, onSelect, delivery, onDelivery }: Props) {
  const scope = delivery === 'today' ? 'Due today · all dates' : delivery === 'late' ? 'Late · all dates' : attentionOnly ? 'Due today or late' : 'In the selected period';
  const hasFilters = Boolean(query.trim()) || status !== 'All' || payment !== 'All' || delivery !== 'all' || attentionOnly;
  const emptyText = hasFilters ? 'No orders match this search. Try another filter.' : 'No orders yet for this period — punch a new sale to get started.';
  return <>
    {employee ? <div className="ad-metrics ad-order-counts"><Metric primary label="Total orders" value={String(orders.length)} detail={scope}/>{(['Pending', 'In Progress', 'Ready', 'Delivered'] as const).map(state => <Metric key={state} label={state} value={String(orders.filter(order => order.status === state).length)} detail={scope}/>)}</div> : <div className="ad-metrics three"><Metric primary label="Order value" value={money(matching.reduce((sum, order) => sum + total(order), 0))} detail={matching.length + ' matching orders'}/><Metric label="Collected on these orders" value={money(matching.reduce((sum, order) => sum + paid(order), 0))} detail="Payments received, across all dates"/><Metric label="Balance to collect" value={money(matching.reduce((sum, order) => sum + total(order) - paid(order), 0))} detail="On matching orders"/></div>}
    <Card>
      <CardHeading
        title={delivery === 'today' ? 'Orders due today' : delivery === 'late' ? 'Late orders' : attentionOnly ? 'Orders due today & overdue' : employee ? 'Orders' : 'Sales register'}
        subtitle="Open an order to view its details and update its status."
      />
      <div className="ad-toolbar" style={{ margin: 0, padding: 0 }}>
        <div className="ad-category-tabs" aria-label="Delivery filter">
          {[['all','Selected dates'],['today','Due today'],['late','Late']].map(([value,label]) => (
            <button key={value} aria-pressed={delivery === value && !attentionOnly} onClick={() => onDelivery(value)}>{label}</button>
          ))}
        </div>
        <input value={query} onChange={event => onQuery(event.target.value)} placeholder="Search order, customer or phone…" aria-label="Search sales"/>
        <SingleSelectDropdown ariaLabel="Filter work status" value={status} onChange={onStatus} options={['All', 'Pending', 'In Progress', 'Ready', 'Delivered'].map(value => ({ value, label: value === 'All' ? 'All work statuses' : value }))}/>
        <SingleSelectDropdown ariaLabel="Filter payment status" value={payment} onChange={onPayment} options={['All', 'Unpaid', 'Part-paid', 'Paid'].map(value => ({ value, label: value === 'All' ? 'All payment statuses' : value }))}/>
        <button className="ad-text-link" onClick={onClear}>Clear</button>
      </div>
      <OrderTable orders={matching} onSelect={onSelect} emptyText={emptyText}/>
    </Card>
  </>;
}
