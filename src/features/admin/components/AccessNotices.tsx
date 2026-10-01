import type { AccessDeniedReason } from '@/server/auth/session';

// Reuses the same "server withholds data, client explains why" pattern the
// explicit-admin-lock check already used (see AdminScreenContainer's former
// `storeLocked` banner) — extended to also cover an archived store, an
// employee's own membership going inactive, and a lapsed subscription
// (Item 1 + Item 3, .agents/2026-09-brainstorm-plan.md). Messaging is kept
// distinguishable per reason, and no financial specifics are shown to
// employees for a payment lapse — only "please check with your store owner".
function messageFor(reason: AccessDeniedReason, isOwner: boolean, paidThroughDate?: string): { title: string; body: string } {
  switch (reason) {
    case 'membership_inactive':
      return {
        title: 'Access removed',
        body: isOwner
          ? 'Your access to this store has been deactivated. Contact your platform administrator if this is unexpected.'
          : 'Your access to this store has been deactivated. Contact your store owner if you believe this is a mistake.',
      };
    case 'store_locked':
      return {
        title: 'Store locked',
        body: "This store's access is currently locked. Contact your platform administrator to restore access.",
      };
    case 'store_archived':
      return {
        title: 'Store archived',
        body: 'This store has been archived and is no longer accessible. Contact your platform administrator for details.',
      };
    case 'payment_lapsed':
      return {
        title: 'Plan expired',
        body: isOwner
          ? `This store's subscription expired on ${paidThroughDate ?? 'the last billing date'}. Renew your plan to restore access — access resumes automatically as soon as a renewal payment is recorded, no separate unlock step needed.`
          : "This store's plan has expired. Please check with your store owner — access will resume automatically once the plan is renewed.",
      };
    case 'billing_pending':
      return {
        title: 'Billing pending',
        body: isOwner
          ? 'Your store account setup is pending billing completion. Contact your platform administrator to complete setup.'
          : 'This store account setup is pending billing completion. Please check with your store owner.',
      };
  }
}

// Full blocking screen shown in place of the normal dashboard/screens once
// access is withheld (rendered inside AdminShell, so navigation/logout stay
// reachable — this isn't a separate route, just a different content state).
export function AccessBlockedScreen({ reason, isOwner, paidThroughDate }: { reason: AccessDeniedReason; isOwner: boolean; paidThroughDate?: string }) {
  const { title, body } = messageFor(reason, isOwner, paidThroughDate);
  return (
    <div className="ad-error" role="alert" style={{ padding: '32px 24px', textAlign: 'center', maxWidth: 520, margin: '48px auto' }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p style={{ marginBottom: 0 }}>{body}</p>
    </div>
  );
}

// Non-blocking pre-expiry banner (7 days before paidThroughDate — see
// PAYMENT_WARNING_DAYS in session.ts). Owners get the exact date and a way
// to act; employees get a generic heads-up with no financial specifics.
export function PaymentWarningBanner({ isOwner, paidThroughDate }: { isOwner: boolean; paidThroughDate: string }) {
  return (
    <div className="ad-error" role="alert" style={{ marginBottom: 20 }}>
      {isOwner
        ? `Your subscription is due for renewal on ${paidThroughDate}. Renew soon to avoid losing access to this store.`
        : 'Billing is due soon for this store. Please check with your store owner.'}
    </div>
  );
}
