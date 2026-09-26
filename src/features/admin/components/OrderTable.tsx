'use client';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Order, StorePaymentMethod, WorkStatus } from '../admin.types';
import { dateLabel, money, paid, total, paymentStatus } from '../admin.data';
import { MultiSelectDropdown, SingleSelectDropdown } from './ui/Dropdown';
import { Pagination } from './ui/Pagination';
import { Pill } from './ui/Pill';
import { Sentinel, EmptyState } from './ui/ListStates';
import OrderDetails from './OrderDetails';
import OrderDetailsHeader from './OrderDetailsHeader';
import { Panel } from './Primitives';
import { recordPaymentAction, updateOrderStatusAction } from '../actions/orders.actions';
import ConfirmationDialog, { type Confirmation } from './ConfirmationDialog';
import { Badge as UIBadge, statusTone } from './ui/Badge';

// The raw table for backwards compatibility (used by Sales/Dashboard) + new Orders UI
export default function OrderTable({
  orders,
  onSelect,
  compact = false,
  emptyText,
  outlets,
  isFiltered,
  onClearFilters,
}: {
  orders: Order[];
  onSelect: (o: Order) => void;
  compact?: boolean;
  emptyText?: string;
  outlets?: { id: string; name: string }[];
  isFiltered?: boolean;
  onClearFilters?: () => void;
}) {
  const [page, setPage] = useState(0);
  const pageSize = compact ? 5 : 10;
  const last = Math.max(0, Math.ceil(orders.length / pageSize) - 1);
  const current = Math.min(page, last);
  const rows = orders.slice(current * pageSize, (current + 1) * pageSize);
  const mobileRows = orders.slice(0, (current + 1) * pageSize);

  const observerTarget = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && current < last) {
        setPage(p => Math.min(last, p + 1));
      }
    }, { rootMargin: '100px' });
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [current, last]);

  const getOutletName = (id?: string) => outlets?.find(outlet => outlet.id === id)?.name || 'Organization-wide';

  const showOutletCol = !!(outlets && outlets.length > 1);

  // Desktop Table (Grid)
  const desktopTable = (
    <table className="grid">
      <thead>
        <tr>
          <th>Order</th>
          <th>Customer</th>
          {showOutletCol && <th>Outlet</th>}
          <th>Status</th>
          <th>Payment</th>
          <th>Date</th>
          <th className="num">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(o => {
          const pay = paymentStatus(o);
          return (
            <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(o)}>
              <td className="mono" style={{ fontWeight: 600 }}>
                <button type="button" className="dashboard-order-link" onClick={() => onSelect(o)} aria-label={`Open order ${o.id}`}>
                  {o.id}
                </button>
              </td>
              <td>{o.name || 'Walk-in customer'}</td>
              {showOutletCol && <td>{getOutletName(o.outletId)}</td>}
              <td>
                <UIBadge tone={statusTone(o.status)}>{o.status}</UIBadge>
              </td>
              <td>
                <UIBadge tone={pay === 'Paid' ? 'on' : 'warn'}>{pay}</UIBadge>
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>{dateLabel(o.date)}</td>
              <td className="num mono" style={{ fontWeight: 700 }}>{money(total(o))}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <>
      {orders.length === 0 ? (
        <EmptyState
          isFiltered={isFiltered ?? !!emptyText}
          filteredTitle="No matching orders"
          filteredDescription={emptyText || 'No orders match the selected filters. Try adjusting or clearing your filters.'}
          filteredAction={
            onClearFilters ? (
              <button type="button" className="btn btn-secondary" onClick={onClearFilters}>
                Clear filters
              </button>
            ) : undefined
          }
          firstUseTitle="Nothing here yet"
          firstUseDescription="Get started by creating your first entry."
        />
      ) : (
        <div style={{ overflowX: 'auto' }}>
           <style>{`
             .new-desktop-only { display: block; }
             .new-mobile-only { display: none; }
             @media (max-width: 768px) {
               .new-desktop-only { display: none; }
               .new-mobile-only { display: flex; flex-direction: column; gap: 10px; }
             }
           `}</style>
           <div className="new-desktop-only">
             {desktopTable}
           </div>
           
           <div className="new-mobile-only">
             {mobileRows.map(o => {
               const pay = paymentStatus(o);
               return (
                 <div key={o.id} className="card" style={{ padding: '14px', border: '1px solid var(--border)', borderRadius: '14px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '8px', cursor: 'pointer' }} onClick={() => onSelect(o)}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <strong className="mono">
                       <button type="button" className="dashboard-order-link" onClick={() => onSelect(o)} aria-label={`Open order ${o.id}`}>
                         {o.id}
                       </button>
                     </strong>
                     <div style={{ display: 'flex', gap: '6px' }}>
                       <UIBadge tone={statusTone(o.status)}>{o.status}</UIBadge>
                       <UIBadge tone={pay === 'Paid' ? 'on' : 'warn'}>{pay}</UIBadge>
                     </div>
                   </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '13px', color: 'var(--muted)', minWidth: 0, gap: '8px' }}>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name || 'Walk-in'}</span>
                      {showOutletCol && <span style={{ flexShrink: 0 }}>{getOutletName(o.outletId)}</span>}
                    </div>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <span className="mono" style={{ fontSize: '15px', fontWeight: 700 }}>{money(total(o))}</span>
                     <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{dateLabel(o.date)}</span>
                   </div>
                 </div>
               );
             })}
             {current < last && (
               <>
                 <div ref={observerTarget}>
                   <Sentinel loading={true} />
                 </div>
                 <button
                   type="button"
                   className="btn btn-secondary"
                   style={{ padding: '10px', fontSize: '13px', width: '100%', marginTop: '4px' }}
                   onClick={() => setPage(p => Math.min(last, p + 1))}
                 >
                   Load more orders ({orders.length - (current + 1) * pageSize} remaining)
                 </button>
               </>
             )}
           </div>
        </div>
      )}
      {rows.length > 0 && (
        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
            Showing {current * pageSize + 1}–{Math.min((current + 1) * pageSize, orders.length)} of {orders.length}
          </span>
          <Pagination currentPage={current + 1} totalPages={last + 1} onPageChange={p => setPage(p - 1)} />
        </div>
      )}
    </>
  );
}

