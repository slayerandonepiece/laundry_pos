import 'server-only';
import { normalizePhone, isValidPhone } from '@/lib/contactValidation';
import { z } from 'zod';
import { unstable_cache, revalidateTag } from 'next/cache';
import { prisma } from '@/server/db';
import { hashPassword } from '@/server/auth/password';
import { parseCalendarDate, formatCalendarDate, todayIST } from '@/server/dates';
import { outletBilling, type OutletBillingState } from '@/lib/subscriptionAccess';
import { isValidNewPassword } from '@/lib/contactValidation';
import { ValidationError } from '@/server/errors';
import { nextFreeOrgCode } from '@/server/numbering';
import { effectiveSubscriptionTerms } from '@/server/subscription-terms';
import { applyOrganizationDefaults } from '@/server/services/org-defaults';
import { assertOrgCodeFree, isNumberingLocked, parseOrgCode } from '@/server/services/org-numbering';
import type { CollectedThisYearStats, DashboardStats, OnboardStoreInput, OwnerLookupResult, PaymentState, RecordSubscriptionPaymentInput, StoreDetail, StoreInvoice, StoreListItem, UpdateStoreInput } from '@/features/super-admin/types';

const EXPIRING_SOON_DAYS = 30;
const TRIAL_ENDING_DAYS = 7;

type StoreRow = Awaited<ReturnType<typeof findAllStores>>[number];

function findAllStores() {
  return prisma.store.findMany({
    where: { deletedAt: null },
    include: {
      subscription: { include: { plan: true } },
      memberships: { where: { role: 'OWNER' }, select: { user: { select: { id: true, name: true, phone: true, email: true } } }, orderBy: { createdAt: 'asc' } },
      _count: { select: { outlets: true } },
      outlets: { where: { status: 'ACTIVE' }, select: { plan: { select: { name: true, annualFeeAmount: true } } } },
    },
    orderBy: { onboardedAt: 'desc' },
  });
}

function addDays(date: string, days: number): string {
  return formatCalendarDate(new Date(parseCalendarDate(date).getTime() + days * 86400000));
}

// Adds exactly one calendar year (same month/day next year), not 365 days —
// otherwise a term spanning a leap day loses a day against an
// anniversary-based renewal. Feb 29 falls back to Feb 28 in a non-leap
// target year, same as native Date's month-rollover would produce for every
// other case, just corrected for the Feb 29 -> Mar 1 rollover specifically.
function addYears(date: string, years: number): string {
  const parsed = parseCalendarDate(date);
  const month = parsed.getUTCMonth();
  const result = new Date(Date.UTC(parsed.getUTCFullYear() + years, month, parsed.getUTCDate()));
  if (result.getUTCMonth() !== month) result.setUTCDate(0);
  return formatCalendarDate(result);
}

function addMonths(date: string, months: number): string {
  const parsed = parseCalendarDate(date);
  const targetMonth = parsed.getUTCMonth() + months;
  const result = new Date(Date.UTC(parsed.getUTCFullYear(), targetMonth, parsed.getUTCDate()));
  // If day overflowed (e.g. Jan 31 + 1 month → Mar 3), clamp to last day of target month.
  if (result.getUTCDate() !== parsed.getUTCDate()) result.setUTCDate(0);
  return formatCalendarDate(result);
}

function addBillingCycle(date: string, cycle: string): string {
  switch (cycle) {
    case 'HALF_YEARLY': return addMonths(date, 6);
    case 'QUARTERLY':   return addMonths(date, 3);
    case 'MONTHLY':     return addMonths(date, 1);
    default:            return addYears(date, 1); // ANNUAL
  }
}

function paymentStateFor(
  paidThroughDate: string | undefined,
  trialEndsAt: string | undefined,
  today: string,
): PaymentState {
  // A current paid term wins over the trial; otherwise an active trial covers a missing or expired term.
  const paidCurrent = !!paidThroughDate && paidThroughDate >= today;
  if (!paidCurrent && trialEndsAt && trialEndsAt >= today) {
    return trialEndsAt <= addDays(today, TRIAL_ENDING_DAYS) ? 'trial_ending' : 'trial';
  }
  if (!paidThroughDate) return 'unset';
  if (paidThroughDate < today) return 'locked';
  if (paidThroughDate <= addDays(today, EXPIRING_SOON_DAYS)) return 'expiring';
  return 'active';
}

