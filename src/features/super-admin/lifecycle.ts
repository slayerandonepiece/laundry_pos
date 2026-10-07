export type OrgLifecycleState =
  | 'TERMS_NOT_SET'
  | 'TRIAL'
  | 'TRIAL_ENDING'
  | 'ACTIVE'
  | 'SUBSCRIPTION_ENDING'
  | 'RESTRICTED'
  | 'LOCKED'
  | 'ARCHIVED';

export interface LifecycleDescription {
  label: string;
  badgeClass: 'good' | 'warm' | 'bad' | 'info' | 'gray';
  description: string;
}

export interface OrgLifecycleFacts {
  state: OrgLifecycleState;
  paidThroughDate?: string;
  trialEndsAt?: string;
  archivedAt?: string;
}

export function describeLifecycleState(state: OrgLifecycleState): LifecycleDescription {
  switch (state) {
    case 'ARCHIVED':
      return { label: 'Archived', badgeClass: 'gray', description: 'Removed from the directory. Order and payment history is kept, not destroyed. There is no restore option — treat this as permanent.' };
    case 'LOCKED':
      return { label: 'Locked', badgeClass: 'bad', description: 'Locked by Super Admin. The owner and every employee can still sign in — every data request returns 403 until it is unlocked.' };
    case 'TERMS_NOT_SET':
      return { label: 'No plan', badgeClass: 'warm', description: 'Onboarded without a plan, deposit or trial. Choose a plan or start a trial to begin.' };
    case 'TRIAL':
      return { label: 'Trial', badgeClass: 'info', description: 'On a free trial.' };
    case 'TRIAL_ENDING':
      return { label: 'Trial ending', badgeClass: 'warm', description: 'The free trial ends soon.' };
    case 'RESTRICTED':
      return { label: 'Restricted', badgeClass: 'bad', description: 'Payment has lapsed. Writes are blocked for the owner and every employee until a payment is recorded.' };
    case 'SUBSCRIPTION_ENDING':
      return { label: 'Renewal due soon', badgeClass: 'warm', description: 'The subscription renews soon.' };
    case 'ACTIVE':
      return { label: 'Active', badgeClass: 'good', description: 'Subscription is in good standing.' };
  }
}
