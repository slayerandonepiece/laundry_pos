'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OrganizationPaymentMethodDTO } from '@/server/services/platform-payment-methods';
import { Card, CardHeading, Toggle } from '@/features/admin/components/ui';
import { setOrganizationPaymentMethodEnabledAction } from '../actions/payment-methods.actions';

export default function PaymentMethodsSettings({ methods }: { methods: OrganizationPaymentMethodDTO[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function handleToggle(methodId: string, enabled: boolean) {
    setBusy(methodId);
    try {
      await setOrganizationPaymentMethodEnabledAction(methodId, enabled);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeading 
        title="Payment methods" 
        subtitle="Choose what customers can use at this store." 
      />
      <div>
        {methods.map(method => (
          <div key={method.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <strong>{method.name}</strong>
            </div>
            <Toggle
              checked={method.enabled}
              onChange={(checked) => handleToggle(method.id, checked)}
              disabled={busy === method.id}
              label={`Enable ${method.name}`}
            />
          </div>
        ))}
      </div>
      <p style={{ marginTop: '16px', fontSize: '13px', color: 'var(--muted)' }}>
        Changes take effect immediately across all organization outlets at checkout.
      </p>
    </Card>
  );
}
