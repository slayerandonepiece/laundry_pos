'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Dialog from './Dialog';
import { money, dateLabel, dateLabelFull, paymentMethodLabel } from '@/features/admin/admin.data';
import Icon from './Icon';
import RecordPaymentDialog from './RecordPaymentDialog';
import ChangePlanDialog from './ChangePlanDialog';
import type { StoreDetail, StoreInvoice, SubscriptionPlanListItem } from '../types';

export default function StoreSubscriptionTab({ store, invoices, plans }: {
  store: StoreDetail;
  invoices: StoreInvoice[];
  plans: SubscriptionPlanListItem[];
}) {
  const router = useRouter();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [notice, setNotice] = useState('');

  return <div>
    {notice && <div className="ad-toast" role="status">✓ {notice}</div>}
    <div className="card">
      <div className="card-head"><h2><Icon name="card" />Subscription terms</h2></div>
      <div className="card-body" style={{ paddingTop: 6 }}>
        <div className="kv"><span>Plan</span><strong>{store.planName ?? 'Custom terms'}</strong></div>
        <div className="kv"><span>Discount</span><strong className="num">{money(store.discountAmount)}</strong></div>
        <div className="kv"><span>Deposit</span><strong className="num">{money(store.depositAmount)}{!store.depositPaidAt && ' · unpaid'}</strong></div>
        <div className="kv"><span>Annual fee</span><strong className="num">{money(store.annualFeeAmount)}</strong></div>
        <div className="kv"><span>Paid through</span><strong className="num">{store.paidThroughDate ? dateLabelFull(store.paidThroughDate) : '—'}</strong></div>
        <div className="kv"><span>Status</span><span className={'badge ' + (store.paymentState === 'active' ? 'good' : store.paymentState === 'expiring' ? 'warm' : store.paymentState === 'locked' ? 'bad' : 'gray')}>{store.paymentState}</span></div>
      </div>
    </div>
    <div className="filters" style={{ marginTop: 16, marginBottom: 0 }}>
      <button type="button" className="btn" onClick={() => setPaymentOpen(true)}><Icon name="card" size="s" />Record payment</button>
      <button type="button" className="btn outline" onClick={() => setPlanOpen(true)}><Icon name="edit" size="s" />Change plan</button>
    </div>

    <h3 style={{ margin: '28px 0 12px' }}>Invoices</h3>
    {!invoices.length ? (
      <div className="card"><div className="empty">
        <span className="ic l"><Icon name="card" size="l" /></span>
        <h3>No payments recorded yet</h3>
        <p>Record a payment to generate the first invoice.</p>
      </div></div>
    ) : (
      <div className="tablecard">
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Invoice</th><th>Type</th><th className="right">Amount</th><th>Method</th><th>Paid</th><th>Covers</th></tr></thead>
            <tbody>
              {invoices.map(invoice => (
                <tr key={invoice.invoiceSeq}>
                  <td><Link href={`/super-admin/subscriptions/invoices/${invoice.invoiceSeq}`}><strong>#{invoice.invoiceSeq}</strong></Link></td>
                  <td>{invoice.type === 'DEPOSIT' ? 'Deposit' : 'Renewal'}</td>
                  <td className="right num">{money(invoice.amount)}</td>
                  <td>{invoice.method ? paymentMethodLabel(invoice.method) : '—'}</td>
                  <td>{dateLabel(invoice.paidAt)}</td>
                  <td>{invoice.coversFrom && invoice.coversTo ? `${dateLabelFull(invoice.coversFrom)} – ${dateLabelFull(invoice.coversTo)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}

    {paymentOpen && (
      <Dialog title="Record a payment" description={`Add a deposit or renewal payment for ${store.name}.`} onClose={() => setPaymentOpen(false)} warnOnChanges>
        <RecordPaymentDialog storeId={store.id} storeName={store.name} onSaved={() => { setPaymentOpen(false); setNotice('Payment recorded'); router.refresh(); setTimeout(() => setNotice(''), 4000); }} />
      </Dialog>
    )}
    {planOpen && (
      <Dialog title="Change plan" description={`Choose the terms ${store.name} will use at its next renewal.`} size="wide" onClose={() => setPlanOpen(false)} warnOnChanges>
        <ChangePlanDialog store={store} plans={plans} onSaved={() => { setPlanOpen(false); setNotice('Plan updated'); router.refresh(); setTimeout(() => setNotice(''), 4000); }} />
      </Dialog>
    )}
  </div>;
}
