import { useState } from 'react';
import type { Order, StorePaymentMethod } from '../admin.types';
import { dateLabel, money, paid, total, paymentStatus, paymentMethodLabel } from '../admin.data';
import { Badge, Button } from './Primitives';

function RecordPaymentForm({
  balance,
  paymentMethods,
  onPayment,
}: {
  balance: number;
  paymentMethods: StorePaymentMethod[];
  onPayment: (amount: number, method: string) => void;
}) {
  const [amount, setAmount] = useState('');
  const maxAmount = (balance / 100).toFixed(2);

  return (
    <form
      className="ad-form ad-record-payment"
      onSubmit={e => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const val = Number(data.get('amount') || amount);
        onPayment(Math.round(val * 100), String(data.get('method')));
      }}
    >
      <h3>Record a payment</h3>
      <label>
        Amount (₹)
        <div className="ad-record-payment-amount">
          <input
            name="amount"
            type="number"
            min=".01"
            max={balance / 100}
            step=".01"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            required
            style={{ flex: 1 }}
          />
          <Button type="button" secondary onClick={() => setAmount(maxAmount)}>
            Pay balance
          </Button>
        </div>
      </label>
      <label>
        Method
        <select name="method">
          {paymentMethods.map(method => (
            <option key={method.id} value={method.name}>
              {method.name}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={!paymentMethods.length}>
        Record payment
      </Button>
    </form>
  );
}

export default function OrderPaymentSummary({ order, paymentMethods, canRecordPayment, onPayment }: { order: Order; paymentMethods: StorePaymentMethod[]; canRecordPayment: boolean; onPayment: (amount: number, method: string) => void }) {
  const balance = order.legacyCancelled ? 0 : total(order) - paid(order);
  const isInvoice = balance <= 0 && order.status === 'Delivered';
  return <section className="ad-detail-section ad-order-bill">
    <div className="ad-payment-heading"><h3>{isInvoice ? 'Invoice' : 'Bill'}</h3><Badge>{paymentStatus(order)}</Badge></div>
    <div className="ad-bill-table-wrap"><table className="ad-bill-table" aria-label="Services and charges">
      <thead><tr><th>Service</th><th>Quantity</th><th>Rate</th><th className="num">Amount</th></tr></thead>
      <tbody>{order.lines.map((line, index) => <tr key={line.productId + index}>
        <td>{line.name}</td><td>{line.quantity} {line.unit === 'pcs' && line.quantity === 1 ? 'pc' : line.unit}</td>
        <td>{line.unit === 'pcs' && line.quantity > 0 ? money(Math.round(line.amount / line.quantity)) + ' / pc' : 'Slab pricing'}</td><td className="num">{money(line.amount)}</td>
      </tr>)}</tbody>
    </table></div>
    <div className="ad-receipt"><div><span>Order total</span><strong>{money(total(order))}</strong></div><div><span>Received</span><strong>{money(paid(order))}</strong></div><div className={`ad-balance${balance <= 0 ? ' ad-balance-paid' : ''}`}><span>Balance due</span><strong>{money(balance)}</strong></div></div>
    <h3>Payments received</h3>{order.payments.length ? order.payments.map(payment => <div className="ad-history" key={payment.id}><span>{dateLabel(payment.date)} · {paymentMethodLabel(payment.method)}</span><strong>{money(payment.amount)}</strong></div>) : <p>No payments recorded.</p>}
    {!isInvoice && canRecordPayment && balance > 0 && <RecordPaymentForm key={order.payments.length} balance={balance} paymentMethods={paymentMethods} onPayment={onPayment}/>}
  </section>;
}
