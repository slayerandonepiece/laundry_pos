import type { Order } from '../admin.types';
import { dateLabel, money, paid, total, paymentStatus } from '../admin.data';
import { Badge, Button } from './Primitives';

export default function OrderPaymentSummary({ order, canRecordPayment, onPayment }: { order: Order; canRecordPayment: boolean; onPayment: (amount: number, method: string) => void }) {
  const balance = order.legacyCancelled ? 0 : total(order) - paid(order);
  return <section className="ad-detail-section"><div className="ad-payment-heading"><h3>Payment summary</h3><Badge>{paymentStatus(order)}</Badge></div>
    <div className="ad-receipt"><div><span>Order total</span><strong>{money(total(order))}</strong></div><div><span>Received</span><strong>{money(paid(order))}</strong></div><div className="ad-balance"><span>Balance due</span><strong>{money(balance)}</strong></div></div>
    <h3>Payments received</h3>{order.payments.length ? order.payments.map(payment => <div className="ad-history" key={payment.id}><span>{dateLabel(payment.date)} · {payment.method}</span><strong>{money(payment.amount)}</strong></div>) : <p>No payments recorded.</p>}
    {canRecordPayment && balance > 0 && <form className="ad-form" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); onPayment(Math.round(Number(data.get('amount')) * 100), String(data.get('method'))); }}><h3>Record a payment</h3><label>Amount (₹)<input name="amount" type="number" min=".01" max={balance / 100} step=".01" required/></label><label>Method<select name="method"><option>UPI</option><option>Cash</option><option>Card</option><option>Other</option></select></label><Button type="submit">Record payment</Button></form>}
  </section>;
}
