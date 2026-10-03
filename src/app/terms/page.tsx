import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPage, { type LegalSection } from '@/components/LegalPage';
import { LEGAL } from '@/lib/legal-config';

export const metadata: Metadata = {
  title: 'Terms of Service – KlenPOS',
  description: 'The terms for using KlenPOS.',
  robots: { index: true, follow: true },
};

const sections: LegalSection[] = [
  { id: 'service', heading: 'The service', body: <p>KlenPOS is a point-of-sale and order-management app and web platform for laundry and similar businesses. It lets you record orders, customers, payments, expenses and staff, and view reports. It is for authorized businesses only and is currently offered only in India.</p> },
  { id: 'accounts', heading: 'Accounts', body: <ul>
    <li>Accounts are created by us for a business after we agree terms with the owner. There is no public sign-up.</li>
    <li>Login credentials are shared with the owner, who is responsible for keeping them safe and for all activity by their staff. Tell us immediately if credentials are compromised.</li>
    <li>You must give accurate information and use KlenPOS only for lawful business purposes.</li>
  </ul> },
  { id: 'subscription', heading: 'Trial and subscription', body: <ul>
    <li>A free trial may be offered to selected businesses, for the period we tell you.</li>
    <li>After the trial, use of KlenPOS requires a paid subscription at the price and billing period agreed with you.</li>
    <li>Payments to us are made outside the app, as agreed with you (for example in person or by bank or UPI transfer). We record them against your account.</li>
    <li>Fees are non-refundable unless we agree otherwise in writing.</li>
  </ul> },
  { id: 'stopping', heading: 'Not renewing or stopping', body: <ul>
    <li><strong>If you do not renew:</strong> your account is put on hold and the app stops working for you. Your data is kept, and when you subscribe again the account is reactivated.</li>
    <li><strong>If you choose to stop using KlenPOS:</strong> tell us. Your data is permanently deleted within 3 months. Until then you may ask us to bring the account back. After that, deletion is final and cannot be undone.</li>
    <li>Export anything you need before you stop. Ask us if you need help.</li>
  </ul> },
  { id: 'data', heading: 'Your data', body: <ul>
    <li>You own the data you enter (customers, orders, payments and so on). You give us permission to store and process it to provide the service, as described in the <Link href="/privacy">Privacy Policy</Link>.</li>
    <li>You are responsible for having the right to enter your customers’ details, and for any receipts, invoices or tax records you issue from KlenPOS. It is a record-keeping tool; it does not provide tax, GST or accounting advice and is not a payment processor.</li>
  </ul> },
  { id: 'use', heading: 'Acceptable use', body: <p>Do not misuse the service: no attempting to access other businesses’ data, reverse-engineering or copying it, overloading or disrupting it, or using it for unlawful activity. We may suspend an account that breaks these terms.</p> },
  { id: 'availability', heading: 'Availability', body: <p>We work to keep the service running but do not guarantee it will be uninterrupted or error-free. The mobile app supports offline use, but you should keep your own backups of records that matter to your business. We may update or change features.</p> },
  { id: 'liability', heading: 'Disclaimer and liability', body: <p>The service is provided “as is”. To the extent permitted by law, we are not liable for indirect or consequential losses, lost profits or lost data, and our total liability for any claim is limited to the fees you paid us in the 3 months before the claim.</p> },
  { id: 'ending', heading: 'Ending the agreement', body: <p>You may stop at any time (see “Not renewing or stopping”). We may suspend or end your access for breach of these terms or unpaid fees, with notice where reasonable.</p> },
  { id: 'changes', heading: 'Changes', body: <p>We may update these terms and will post the new version with its date. Continuing to use KlenPOS after a change means you accept it.</p> },
  { id: 'law', heading: 'Governing law', body: <p>These terms are governed by the laws of India. Courts at {LEGAL.city}, India have exclusive jurisdiction.</p> },
  { id: 'contact', heading: 'Contact', body: <p>{LEGAL.operatorName}, {LEGAL.city}, India<br /><a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a></p> },
];

export default function TermsPage() {
  return <LegalPage
    title="Terms of Service"
    sections={sections}
    intro={<p>These terms are between you (the business or person using KlenPOS) and {LEGAL.operatorName}, an individual based in {LEGAL.city}, India (“we”, “us”). By using KlenPOS you agree to them.</p>}
  />;
}
