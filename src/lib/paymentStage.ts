// Client-safe payment-stage helpers shared by the Super Admin and store workspaces.
// A stage says where a payment method appears: when the order is placed
// (pre-order), after it (post-order: collecting payment or delivering), or both.

export type PaymentStageValue = 'PRE_ORDER' | 'POST_ORDER' | 'BOTH';

export const PAYMENT_STAGES: PaymentStageValue[] = ['PRE_ORDER', 'POST_ORDER', 'BOTH'];

export const PAYMENT_STAGE_LABELS: Record<PaymentStageValue, string> = {
  PRE_ORDER: 'Pre-order',
  POST_ORDER: 'Post-order',
  BOTH: 'Both',
};

/** Cash on delivery is a promise to pay, so it can only appear when the order is placed. */
export function allowedPaymentStages(code: string): PaymentStageValue[] {
  return code === 'COD' ? ['PRE_ORDER'] : PAYMENT_STAGES;
}

export function stageAllowsPhase(stage: PaymentStageValue | undefined, phase: 'PRE_ORDER' | 'POST_ORDER'): boolean {
  return !stage || stage === 'BOTH' || stage === phase;
}

/**
 * Whether a method is offered in a phase. Cash on delivery is never post-order,
 * because recording it is always rejected server-side. The stage itself comes
 * from the platform catalogue, never from an organization.
 */
export function methodAllowsPhase(method: { code?: string; stage?: PaymentStageValue }, phase: 'PRE_ORDER' | 'POST_ORDER'): boolean {
  if (method.code === 'COD' && phase === 'POST_ORDER') return false;
  return stageAllowsPhase(method.stage, phase);
}
