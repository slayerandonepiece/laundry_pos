'use client';

import type { OrganizationPaymentMethodDTO } from '@/server/services/platform-payment-methods';
import { Badge, Card, CardHeading } from '@/features/admin/components/ui';
import { methodAllowsPhase } from '@/lib/paymentStage';

const Mark = ({ on }: { on: boolean }) => on ? <Badge tone="on">Offered</Badge> : <span className="ad-pay-no">Not offered</span>;

// Payment methods and where each appears are set by the platform administrator.
// Owners can see the configuration here but cannot change it.
export default function PaymentMethodsSettings({ methods }: { methods: OrganizationPaymentMethodDTO[] }) {
  const enabled = methods.filter(method => method.enabled);
  return (
    <div className="ad-profile-split">
      <Card className="ad-table-card">
        <CardHeading title="Payment methods" subtitle="What customers can pay with, and at which point staff can choose each one." />
        {enabled.length === 0 ? (
          <p className="ad-billing-empty">No payment methods are enabled yet. Contact support to set them up.</p>
        ) : (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead><tr><th>Method</th><th>When placing an order</th><th>After the order</th></tr></thead>
              <tbody>{enabled.map(method => (
                <tr key={method.id}>
                  <td><strong>{method.name}</strong></td>
                  <td><Mark on={methodAllowsPhase(method, 'PRE_ORDER')} /></td>
                  <td><Mark on={methodAllowsPhase(method, 'POST_ORDER')} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
      <Card>
        <CardHeading title="What these columns mean" />
        <dl className="ad-profile-details">
          <div><dt>When placing an order</dt><dd>Shown on the New order screen when the customer pays up front, or chooses to pay on delivery.</dd></div>
          <div><dt>After the order</dt><dd>Shown when staff record a payment on an existing order, or collect the balance at delivery.</dd></div>
          <div><dt>Cash on delivery</dt><dd>A promise to pay, not money received, so it is only available when placing the order and is recorded as unpaid.</dd></div>
        </dl>
        <p className="ad-billing-empty">Contact support to change which methods are offered.</p>
      </Card>
    </div>
  );
}
