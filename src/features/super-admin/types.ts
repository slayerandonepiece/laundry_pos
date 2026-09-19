export type PaymentState = 'active' | 'expiring' | 'locked' | 'unset';

export interface StoreListItem {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  ownerId?: string;
  ownerName: string;
  ownerUsername: string;
  // Owner's own contact info, global to the person — distinct from this
  // store's own phone/email above.
  ownerEmail?: string;
  ownerPhone?: string;
  planName?: string;
  depositAmount: number;
  depositPaidAt?: string;
  annualFeeAmount: number;
  paidThroughDate?: string;
  paymentState: PaymentState;
  status: 'ACTIVE' | 'LOCKED';
  lastInvoiceSeq?: number;
  lastInvoiceAt?: string;
  outletCount: number;
}

// "Collected this year" — financial-year (Apr 1 - Mar 31) revenue aggregate
// against SubscriptionPayment, for the Subscriptions -> Billing screen.
export interface CollectedThisYearStats {
  amount: number; // paise
  fyLabel: string; // e.g. "FY 2026-27"
  previousYearAmount?: number; // paise, same FY window a year earlier
  deltaPercent?: number; // vs previousYearAmount, omitted if there's nothing to compare against
}

export interface DashboardStats {
  totalStores: number;
  activeStores: number;
  expiringSoon: number;
  lockedStores: number;
  needsAttention: StoreListItem[];
}

export interface StoreDetail extends StoreListItem {
  onboardedAt: string;
  planId?: string;
  planName?: string;
  discountAmount: number;
}

export interface UpdateStoreInput {
  name: string;
  address: string;
  phone: string;
  email: string;
}

export interface OwnerLookupResult {
  id: string;
  name: string;
  username: string;
  phone?: string;
  storeCount: number;
  storeNames?: string[];
}

export interface OnboardStoreInput {
  storeName: string;
  address: string;
  phone: string;
  owner:
    | { mode: 'new'; name: string; username: string; password: string }
    | { mode: 'existing'; userId: string };
  subscription:
    | { mode: 'plan'; planId: string; discountAmount: number; chargeDepositAnyway?: boolean }
    | { mode: 'custom'; depositAmount: number; annualFeeAmount: number };
  markPaid: boolean;
  notes?: string;
}

export type BillingCycle = 'ANNUAL';

export interface SubscriptionPlanListItem {
  id: string;
  name: string;
  depositAmount: number;
  annualFeeAmount: number;
  billingCycle: BillingCycle;
  depositWaivedByDefault: boolean;
  notes: string;
  archivedAt?: string;
  createdAt: string;
  storeCount: number;
}

export interface SubscriptionPlanDetail extends SubscriptionPlanListItem {
  stores: { id: string; name: string; ownerName: string; onboardedAt: string; depositAmount: number; status: 'ACTIVE' | 'LOCKED' }[];
  lastUsedAt?: string;
}

export interface PlanInput {
  name: string;
  depositAmount: number;
  annualFeeAmount: number;
  depositWaivedByDefault: boolean;
  notes: string;
}

export type PaymentMethod = 'CASH' | 'UPI';

export interface StoreInvoice {
  invoiceSeq: number;
  storeId: string;
  storeName: string;
  type: 'DEPOSIT' | 'RENEWAL';
  amount: number;
  method?: PaymentMethod;
  paidAt: string;
  coversFrom?: string;
  coversTo?: string;
  notes: string;
  // Free-text reference (e.g. a UPI transaction ID), optional.
  reference: string;
  // Which Super Admin recorded this payment — absent on payments recorded
  // before this column existed.
  recordedById?: string;
  recordedByName?: string;
}

export interface RecordSubscriptionPaymentInput {
  type: 'DEPOSIT' | 'RENEWAL';
  amount: number;
  method: PaymentMethod;
  coversMonths?: number;
  notes?: string;
  reference?: string;
}

export type PlatformRole = 'OWNER' | 'EMPLOYEE';

export interface PlatformUserMembership {
  storeId: string;
  storeName: string;
  role: PlatformRole;
}

export interface PlatformUserListItem {
  id: string;
  name: string;
  username: string;
  active: boolean;
  memberships: PlatformUserMembership[];
  // Global to the person — distinct from a Store's own email/phone.
  email?: string;
  phone?: string;
}

export interface PlatformUserDetail extends PlatformUserListItem {
  lastSignInAt?: string;
}

export interface CreateUserInput {
  name: string;
  username: string;
  password: string;
  storeId?: string;
  role?: PlatformRole;
}

export interface UpdateUserInput {
  name: string;
  username: string;
  storeId?: string;
  role?: PlatformRole;
  email?: string;
  phone?: string;
}

export type ResetPasswordInput = { mode: 'auto' } | { mode: 'manual'; password: string };

export type OutletStatus = 'ACTIVE' | 'CLOSED' | 'RELOCATED';

export interface OutletListItem {
  id: string;
  storeId: string;
  outletCode: string;
  displayName: string;
  address: string;
  phone: string;
  status: OutletStatus;
  openedAt: string;
  closedAt?: string;
}

export interface OutletDetail extends OutletListItem {
  staffCount: number;
  orders30d?: number;
  collected30d?: number;
}

// A single AuditLog row for a store's Activity tab. Deliberately close to
// the raw AuditLog shape (action/entityType/beforeJson/afterJson) rather
// than a pre-rendered sentence, since the AuditLog table only carries a
// handful of distinct `action` values today and new ones will need mapping
// in the UI as they're added — better than baking rendered strings into the
// service layer.
export interface ActivityEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorName?: string;
  outletId?: string;
  createdAt: string; // ISO timestamp
  beforeJson?: unknown;
  afterJson?: unknown;
}

export interface PlatformActivityEntry extends ActivityEntry {
  actorUsername?: string;
  storeId?: string;
  storeName?: string;
  outletName?: string;
  outletCode?: string;
}
