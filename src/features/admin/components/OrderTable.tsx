'use client';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Order, StorePaymentMethod, WorkStatus } from '../admin.types';
import { dateLabel, money, paid, total } from '../admin.data';
import { MultiSelectDropdown, SingleSelectDropdown } from './ui/Dropdown';
import { Pagination } from './ui/Pagination';
import { Pill } from './ui/Pill';
import { Sentinel, EmptyState } from './ui/ListStates';
import OrderDetails from './OrderDetails';
import { recordPaymentAction, updateOrderStatusAction } from '../actions/orders.actions';
import ConfirmationDialog, { type Confirmation } from './ConfirmationDialog';
import { Badge as UIBadge } from './ui/Badge';

// The raw table for backwards compatibility (used by Sales/Dashboard) + new Orders UI
export default function OrderTable({ orders, onSelect, compact = false, emptyText, outlets }: { orders: Order[]; onSelect: (o: Order) => void; compact?: boolean; emptyText?: string; outlets?: { id: string; name: string }[] }) {
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

  // Desktop Table (Grid)
  const desktopTable = (
    <table className="grid">
      <thead>
        <tr>
          <th>Order</th>
          <th>Customer</th>
          {outlets && <th>Outlet</th>}
          <th>Status</th>
          <th>Date</th>
          <th className="num">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(o => (
          <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(o)}>
            <td className="mono" style={{ fontWeight: 600 }}>{o.id}</td>
            <td>{o.name || 'Walk-in customer'}</td>
            {outlets && <td>{getOutletName(o.outletId)}</td>}
            <td>
              <UIBadge tone={o.status === 'Delivered' ? 'on' : o.status === 'Pending' ? 'warn' : 'warn'}>{o.status}</UIBadge>
            </td>
            <td>{dateLabel(o.date)}</td>
            <td className="num mono" style={{ fontWeight: 700 }}>{money(total(o))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <>
      {orders.length === 0 ? (
        <EmptyState isFiltered={!!emptyText} filteredDescription={emptyText} firstUseDescription={emptyText} />
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
             {mobileRows.map(o => (
               <div key={o.id} className="card" style={{ padding: '14px', border: '1px solid var(--border)', borderRadius: '14px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '8px' }} onClick={() => onSelect(o)}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <strong className="mono">{o.id}</strong>
                   <UIBadge tone={o.status === 'Delivered' ? 'on' : o.status === 'Pending' ? 'warn' : 'warn'}>{o.status}</UIBadge>
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--muted)' }}>
                   <span>{o.name || 'Walk-in'}</span>
                   {outlets && <span>{getOutletName(o.outletId)}</span>}
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <span className="mono" style={{ fontSize: '15px', fontWeight: 700 }}>{money(total(o))}</span>
                   <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{dateLabel(o.date)}</span>
                 </div>
               </div>
             ))}
             {current < last && (
               <div ref={observerTarget}>
                 <Sentinel loading={true} />
               </div>
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
  const [selectedOutlets, setSelectedOutlets] = useState<string[]>([]);
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

  const outletOptions = outlets.map(outlet => ({ value: outlet.id, label: outlet.name }));
  const statusOptions = [
    { value: 'All status', label: 'All status' },
    { value: 'Pending', label: 'Pending' },
    { value: 'In Progress', label: 'In progress' },
    { value: 'Ready', label: 'Ready' },
    { value: 'Delivered', label: 'Delivered' }
  ];

  const filteredOrders = useMemo(() => {
    return serverOrders.filter(o => {
      if (selectedOutlets.length > 0 && o.outletId && !selectedOutlets.includes(o.outletId)) return false;
      if (statusFilter !== 'All status' && o.status !== statusFilter) return false;
      if (dateFrom && o.date < dateFrom) return false;
      if (dateTo && o.date > dateTo) return false;
      if (search) {
        const term = search.toLowerCase();
        if (!o.id.toLowerCase().includes(term) && !o.name?.toLowerCase().includes(term) && !o.phone?.toLowerCase().includes(term)) return false;
      }
      return true;
    });
  }, [serverOrders, selectedOutlets, statusFilter, dateFrom, dateTo, search]);

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
    <div className="content" style={{ flexGrow: 1, overflow: 'auto', padding: '26px 30px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div>
        <h1 style={{ fontSize: '22px' }}>Orders</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '13px' }}>Latest {serverOrders.length} across all outlets · page-numbered on desktop</p>
      </div>

      <div className="card" style={{ gap: '16px', overflow: 'visible', border: '1px solid var(--border)', borderRadius: '14px', background: '#fff', padding: '19px', display: 'flex', flexDirection: 'column' }}>
        
        {/* Desktop Filters */}
        <style>{`
          .orders-desktop-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
          .orders-mobile-filters { display: none; }
          @media (max-width: 768px) {
            .orders-desktop-filters { display: none; }
            .orders-mobile-filters { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 10px; }
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
          <input type="date" className="field" style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px', fontSize: '12.5px', width: '132px' }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <input type="date" className="field" style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px', fontSize: '12.5px', width: '132px' }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
          <input placeholder="Search name, phone or order #…" className="search-input" style={{ marginLeft: 'auto', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', minWidth: '210px' }} value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Mobile Filters */}
        <div className="orders-mobile-filters">
           {statusOptions.map(opt => (
             <Pill key={opt.value} active={statusFilter === opt.value} onClick={() => setStatusFilter(opt.value)}>{opt.label}</Pill>
           ))}
        </div>

        <OrderTable orders={filteredOrders} onSelect={order => setSelectedId(order.id)} outlets={outlets.length > 1 ? outlets : undefined} emptyText={search || selectedOutlets.length ? 'No orders match this search. Try another filter.' : undefined} />
      </div>

      {selectedOrder && (
        <OrderDetails
          asDialog={true}
          order={selectedOrder}
          paymentMethods={paymentMethods}
          onStatus={handleStatusUpdate}
          onPayment={handlePaymentRecord}
          error={error}
          onClose={() => setSelectedId(null)}
        />
      )}
      
      {confirmation && <ConfirmationDialog {...confirmation} onCancel={() => setConfirmation(null)} onConfirm={() => { const action = confirmation.onConfirm; setConfirmation(null); action(); }}/>}
      {notice && <div className="ad-toast" role="status">✓ {notice}</div>}
    </div>
  );
}
