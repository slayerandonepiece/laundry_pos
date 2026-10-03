import Link from 'next/link';
import { money, dateLabel, dateLabelFull, paymentMethodLabel } from '@/features/admin/admin.data';
import Icon from './Icon';
import InvoiceActions from './InvoiceActions';
import type { StoreDetail, StoreInvoice } from '../types';

export default function InvoiceDetail({ invoice, store }: { invoice: StoreInvoice; store: StoreDetail }) {
  return <>
    <Link className="backlink no-print" href={`/super-admin/stores/${store.id}/subscription`}><Icon name="arrowLeft" size="s" />Back to organization</Link>

    <div className="phead">
      <div className="phead-l">
        <span className="phead-ic"><Icon name="card" /></span>
        <div>
          <h1>Invoice #{invoice.invoiceSeq} <span className="badge good">Paid</span></h1>
          <p>{invoice.type === 'DEPOSIT' ? 'Deposit payment' : 'Annual renewal'} · recorded {dateLabel(invoice.paidAt)}</p>
        </div>
      </div>
      <div className="phead-r no-print"><InvoiceActions invoiceSeq={invoice.invoiceSeq} /></div>
    </div>

    <div className="grid2" style={{ alignItems: 'start' }}>
      <div className="card">
        <div className="card-head"><h2><Icon name="building" />Billed to</h2></div>
        <div className="card-body">
          <div className="grid2">
            <div>
              <small style={{ fontSize: 11.5, color: 'var(--muted)' }}>Organization</small>
              <p style={{ color: 'var(--ink)', fontWeight: 600, margin: '5px 0 3px' }}><Link href={`/super-admin/stores/${store.id}`}>{store.name}</Link></p>
              <p style={{ fontSize: 12.5, lineHeight: 1.65 }}>{store.address || '—'}</p>
            </div>
            <div>
              <small style={{ fontSize: 11.5, color: 'var(--muted)' }}>Owner</small>
              <p style={{ color: 'var(--ink)', fontWeight: 600, margin: '5px 0 3px' }}>{store.ownerName}</p>
              <p style={{ fontSize: 12.5, lineHeight: 1.65 }}>{store.ownerPhone}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3><Icon name="card" />Payment</h3><span className="badge good">Paid</span></div>
        <div className="card-body">
          <div className="kv"><span>Method</span><strong>{invoice.method ? paymentMethodLabel(invoice.method) : '—'}</strong></div>
          <div className="kv"><span>Paid on</span><strong className="num">{dateLabel(invoice.paidAt)}</strong></div>
          {invoice.coversFrom && invoice.coversTo && <div className="kv"><span>Covers</span><strong className="num">{dateLabelFull(invoice.coversFrom)} – {dateLabelFull(invoice.coversTo)}</strong></div>}
          {invoice.reference && <div className="kv"><span>Reference</span><strong className="num">{invoice.reference}</strong></div>}
          <div className="kv"><span>Recorded by</span><strong>{invoice.recordedByName ?? '—'}</strong></div>
          <div className="kv total"><span>Total paid</span><strong className="num">{money(invoice.amount)}</strong></div>
        </div>
      </div>
    </div>

    <div className="tablecard" style={{ marginTop: 16 }}>
      <div className="card-head"><h2><Icon name="card" />Line items</h2></div>
      <table>
        <thead><tr><th>Description</th><th>Period</th><th className="right">Amount</th></tr></thead>
        <tbody>
          <tr>
            <td><strong>{invoice.type === 'DEPOSIT' ? 'Subscription deposit' : 'Annual maintenance'}</strong><small>StoreOps platform subscription</small></td>
            <td className="num">{invoice.coversFrom && invoice.coversTo ? `${dateLabelFull(invoice.coversFrom)} – ${dateLabelFull(invoice.coversTo)}` : '—'}</td>
            <td className="right num"><strong>{money(invoice.amount)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div className="grid2" style={{ marginTop: 16, alignItems: 'start' }}>
      <div className="card">
        <div className="card-head"><h3><Icon name="card" />Subscription</h3></div>
        <div className="card-body">
          <div className="kv"><span>Organization</span><strong><Link href={`/super-admin/stores/${store.id}/subscription`}>{store.name}</Link></strong></div>
          <div className="kv"><span>Term</span><strong>Yearly</strong></div>
          <div className="kv"><span>Paid through</span><strong className="num">{store.paidThroughDate ? dateLabelFull(store.paidThroughDate) : '—'}</strong></div>
          <Link className="btn outline sm" href={`/super-admin/stores/${store.id}/subscription`} style={{ marginTop: 10, display: 'inline-flex' }}>View subscription</Link>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Subscription notes</h3></div>
        <div className="card-body">
          <p style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--ink-2)' }}>{invoice.notes || (store.planName ? `On ${store.planName} plan.` : 'No notes.')}</p>
        </div>
      </div>
    </div>
  </>;
}
