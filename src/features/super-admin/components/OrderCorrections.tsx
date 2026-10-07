'use client';
import { useState } from 'react';
import { Button } from '@/features/admin/components/Primitives';
import { money } from '@/features/admin/admin.data';
import { correctOrderAction, fetchCorrectionOrderAction, fetchCorrectionOutletsAction, searchCorrectionOrdersAction } from '../actions/order-corrections.actions';
import Pager from './Pager';
import type { DeliveredOrderCorrectionView, DeliveredOrderSearchRow } from '@/server/services/orders';

interface Organization { id: string; name: string; orgCode: string }
type Outlet = { id: string; name: string };

const STATUS_LABEL: Record<string, string> = { PENDING: 'Pending', IN_PROGRESS: 'In progress', READY: 'Ready', DELIVERED: 'Delivered' };
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function OrderCorrections({ organizations }: { organizations: Organization[] }) {
  const [storeId, setStoreId] = useState('');
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [filters, setFilters] = useState({ orderNumber: '', phone: '', from: '', to: '', outletId: '' });
  const [rows, setRows] = useState<DeliveredOrderSearchRow[] | null>(null);
  const [paging, setPaging] = useState({ page: 1, pageSize: 10, total: 0 });
  const [searching, setSearching] = useState(false);
  const [opening, setOpening] = useState('');
  const [order, setOrder] = useState<DeliveredOrderCorrectionView | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<'customer' | { payment: string } | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const set = (change: Partial<typeof filters>) => setFilters(current => ({ ...current, ...change }));

  function chooseOrganization(id: string) {
    setStoreId(id); setRows(null); setError(''); setOutlets([]); set({ outletId: '' });
    if (id) fetchCorrectionOutletsAction(id).then(setOutlets).catch(() => undefined);
  }

  async function search(page = 1, pageSize = paging.pageSize) {
    if (!storeId) return setError('Choose an organization first.');
    setSearching(true); setError(''); setNotice('');
    try {
      const result = await searchCorrectionOrdersAction(storeId, filters, { page, pageSize });
      if (result.ok) { setRows(result.rows); setPaging({ page: result.page, pageSize: result.pageSize, total: result.total }); }
      else { setRows(null); setError(result.error); }
    } catch { setError('Could not search orders. Try again.'); }
    finally { setSearching(false); }
  }

  function clear() { setFilters({ orderNumber: '', phone: '', from: '', to: '', outletId: '' }); setRows(null); setPaging(current => ({ ...current, page: 1, total: 0 })); setError(''); setNotice(''); }

  async function open(code: string) {
    setOpening(code); setError('');
    try {
      const result = await fetchCorrectionOrderAction(storeId, code);
      if (result.ok) { setOrder(result.order); setEditing(null); setNotice(''); } else setError(result.error);
    } catch { setError('Could not open the order. Try again.'); }
    finally { setOpening(''); }
  }

  function startEdit(target: 'customer' | { payment: string }) {
    if (!order) return;
    setEditing(target); setReason(''); setAmount(''); setError('');
    if (target === 'customer') { setName(order.customerName); setPhone(order.phone); }
  }

  async function apply(input: Parameters<typeof correctOrderAction>[2], done: string) {
    if (!order) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await correctOrderAction(storeId, order.orderCode, input);
      if (result.ok) { setOrder(result.order); setEditing(null); setNotice(done); void search(paging.page); } else setError(result.error);
    } catch { setError('Could not save the correction. Try again.'); }
    finally { setBusy(false); }
  }

  if (order) {
    const paid = order.payments.reduce((sum, payment) => sum + payment.amount, 0);
    const editingPayment = typeof editing === 'object' && editing ? order.payments.find(payment => payment.id === editing.payment) : undefined;
    return <div className="cor">
      <div className="cor-bar">
        <Button secondary type="button" onClick={() => { setOrder(null); setEditing(null); setNotice(''); setError(''); }}>← Back to results</Button>
        <div className="cor-title"><b className="num">{order.orderCode}</b><span className="badge good">Delivered</span>{order.isImported && <span className="badge gray">Imported</span>}</div>
        <span className="cor-sub">{order.outletName} · Ordered {order.orderDate}{order.deliveredOn ? ` · Delivered ${order.deliveredOn}` : ''}</span>
      </div>
      {notice && <p className="ad-help cor-flash" role="status">✓ {notice}</p>}
      {error && <p className="ad-error cor-flash" role="alert">{error}</p>}

      <div className="cor-tiles">
        <div className="stat"><small>Order total</small><strong className="num">{money(order.total)}</strong></div>
        <div className="stat"><small>Collected</small><strong className="num">{money(paid)}</strong></div>
        <div className="stat"><small>Items</small><strong className="num">{order.lines.length}</strong></div>
        <div className="stat"><small>Invoice</small><strong className="num cor-inv">{order.invoiceNumber ?? 'Not generated'}</strong></div>
      </div>

      <div className="cor-grid">
        <div className="cor-main">
          <div className="card">
            <div className="card-head"><h2>Payments</h2><span className="cor-sub">{order.payments.length} recorded</span></div>
            {order.payments.length ? <div className="tablecard cor-flat"><table>
              <thead><tr><th>Receipt</th><th>Method</th><th>Paid on</th><th className="right">Amount</th><th className="right" /></tr></thead>
              <tbody>{order.payments.map(payment => <tr key={payment.id} className={editingPayment?.id === payment.id ? 'cor-active' : undefined}>
                <td className="num">{payment.receiptNumber ?? '—'}</td><td>{payment.method}</td><td className="num">{payment.paidAt}</td><td className="right num"><b>{money(payment.amount)}</b></td>
                <td className="right"><Button secondary type="button" disabled={busy} onClick={() => startEdit({ payment: payment.id })}>Adjust</Button></td>
              </tr>)}</tbody>
            </table></div> : <p className="ad-help cor-pad">This order has no payments to correct.</p>}
            {editingPayment && <div className="cor-form cor-inline">
              <b>Adjust {money(editingPayment.amount)} · {editingPayment.method} · {editingPayment.paidAt}</b>
              <div className="cor-two">
                <div className="field"><label htmlFor="cor-amount">Correct amount (₹)</label><input id="cor-amount" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} disabled={busy} placeholder="Enter 0 to void this payment" /></div>
                <div className="field"><label htmlFor="cor-preason">Reason (required)</label><input id="cor-preason" value={reason} onChange={event => setReason(event.target.value)} disabled={busy} placeholder="Why is this being corrected?" /></div>
              </div>
              <div className="cor-actions"><Button secondary type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="button" disabled={busy} onClick={() => {
                  if (!/^\d+(\.\d{1,2})?$/.test(amount.trim())) return setError('Enter the correct amount in rupees.');
                  const rupees = Number(amount);
                  void apply({ type: 'payment', paymentId: editingPayment.id, amount: Math.round(rupees * 100), reason }, rupees === 0 ? 'Payment voided' : 'Payment corrected');
                }}>{busy ? 'Saving…' : 'Save payment'}</Button></div>
            </div>}
          </div>

          <div className="card">
            <div className="card-head"><h2>Order lines</h2><span className="cor-sub">{order.lines.length} item{order.lines.length === 1 ? '' : 's'}</span></div>
            <div className="tablecard cor-flat"><table>
              <thead><tr><th>Service</th><th className="right">Quantity</th><th className="right">Amount</th></tr></thead>
              <tbody>{order.lines.map((line, index) => <tr key={index}><td>{line.name}</td><td className="right num">{line.quantity} {line.unit}</td><td className="right num">{money(line.amount)}</td></tr>)}
                <tr className="cor-total"><td colSpan={2}>Total</td><td className="right num">{money(order.total)}</td></tr></tbody>
            </table></div>
          </div>
        </div>

        <div className="cor-side">
          <div className="card">
            <div className="card-head"><h2>Customer</h2>{editing !== 'customer' && <Button secondary type="button" onClick={() => startEdit('customer')}>Edit</Button>}</div>
            {editing === 'customer' ? <div className="cor-form">
              <div className="field"><label htmlFor="cor-name">Name</label><input id="cor-name" value={name} onChange={event => setName(event.target.value)} disabled={busy} /></div>
              <div className="field"><label htmlFor="cor-phone">Phone</label><input id="cor-phone" inputMode="tel" value={phone} onChange={event => setPhone(event.target.value)} disabled={busy} /></div>
              <div className="field"><label htmlFor="cor-creason">Reason (required)</label><textarea id="cor-creason" rows={2} value={reason} onChange={event => setReason(event.target.value)} disabled={busy} placeholder="Why is this being corrected?" /></div>
              <div className="cor-actions"><Button secondary type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="button" disabled={busy} onClick={() => void apply({ type: 'customer', customerName: name, phone: phone.replace(/[\s-]/g, ''), reason }, 'Customer corrected')}>{busy ? 'Saving…' : 'Save'}</Button></div>
            </div> : <dl className="cor-list">
              <div><dt>Name</dt><dd>{order.customerName || '—'}</dd></div>
              <div><dt>Phone</dt><dd className="num">{order.phone}</dd></div>
            </dl>}
          </div>
          <div className="card">
            <div className="card-head"><h2>Order details</h2></div>
            <dl className="cor-list">
              <div><dt>Order number</dt><dd className="num">{order.orderCode}</dd></div>
              <div><dt>Outlet</dt><dd>{order.outletName}</dd></div>
              <div><dt>Order date</dt><dd className="num">{order.orderDate}</dd></div>
              <div><dt>Delivered on</dt><dd className="num">{order.deliveredOn ?? '—'}</dd></div>
            </dl>
          </div>
          <div className="card">
            <div className="card-head"><h2>Status history</h2></div>
            <ol className="cor-history">{order.history.map((event, index) => <li key={index}><b>{STATUS_LABEL[event.status] ?? event.status}</b><span>{when(event.at)} · {event.by}</span></li>)}</ol>
          </div>
        </div>
      </div>
    </div>;
  }

  return <div className="cor">
    <div className="card cor-gap0 cor-search">
      <div className="cor-filters">
        <div className="field cor-org"><label htmlFor="cor-org">Organization</label>
          <select id="cor-org" value={storeId} disabled={searching} onChange={event => chooseOrganization(event.target.value)}>
            <option value="">Select an organization</option>
            {organizations.map(org => <option key={org.id} value={org.id}>{org.orgCode} · {org.name}</option>)}
          </select></div>
        <div className="field"><label htmlFor="cor-code">Order number</label>
          <input id="cor-code" value={filters.orderNumber} onChange={event => set({ orderNumber: event.target.value })} onKeyDown={event => { if (event.key === 'Enter') void search(); }} placeholder="e.g. EL-23" /></div>
        <div className="field"><label htmlFor="cor-ph">Phone number</label>
          <input id="cor-ph" inputMode="tel" value={filters.phone} onChange={event => set({ phone: event.target.value })} onKeyDown={event => { if (event.key === 'Enter') void search(); }} placeholder="Customer phone" /></div>
        <div className="field"><label htmlFor="cor-out">Outlet</label>
          <select id="cor-out" value={filters.outletId} disabled={!outlets.length} onChange={event => set({ outletId: event.target.value })}>
            <option value="">All outlets</option>
            {outlets.map(outlet => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
          </select></div>
        <div className="field"><label htmlFor="cor-from">From</label>
          <input id="cor-from" type="date" value={filters.from} onChange={event => set({ from: event.target.value })} /></div>
        <div className="field"><label htmlFor="cor-to">To</label>
          <input id="cor-to" type="date" value={filters.to} onChange={event => set({ to: event.target.value })} /></div>
        <div className="cor-go"><Button secondary type="button" disabled={searching} onClick={clear}>Clear</Button>
          <Button type="button" disabled={searching || !storeId} onClick={() => void search()}>{searching ? 'Searching…' : 'Search'}</Button></div>
      </div>
      {error && <p className="ad-error" role="alert" style={{ margin: '10px 0 0' }}>{error}</p>}
    </div>

    {(rows || searching) && <div className="tablecard cor-results" aria-busy={searching}>
      <table>
        <thead><tr><th>Order</th><th>Customer</th><th className="right">Total</th><th>Payment</th><th className="right">Items</th><th className="right">Action</th></tr></thead>
        <tbody>
          {searching && !rows && [0, 1, 2, 3].map(i => <tr key={i} className="cor-skel"><td colSpan={6}><span /></td></tr>)}
          {rows?.map(row => <tr key={row.orderCode}>
            <td><b className="num">{row.orderCode}</b>{row.isImported && <span className="tag annual" style={{ marginLeft: 6 }}>Imported</span>}<small>{row.orderDate} · {row.outletName}</small></td>
            <td>{row.customerName || '—'}<small className="num">{row.phone}</small></td>
            <td className="right num"><b>{money(row.total)}</b></td>
            <td>{row.methods.join(', ') || '—'}<small className="num">{money(row.paid)} collected</small></td>
            <td className="right num">{row.itemCount}</td>
            <td className="right"><Button secondary type="button" disabled={!!opening} onClick={() => void open(row.orderCode)}>{opening === row.orderCode ? 'Opening…' : 'View details'}</Button></td>
          </tr>)}
          {rows && !rows.length && <tr><td colSpan={6} className="cor-none">No delivered orders match these filters. Cancelled orders are not listed.</td></tr>}
        </tbody>
      </table>
      {rows && <Pager page={paging.page} pageSize={paging.pageSize} total={paging.total} busy={searching} onPage={page => void search(page)} onSize={size => void search(1, size)} />}
    </div>}
  </div>;
}