function toDTO(row: StoreRow, today: string, lastInvoice?: { invoiceSeq: number; paidAt: Date }): StoreListItem {
  const owner = row.memberships[0]?.user;
  const terms = effectiveSubscriptionTerms(row.subscription);
  const outletPlans = row.outlets.flatMap(outlet => outlet.plan ? [outlet.plan] : []);
  const paidThroughDate = row.subscription?.paidThroughDate ? formatCalendarDate(row.subscription.paidThroughDate) : undefined;
  const trialEndsAt = row.subscription?.trialEndsAt ? formatCalendarDate(row.subscription.trialEndsAt) : undefined;
  return {
    id: row.id,
    orgCode: row.orgCode,
    name: row.name,
    address: row.address,
    phone: row.phone,
    email: row.email,
    ownerId: owner?.id,
    ownerName: owner?.name ?? '—',
    ownerEmail: owner?.email ?? undefined,
    ownerPhone: owner?.phone ?? undefined,
    // Plans are per outlet now: the names of the recurring plans its outlets are on.
    planName: outletPlans.map(plan => plan.name).filter((name, index, all) => all.indexOf(name) === index).join(', ') || (row.subscription?.plan?.kind === 'RECURRING' ? row.subscription.plan.name : undefined),
    depositPlanName: row.subscription?.plan?.kind === 'ONE_TIME' ? row.subscription.plan.name : undefined,
    depositAmount: terms.depositAmount,
    depositPaidAt: row.subscription?.depositPaidAt ? formatCalendarDate(row.subscription.depositPaidAt) : undefined,
    annualFeeAmount: outletPlans[0]?.annualFeeAmount ?? terms.annualFeeAmount,
    paidThroughDate,
    trialEndsAt,
    paymentState: row.status === 'LOCKED' ? 'locked' : paymentStateFor(paidThroughDate, trialEndsAt, today),
    status: row.status,
    lastInvoiceSeq: lastInvoice?.invoiceSeq,
    lastInvoiceAt: lastInvoice ? formatCalendarDate(lastInvoice.paidAt) : undefined,
    outletCount: row._count.outlets,
    isReviewDemo: row.isReviewDemo,
  };
}

export const listStores = unstable_cache(async (): Promise<StoreListItem[]> => {
  const today = todayIST();
  const rows = await findAllStores();

  // One most-recent payment per store, for the "Last invoice" column — a
  // plain findMany + first-seen-wins in JS rather than a groupBy, since
  // groupBy's independent per-column max() can't guarantee invoiceSeq and
  // paidAt come from the same row.
  const payments = await prisma.subscriptionPayment.findMany({
    where: { storeId: { in: rows.map(r => r.id) } },
    orderBy: { paidAt: 'desc' },
    select: { storeId: true, invoiceSeq: true, paidAt: true },
  });
  const lastInvoiceByStore = new Map<string, { invoiceSeq: number; paidAt: Date }>();
  for (const p of payments) if (!lastInvoiceByStore.has(p.storeId)) lastInvoiceByStore.set(p.storeId, p);

  return rows.map(row => toDTO(row, today, lastInvoiceByStore.get(row.id)));
}, ['stores'], { tags: ['stores'], revalidate: 60 });

export interface OutletBillingRow {
  id: string;
  outletCode: string;
  name: string;
  planId?: string;
  planName?: string;
  paidThroughDate?: string;
  paymentCount: number;
  lastPaidAt?: string;
  // The discount and note on this outlet's latest payment.
  discountPercent: number;
  note?: string;
  state: OutletBillingState;
  blocked: boolean;
  daysLeft?: number;
}

/** Each active outlet of an organization with its own plan, term, payment count and standing. */
export async function listOutletBilling(storeId: string): Promise<OutletBillingRow[]> {
  const today = todayIST();
  const [store, outlets, payments] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId }, select: { accessGrantedUntil: true, subscription: { select: { paidThroughDate: true, trialEndsAt: true, depositPaidAt: true } } } }),
    prisma.outlet.findMany({ where: { storeId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, include: { plan: { select: { id: true, name: true } } } }),
    prisma.subscriptionPayment.findMany({ where: { storeId, type: 'RENEWAL', outletId: { not: null } }, orderBy: [{ paidAt: 'desc' }, { invoiceSeq: 'desc' }], select: { outletId: true, paidAt: true, discountPercent: true, notes: true } }),
  ]);
  const stats = new Map<string, { count: number; latest: (typeof payments)[number] }>();
  for (const payment of payments) {
    const entry = stats.get(payment.outletId!);
    if (entry) entry.count += 1;
    else stats.set(payment.outletId!, { count: 1, latest: payment });
  }
  const orgPaidThrough = store?.subscription?.paidThroughDate ? formatCalendarDate(store.subscription.paidThroughDate) : undefined;
  const trialEndsAt = store?.subscription?.trialEndsAt ? formatCalendarDate(store.subscription.trialEndsAt) : undefined;
  const overrideUntil = store?.accessGrantedUntil ? formatCalendarDate(store.accessGrantedUntil) : undefined;
  return outlets.map(outlet => {
    const billing = outletBilling({ today, outletPaidThrough: outlet.paidThroughDate ? formatCalendarDate(outlet.paidThroughDate) : undefined, orgPaidThrough, trialEndsAt, overrideUntil, depositSettled: !!store?.subscription?.depositPaidAt, warnDays: EXPIRING_SOON_DAYS });
    const stat = stats.get(outlet.id);
    return {
      id: outlet.id, outletCode: outlet.outletCode, name: outlet.displayName,
      planId: outlet.plan?.id, planName: outlet.plan?.name,
      paidThroughDate: billing.paidThroughDate, paymentCount: stat?.count ?? 0,
      lastPaidAt: stat ? formatCalendarDate(stat.latest.paidAt) : undefined,
      discountPercent: stat?.latest.discountPercent ?? 0, note: stat?.latest.notes || undefined,
      state: billing.state, blocked: billing.blocked, daysLeft: billing.daysLeft,
    };
  });
}

