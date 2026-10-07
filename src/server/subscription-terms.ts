// The price an organization is actually charged. The plan owns the price;
// a subscription stores a number only when the organization has its own
// (custom terms, a negotiated override, or a deposit frozen once paid).
interface TermsPlan { depositAmount: number; annualFeeAmount: number; depositWaivedByDefault: boolean }
interface TermsSubscription { depositAmount: number | null; annualFeeAmount: number | null; plan?: TermsPlan | null }

export const planDepositAmount = (plan: Pick<TermsPlan, 'depositAmount' | 'depositWaivedByDefault'>): number =>
  plan.depositWaivedByDefault ? 0 : plan.depositAmount;

export function effectiveSubscriptionTerms(subscription: TermsSubscription | null | undefined): { depositAmount: number; annualFeeAmount: number } {
  if (!subscription) return { depositAmount: 0, annualFeeAmount: 0 };
  const { plan } = subscription;
  return {
    depositAmount: subscription.depositAmount ?? (plan ? planDepositAmount(plan) : 0),
    annualFeeAmount: subscription.annualFeeAmount ?? plan?.annualFeeAmount ?? 0,
  };
}
