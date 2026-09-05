import type { Order } from '../admin.types';
import { money, paid, total } from '../admin.data';
import { Metric } from './Primitives';
import OrderTable from './OrderTable';

interface Props {
  orders: Order[]; matching: Order[]; employee: boolean; attentionOnly: boolean;
  query: string; status: string; payment: string;
  onQuery: (value: string) => void; onStatus: (value: string) => void; onPayment: (value: string) => void;
  onClear: () => void; onSelect: (order: Order) => void;
  delivery: string; onDelivery: (value: string) => void;
}
export default function Sales({ orders, matching, employee, attentionOnly, query, status, payment, onQuery, onStatus, onPayment, onClear, onSelect, delivery, onDelivery }: Props) {
  const scope = delivery === 'today' ? 'Due today · all dates' : delivery === 'late' ? 'Late · all dates' : attentionOnly ? 'Due today or late' : 'In the selected period';
  return <>
    {employee ? <div className="ad-metrics ad-order-counts"><Metric primary label="Total orders" value={String(orders.length)} detail={scope}/>{(['Pending', 'In Progress', 'Completed'] as const).map(state => <Metric key={state} label={state} value={String(orders.filter(order => order.status === state).length)} detail={scope}/>)}</div> : <div className="ad-metrics three"><Metric primary label="Order value" value={money(matching.reduce((sum, order) => sum + total(order), 0))} detail={matching.length + ' matching orders'}/><Metric label="Collected on these orders" value={money(matching.reduce((sum, order) => sum + paid(order), 0))} detail="Payments received, across all dates"/><Metric label="Balance to collect" value={money(matching.reduce((sum, order) => sum + total(order) - paid(order), 0))} detail="On matching orders"/></div>}
    <section className="ad-card ad-table-card ad-orders-card">
      <div className="ad-card-heading"><div><h2>{delivery === 'today' ? 'Orders due today' : delivery === 'late' ? 'Late orders' : attentionOnly ? 'Orders due today & overdue' : employee ? 'Orders' : 'Sales register'}</h2><p>Open an order to view its details and update its status.</p></div></div>
      <div className="ad-toolbar"><div className="ad-category-tabs" aria-label="Delivery filter">{[['all','Selected dates'],['today','Due today'],['late','Late']].map(([value,label]) => <button key={value} aria-pressed={delivery === value && !attentionOnly} onClick={() => onDelivery(value)}>{label}</button>)}</div><input value={query} onChange={event => onQuery(event.target.value)} placeholder="Search order, customer or phone…" aria-label="Search sales"/>
        <select value={status} aria-label="Filter work status" onChange={event => onStatus(event.target.value)}>{['All', 'Pending', 'In Progress', 'Completed'].map(value => <option key={value} value={value}>{value === 'All' ? 'All work statuses' : value}</option>)}</select>
        <select value={payment} aria-label="Filter payment status" onChange={event => onPayment(event.target.value)}>{['All', 'Unpaid', 'Part-paid', 'Paid'].map(value => <option key={value} value={value}>{value === 'All' ? 'All payment statuses' : value}</option>)}</select>
        <button className="ad-text-link" onClick={onClear}>Clear</button>
      </div><OrderTable orders={matching} onSelect={onSelect}/>
    </section>
  </>;
}