export interface PaymentContext {
  deposit: { paid: boolean; paidAt?: string; planId?: string; planName?: string; paidAmount?: number; discountPercent?: number; note?: string };
  outlets: OutletBillingRow[];
  trialEndsAt?: string;
}

/** What the Record payment dialog needs: the state of the deposit and of every outlet. */
export async function getPaymentContext(storeId: string): Promise<PaymentContext> {
  const [subscription, outlets, depositPayment] = await Promise.all([
    prisma.subscription.findUnique({ where: { storeId }, include: { plan: { select: { id: true, name: true, kind: true } } } }),
    listOutletBilling(storeId),
    prisma.subscriptionPayment.findFirst({ where: { storeId, type: 'DEPOSIT' }, orderBy: { invoiceSeq: 'desc' }, select: { amount: true, discountPercent: true, notes: true, planName: true } }),
  ]);
  const depositPlan = subscription?.plan?.kind === 'ONE_TIME' ? subscription.plan : undefined;
  return {
    deposit: {
      paid: !!subscription?.depositPaidAt,
      paidAt: subscription?.depositPaidAt ? formatCalendarDate(subscription.depositPaidAt) : undefined,
      planId: depositPlan?.id, planName: depositPayment?.planName || depositPlan?.name,
      paidAmount: depositPayment?.amount, discountPercent: depositPayment?.discountPercent, note: depositPayment?.notes || undefined,
    },
    outlets,
    trialEndsAt: subscription?.trialEndsAt ? formatCalendarDate(subscription.trialEndsAt) : undefined,
  };
}

export async function getStore(storeId: string): Promise<StoreDetail | null> {
  const today = todayIST();
  const row = await prisma.store.findUnique({
    where: { id: storeId },
    include: {
      subscription: { include: { plan: true } },
      memberships: { where: { role: 'OWNER' }, select: { user: { select: { id: true, name: true, phone: true, email: true } } }, orderBy: { createdAt: 'asc' } },
      _count: { select: { outlets: true } },
      outlets: { where: { status: 'ACTIVE' }, select: { plan: { select: { name: true, annualFeeAmount: true } } } },
    },
  });
  if (!row) return null;
  const numberingLocked = await isNumberingLocked(prisma, storeId);
  return {
    ...toDTO(row, today),
    orderSeqBase: Number(row.orderSeqBase),
    numberingLocked,
    onboardedAt: formatCalendarDate(row.onboardedAt),
    planId: row.subscription?.planId ?? undefined,
    discountAmount: row.subscription?.discountAmount ?? 0,
    trialStartsAt: row.subscription?.trialStartsAt ? formatCalendarDate(row.subscription.trialStartsAt) : undefined,
    trialEndsAt: row.subscription?.trialEndsAt ? formatCalendarDate(row.subscription.trialEndsAt) : undefined,
    accessGrantedUntil: row.accessGrantedUntil ? formatCalendarDate(row.accessGrantedUntil) : undefined,
    // Outlets can be added once the organization has a subscription (a trial, or its setup deposit); each outlet is billed on its own.
    hasActiveAccess: row.status === 'ACTIVE' && !row.deletedAt && !!row.subscription,
  };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const stores = await listStores();
  const needsAttention = stores.filter(s => s.paymentState === 'expiring' || s.paymentState === 'locked');
  return {
    totalStores: stores.length,
    activeStores: stores.filter(s => s.paymentState === 'active').length,
    expiringSoon: stores.filter(s => s.paymentState === 'expiring').length,
    lockedStores: stores.filter(s => s.paymentState === 'locked').length,
    needsAttention,
  };
}

const updateStoreSchema = z.object({
  name: z.string().trim().min(1),
  address: z.string().trim().default(''),
  phone: z.string().trim().default(''),
  email: z.string().trim().default(''),
});

export async function updateStore(storeId: string, input: UpdateStoreInput): Promise<StoreDetail> {
  const data = updateStoreSchema.parse(input);
  const existing = await prisma.store.findUnique({ where: { id: storeId } });
  if (!existing) throw new ValidationError('Store not found.');
  await prisma.store.update({ where: { id: storeId }, data });
  revalidateTag('stores', { expire: 0 });
  const store = await getStore(storeId);
  if (!store) throw new Error('Store not found after update.');
  return store;
}

