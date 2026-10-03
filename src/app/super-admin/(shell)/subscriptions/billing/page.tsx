import { redirect } from 'next/navigation';

export default function SubscriptionsBillingRedirect() {
  redirect('/super-admin/billing');
}