export function OrdersClient({ serverOrders, paymentMethods, outlets }: { serverOrders: Order[]; paymentMethods: StorePaymentMethod[]; outlets: { id: string; name: string }[] }) {
  const router = useRouter();

  const outletOptions = useMemo(() => [
    ...outlets.map(outlet => ({ value: outlet.id, label: outlet.name })),
    { value: 'org-wide', label: 'Organization-wide' }
  ], [outlets]);

  const allOutletValues = useMemo(() => outletOptions.map(o => o.value), [outletOptions]);

  const [selectedOutlets, setSelectedOutlets] = useState<string[]>(() => [
    ...outlets.map(outlet => ({ value: outlet.id, label: outlet.name })),
    { value: 'org-wide', label: 'Organization-wide' }
  ].map(o => o.value));
  const [statusFilter, setStatusFilter] = useState('All status');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  
  // Keep only the code: the open order is read from serverOrders so it reflects router.refresh().
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedOrder = selectedId ? serverOrders.find(order => order.id === selectedId) ?? null : null;
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const statusOptions = [
    { value: 'All status', label: 'All status' },
    { value: 'Pending', label: 'Pending' },
    { value: 'In Progress', label: 'In progress' },
    { value: 'Ready', label: 'Ready' },
    { value: 'Delivered', label: 'Delivered' }
  ];

  const hasActiveFilters = (selectedOutlets.length > 0 && selectedOutlets.length < outletOptions.length) || statusFilter !== 'All status' || !!dateFrom || !!dateTo || !!search;

  const handleClearAllFilters = () => {
    setSelectedOutlets(allOutletValues);
    setStatusFilter('All status');
    setDateFrom('');
    setDateTo('');
    setSearch('');
  };

  const filteredOrders = useMemo(() => {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      return [];
    }
    return serverOrders.filter(o => {
      if (selectedOutlets.length > 0 && selectedOutlets.length < outletOptions.length) {
        if (!o.outletId) {
          if (!selectedOutlets.includes('org-wide')) return false;
        } else {
          if (!selectedOutlets.includes(o.outletId)) return false;
        }
      }
      if (statusFilter !== 'All status' && o.status !== statusFilter) return false;
      if (dateFrom && o.date < dateFrom) return false;
      if (dateTo && o.date > dateTo) return false;
      if (search) {
        const term = search.toLowerCase();
        if (!o.id.toLowerCase().includes(term) && !o.name?.toLowerCase().includes(term) && !o.phone?.toLowerCase().includes(term)) return false;
      }
      return true;
    });
  }, [serverOrders, selectedOutlets, outletOptions.length, statusFilter, dateFrom, dateTo, search]);

  const allOutletsSelected = selectedOutlets.length === 0 || selectedOutlets.length === outletOptions.length;
  const subtitle = useMemo(() => {
    const count = filteredOrders.length;
    const orderText = count === 1 ? '1 order' : `${count} orders`;
    if (allOutletsSelected || outletOptions.length <= 1) {
      return `Showing ${orderText} across all outlets`;
    }
    if (selectedOutlets.length === 1) {
      const single = outletOptions.find(o => o.value === selectedOutlets[0]);
      return `Showing ${orderText} for ${single?.label || 'selected outlet'}`;
    }
    return `Showing ${orderText} across ${selectedOutlets.length} selected outlets`;
  }, [filteredOrders.length, allOutletsSelected, outletOptions, selectedOutlets]);

  const handleStatusUpdate = (next: WorkStatus) => {
    if (!selectedOrder || next === selectedOrder.status) return;
    const id = selectedOrder.id;
    const balanceDue = total(selectedOrder) - paid(selectedOrder);
    const deliverWithBalance = next === 'Delivered' && balanceDue > 0;
    setConfirmation({
      title: 'Update order status?',
      description: deliverWithBalance ? `${id} still has ${money(balanceDue)} due. Mark it delivered anyway?` : `Change ${id} from ${selectedOrder.status} to ${next}.`,
      confirmLabel: deliverWithBalance ? 'Deliver anyway' : 'Update status',
      onConfirm: () => {
        updateOrderStatusAction(id, next).then(() => {
          router.refresh();
          setNotice('Order status updated');
          setError('');
        }).catch(() => setError('Could not update the status. Try again.'));
      }
    });
  };

  const handlePaymentRecord = (amount: number, method: string) => {
    if (!selectedOrder) return;
    recordPaymentAction(selectedOrder.id, amount, method).then(() => {
      router.refresh();
      setNotice('Payment recorded');
      setError('');
    }).catch(() => setError('Could not record the payment. Try again.'));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div>
        <h1>Orders</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '13px' }}>{subtitle}</p>
      </div>

      <div className="card" style={{ gap: '16px', overflow: 'visible', border: '1px solid var(--border)', borderRadius: '14px', background: '#fff', padding: '19px', display: 'flex', flexDirection: 'column' }}>
        
        {/* Desktop Filters */}
        <style>{`
          .orders-desktop-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
          .orders-mobile-filters { display: none; }
          @media (max-width: 768px) {
            .orders-desktop-filters { display: none; }
            .orders-mobile-filters { display: flex; flex-direction: column; gap: 10px; }
          }
        `}</style>
        <div className="orders-desktop-filters">
          {outlets.length > 1 && (
            <MultiSelectDropdown
              label="Outlets"
              emptyLabel="All outlets"
              options={outletOptions}
              selected={selectedOutlets}
              onChange={setSelectedOutlets}
            />
          )}
          <SingleSelectDropdown
            options={statusOptions}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          <span style={{ width: '1px', height: '22px', background: 'var(--border)', flexShrink: 0 }} />
          <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', fontWeight: 500, gap: '6px', fontSize: '12.5px', color: 'var(--muted)' }}>
            From
            <input
              type="date"
              aria-label="From date"
              className="field"
              style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 9px', fontSize: '12.5px', width: '132px' }}
              value={dateFrom}
              max={dateTo || undefined}
              onChange={e => setDateFrom(e.target.value)}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', fontWeight: 500, gap: '6px', fontSize: '12.5px', color: 'var(--muted)' }}>
            To
            <input
              type="date"
              aria-label="To date"
              className="field"
              style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 9px', fontSize: '12.5px', width: '132px' }}
              value={dateTo}
              min={dateFrom || undefined}
              onChange={e => setDateTo(e.target.value)}
            />
          </label>
          {hasActiveFilters && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '12px', padding: '6px 12px', height: '34px' }}
              onClick={handleClearAllFilters}
            >
              Clear filters
            </button>
          )}
          <input
            placeholder="Search name, phone or order #…"
            aria-label="Search orders by customer, phone or order code"
            className="search-input"
            style={{ marginLeft: 'auto', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', minWidth: '250px' }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Mobile Filters */}
        <div className="orders-mobile-filters">
          <input
            placeholder="Search name, phone or order #…"
            aria-label="Search orders by customer, phone or order code"
            className="search-input"
            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', boxSizing: 'border-box' }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {statusOptions.map(opt => (
              <Pill key={opt.value} active={statusFilter === opt.value} onClick={() => setStatusFilter(opt.value)}>{opt.label}</Pill>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            {outlets.length > 1 && (
              <SingleSelectDropdown
                ariaLabel="Filter outlet"
                value={selectedOutlets.length === outletOptions.length ? 'all' : selectedOutlets.length === 1 ? selectedOutlets[0] : 'custom'}
                onChange={val => {
                  if (val === 'all') setSelectedOutlets(allOutletValues);
                  else setSelectedOutlets([val]);
                }}
                options={[
                  { value: 'all', label: 'All outlets' },
                  ...outletOptions
                ]}
              />
            )}
            <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', fontWeight: 500, gap: '4px', fontSize: '12px', color: 'var(--muted)' }}>
              From
              <input
                type="date"
                aria-label="From date"
                max={dateTo || undefined}
                style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 6px', fontSize: '12px', width: '115px' }}
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', fontWeight: 500, gap: '4px', fontSize: '12px', color: 'var(--muted)' }}>
              To
              <input
                type="date"
                aria-label="To date"
                min={dateFrom || undefined}
                style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 6px', fontSize: '12px', width: '115px' }}
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
              />
            </label>
            {hasActiveFilters && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '12px', padding: '5px 10px', height: '30px' }}
                onClick={handleClearAllFilters}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <OrderTable
          orders={filteredOrders}
          onSelect={order => setSelectedId(order.id)}
          outlets={outlets.length > 1 ? outlets : undefined}
          isFiltered={hasActiveFilters}
          onClearFilters={handleClearAllFilters}
          emptyText={hasActiveFilters ? 'No orders match this search. Try another filter.' : undefined}
        />
      </div>

      {selectedOrder && (
        <Panel
          variant="details"
          title={selectedOrder.id}
          headerContent={<OrderDetailsHeader order={selectedOrder} outletName={outlets.find(outlet => outlet.id === selectedOrder.outletId)?.name || 'Organization-wide'} />}
          onClose={() => setSelectedId(null)}
          warnOnChanges={false}
        >
          <OrderDetails
            order={selectedOrder}
            paymentMethods={paymentMethods}
            onStatus={handleStatusUpdate}
            onPayment={handlePaymentRecord}
            error={error}
            onClose={() => setSelectedId(null)}
          />
        </Panel>
      )}
      
      {confirmation && <ConfirmationDialog {...confirmation} onCancel={() => setConfirmation(null)} onConfirm={() => { const action = confirmation.onConfirm; setConfirmation(null); action(); }}/>}
      {notice && <div className="ad-toast" role="status">✓ {notice}</div>}
    </div>
  );
}
