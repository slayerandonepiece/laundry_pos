'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PageHeading from '../components/PageHeading';
import Dialog from '../components/Dialog';
import PaymentMethodsTable from '../components/PaymentMethodsTable';
import AddPaymentMethodDialog from '../components/AddPaymentMethodDialog';
import EditPaymentMethodDialog from '../components/EditPaymentMethodDialog';
import { updatePlatformPaymentMethodAction } from '../actions/platform-payment-methods.actions';
import type { PlatformPaymentMethodDTO } from '@/server/services/platform-payment-methods';

export default function PaymentMethodsScreenContainer({
  methods,
}: {
  methods: PlatformPaymentMethodDTO[];
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PlatformPaymentMethodDTO | null>(null);
  const [notice, setNotice] = useState('');

  function flash(message: string) {
    setNotice(message);
    router.refresh();
    setTimeout(() => setNotice(''), 4000);
  }

  function toggleActive(method: PlatformPaymentMethodDTO) {
    updatePlatformPaymentMethodAction(method.id, { active: !method.active })
      .then(result => {
        if (!result.ok) {
          flash(result.error || 'Could not update payment method.');
          return;
        }
        flash(`${method.name} ${method.active ? 'deactivated' : 'activated'}`);
      })
      .catch(() => {
        flash('Could not update payment method.');
      });
  }

  return <>
    {notice && <div className="ad-toast" role="status">✓ {notice}</div>}
    <PageHeading icon="card" title="Payment methods" subtitle="Global catalog of payment methods available to organizations." action={<button type="button" className="btn" onClick={() => setAddOpen(true)}>+ Add payment method</button>} />

    <PaymentMethodsTable
      methods={methods}
      onEdit={setEditingMethod}
      onToggleActive={toggleActive}
    />

    {addOpen && (
      <Dialog
        title="Add payment method"
        description="Add a new method to the global catalog. Organizations can enable it for their outlets."
        onClose={() => setAddOpen(false)}
        warnOnChanges
      >
        <AddPaymentMethodDialog
          onSaved={newMethod => {
            setAddOpen(false);
            flash(`${newMethod.name} added`);
          }}
        />
      </Dialog>
    )}

    {editingMethod && (
      <Dialog
        title={`Edit ${editingMethod.name}`}
        description="Update the display name or availability in the global catalog."
        onClose={() => setEditingMethod(null)}
        warnOnChanges
      >
        <EditPaymentMethodDialog
          method={editingMethod}
          onSaved={updated => {
            setEditingMethod(null);
            flash(`${updated.name} updated`);
          }}
        />
      </Dialog>
    )}
  </>;
}
