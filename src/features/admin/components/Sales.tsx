import type { Order } from '../admin.types';
import OrderTable from './OrderTable';

import { Card, CardHeading, SingleSelectDropdown } from './ui';

interface Props {
  orders: Order[]; matching: Order[]; employee: boolean; attentionOnly: boolean;
  query: string; status: string; payment: string;
  onQuery: (value: string) => void; onStatus: (value: string) => void; onPayment: (value: string) => void;
  onClear: () => void; onSelect: (order: Order) => void;
  delivery: string; onDelivery: (value: string) => void;
  outlets?: { id: string; name: string }[];
  onNewOrder?: () => void;
}
export default function Sales({ matching, employee, attentionOnly, query, status, payment, onQuery, onStatus, onPayment, onClear, onSelect, delivery, onDelivery, outlets, onNewOrder }: Props) {
  const hasFilters = Boolean(query.trim()) || status !== 'All' || payment !== 'All' || delivery !== 'all' || attentionOnly;
  return <>
    <Card className="ad-sales-register">
      <CardHeading
        title={delivery === 'today' ? 'Orders due today' : delivery === 'late' ? 'Late orders' : attentionOnly ? 'Orders due today & overdue' : employee ? 'Orders' : 'Sales register'}
        subtitle="Open an order to view its details and update its status."
      />
      <div className="ad-toolbar ad-sales-toolbar" style={{ margin: 0, padding: 0 }}>
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
      <OrderTable
        orders={matching}
        onSelect={onSelect}
        isFiltered={hasFilters}
        emptyText={hasFilters ? 'No orders match this search. Try another filter.' : undefined}
        firstUseTitle="No orders yet"
        firstUseDescription="Orders you create in Orders will appear here."
        firstUseAction={employee ?
          <a href="/admin/orders" className="btn btn-primary">Go to counter →</a> :
          (onNewOrder ? <button type="button" className="btn btn-primary" onClick={onNewOrder}>＋ Create a new sale</button> : undefined)
        }
        onClearFilters={hasFilters ? onClear : undefined}
        outlets={outlets}
      />
    </Card>
  </>;
}
