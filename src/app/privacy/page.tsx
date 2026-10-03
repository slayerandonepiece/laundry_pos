import type { Metadata } from 'next';
import LegalPage, { type LegalSection } from '@/components/LegalPage';
import { LEGAL } from '@/lib/legal-config';

export const metadata: Metadata = {
  title: 'Privacy Policy – KlenPOS',
  description: 'How KlenPOS collects, uses and protects data.',
  robots: { index: true, follow: true },
};

const sections: LegalSection[] = [
  { id: 'responsibility', heading: 'Who is responsible for which data', body: <>
    <p>KlenPOS is a business tool for authorized businesses only. Accounts are not open to the public: we create each business account ourselves after an in-person or direct agreement with the store owner, and share the login details with them.</p>
    <ul>
      <li>For a business’s own customer and order data, the <strong>store owner is the data fiduciary</strong> (controller) and <strong>we act as the data processor</strong>: we store and process that data only to provide the service to them.</li>
      <li>For the login and account details of store owners and staff, and for diagnostics, we are the data fiduciary.</li>
    </ul>
  </> },
  { id: 'collect', heading: 'What we collect', body: <>
    <p><strong>Account data (store owners and staff):</strong> name, phone number or email used to log in, role (owner or employee), and the business (store or outlet) details the owner provides.</p>
    <p><strong>Business data entered by the store:</strong> customer names and phone numbers, orders and items, prices, invoices, payment records (amount, mode and status as recorded by the store), expenses, and staff records.</p>
    <p><strong>Technical and diagnostic data:</strong> in the mobile app, crash reports and error logs (Firebase Crashlytics), usage events such as login, order placed, payment recorded and screen views (Firebase Analytics), device and app information (model, OS version, app version), an app installation identifier, and, when notifications are enabled, a push-notification token (Firebase Cloud Messaging). This data is linked only to opaque internal IDs, not to customer names or phone numbers. On the web platform we use a sign-in session cookie that is needed to keep you signed in.</p>
    <p><strong>What we do not collect:</strong> your location, contacts, camera, microphone, photos or files, or card, bank or UPI credentials. KlenPOS only records that a payment was made, as entered by the store. It does not process or touch payments.</p>
  </> },
  { id: 'use', heading: 'Why we use it', body: <>
    <ul>
      <li>To provide the service: sign-in, orders, billing records, reports and offline sync.</li>
      <li>To keep it secure and working: fix crashes, prevent abuse, and send service messages.</li>
      <li>To understand feature usage in aggregate and improve the app.</li>
      <li>To manage subscriptions and support.</li>
    </ul>
    <p>We do not sell personal data and we do not show ads.</p>
  </> },
  { id: 'storage', heading: 'Where data is stored and who processes it', body: <>
    <ul>
      <li><strong>Our servers:</strong> hosted on Vercel (Singapore region), with the database on Neon (PostgreSQL, Singapore region). Your data is therefore stored and processed outside India.</li>
      <li><strong>Google Firebase</strong> (Crashlytics, Analytics, Cloud Messaging, Remote Config) for diagnostics, analytics and notifications.</li>
      <li><strong>On your device:</strong> the mobile app keeps a local cache of recent data so it works offline. Sign-in tokens are kept in the operating system’s secure storage.</li>
    </ul>
    <p>These providers process data under their own security and data-protection terms. We do not share data with anyone else except where required by law. All data moves between the app, the website and our servers over encrypted HTTPS connections.</p>
  </> },
  { id: 'retention', heading: 'How long we keep data', body: <>
    <ul>
      <li><strong>Active subscription:</strong> data is kept while the account is active.</li>
      <li><strong>Subscription not renewed:</strong> the account is placed on hold. Data is retained so the store can resume exactly where it left off once it subscribes again.</li>
      <li><strong>Store chooses to stop using KlenPOS:</strong> all of the store’s data is permanently deleted within <strong>3 months</strong> of that decision. During this period the store may ask us to restore the account. After it, deletion is final.</li>
    </ul>
    <p>Copies in provider backups are removed as those backups expire. We may keep limited records where the law requires, for example billing records.</p>
  </> },
  { id: 'rights', heading: 'Your rights and account deletion', body: <>
    <p>Under the Digital Personal Data Protection Act, 2023, you may ask to access, correct or delete your personal data, withdraw consent, and nominate someone to act for you.</p>
    <ul>
      <li><strong>Store owners and staff:</strong> email <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a> from your registered contact and we will act on the request within 30 days.</li>
      <li><strong>A store’s customers:</strong> your data is held by the store you used. Please ask the store; we will help the store fulfil the request.</li>
      <li><strong>Delete my account or data:</strong> email us with the subject “Delete account”. Deletion follows the retention rules above.</li>
    </ul>
    <p>Grievance contact: {LEGAL.operatorName}, <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>.</p>
  </> },
  { id: 'security', heading: 'Security', body: <p>We use HTTPS, access controls and secure credential storage. No system is perfectly secure. If a breach affecting you occurs, we will notify you and the authorities as the law requires.</p> },
  { id: 'children', heading: 'Children', body: <p>KlenPOS is for businesses and is not directed at children under 18.</p> },
  { id: 'changes', heading: 'Changes', body: <p>We will post changes on this page and update the date at the top. Material changes will also be notified in the app or by email.</p> },
  { id: 'contact', heading: 'Contact', body: <p>{LEGAL.operatorName}, {LEGAL.city}, India<br /><a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a></p> },
];

export default function PrivacyPage() {
  return <LegalPage
    title="Privacy Policy"
    sections={sections}
    intro={<p>KlenPOS is a point-of-sale and order-management app and web platform for laundry and similar businesses, operated by {LEGAL.operatorName}, an individual (sole proprietor) based in {LEGAL.city}, India (“we”, “us”). It is currently offered only in India.</p>}
  />;
}
