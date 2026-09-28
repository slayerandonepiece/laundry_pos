export function hasCurrentAccess(today: string, paidThrough?: string, trialEnds?: string, overrideUntil?: string): boolean {
  return [paidThrough, trialEnds, overrideUntil].some(date => !!date && date >= today);
}
export function isSubscriptionLapsed(today: string, paidThrough?: string, trialEnds?: string, overrideUntil?: string): boolean {
  return !!(paidThrough || trialEnds) && !hasCurrentAccess(today, paidThrough, trialEnds, overrideUntil);
}
