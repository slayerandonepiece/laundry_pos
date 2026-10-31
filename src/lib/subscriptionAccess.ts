export function hasCurrentAccess(today: string, paidThrough?: string, trialEnds?: string, overrideUntil?: string): boolean {
  return [paidThrough, trialEnds, overrideUntil].some(date => !!date && date >= today);
}
export function isSubscriptionLapsed(today: string, paidThrough?: string, trialEnds?: string, overrideUntil?: string): boolean {
  return !!(paidThrough || trialEnds) && !hasCurrentAccess(today, paidThrough, trialEnds, overrideUntil);
}

export type OutletBillingState = 'active' | 'ending' | 'trial' | 'blocked' | 'awaiting';

export interface OutletBilling {
  state: OutletBillingState;
  /** True when this outlet's access is withheld. */
  blocked: boolean;
  paidThroughDate?: string;
  /** Whole days until the outlet's paid term ends; only while a paid term is current. */
  daysLeft?: number;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/**
 * One outlet's standing. A paid term on the outlet wins over the organization's free trial.
 * An outlet that has never been paid is only blocked once the organization has started billing
 * (a trial, or any paid outlet), so a store with no terms at all keeps working as before.
 */
export function outletBilling(input: {
  today: string;
  outletPaidThrough?: string;
  orgPaidThrough?: string;
  trialEndsAt?: string;
  overrideUntil?: string;
  /** The organization's setup deposit is settled, so billing has started even with no outlet term yet. */
  depositSettled?: boolean;
  warnDays: number;
}): OutletBilling {
  const { today, outletPaidThrough, orgPaidThrough, trialEndsAt, overrideUntil, warnDays } = input;
  const paidCurrent = !!outletPaidThrough && outletPaidThrough >= today;
  if (paidCurrent) {
    const daysLeft = daysBetween(today, outletPaidThrough!);
    return { state: daysLeft <= warnDays ? 'ending' : 'active', blocked: false, paidThroughDate: outletPaidThrough, daysLeft };
  }
  if (hasCurrentAccess(today, undefined, trialEndsAt, overrideUntil)) {
    return { state: trialEndsAt && trialEndsAt >= today ? 'trial' : 'active', blocked: false, paidThroughDate: outletPaidThrough };
  }
  if (outletPaidThrough) return { state: 'blocked', blocked: true, paidThroughDate: outletPaidThrough };
  const billingStarted = !!(orgPaidThrough || trialEndsAt || input.depositSettled);
  return { state: 'awaiting', blocked: billingStarted };
}
