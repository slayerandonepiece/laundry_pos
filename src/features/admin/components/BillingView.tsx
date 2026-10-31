'use client';

import { useState } from 'react';
import InvoiceViewerPanel from './InvoiceViewerPanel';
import { getSubscriptionInvoiceLinkAction } from '../actions/subscription-invoices.actions';
import type { OutletBillingRow } from '@/server/services/stores';
import type { PaymentState, StoreDetail, StoreInvoice } from '@/features/super-admin/types';
import { Badge, Card, CardHeading, type BadgeTone } from '@/features/admin/components/ui';
import { formatInvoiceNumber } from '@/lib/invoiceNumber';
import { money, dateLabelFull } from '@/features/admin/admin.data';

const STATE: Record<PaymentState, { label: string; tone: BadgeTone }> = {
  active: { label: 'Active', tone: 'on' },
  expiring: { label: 'Renewal due soon', tone: 'warn' },
  locked: { label: 'Expired', tone: 'warn' },
  unset: { label: 'Awaiting payment', tone: 'off' },
  trial: { label: 'Free trial', tone: 'info' },
  trial_ending: { label: 'Trial ending soon', tone: 'warn' },
};

const TYPE_LABEL = { DEPOSIT: 'Setup deposit', RENEWAL: 'Annual renewal' } as const;
const period = (invoice: StoreInvoice) => invoice.coversFrom && invoice.coversTo ? `${dateLabelFull(invoice.coversFrom)} – ${dateLabelFull(invoice.coversTo)}` : 'One-time';

export default function BillingView({ store, invoices, outlets }: { store: StoreDetail | null; invoices: StoreInvoice[]; outlets: OutletBillingRow[] }) {
  const [viewing, setViewing] = useState<StoreInvoice | null>(null);
  const state = STATE[store?.paymentState ?? 'unset'];
  // The current term is the paid period that ends last.
  const current = invoices.filter(invoice => invoice.coversFrom && invoice.coversTo).sort((a, b) => b.coversTo!.localeCompare(a.coversTo!))[0];
  const onTrial = store?.paymentState === 'trial' || store?.paymentState === 'trial_ending';
  return <div className="ad-profile-stack">
    <div className="ad-billing-tiles">
      <Card><small>Status</small><div className="ad-billing-value"><Badge tone={state.tone}>{state.label}</Badge></div></Card>
      <Card><small>Plan</small><div className="ad-billing-value">{store?.planName || 'Custom terms'}</div><span>{store ? money(store.annualFeeAmount) : '—'} per outlet / year{store?.depositAmount ? ` · Deposit ${money(store.depositAmount)}` : ''}</span></Card>
      <Card><small>{onTrial ? 'Trial period' : 'Current term'}</small>
        <div className="ad-billing-value">{onTrial ? (store?.trialEndsAt ? `Ends ${dateLabelFull(store.trialEndsAt)}` : '—') : current ? dateLabelFull(current.coversFrom!) : '—'}</div>
        {!onTrial && <span>{current ? `to ${dateLabelFull(current.coversTo!)}` : 'No paid term yet'}</span>}
      </Card>
      <Card><small>Paid through</small><div className="ad-billing-value">{store?.paidThroughDate ? dateLabelFull(store.paidThroughDate) : 'Not set'}</div><span>Latest outlet term</span></Card>
    </div>

    {outlets.length > 0 && <Card className="ad-table-card">
      <CardHeading title="Outlets" subtitle="Each outlet is billed on its own. A renewal is recorded by the platform team." />
      <div className="ad-table-wrap">
        <table className="ad-table">
          <thead><tr><th>Outlet</th><th>Plan</th><th>Paid through</th><th>Payments</th><th>Status</th></tr></thead>
          <tbody>{outlets.map(outlet => <tr key={outlet.id}>
            <td><strong>{outlet.name}</strong></td>
            <td>{outlet.planName ?? '—'}{outlet.discountPercent > 0 && <small>{outlet.discountPercent}% discount{outlet.note ? ` · ${outlet.note}` : ''}</small>}</td>
            <td>{outlet.paidThroughDate ? dateLabelFull(outlet.paidThroughDate) : '—'}</td>
            <td className="ad-number">{outlet.paymentCount}</td>
            <td><Badge tone={outlet.blocked ? 'warn' : outlet.state === 'ending' ? 'warn' : outlet.state === 'trial' ? 'info' : outlet.state === 'awaiting' ? 'off' : 'on'}>
              {outlet.blocked ? 'Blocked' : outlet.state === 'ending' ? `Ends in ${outlet.daysLeft} days` : outlet.state === 'trial' ? 'Free trial' : outlet.state === 'awaiting' ? 'Awaiting payment' : 'Active'}
            </Badge></td>
          </tr>)}</tbody>
        </table>
      </div>
    </Card>}

    <Card className="ad-table-card">
      <CardHeading title="Invoices & receipts" subtitle="Each payment you made to the platform, with the period it covers." />
      {!invoices.length ? <p className="ad-billing-empty">No invoices yet. They appear here once a payment is recorded for your organization.</p> : (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>Invoice</th><th>For</th><th>Billing period</th><th>Paid on</th><th>Method</th><th>Amount</th><th><span className="ad-sr-only">Actions</span></th></tr></thead>
            <tbody>{invoices.map(invoice => <tr key={invoice.invoiceSeq}>
              <td><strong>{formatInvoiceNumber(invoice.invoiceSeq)}</strong>{invoice.reference && <small>Ref {invoice.reference}</small>}</td>
              <td>{TYPE_LABEL[invoice.type]}{(invoice.outletName || invoice.planName) && <small>{[invoice.outletName, invoice.planName].filter(Boolean).join(' · ')}</small>}{invoice.discountPercent > 0 && <small>{invoice.discountPercent}% discount{invoice.notes ? ` · ${invoice.notes}` : ''}</small>}</td>
              <td>{period(invoice)}</td>
              <td>{dateLabelFull(invoice.paidAt)}</td>
              <td>{invoice.method === 'UPI' ? 'UPI' : invoice.method === 'CASH' ? 'Cash' : '—'}</td>
              <td className="ad-number">{money(invoice.amount)}</td>
              <td className="ad-billing-actions">
                <button type="button" className="ad-billing-link" onClick={() => setViewing(invoice)}>View</button>
                <a href={`/api/v1/subscription/invoices/${invoice.invoiceSeq}/pdf?download=1`}>Download</a>
              </td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
    </Card>
    {viewing && <InvoiceViewer invoice={viewing} onClose={() => setViewing(null)} />}
  </div>;
}

function InvoiceViewer({ invoice, onClose }: { invoice: StoreInvoice; onClose: () => void }) {
  return <InvoiceViewerPanel key={invoice.invoiceSeq} number={formatInvoiceNumber(invoice.invoiceSeq)} previewUrl={`/api/v1/subscription/invoices/${invoice.invoiceSeq}/pdf`}
    getPublicLinks={async () => { const url = `${window.location.origin}${(await getSubscriptionInvoiceLinkAction(invoice.invoiceSeq)).path}`; return { downloadUrl: url, viewUrl: url }; }} onClose={onClose} />;
}
