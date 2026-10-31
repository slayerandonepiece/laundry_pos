'use client';
import SetTrialDialog from './SetTrialDialog';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Dialog from './Dialog';
import { money, today, dateLabel, dateLabelFull, paymentMethodLabel } from '@/features/admin/admin.data';
import Icon from './Icon';
import RowMenu from './RowMenu';
import InvoicePdfViewer from './InvoicePdfViewer';
import RecordPaymentDialog from './RecordPaymentDialog';
import ChangePlanDialog from './ChangePlanDialog';
import { formatInvoiceNumber } from '@/lib/invoiceNumber';
import { printInvoicePdf } from '@/lib/invoicePrint';
import type { StoreDetail, StoreInvoice, SubscriptionPlanListItem } from '../types';
import { daysUntil } from '../utils';

// Days-remaining threshold for calling out a trial as "ending soon" rather
// than just "trial" — mirrors the 30-day EXPIRING_SOON_DAYS window the paid
// subscription lifecycle already uses on the server, scaled down since a
// trial is a much shorter window to begin with.
const TRIAL_ENDING_SOON_DAYS = 7;

type Stage = 'terms-not-set' | 'trial' | 'trial-ending' | 'active' | 'ending' | 'restricted' | 'unset';

export default function StoreSubscriptionTab({ store, invoices, plans, hasSubscription, trialEndsAt }: {
  store: StoreDetail;
  invoices: StoreInvoice[];
  plans: SubscriptionPlanListItem[];
  // Whether a Subscription row exists at all for this store — distinct from
  // every field on it happening to be zero/unset.
  hasSubscription: boolean;
  trialEndsAt?: string;
}) {
  const router = useRouter();
  const [accessDialog, setAccessDialog] = useState<'trial' | 'temporary' | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [viewingInvoiceSeq, setViewingInvoiceSeq] = useState<number | null>(null);
  const [notice, setNotice] = useState('');

  const isTrialActive = !!trialEndsAt && (!store.paidThroughDate || store.paidThroughDate < today()) && trialEndsAt >= today();
  const trialDaysLeft = isTrialActive ? daysUntil(trialEndsAt!, today()) : undefined;

  let stage: Stage;
  if (!hasSubscription) stage = 'terms-not-set';
  else if (isTrialActive) stage = trialDaysLeft !== undefined && trialDaysLeft <= TRIAL_ENDING_SOON_DAYS ? 'trial-ending' : 'trial';
  else if ((store.accessGrantedUntil && store.accessGrantedUntil >= today())) stage = 'active';
  else if ((trialEndsAt && trialEndsAt < today() && (!store.paidThroughDate || store.paidThroughDate < today())) || store.paymentState === 'locked') stage = 'restricted';
  else if (store.paymentState === 'expiring') stage = 'ending';
  else if (store.paymentState === 'unset') stage = 'unset';
  else stage = 'active';

  const statusBadge: Record<Stage, { label: string; tone: 'good' | 'warm' | 'bad' | 'info' | 'gray' }> = {
    'terms-not-set': { label: 'No plan', tone: 'gray' },
    trial: { label: 'Trial', tone: 'info' },
    'trial-ending': { label: `Trial ending${trialDaysLeft !== undefined ? ` · ${trialDaysLeft}d` : ''}`, tone: 'warm' },
    active: { label: 'Active', tone: 'good' },
    ending: { label: 'Ending soon', tone: 'warm' },
    restricted: { label: 'Restricted', tone: 'bad' },
    unset: { label: 'Not started', tone: 'gray' },
  };
  const { label: statusLabel, tone: statusTone } = statusBadge[stage];

  if (stage === 'terms-not-set') {
    return <div>
      {notice && <div className="ad-toast" role="status">✓ {notice}</div>}
      <div className="card"><div className="empty">
        <span className="ic l"><Icon name="card" size="l" /></span>
        <h3>Subscription terms haven&apos;t been set</h3>
        <p>Set a plan or custom deposit and annual fee to start billing {store.name}.</p>
        <button type="button" className="btn outline" onClick={() => setAccessDialog('trial')}>Set trial period</button>
        <button type="button" className="btn" style={{ marginTop: 14 }} onClick={() => setPlanOpen(true)}><Icon name="edit" size="s" />Set subscription terms</button>
      </div></div>
      {accessDialog && <Dialog title="Set trial period" onClose={() => setAccessDialog(null)}><SetTrialDialog storeId={store.id} onSaved={() => { setAccessDialog(null); router.refresh(); }} /></Dialog>}
      {planOpen && (
        <Dialog title="Set subscription terms" description={`Choose the terms ${store.name} will use.`} size="wide" onClose={() => setPlanOpen(false)} warnOnChanges>
          <ChangePlanDialog store={store} plans={plans} onSaved={() => { setPlanOpen(false); setNotice('Subscription terms set'); router.refresh(); setTimeout(() => setNotice(''), 4000); }} />
        </Dialog>
      )}
    </div>;
  }

  const statusMessage: { tone: 'info' | 'warn' | 'danger' | 'good'; icon: 'clock' | 'alertTriangle' | 'lock' | 'check'; text: string } | null =
    stage === 'ending' ? { tone: 'warn', icon: 'alertTriangle', text: `Subscription is ending soon${store.paidThroughDate ? `, paid through ${dateLabelFull(store.paidThroughDate)}` : ''}. Record a renewal payment to extend it.` }
    : stage === 'restricted' ? { tone: 'danger', icon: 'lock', text: `Access blocked since ${store.paidThroughDate ? dateLabelFull(store.paidThroughDate) : trialEndsAt ? dateLabelFull(trialEndsAt) : 'an unknown date'}. Record a renewal payment to restore access automatically.` }
    : stage === 'trial' || stage === 'trial-ending' ? { tone: stage === 'trial-ending' ? 'warn' : 'info', icon: 'clock', text: `${stage === 'trial-ending' ? `Trial ends in ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'}` : 'Free trial'}${trialEndsAt ? ` until ${dateLabelFull(trialEndsAt)}` : ''}. Record a payment or extend the trial to continue access.` }
    : stage === 'active' ? { tone: 'good', icon: 'check', text: store.paidThroughDate ? `Paid through ${dateLabelFull(store.paidThroughDate)}.` : 'Subscription is in good standing.' }
    : null;
  const items: [string, React.ReactNode][] = [
    ['Plan', store.planId ? (store.planName ?? '—') : 'Custom terms'],
    ['Deposit', <>{money(store.depositAmount)}{!store.depositPaidAt && <span className="sub-flag">Unpaid</span>}</>],
    ['Annual fee', money(store.annualFeeAmount)],
    ...(store.planId ? [['Discount', money(store.discountAmount)] as [string, React.ReactNode]] : []),
    ...(trialEndsAt ? [['Trial period', store.trialStartsAt ? `${dateLabel(store.trialStartsAt)} – ${dateLabel(trialEndsAt)}` : `Until ${dateLabel(trialEndsAt)}`] as [string, React.ReactNode]] : []),
    ['Paid through', store.paidThroughDate ? dateLabelFull(store.paidThroughDate) : '—'],
  ];

  return <div>
    {notice && <div className="ad-toast" role="status">✓ {notice}</div>}

    <div className="sub-layout">
      <div className="card">
        <div className="card-head">
          <h2><Icon name="card" />Subscription terms</h2>
          <div className="sub-actions">
            <button type="button" className="btn sm" onClick={() => setPaymentOpen(true)}><Icon name="card" size="s" />Record payment</button>
            {['trial', 'trial-ending', 'unset'].includes(stage) && <button type="button" className="btn outline sm" onClick={() => setAccessDialog('trial')}>Set trial period</button>}
            {stage === 'restricted' && <button type="button" className="btn outline sm" onClick={() => setAccessDialog('temporary')}>Grant temporary access</button>}
            <button type="button" className="btn outline sm" onClick={() => setPlanOpen(true)} disabled={stage === 'restricted'} title={stage === 'restricted' ? 'Renew the subscription before changing plan terms.' : undefined}><Icon name="edit" size="s" />Change plan</button>
          </div>
        </div>
        <dl className="sub-grid">
          {items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="num">{value}</dd></div>)}
        </dl>
      </div>

      <aside className="card sub-status" aria-label="Subscription status">
        <div className="card-head"><h2>Status</h2><span className={'badge ' + statusTone}>{statusLabel}</span></div>
        {statusMessage && <p className={'sub-msg ' + statusMessage.tone}><Icon name={statusMessage.icon} size="s" /><span>{statusMessage.text}</span></p>}
        {store.accessGrantedUntil && store.accessGrantedUntil >= today() && <p className="sub-msg warn"><Icon name="clock" size="s" /><span>Temporary access granted until {dateLabelFull(store.accessGrantedUntil)}.</span></p>}
      </aside>
    </div>

    <h3 style={{ margin: '20px 0 10px', fontSize: 15 }}>Invoices</h3>
    {!invoices.length ? (
      <div className="card"><div className="empty compact">
        <span className="ic l"><Icon name="card" size="l" /></span>
        <h3>No payments recorded yet</h3>
        <p>Record a payment to generate the first invoice.</p>
      </div></div>
    ) : (
      <div className="tablecard">
        <table>
          <thead><tr><th>Invoice</th><th>Type</th><th className="right">Amount</th><th>Method</th><th>Paid</th><th>Covers</th><th>Recorded by</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {invoices.map(invoice => (
              <tr key={invoice.invoiceSeq}>
                <td>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setViewingInvoiceSeq(invoice.invoiceSeq)}
                    title="View invoice PDF in dialog"
                  >
                    <strong>{formatInvoiceNumber(invoice.invoiceSeq)}</strong>
                  </button>
                </td>
                <td>{invoice.type === 'DEPOSIT' ? 'Deposit' : 'Renewal'}</td>
                <td className="right num">{money(invoice.amount)}</td>
                <td>{invoice.method ? paymentMethodLabel(invoice.method) : '—'}</td>
                <td className="num">{dateLabel(invoice.paidAt)}</td>
                <td className="num">{invoice.coversFrom && invoice.coversTo ? `${dateLabel(invoice.coversFrom)} – ${dateLabel(invoice.coversTo)}` : '—'}</td>
                <td>{invoice.recordedByName ?? '—'}</td>
                <td>
                  <div className="rowacts">
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`View invoice ${formatInvoiceNumber(invoice.invoiceSeq)}`}
                      title="View invoice PDF"
                      onClick={() => setViewingInvoiceSeq(invoice.invoiceSeq)}
                    >
                      <Icon name="eye" />
                    </button>
                    <RowMenu items={[
                      { label: 'View invoice', icon: 'eye', onClick: () => setViewingInvoiceSeq(invoice.invoiceSeq) },
                      { label: 'Print PDF', icon: 'printer', onClick: () => printInvoicePdf(`/super-admin/subscriptions/invoices/${invoice.invoiceSeq}/pdf`) },
                      { label: 'Download PDF', icon: 'download', onClick: () => window.open(`/super-admin/subscriptions/invoices/${invoice.invoiceSeq}/pdf?download=1`, '_blank') },
                      { label: 'Invoice detail page', icon: 'externalLink', onClick: () => router.push(`/super-admin/subscriptions/invoices/${invoice.invoiceSeq}`) },
                    ]} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    {viewingInvoiceSeq !== null && (
      <InvoicePdfViewer invoiceSeq={viewingInvoiceSeq} onClose={() => setViewingInvoiceSeq(null)} />
    )}

    {accessDialog && <Dialog title={accessDialog === 'temporary' ? 'Grant temporary access' : 'Set trial period'} onClose={() => setAccessDialog(null)} warnOnChanges><SetTrialDialog storeId={store.id} temporary={accessDialog === 'temporary'} onSaved={() => { setAccessDialog(null); setNotice('Access updated'); router.refresh(); }} /></Dialog>}
    {paymentOpen && (
      <Dialog title="Record a payment" description={`Add a deposit or renewal payment for ${store.name}.`} onClose={() => setPaymentOpen(false)} warnOnChanges>
        <RecordPaymentDialog storeId={store.id} storeName={store.name} store={store} onSaved={invoice => { setPaymentOpen(false); setNotice(invoice.coversTo ? `Payment recorded. Access paid through: ${dateLabelFull(invoice.coversTo)}.` : 'Deposit payment recorded.'); router.refresh(); setTimeout(() => setNotice(''), 4000); }} />
      </Dialog>
    )}
    {planOpen && (
      <Dialog title="Change plan" description={`Choose the terms ${store.name} will use at its next renewal.`} size="wide" onClose={() => setPlanOpen(false)} warnOnChanges>
        <ChangePlanDialog store={store} plans={plans} onSaved={() => { setPlanOpen(false); setNotice('Plan updated'); router.refresh(); setTimeout(() => setNotice(''), 4000); }} />
      </Dialog>
    )}
  </div>;
}