export async function setStoreStatus(storeId: string, status: 'ACTIVE' | 'LOCKED'): Promise<StoreDetail> {
  const existing = await prisma.store.findUnique({ where: { id: storeId } });
  if (!existing) throw new ValidationError('Store not found.');
  await prisma.store.update({ where: { id: storeId }, data: { status } });
  revalidateTag('stores', { expire: 0 });
  const store = await getStore(storeId);
  if (!store) throw new Error('Store not found after update.');
  return store;
}

export async function setStoreReviewDemo(storeId: string, isReviewDemo: boolean): Promise<StoreDetail> {
  const existing = await prisma.store.findUnique({ where: { id: storeId } });
  if (!existing) throw new ValidationError('Store not found.');
  await prisma.store.update({ where: { id: storeId }, data: { isReviewDemo } });
  revalidateTag('stores', { expire: 0 });
  const store = await getStore(storeId);
  if (!store) throw new Error('Store not found after update.');
  return store;
}

export async function archiveStore(storeId: string, confirmName: string): Promise<void> {
  const existing = await prisma.store.findUnique({ where: { id: storeId } });
  if (!existing || existing.deletedAt) throw new ValidationError('Store not found.');
  if (confirmName.trim() !== existing.name) throw new ValidationError('Type the store name exactly to confirm.');
  await prisma.store.update({ where: { id: storeId }, data: { deletedAt: new Date() } });
  revalidateTag('stores', { expire: 0 });
}

export async function lookupOwnerByPhone(phone: string): Promise<OwnerLookupResult | null> {
  const normalized = normalizePhone(phone);
  if (!isValidPhone(normalized)) return null;
  const user = await prisma.user.findUnique({
    where: { phone: normalized },
    select: { id: true, name: true, phone: true, isSuperAdmin: true, memberships: { where: { store: { deletedAt: null } }, select: { store: { select: { name: true } } } } },
  });
  if (!user || user.isSuperAdmin) return null;
  return { id: user.id, name: user.name, phone: user.phone, storeCount: user.memberships.length, storeNames: user.memberships.map(m => m.store.name) };
}

const discountPercentSchema = z.number().int().min(0, 'Discount must be between 0 and 100.').max(100, 'Discount must be between 0 and 100.').default(0);

/** The price after a percentage discount, in paise, rounded to the nearest paisa. */
export function discountedAmount(listAmount: number, percent: number): number {
  return Math.round(listAmount * (100 - percent) / 100);
}

