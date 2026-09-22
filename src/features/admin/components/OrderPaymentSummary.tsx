import type { Order, StorePaymentMethod } from '../admin.types';
import { dateLabel, money, paid, total, paymentStatus, paymentMethodLabel } from '../admin.data';
import { Badge, Button } from './Primitives';
import OrderInvoiceActions from './OrderInvoiceActions';

export default function OrderPaymentSummary({ order, paymentMethods, canRecordPayment, onPayment }: { order: Order; paymentMethods: StorePaymentMethod[]; canRecordPayment: boolean; onPayment: (amount: number, method: string) => void }) {
  const balance = order.legacyCancelled ? 0 : total(order) - paid(order);
  const isInvoice = balance <= 0 && order.status === 'Delivered';
  return <section className="ad-detail-section">
    <div className="ad-payment-heading"><h3>{isInvoice ? 'Invoice' : 'Bill'}</h3><Badge>{paymentStatus(order)}</Badge></div>
    <div className="ad-bill-lines">{order.lines.map((line, index) => <div className="ad-history" key={line.productId + index}><span>{line.name}<small>{line.quantity} {line.unit}{line.unit === 'pcs' ? ' × ' + money(Math.round(line.amount / line.quantity)) : ''}</small></span><strong>{money(line.amount)}</strong></div>)}</div>
    <div className="ad-receipt"><div><span>Order total</span><strong>{money(total(order))}</strong></div><div><span>Received</span><strong>{money(paid(order))}</strong></div><div className="ad-balance"><span>Balance due</span><strong>{money(balance)}</strong></div></div>
    <h3>Payments received</h3>{order.payments.length ? order.payments.map(payment => <div className="ad-history" key={payment.id}><span>{dateLabel(payment.date)} · {paymentMethodLabel(payment.method)}</span><strong>{money(payment.amount)}</strong></div>) : <p>No payments recorded.</p>}
    {isInvoice && <OrderInvoiceActions orderCode={order.id}/>}
    {!isInvoice && canRecordPayment && balance > 0 && <form key={order.payments.length} className="ad-form" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); onPayment(Math.round(Number(data.get('amount')) * 100), String(data.get('method'))); }}><h3>Record a payment</h3><label>Amount (₹)<input name="amount" type="number" min=".01" max={balance / 100} step=".01" required/></label><label>Method<select name="method">{paymentMethods.map(method => <option key={method.id} value={method.name}>{method.name}</option>)}</select></label><Button type="submit" disabled={!paymentMethods.length}>Record payment</Button></form>}
  </section>;
}
