import 'server-only';
import { normalizePhone, isValidPhone } from '@/lib/contactValidation';
import { z } from 'zod';
import { unstable_cache, revalidateTag } from 'next/cache';
import { prisma } from '@/server/db';
import { hashPassword } from '@/server/auth/password';
import { parseCalendarDate, formatCalendarDate, todayIST } from '@/server/dates';
import { hasCurrentAccess } from '@/lib/subscriptionAccess';
import { isValidNewPassword } from '@/lib/contactValidation';
import { ValidationError } from '@/server/errors';
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
  // Active trial takes precedence over a missing/expired paidThroughDate
  if (trialEndsAt && trialEndsAt >= today) {
    return trialEndsAt <= addDays(today, TRIAL_ENDING_DAYS) ? 'trial_ending' : 'trial';
  }
  if (!paidThroughDate) return 'unset';
  if (paidThroughDate < today) return 'locked';
  if (paidThroughDate <= addDays(today, EXPIRING_SOON_DAYS)) return 'expiring';
  return 'active';
}

function toDTO(row: StoreRow, today: string, lastInvoice?: { invoiceSeq: number; paidAt: Date }): StoreListItem {
  const owner = row.memberships[0]?.user;
  const paidThroughDate = row.subscription?.paidThroughDate ? formatCalendarDate(row.subscription.paidThroughDate) : undefined;
  const trialEndsAt = row.subscription?.trialEndsAt ? formatCalendarDate(row.subscription.trialEndsAt) : undefined;
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    email: row.email,
    ownerId: owner?.id,
    ownerName: owner?.name ?? '—',
    ownerEmail: owner?.email ?? undefined,
    ownerPhone: owner?.phone ?? undefined,
    planName: row.subscription?.plan?.name,
    depositAmount: row.subscription?.depositAmount ?? 0,
    depositPaidAt: row.subscription?.depositPaidAt ? formatCalendarDate(row.subscription.depositPaidAt) : undefined,
    annualFeeAmount: row.subscription?.annualFeeAmount ?? 0,
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

export async function getStore(storeId: string): Promise<StoreDetail | null> {
  const today = todayIST();
  const row = await prisma.store.findUnique({
    where: { id: storeId },
    include: {
      subscription: { include: { plan: true } },
      memberships: { where: { role: 'OWNER' }, select: { user: { select: { id: true, name: true, phone: true, email: true } } }, orderBy: { createdAt: 'asc' } },
      _count: { select: { outlets: true } },
    },
  });
  if (!row) return null;
  return {
    ...toDTO(row, today),
    onboardedAt: formatCalendarDate(row.onboardedAt),
    planId: row.subscription?.planId ?? undefined,
    planName: row.subscription?.plan?.name,
    discountAmount: row.subscription?.discountAmount ?? 0,
    trialStartsAt: row.subscription?.trialStartsAt ? formatCalendarDate(row.subscription.trialStartsAt) : undefined,
    trialEndsAt: row.subscription?.trialEndsAt ? formatCalendarDate(row.subscription.trialEndsAt) : undefined,
    accessGrantedUntil: row.accessGrantedUntil ? formatCalendarDate(row.accessGrantedUntil) : undefined,
    hasActiveAccess: row.status === 'ACTIVE' && !row.deletedAt && hasCurrentAccess(today,
      row.subscription?.paidThroughDate ? formatCalendarDate(row.subscription.paidThroughDate) : undefined,
      row.subscription?.trialEndsAt ? formatCalendarDate(row.subscription.trialEndsAt) : undefined,
      row.accessGrantedUntil ? formatCalendarDate(row.accessGrantedUntil) : undefined),
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

const onboardSchema = z.object({
  storeName: z.string().trim().min(1),
  address: z.string().trim().default(''),
  phone: z.string().trim().min(1, 'Enter a contact phone number for this organization.').refine(isValidPhone, 'Enter a valid phone number (8–15 digits).'),
  owner: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('new'), name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(100), password: z.string().refine(isValidNewPassword, 'Use at least 8 characters with a letter and a number.'), ownerPhone: z.string().transform(normalizePhone).refine(value => !!value, "Enter the owner's phone number.").refine(isValidPhone, 'Enter a valid phone number (8–15 digits).') }),
    z.object({ mode: z.literal('existing'), userId: z.string().min(1) }),
  ]),
  subscription: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('plan'), planId: z.string().min(1), discountAmount: z.number().int().nonnegative().default(0), chargeDepositAnyway: z.boolean().default(false) }),
    z.object({ mode: z.literal('trial'), trialStartDate: z.string().optional(), trialEndDate: z.string() }),
    z.object({ mode: z.literal('custom'), depositAmount: z.number().int().nonnegative(), annualFeeAmount: z.number().int().nonnegative() }),
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

    const store = await tx.store.create({
      data: { name: data.storeName, address: data.address, phone: data.phone, onboardedById: superAdminId },
    });

    // auto-enable all active platform payment methods for the new org
    const activeMethods = await tx.platformPaymentMethod.findMany({ where: { active: true }, select: { id: true } });
    await tx.organizationPaymentMethod.createMany({
      data: activeMethods.map(method => ({ storeId: store.id, platformPaymentMethodId: method.id, enabled: true })),
    });

    await tx.storePaymentMethod.createMany({
      data: [{ storeId: store.id, name: 'Cash' }, { storeId: store.id, name: 'UPI' }],
    });

    await tx.storeMembership.create({ data: { storeId: store.id, userId: ownerId, role: 'OWNER' } });

    let depositAmount = 0;
    let annualFeeAmount = 0;
    let planId: string | null = null;
    let discountAmount = 0;

    if (data.subscription.mode === 'plan') {
      const plan = await tx.subscriptionPlan.findUnique({ where: { id: data.subscription.planId } });
      if (!plan || plan.archivedAt) throw new ValidationError('Plan not found.');
      depositAmount = plan.depositWaivedByDefault ? 0 : plan.depositAmount;
      annualFeeAmount = plan.annualFeeAmount;
      planId = plan.id;
      discountAmount = data.subscription.discountAmount;
    } else if (data.subscription.mode === 'custom') {
      depositAmount = data.subscription.depositAmount;
      annualFeeAmount = data.subscription.annualFeeAmount;
    }

    const amountDue = Math.max(depositAmount + annualFeeAmount - discountAmount, 0);
    const recordPayment = data.markPaid && data.subscription.mode !== 'trial' && amountDue > 0;
    const paidThroughDate = recordPayment ? parseCalendarDate(addYears(today, 1)) : null;
    await tx.subscription.create({
      data: {
        storeId: store.id,
        planId,
        depositAmount,
        depositPaidAt: recordPayment ? parseCalendarDate(today) : null,
        annualFeeAmount,
        discountAmount,
        paidThroughDate,
        trialStartsAt: data.subscription.mode === 'trial' && data.subscription.trialStartDate ? parseCalendarDate(data.subscription.trialStartDate) : null,
        trialEndsAt: data.subscription.mode === 'trial' ? parseCalendarDate(data.subscription.trialEndDate) : null,
        notes: data.notes ?? '',
      },
    });

    if (recordPayment) {
      const depositDue = Math.max(depositAmount - discountAmount, 0);
      const annualDue = Math.max(annualFeeAmount - Math.max(discountAmount - depositAmount, 0), 0);
      if (depositDue > 0) await tx.subscriptionPayment.create({
        data: { storeId: store.id, type: 'DEPOSIT', amount: depositDue, paidAt: parseCalendarDate(today), notes: 'Onboarding deposit', method: data.paymentMethod ?? 'UPI', reference: data.paymentReference ?? '', recordedById: superAdminId },
      });
      if (annualDue > 0) await tx.subscriptionPayment.create({
        data: {
          storeId: store.id,
          type: 'RENEWAL',
          amount: annualDue,
          paidAt: parseCalendarDate(today),
          coversFrom: parseCalendarDate(today),
          coversTo: paidThroughDate,
          notes: 'First year, included at onboarding',
          method: data.paymentMethod ?? 'UPI', reference: data.paymentReference ?? '', recordedById: superAdminId,
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

const recordSubscriptionPaymentSchema = z.object({
  type: z.enum(['DEPOSIT', 'RENEWAL']),
  amount: z.number().int().positive(),
  method: z.enum(['CASH', 'UPI']),
  notes: z.string().trim().default(''),
  reference: z.string().trim().default(''),
});

// Renewal payments extend paidThroughDate by one year from whichever is
// later — today, or the current paidThroughDate (so renewing early doesn't
// shorten the store's remaining term). Deposit payments don't move the date.
// recordedById captures which Super Admin was logged in (from the calling
// Server Action's requireSuperAdmin() session) — nullable on the schema so
// historical payments recorded before this column existed stay valid.
export async function recordSubscriptionPayment(storeId: string, input: RecordSubscriptionPaymentInput, recordedById?: string): Promise<StoreInvoice> {
  const data = recordSubscriptionPaymentSchema.parse(input);
  const today = todayIST();
  const paidAt = parseCalendarDate(today);

  const result = await prisma.$transaction(async tx => {
    // Lock before reading the current term. A concurrent payment must see
    // the preceding payment's committed expiry, not grant the same term twice.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM subscriptions WHERE "storeId" = ${storeId} FOR UPDATE
    `;
    if (!locked.length) throw new ValidationError('This store has no subscription yet.');
    const subscription = await tx.subscription.findUniqueOrThrow({ where: { storeId }, include: { plan: { select: { billingCycle: true } } } });

    let coversFrom: Date | undefined;
    let coversTo: Date | undefined;

    if (data.type === 'RENEWAL') {
      const billingCycle = subscription.plan?.billingCycle ?? 'ANNUAL';
      const currentPaidThrough = subscription.paidThroughDate ? formatCalendarDate(subscription.paidThroughDate) : undefined;
      const base = currentPaidThrough && currentPaidThrough > today ? currentPaidThrough : today;
      coversFrom = parseCalendarDate(base);
      coversTo = parseCalendarDate(addBillingCycle(base, billingCycle));
      await tx.subscription.update({ where: { storeId }, data: { paidThroughDate: coversTo } });
    } else {
      await tx.subscription.update({ where: { storeId }, data: { depositPaidAt: paidAt } });
    }

    return tx.subscriptionPayment.create({
      data: { storeId, type: data.type, amount: data.amount, method: data.method, paidAt, coversFrom, coversTo, notes: data.notes, reference: data.reference, recordedById },
      include: { store: { select: { name: true } }, recordedBy: { select: { name: true } } },
    });
  });

  revalidateTag('stores', { expire: 0 });
  return {
    invoiceSeq: result.invoiceSeq,
    storeId,
    storeName: result.store.name,
    type: result.type,
    amount: result.amount,
    method: result.method ?? undefined,
    paidAt: formatCalendarDate(result.paidAt),
    coversFrom: result.coversFrom ? formatCalendarDate(result.coversFrom) : undefined,
    coversTo: result.coversTo ? formatCalendarDate(result.coversTo) : undefined,
    notes: result.notes,
    reference: result.reference,
    recordedById: result.recordedById ?? undefined,
    recordedByName: result.recordedBy?.name,
  };
}

function invoiceToDTO(row: { invoiceSeq: number; storeId: string; store: { name: string }; type: 'DEPOSIT' | 'RENEWAL'; amount: number; method: 'CASH' | 'UPI' | null; paidAt: Date; coversFrom: Date | null; coversTo: Date | null; notes: string; reference: string; recordedById: string | null; recordedBy: { name: string } | null }): StoreInvoice {
  return {
    invoiceSeq: row.invoiceSeq,
    storeId: row.storeId,
    storeName: row.store.name,
    type: row.type,
    amount: row.amount,
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
  const rows = await prisma.subscriptionPayment.findMany({ where: { storeId }, include: { store: true, recordedBy: { select: { name: true } } }, orderBy: { paidAt: 'desc' } });
  return rows.map(invoiceToDTO);
}

export async function getInvoice(invoiceSeq: number): Promise<StoreInvoice | null> {
  const row = await prisma.subscriptionPayment.findUnique({ where: { invoiceSeq }, include: { store: true, recordedBy: { select: { name: true } } } });
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