const onboardSchema = z.object({
  storeName: z.string().trim().min(1),
  orgCode: z.string().trim().optional(),
  address: z.string().trim().default(''),
  phone: z.string().trim().min(1, 'Enter a contact phone number for this organization.').refine(isValidPhone, 'Enter a valid phone number (8–15 digits).'),
  owner: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('new'), name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(100), password: z.string().refine(isValidNewPassword, 'Use at least 8 characters with a letter and a number.'), ownerPhone: z.string().transform(normalizePhone).refine(value => !!value, "Enter the owner's phone number.").refine(isValidPhone, 'Enter a valid phone number (8–15 digits).') }),
    z.object({ mode: z.literal('existing'), userId: z.string().min(1) }),
  ]),
  // An organization starts on a free trial, or pays its one-time setup deposit (a one-time plan,
  // optionally discounted). Outlets are added afterwards and billed on their own recurring plan.
  subscription: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('plan'), planId: z.string().min(1), discountPercent: discountPercentSchema }),
    z.object({ mode: z.literal('trial'), trialStartDate: z.string().optional(), trialEndDate: z.string() }),
  ]),
  markPaid: z.boolean(),
  paymentMethod: z.enum(['UPI', 'CASH']).optional(),
  paymentReference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export async function onboardStore(input: OnboardStoreInput, superAdminId: string): Promise<StoreListItem> {
  const parsed = onboardSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  const data = parsed.data;
  const today = todayIST();
  if (data.subscription.mode === 'trial') {
    const sub = data.subscription;
    validateAccessDate(sub.trialEndDate, addDays(today, 1));
    if (sub.trialStartDate && sub.trialStartDate > sub.trialEndDate)
      throw new ValidationError('Trial start date must be before end date.');
    if (data.markPaid) throw new ValidationError('A free trial cannot record a payment.');
  }

  const storeId = await prisma.$transaction(async tx => {
    let ownerId: string;

    if (data.owner.mode === 'new') {
      const existing = await tx.user.findUnique({ where: { phone: data.owner.ownerPhone } });
      if (existing) throw new ValidationError('This phone number is already registered.');
      const passwordHash = await hashPassword(data.owner.password);
      const created = await tx.user.create({
        data: {
          name: data.owner.name,
          passwordHash,
          phone: data.owner.ownerPhone,
        },
      });
      ownerId = created.id;
    } else {
      const existing = await tx.user.findUnique({ where: { id: data.owner.userId } });
      if (!existing || existing.isSuperAdmin) throw new ValidationError('Owner not found.');
      ownerId = existing.id;
    }

    // A custom code must be free; otherwise take the next free one. Both happen
    // in this transaction so a rolled-back onboarding does not keep a code.
    let orgCode: string;
    if (data.orgCode) {
      orgCode = parseOrgCode(data.orgCode);
      await assertOrgCodeFree(tx, orgCode);
    } else {
      orgCode = await nextFreeOrgCode(tx);
    }
    const store = await tx.store.create({
      data: { orgCode, name: data.storeName, address: data.address, phone: data.phone, onboardedById: superAdminId },
    });

    // Platform defaults: payment methods flagged enabledByDefault. Message templates are inherited, not copied.
    await applyOrganizationDefaults(tx, store.id);

    await tx.storeMembership.create({ data: { storeId: store.id, userId: ownerId, role: 'OWNER' } });

    let planId: string | null = null;
    let listAmount = 0;
    let planName = '';
    const discountPercent = data.subscription.mode === 'plan' ? data.subscription.discountPercent : 0;
    if (data.subscription.mode === 'plan') {
      const plan = await tx.subscriptionPlan.findUnique({ where: { id: data.subscription.planId } });
      if (!plan || plan.archivedAt) throw new ValidationError('Plan not found.');
      if (plan.kind !== 'ONE_TIME') throw new ValidationError('Choose a one-time plan for the organization deposit.');
      planId = plan.id;
      listAmount = plan.depositAmount;
      planName = plan.name;
    }

    // A deposit at 100% discount is waived: nothing is collected, but it is recorded as settled.
    const settled = data.subscription.mode === 'plan' && (data.markPaid || discountPercent === 100);
    await tx.subscription.create({
      data: {
        storeId: store.id,
        planId,
        // The deposit price is frozen once it is settled; before that it follows the plan.
        depositAmount: settled ? listAmount : null,
        depositPaidAt: settled ? parseCalendarDate(today) : null,
        annualFeeAmount: null,
        discountAmount: 0,
        paidThroughDate: null,
        trialStartsAt: data.subscription.mode === 'trial' && data.subscription.trialStartDate ? parseCalendarDate(data.subscription.trialStartDate) : null,
        trialEndsAt: data.subscription.mode === 'trial' ? parseCalendarDate(data.subscription.trialEndDate) : null,
        notes: '',
      },
    });

    if (settled) {
      await tx.subscriptionPayment.create({
        data: {
          storeId: store.id, type: 'DEPOSIT', amount: discountedAmount(listAmount, discountPercent), listAmount, discountPercent,
          planId, planName, paidAt: parseCalendarDate(today), method: data.paymentMethod ?? 'UPI',
          reference: data.paymentReference ?? '', notes: data.notes ?? '', recordedById: superAdminId,
        },
      });
    }

    return store.id;
  });

  revalidateTag('plans', { expire: 0 });
  revalidateTag('stores', { expire: 0 });
  const rows = await findAllStores();
  const row = rows.find(r => r.id === storeId);
  if (!row) throw new Error('Store not found after creation.');
  return toDTO(row, today);
}

const paymentLineSchema = z.object({
  planId: z.string().min(1).optional(),
  discountPercent: discountPercentSchema,
  note: z.string().trim().default(''),
  amount: z.number().int().nonnegative().optional(),
});

const recordSubscriptionPaymentSchema = z.object({
  deposit: paymentLineSchema.optional(),
  outlets: paymentLineSchema.extend({ outletIds: z.array(z.string().min(1)).optional() }).optional(),
  method: z.enum(['CASH', 'UPI']),
  reference: z.string().trim().default(''),
});

const invoiceInclude = { store: { select: { name: true } }, recordedBy: { select: { name: true } }, outlet: { select: { displayName: true } } } as const;

