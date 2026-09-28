'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Dialog from '../components/Dialog';
import SubscriptionsBillingTable from '../components/SubscriptionsBillingTable';
import RecordPaymentDialog from '../components/RecordPaymentDialog';
import type { CollectedThisYearStats, StoreListItem } from '../types';

export default function BillingScreenContainer({ stores, collectedThisYear }: { stores: StoreListItem[]; collectedThisYear: CollectedThisYearStats }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [payingStore, setPayingStore] = useState<StoreListItem | null>(null);
  const [notice, setNotice] = useState('');

  return <>
    {notice && <div className="ad-toast" role="status">✓ {notice}</div>}
    <SubscriptionsBillingTable stores={stores} collectedThisYear={collectedThisYear} search={search} onSearch={setSearch} onRecordPayment={setPayingStore} />
    {payingStore && (
      <Dialog title="Record a payment" description={`Add a deposit or renewal payment for ${payingStore.name}.`} onClose={() => setPayingStore(null)} warnOnChanges>
        <RecordPaymentDialog
          storeId={payingStore.id}
          storeName={payingStore.name}
          store={payingStore}
          onSaved={() => { setPayingStore(null); setNotice('Payment recorded'); router.refresh(); setTimeout(() => setNotice(''), 4000); }}
        />
      </Dialog>
    )}
  </>;
}