// Everything charged follows one pattern: a plan, an optional discount percentage and an optional note.
// The deposit is paid once per organization and moves no date. A renewal extends each chosen outlet by
// one billing cycle from whichever is later — today, or that outlet's current paid-through date (so
// renewing early never shortens its term), and writes one invoice per outlet. The organization's own
// paidThroughDate then follows its latest outlet, which keeps the organization-level checks working:
// it lapses only when every outlet has. An organization with no outlets yet keeps one
// organization-level term.
// recordedById captures which Super Admin was logged in (from the calling
// Server Action's requireSuperAdmin() session) — nullable on the schema so
// historical payments recorded before this column existed stay valid.
export async function recordSubscriptionPayments(storeId: string, input: RecordSubscriptionPaymentInput, recordedById?: string): Promise<StoreInvoice[]> {
  const parsed = recordSubscriptionPaymentSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  const data = parsed.data;
  if (!data.deposit && !data.outlets) throw new ValidationError('Choose what to record a payment for.');
  const today = todayIST();
  const paidAt = parseCalendarDate(today);

  const results = await prisma.$transaction(async tx => {
    // Lock before reading the current term. A concurrent payment must see
    // the preceding payment's committed expiry, not grant the same term twice.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM subscriptions WHERE "storeId" = ${storeId} FOR UPDATE
    `;
    if (!locked.length) throw new ValidationError('This store has no subscription yet.');
    const subscription = await tx.subscription.findUniqueOrThrow({ where: { storeId }, include: { plan: true } });
    const created = [];

    const loadPlan = async (planId: string, kind: 'ONE_TIME' | 'RECURRING') => {
      const plan = await tx.subscriptionPlan.findUnique({ where: { id: planId } });
      if (!plan || plan.archivedAt) throw new ValidationError('Plan not found.');
      if (plan.kind !== kind) throw new ValidationError(kind === 'ONE_TIME' ? 'Choose a one-time plan for the deposit.' : 'Choose a recurring plan for outlets.');
      return plan;
    };

    if (data.deposit) {
      if (subscription.depositPaidAt) throw new ValidationError('The setup deposit is already paid for this organization.');
      const line = data.deposit;
      const plan = line.planId ? await loadPlan(line.planId, 'ONE_TIME') : subscription.plan?.kind === 'ONE_TIME' ? subscription.plan : null;
      const listAmount = plan ? plan.depositAmount : line.amount ?? effectiveSubscriptionTerms(subscription).depositAmount;
      if (!plan && !listAmount) throw new ValidationError('Choose the deposit plan.');
      // The deposit is a historical fact once paid: freeze the amount so a later plan edit cannot rewrite it.
      await tx.subscription.update({ where: { storeId }, data: { depositPaidAt: paidAt, depositAmount: listAmount, ...(plan ? { planId: plan.id } : {}) } });
      created.push(await tx.subscriptionPayment.create({
        data: { storeId, type: 'DEPOSIT', amount: discountedAmount(listAmount, line.discountPercent), listAmount, discountPercent: line.discountPercent, planId: plan?.id, planName: plan?.name ?? '', method: data.method, paidAt, notes: line.note, reference: data.reference, recordedById },
        include: invoiceInclude,
      }));
    }

    if (data.outlets) {
      const line = data.outlets;
      const outlets = await tx.outlet.findMany({ where: { storeId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, include: { plan: true } });
      const chosen = line.planId ? await loadPlan(line.planId, 'RECURRING') : null;

      if (!outlets.length) {
        // No outlets yet: one organization-level term, as before.
        const plan = chosen ?? (subscription.plan?.kind === 'RECURRING' ? subscription.plan : null);
        const listAmount = plan ? plan.annualFeeAmount : line.amount ?? effectiveSubscriptionTerms(subscription).annualFeeAmount;
        if (!plan && !listAmount) throw new ValidationError('Choose a plan to renew.');
        const currentPaidThrough = subscription.paidThroughDate ? formatCalendarDate(subscription.paidThroughDate) : undefined;
        const base = currentPaidThrough && currentPaidThrough > today ? currentPaidThrough : today;
        const coversTo = parseCalendarDate(addBillingCycle(base, plan?.billingCycle ?? 'ANNUAL'));
        await tx.subscription.update({ where: { storeId }, data: { paidThroughDate: coversTo } });
        created.push(await tx.subscriptionPayment.create({
          data: { storeId, type: 'RENEWAL', amount: discountedAmount(listAmount, line.discountPercent), listAmount, discountPercent: line.discountPercent, planId: plan?.id, planName: plan?.name ?? '', method: data.method, paidAt, coversFrom: parseCalendarDate(base), coversTo, notes: line.note, reference: data.reference, recordedById },
          include: invoiceInclude,
        }));
      } else {
        const wanted = line.outletIds ? [...new Set(line.outletIds)] : outlets.map(outlet => outlet.id);
        if (!wanted.length) throw new ValidationError('Choose at least one outlet to renew.');
        const targets = wanted.map(id => outlets.find(outlet => outlet.id === id));
        if (targets.some(outlet => !outlet)) throw new ValidationError('One of the chosen outlets is not an active outlet of this organization.');

        const latest = new Map(outlets.map(outlet => [outlet.id, outlet.paidThroughDate ? formatCalendarDate(outlet.paidThroughDate) : undefined]));
        for (const outlet of targets as typeof outlets) {
          const plan = chosen ?? outlet.plan;
          const listAmount = plan ? plan.annualFeeAmount : line.amount ?? effectiveSubscriptionTerms(subscription).annualFeeAmount;
          if (!plan && !listAmount) throw new ValidationError(`Choose a plan for ${outlet.displayName}.`);
          const current = latest.get(outlet.id);
          const base = current && current > today ? current : today;
          const coversTo = addBillingCycle(base, plan?.billingCycle ?? subscription.plan?.billingCycle ?? 'ANNUAL');
          latest.set(outlet.id, coversTo);
          await tx.outlet.update({ where: { id: outlet.id }, data: { paidThroughDate: parseCalendarDate(coversTo), ...(chosen ? { planId: chosen.id } : {}) } });
          created.push(await tx.subscriptionPayment.create({
            data: { storeId, type: 'RENEWAL', amount: discountedAmount(listAmount, line.discountPercent), listAmount, discountPercent: line.discountPercent, planId: plan?.id, planName: plan?.name ?? '', outletId: outlet.id, method: data.method, paidAt, coversFrom: parseCalendarDate(base), coversTo: parseCalendarDate(coversTo), notes: line.note, reference: data.reference, recordedById },
            include: invoiceInclude,
          }));
        }
        const newest = [...latest.values()].filter((date): date is string => !!date).sort().at(-1);
        if (newest) await tx.subscription.update({ where: { storeId }, data: { paidThroughDate: parseCalendarDate(newest) } });
      }
    }
    return created;
  });

  revalidateTag('stores', { expire: 0 });
  return results.map(invoiceToDTO);
}

export async function recordSubscriptionPayment(storeId: string, input: RecordSubscriptionPaymentInput, recordedById?: string): Promise<StoreInvoice> {
  const [first] = await recordSubscriptionPayments(storeId, input, recordedById);
  return first;
}

function invoiceToDTO(row: { invoiceSeq: number; storeId: string; store: { name: string }; outletId: string | null; outlet: { displayName: string } | null; planName: string; listAmount: number | null; discountPercent: number; type: 'DEPOSIT' | 'RENEWAL'; amount: number; method: 'CASH' | 'UPI' | null; paidAt: Date; coversFrom: Date | null; coversTo: Date | null; notes: string; reference: string; recordedById: string | null; recordedBy: { name: string } | null }): StoreInvoice {
  return {
    invoiceSeq: row.invoiceSeq,
    storeId: row.storeId,
    storeName: row.store.name,
    type: row.type,
    amount: row.amount,
    outletId: row.outletId ?? undefined,
    outletName: row.outlet?.displayName,
    planName: row.planName || undefined,
    listAmount: row.listAmount ?? undefined,
    discountPercent: row.discountPercent,
    method: row.method ?? undefined,
    paidAt: formatCalendarDate(row.paidAt),
    coversFrom: row.coversFrom ? formatCalendarDate(row.coversFrom) : undefined,
    coversTo: row.coversTo ? formatCalendarDate(row.coversTo) : undefined,
    notes: row.notes,
    reference: row.reference,
    recordedById: row.recordedById ?? undefined,
    recordedByName: row.recordedBy?.name,
  };
}

export async function listStoreInvoices(storeId: string): Promise<StoreInvoice[]> {
  const rows = await prisma.subscriptionPayment.findMany({ where: { storeId }, include: { store: true, recordedBy: { select: { name: true } }, outlet: { select: { displayName: true } } }, orderBy: [{ paidAt: 'desc' }, { invoiceSeq: 'desc' }] });
  return rows.map(invoiceToDTO);
}

export async function getInvoice(invoiceSeq: number): Promise<StoreInvoice | null> {
  const row = await prisma.subscriptionPayment.findUnique({ where: { invoiceSeq }, include: { store: true, recordedBy: { select: { name: true } }, outlet: { select: { displayName: true } } } });
  return row ? invoiceToDTO(row) : null;
}

// "Collected this year" — financial year (Apr 1 - Mar 31), per the project
// owner's explicit decision (better for auditing, matches Indian FY
// convention) rather than calendar year. FY boundaries are derived from
// todayIST()'s IST calendar date, not server-local time, matching how the
// rest of this app treats "today" everywhere else.
function fyBounds(today: string): { start: string; end: string; label: string } {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const fyStartYear = month >= 4 ? year : year - 1;
  const start = `${fyStartYear}-04-01`;
  const end = `${fyStartYear + 1}-04-01`;
  const label = `FY ${fyStartYear}–${String((fyStartYear + 1) % 100).padStart(2, '0')}`;
  return { start, end, label };
}

// Year-over-year delta is included: it's just one extra SUM aggregate over
// the same table with a shifted date range (no join, no extra table scan
// pattern beyond what the main query already does), not a second heavy
// query — cheap enough to always compute alongside the current FY figure.
export async function getCollectedThisYearStats(): Promise<CollectedThisYearStats> {
  const today = todayIST();
  const current = fyBounds(today);
  const previousStart = `${Number(current.start.slice(0, 4)) - 1}-04-01`;

  const [currentAgg, previousAgg] = await Promise.all([
    prisma.subscriptionPayment.aggregate({
      _sum: { amount: true },
      where: { paidAt: { gte: parseCalendarDate(current.start), lt: parseCalendarDate(current.end) } },
    }),
    prisma.subscriptionPayment.aggregate({
      _sum: { amount: true },
      where: { paidAt: { gte: parseCalendarDate(previousStart), lt: parseCalendarDate(current.start) } },
    }),
  ]);

  const amount = currentAgg._sum.amount ?? 0;
  const previousYearAmount = previousAgg._sum.amount ?? 0;
  const deltaPercent = previousYearAmount > 0 ? Math.round(((amount - previousYearAmount) / previousYearAmount) * 100) : undefined;

  return { amount, fyLabel: current.label, previousYearAmount, deltaPercent };
}

export async function setStoreTrial(
  storeId: string,
  trialEndsAt: string,
  trialStartsAt?: string,
): Promise<{ trialEndsAt: string; trialStartsAt: string | undefined; storeId: string }> {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store || store.deletedAt) throw new ValidationError('Store not found.');

  const parsedEnd = validateAccessDate(trialEndsAt, todayIST());
  let parsedStart: Date | undefined;
  if (trialStartsAt) {
    parseCalendarDate(trialStartsAt); // validates format
    if (trialStartsAt > trialEndsAt) throw new ValidationError('Trial start date must be before end date.');
    parsedStart = parseCalendarDate(trialStartsAt);
  }

  await prisma.subscription.upsert({
    where: { storeId },
    create: { storeId, depositAmount: 0, annualFeeAmount: 0, trialStartsAt: parsedStart ?? null, trialEndsAt: parsedEnd },
    update: { trialStartsAt: parsedStart ?? null, trialEndsAt: parsedEnd },
  });

  revalidateTag('stores', { expire: 0 });
  return { storeId, trialEndsAt, trialStartsAt };
}

export interface ExpiringSubscriptionItem {
  storeId: string;
  storeName: string;
  phone: string;
  email: string | null;
  paidThroughDate: string | null;
  trialEndsAt: string | null;
  daysRemaining: number;
  type: 'TRIAL' | 'SUBSCRIPTION';
}

export async function listExpiringSubscriptions(withinDays = 30): Promise<ExpiringSubscriptionItem[]> {
  const today = todayIST();
  const todayDate = parseCalendarDate(today);
  const horizonDate = parseCalendarDate(addDays(today, withinDays));

  const subscriptions = await prisma.subscription.findMany({
    where: {
      store: { deletedAt: null },
      OR: [
        {
          trialEndsAt: {
            lte: horizonDate,
          },
        },
        {
          paidThroughDate: {
            lte: horizonDate,
          },
        },
      ],
    },
    include: {
      store: { select: { id: true, name: true, phone: true, email: true } },
    },
  });

  const results: ExpiringSubscriptionItem[] = [];
  for (const s of subscriptions) {
    const trialDate = s.trialEndsAt ? formatCalendarDate(s.trialEndsAt) : null;
    const paidDate = s.paidThroughDate ? formatCalendarDate(s.paidThroughDate) : null;

    if (trialDate && !paidDate) {
      const days = Math.round((parseCalendarDate(trialDate).getTime() - todayDate.getTime()) / 86400000);
      results.push({
        storeId: s.store.id,
        storeName: s.store.name,
        phone: s.store.phone,
        email: s.store.email,
        paidThroughDate: null,
        trialEndsAt: trialDate,
        daysRemaining: days,
        type: 'TRIAL',
      });
    } else if (paidDate) {
      const days = Math.round((parseCalendarDate(paidDate).getTime() - todayDate.getTime()) / 86400000);
      results.push({
        storeId: s.store.id,
        storeName: s.store.name,
        phone: s.store.phone,
        email: s.store.email,
        paidThroughDate: paidDate,
        trialEndsAt: trialDate,
        daysRemaining: days,
        type: 'SUBSCRIPTION',
      });
    }
  }

  return results.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

function validateAccessDate(value: string, minimum: string, maximum?: string): Date {
  let parsed: Date;
  try { parsed = parseCalendarDate(value); } catch { throw new ValidationError('Enter a valid calendar date.'); }
  if (value < minimum || (maximum && value > maximum)) throw new ValidationError(maximum ? 'Choose a date from today through the next 30 days.' : 'Choose a trial end date after today.');
  return parsed;
}

export async function grantTemporaryAccess(storeId: string, untilDate: string): Promise<void> {
  const date = validateAccessDate(untilDate, todayIST(), addDays(todayIST(), 30));
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store || store.deletedAt) throw new ValidationError('Organization not found.');
  if (store.status === 'LOCKED') throw new ValidationError('Unlock the organization before granting temporary access.');
  await prisma.store.update({ where: { id: storeId }, data: { accessGrantedUntil: date } });
}
