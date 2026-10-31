import { testPhone } from './test-phone';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient, Role } from '../src/generated/prisma/client';
import { hashPassword } from '../src/server/auth/password';

const socket = process.env.QA_SUBSCRIPTION_PG_SOCKET;
if (!socket?.startsWith('/tmp/el-subscription-test-') || !socket.endsWith('/socket')) {
  throw new Error('Run npm run test:subscription-payments to create an isolated PostgreSQL cluster.');
}

const connection = { host: socket, user: 'subscription_test', database: 'postgres', port: 5432 };
const prisma = new PrismaClient({ adapter: new PrismaPg({ ...connection, max: 10, application_name: 'el-outlet-billing-test' }) });
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
const control = new Pool({ ...connection, max: 2 });

let stores: typeof import('../src/server/services/stores');
let sessionMod: typeof import('../src/server/auth/session');
let access: typeof import('../src/lib/subscriptionAccess');
let outletsService: typeof import('../src/server/services/outlets');
let admin: { id: string };

const iso = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const date = (days: number) => new Date(`${iso(days)}T00:00:00Z`);

before(async () => {
  stores = await import('../src/server/services/stores');
  sessionMod = await import('../src/server/auth/session');
  access = await import('../src/lib/subscriptionAccess');
  outletsService = await import('../src/server/services/outlets');
  admin = await prisma.user.create({ data: { name: 'Billing admin', phone: testPhone('outlet_billing_admin'), passwordHash: await hashPassword('password123'), isSuperAdmin: true } });
});

after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
  await control.end();
});

// An organization with an owner and two outlets, each with its own paid-through date.
async function setupOrg(key: string, opts: { outletA?: Date | null; outletB?: Date | null; orgPaid?: Date | null; trialEndsAt?: Date | null; depositPaidAt?: Date | null } = {}) {
  const store = await prisma.store.create({ data: { id: `store-ob-${key}`, name: `Billing ${key}` } });
  await prisma.subscription.create({
    data: { storeId: store.id, depositAmount: 1_000_000, annualFeeAmount: 500_000, paidThroughDate: opts.orgPaid ?? null, trialEndsAt: opts.trialEndsAt ?? null, depositPaidAt: opts.depositPaidAt ?? null },
  });
  const a = await prisma.outlet.create({ data: { storeId: store.id, outletCode: `OBA-${key}`, displayName: `Alpha ${key}`, paidThroughDate: opts.outletA ?? null } });
  const b = await prisma.outlet.create({ data: { storeId: store.id, outletCode: `OBB-${key}`, displayName: `Beta ${key}`, paidThroughDate: opts.outletB ?? null } });
  const owner = await prisma.user.create({ data: { name: `Owner ${key}`, phone: testPhone(`ob_owner_${key}`), passwordHash: await hashPassword('password123') } });
  await prisma.storeMembership.create({ data: { userId: owner.id, storeId: store.id, role: Role.OWNER } });
  return { store, a, b, owner };
}

async function addEmployee(org: Awaited<ReturnType<typeof setupOrg>>, key: string, outletIds: string[]) {
  const user = await prisma.user.create({ data: { name: `Staff ${key}`, phone: testPhone(`ob_emp_${key}`), passwordHash: await hashPassword('password123') } });
  await prisma.storeMembership.create({ data: { userId: user.id, storeId: org.store.id, role: Role.EMPLOYEE } });
  for (const [index, outletId] of outletIds.entries()) await prisma.outletMembership.create({ data: { userId: user.id, outletId, isDefault: index === 0 } });
  return user;
}

const renewal = { outlets: { amount: 500_000 }, method: 'UPI' as const };
const makePlan = (name: string, kind: 'ONE_TIME' | 'RECURRING', amount: number, billingCycle: 'ANNUAL' | 'MONTHLY' = 'ANNUAL') =>
  prisma.subscriptionPlan.create({ data: { name, kind, depositAmount: kind === 'ONE_TIME' ? amount : 0, annualFeeAmount: kind === 'RECURRING' ? amount : 0, billingCycle } });

test('outletBilling judges each outlet on its own term', () => {
  const warn = 30;
  const base = { today: '2026-10-31', warnDays: warn };
  assert.equal(access.outletBilling({ ...base, outletPaidThrough: '2027-10-31' }).state, 'active');
  assert.equal(access.outletBilling({ ...base, outletPaidThrough: '2026-11-06' }).state, 'ending');
  assert.equal(access.outletBilling({ ...base, outletPaidThrough: '2026-11-06' }).daysLeft, 6);
  assert.deepEqual(access.outletBilling({ ...base, outletPaidThrough: '2026-10-20' }), { state: 'blocked', blocked: true, paidThroughDate: '2026-10-20' });
  // A paid term beats the trial; with no term the trial covers the outlet.
  assert.equal(access.outletBilling({ ...base, outletPaidThrough: '2027-10-31', trialEndsAt: '2026-11-03' }).state, 'active');
  assert.equal(access.outletBilling({ ...base, trialEndsAt: '2026-11-03' }).state, 'trial');
  // Never paid: blocked once billing has started (a term, a trial, or a settled deposit), open otherwise.
  assert.equal(access.outletBilling({ ...base, orgPaidThrough: '2027-01-01' }).blocked, true);
  assert.equal(access.outletBilling({ ...base, depositSettled: true }).blocked, true);
  assert.equal(access.outletBilling({ ...base, trialEndsAt: '2026-10-01' }).blocked, true, 'a trial that ended');
  assert.equal(access.outletBilling({ ...base }).blocked, false);
  assert.equal(access.outletBilling({ ...base }).state, 'awaiting');
  // Temporary access keeps a lapsed outlet open.
  assert.equal(access.outletBilling({ ...base, outletPaidThrough: '2026-10-20', overrideUntil: '2026-11-05' }).blocked, false);
});

test('a renewal extends only the chosen outlet and the organization follows its latest outlet', async () => {
  const org = await setupOrg('renew-one', { outletA: date(-10), outletB: date(40), orgPaid: date(40) });
  const [invoice] = await stores.recordSubscriptionPayments(org.store.id, { ...renewal, outlets: { ...renewal.outlets, outletIds: [org.a.id] } });
  assert.equal(invoice.outletId, org.a.id);
  assert.equal(invoice.outletName, org.a.displayName);
  const [a, b, sub] = await Promise.all([
    prisma.outlet.findUniqueOrThrow({ where: { id: org.a.id } }),
    prisma.outlet.findUniqueOrThrow({ where: { id: org.b.id } }),
    prisma.subscription.findUniqueOrThrow({ where: { storeId: org.store.id } }),
  ]);
  assert.ok(a.paidThroughDate && a.paidThroughDate.toISOString().slice(0, 10) > iso(300), 'alpha restarted from today for about a year');
  assert.equal(b.paidThroughDate?.toISOString().slice(0, 10), iso(40));
  assert.equal(sub.paidThroughDate?.toISOString().slice(0, 10), a.paidThroughDate?.toISOString().slice(0, 10));
});

test('renewing several outlets writes one invoice each and an early renewal never shortens a term', async () => {
  const org = await setupOrg('renew-all', { outletA: date(-3), outletB: date(20), orgPaid: date(20) });
  const invoices = await stores.recordSubscriptionPayments(org.store.id, { ...renewal, outlets: { ...renewal.outlets, outletIds: [org.a.id, org.b.id] } });
  assert.equal(invoices.length, 2);
  assert.equal(invoices.find(invoice => invoice.outletId === org.b.id)!.coversFrom, iso(20), 'beta extends from its current end date');
  assert.equal((await stores.recordSubscriptionPayments(org.store.id, renewal)).length, 2, 'omitting outletIds renews every active outlet');
});

test('a renewal must name active outlets of the same organization', async () => {
  const org = await setupOrg('renew-bad');
  const other = await setupOrg('renew-other');
  await assert.rejects(stores.recordSubscriptionPayments(org.store.id, { ...renewal, outlets: { amount: 1, outletIds: [other.a.id] } }), /not an active outlet/);
  await assert.rejects(stores.recordSubscriptionPayments(org.store.id, { ...renewal, outlets: { amount: 1, outletIds: [] } }), /at least one outlet/);
  await assert.rejects(stores.recordSubscriptionPayments(org.store.id, { method: 'UPI' }), /what to record/);
});

test('a plan, discount percentage and note are charged, snapshotted on each invoice and attached to the outlet', async () => {
  const standard = await makePlan('Standard', 'RECURRING', 500_000);
  const org = await setupOrg('plan-discount', { outletA: date(-5), outletB: date(-5), orgPaid: date(-5) });
  const invoices = await stores.recordSubscriptionPayments(org.store.id, { outlets: { planId: standard.id, discountPercent: 10, note: 'Two outlets' }, method: 'CASH' });
  assert.deepEqual(invoices.map(invoice => [invoice.amount, invoice.listAmount, invoice.discountPercent, invoice.planName, invoice.notes]), [
    [450_000, 500_000, 10, 'Standard', 'Two outlets'], [450_000, 500_000, 10, 'Standard', 'Two outlets'],
  ]);
  const outlets = await prisma.outlet.findMany({ where: { storeId: org.store.id } });
  assert.ok(outlets.every(outlet => outlet.planId === standard.id));
  // The plan is remembered: the next renewal needs no plan and no price.
  const next = await stores.recordSubscriptionPayments(org.store.id, { outlets: { outletIds: [org.a.id] }, method: 'UPI' });
  assert.equal(next[0].amount, 500_000);
  assert.equal(next[0].planName, 'Standard');
  const row = (await stores.listOutletBilling(org.store.id)).find(item => item.id === org.a.id)!;
  assert.deepEqual([row.planName, row.paymentCount, row.discountPercent, row.note], ['Standard', 2, 0, undefined]);
  assert.equal((await stores.listOutletBilling(org.store.id)).find(item => item.id === org.b.id)!.discountPercent, 10);
  // Cycle follows the plan: a monthly plan adds one month.
  const monthly = await makePlan('Monthly', 'RECURRING', 100_000, 'MONTHLY');
  const [month] = await stores.recordSubscriptionPayments(org.store.id, { outlets: { outletIds: [org.b.id], planId: monthly.id }, method: 'UPI' });
  const days = (new Date(month.coversTo!).getTime() - new Date(month.coversFrom!).getTime()) / 86400000;
  assert.ok(days >= 28 && days <= 31, `a monthly plan covers one month, got ${days} days`);
});

test('a plan is required when the outlet has none, and kinds are enforced', async () => {
  const standard = await makePlan('Kind recurring', 'RECURRING', 500_000);
  const deposit = await makePlan('Kind deposit', 'ONE_TIME', 1_000_000);
  const org = await setupOrg('plan-required');
  await prisma.subscription.update({ where: { storeId: org.store.id }, data: { annualFeeAmount: 0 } });
  await assert.rejects(stores.recordSubscriptionPayments(org.store.id, { outlets: { outletIds: [org.a.id] }, method: 'UPI' }), /Choose a plan/);
  await assert.rejects(stores.recordSubscriptionPayments(org.store.id, { outlets: { planId: deposit.id }, method: 'UPI' }), /recurring plan/);
  await assert.rejects(stores.recordSubscriptionPayments(org.store.id, { deposit: { planId: standard.id }, method: 'UPI' }), /one-time plan/);
  await assert.rejects(stores.recordSubscriptionPayments(org.store.id, { deposit: { planId: deposit.id, discountPercent: 101 }, method: 'UPI' }), /between 0 and 100/);
});

test('the deposit is paid once: discounted, waived at 100%, and never recorded twice', async () => {
  const deposit = await makePlan('Deposit plan', 'ONE_TIME', 1_000_000);
  const org = await setupOrg('deposit', { outletA: date(5), outletB: date(5), orgPaid: date(5) });
  const [paid] = await stores.recordSubscriptionPayments(org.store.id, { deposit: { planId: deposit.id, discountPercent: 40, note: 'Referral' }, method: 'CASH' });
  assert.deepEqual([paid.type, paid.amount, paid.listAmount, paid.discountPercent, paid.notes, paid.outletId], ['DEPOSIT', 600_000, 1_000_000, 40, 'Referral', undefined]);
  assert.equal((await prisma.outlet.findUniqueOrThrow({ where: { id: org.a.id } })).paidThroughDate?.toISOString().slice(0, 10), iso(5), 'the deposit moves no outlet date');
  assert.equal((await prisma.subscription.findUniqueOrThrow({ where: { storeId: org.store.id } })).planId, deposit.id);
  await assert.rejects(stores.recordSubscriptionPayments(org.store.id, { deposit: { planId: deposit.id }, method: 'CASH' }), /already paid/);
  const waived = await setupOrg('waive');
  const [free] = await stores.recordSubscriptionPayments(waived.store.id, { deposit: { planId: deposit.id, discountPercent: 100, note: 'Founding customer' }, method: 'CASH' });
  assert.deepEqual([free.amount, free.discountPercent, free.notes], [0, 100, 'Founding customer']);
  assert.ok((await prisma.subscription.findUniqueOrThrow({ where: { storeId: waived.store.id } })).depositPaidAt);
});

test('deposit and outlets are paid together in one dialog: one invoice for each', async () => {
  const deposit = await makePlan('Combined deposit', 'ONE_TIME', 1_000_000);
  const standard = await makePlan('Combined standard', 'RECURRING', 500_000);
  const org = await setupOrg('combined', { trialEndsAt: date(-2) });
  const invoices = await stores.recordSubscriptionPayments(org.store.id, {
    deposit: { planId: deposit.id, discountPercent: 20 }, outlets: { planId: standard.id, discountPercent: 0 }, method: 'UPI', reference: 'txn-1',
  });
  assert.deepEqual(invoices.map(invoice => [invoice.type, invoice.amount, invoice.outletName ?? null]), [['DEPOSIT', 800_000, null], ['RENEWAL', 500_000, org.a.displayName], ['RENEWAL', 500_000, org.b.displayName]]);
  assert.ok(invoices.every(invoice => invoice.reference === 'txn-1'));
  const context = await stores.getPaymentContext(org.store.id);
  assert.equal(context.deposit.paid, true);
  assert.equal(context.deposit.discountPercent, 20);
  assert.ok(context.outlets.every(outlet => outlet.state === 'active'));
});

test('an organization with no outlets keeps one organization-level term', async () => {
  const store = await prisma.store.create({ data: { id: 'store-ob-no-outlets', name: 'No outlets' } });
  await prisma.subscription.create({ data: { storeId: store.id, depositAmount: 0, annualFeeAmount: 500_000 } });
  const [invoice] = await stores.recordSubscriptionPayments(store.id, renewal);
  assert.equal(invoice.outletId, undefined);
  assert.ok((await prisma.subscription.findUniqueOrThrow({ where: { storeId: store.id } })).paidThroughDate);
});

test('an expired outlet is blocked alone: writes fail, its sibling and the organization stay open', async () => {
  const org = await setupOrg('block', { outletA: date(-5), outletB: date(200), orgPaid: date(200) });
  const owner = { id: org.owner.id, name: org.owner.name, isSuperAdmin: false } as never;
  await assert.rejects(sessionMod.requireOutletSession(org.store.id, org.a.id, undefined, owner), (error: unknown) => error instanceof sessionMod.AuthError && error.reason === 'payment_lapsed');
  assert.equal((await sessionMod.requireOutletSession(org.store.id, org.b.id, undefined, owner)).outletId, org.b.id);
  assert.equal((await sessionMod.requireOutletSession(org.store.id, org.a.id, undefined, owner, { allowRestricted: true })).outletId, org.a.id);
  assert.equal((await sessionMod.requireStoreSession(org.store.id, undefined, owner)).storeId, org.store.id);
  await stores.recordSubscriptionPayments(org.store.id, { outlets: { outletIds: [org.a.id], amount: 500_000 }, method: 'UPI' });
  assert.equal((await sessionMod.requireOutletSession(org.store.id, org.a.id, undefined, owner)).outletId, org.a.id);
});

test('a never-paid outlet is blocked once the deposit is settled, but open during a trial', async () => {
  const settled = await setupOrg('awaiting', { depositPaidAt: date(-1) });
  const owner = { id: settled.owner.id, name: settled.owner.name, isSuperAdmin: false } as never;
  await assert.rejects(sessionMod.requireOutletSession(settled.store.id, settled.a.id, undefined, owner), (error: unknown) => error instanceof sessionMod.AuthError && error.reason === 'payment_lapsed');
  const trial = await setupOrg('trial-outlets', { trialEndsAt: date(10) });
  const trialOwner = { id: trial.owner.id, name: trial.owner.name, isSuperAdmin: false } as never;
  assert.equal((await sessionMod.requireOutletSession(trial.store.id, trial.a.id, undefined, trialOwner)).outletId, trial.a.id);
  assert.ok((await stores.listOutletBilling(trial.store.id)).every(row => row.state === 'trial' && !row.blocked));
});

test('adding an outlet: free during a trial, otherwise it picks a plan and records the payment', async () => {
  const standard = await makePlan('Add outlet plan', 'RECURRING', 500_000);
  const deposit = await makePlan('Add outlet deposit', 'ONE_TIME', 1_000_000);
  // Trial: free, no payment, plan optional.
  const trial = await setupOrg('add-trial', { trialEndsAt: date(20) });
  const free = await outletsService.createOutlet({ storeId: trial.store.id, outletCode: 'ADD-TRIAL-1', displayName: 'Trial outlet', phone: '9876500010', billing: {} });
  assert.equal(await prisma.subscriptionPayment.count({ where: { storeId: trial.store.id } }), 0);
  assert.equal(free.storeId, trial.store.id);
  // A deposit-only organization (no term yet) can add outlets; a plan is then required.
  const paid = await setupOrg('add-paid', { depositPaidAt: date(-1) });
  await prisma.subscription.update({ where: { storeId: paid.store.id }, data: { planId: deposit.id } });
  await assert.rejects(outletsService.createOutlet({ storeId: paid.store.id, outletCode: 'ADD-PAID-0', displayName: 'No plan', phone: '9876500011', billing: {} }), /Choose a plan/);
  await assert.rejects(outletsService.createOutlet({ storeId: paid.store.id, outletCode: 'ADD-PAID-X', displayName: 'Wrong kind', phone: '9876500011', billing: { planId: deposit.id } }), /recurring plan/);
  const outlet = await outletsService.createOutlet({ storeId: paid.store.id, outletCode: 'ADD-PAID-1', displayName: 'Paid outlet', phone: '9876500012', createdById: admin.id,
    billing: { planId: standard.id, discountPercent: 50, note: 'Half price', paymentReceived: true, method: 'UPI', reference: 'abc' } });
  const [invoice] = await prisma.subscriptionPayment.findMany({ where: { outletId: outlet.id } });
  assert.deepEqual([invoice.amount, invoice.discountPercent, invoice.notes, invoice.planId, invoice.recordedById], [250_000, 50, 'Half price', standard.id, admin.id]);
  assert.ok((await prisma.outlet.findUniqueOrThrow({ where: { id: outlet.id } })).paidThroughDate);
  // Collect later: the outlet carries its plan but no term, so it is blocked until paid.
  const later = await outletsService.createOutlet({ storeId: paid.store.id, outletCode: 'ADD-PAID-2', displayName: 'Unpaid outlet', phone: '9876500013', billing: { planId: standard.id, paymentReceived: false } });
  const row = (await stores.listOutletBilling(paid.store.id)).find(item => item.id === later.id)!;
  assert.deepEqual([row.planName, row.state, row.blocked], ['Add outlet plan', 'awaiting', true]);
  // No subscription at all: nothing can be added.
  const bare = await prisma.store.create({ data: { id: 'store-ob-bare', name: 'Bare' } });
  await assert.rejects(outletsService.createOutlet({ storeId: bare.id, outletCode: 'ADD-BARE-1', displayName: 'Bare', phone: '9876500014' }), /trial or the setup deposit/);
});

test('an employee moves to an open outlet; with none left they are blocked with the paid-through date', async () => {
  const org = await setupOrg('employee', { outletA: date(-5), outletB: date(120), orgPaid: date(120) });
  const staff = await addEmployee(org, 'both', [org.a.id, org.b.id]);
  const { defaultOutletId, allowedOutlets } = await sessionMod.resolveAllowedOutlets(staff.id, org.store.id, Role.EMPLOYEE);
  assert.equal(defaultOutletId, org.b.id, 'the blocked outlet is not the default while another is open');
  assert.equal(allowedOutlets.find(outlet => outlet.id === org.a.id)?.billing.blocked, true);
  assert.equal((await sessionMod.getStoreAccessStatus(staff.id, org.store.id))?.blockedReason, undefined);
  const lone = await addEmployee(org, 'lone', [org.a.id]);
  const status = await sessionMod.getStoreAccessStatus(lone.id, org.store.id);
  assert.equal(status?.blockedReason, 'payment_lapsed');
  assert.equal(status?.paidThroughDate, iso(-5));
});

test('the organization status follows a current paid term even while a free trial is also running', async () => {
  const org = await setupOrg('paid-over-trial', { outletA: date(200), outletB: date(200), orgPaid: date(200), trialEndsAt: date(3) });
  assert.equal((await stores.listStores()).find(store => store.id === org.store.id)?.paymentState, 'active');
});

test('plan names on the organization come from its outlets', async () => {
  const standard = await makePlan('Derived plan', 'RECURRING', 500_000);
  const org = await setupOrg('derived', { outletA: date(100), outletB: date(100), orgPaid: date(100) });
  await prisma.outlet.updateMany({ where: { storeId: org.store.id }, data: { planId: standard.id } });
  const store = (await stores.listStores()).find(item => item.id === org.store.id)!;
  assert.equal(store.planName, 'Derived plan');
  assert.equal(store.annualFeeAmount, 500_000);
});

test('plans are one time or recurring: amount, kind, and usage counts', async () => {
  const plans = await import('../src/server/services/subscription-plans');
  const deposit = await plans.createPlan({ name: 'Plan form deposit', kind: 'ONE_TIME', amount: 1_000_000, notes: '' });
  assert.deepEqual([deposit.kind, deposit.amount, deposit.depositAmount, deposit.annualFeeAmount], ['ONE_TIME', 1_000_000, 1_000_000, 0]);
  const recurring = await plans.createPlan({ name: 'Plan form recurring', kind: 'RECURRING', amount: 500_000, billingCycle: 'HALF_YEARLY', notes: '' });
  assert.deepEqual([recurring.kind, recurring.amount, recurring.billingCycle, recurring.annualFeeAmount, recurring.depositAmount], ['RECURRING', 500_000, 'HALF_YEARLY', 500_000, 0]);
  const org = await setupOrg('plan-usage');
  await prisma.outlet.updateMany({ where: { storeId: org.store.id }, data: { planId: recurring.id } });
  assert.equal((await plans.getPlan(recurring.id))?.storeCount, 2, 'a recurring plan counts the outlets on it');
  assert.equal((await plans.getPlan(recurring.id))?.stores.length, 1, 'and lists their organization once');
  await assert.rejects(plans.deletePlan(recurring.id), /Move every store/);
  await assert.rejects(plans.archivePlan(recurring.id, deposit.id), /same type/, 'outlets cannot be moved onto a one time plan');
  await plans.archivePlan(recurring.id);
  assert.ok((await prisma.outlet.findMany({ where: { storeId: org.store.id } })).every(outlet => outlet.planId === null), 'archiving detaches outlets');
  await assert.rejects(plans.createPlan({ name: ' ', kind: 'ONE_TIME', amount: 1, notes: '' }), /plan name/);
});

test('onboarding to the first paid outlet: the whole flow in order', async () => {
  const deposit = await makePlan('Flow deposit', 'ONE_TIME', 1_000_000);
  const standard = await makePlan('Flow standard', 'RECURRING', 500_000);
  const created = await stores.onboardStore({
    storeName: 'Flow org', address: '', phone: '9876543210',
    owner: { mode: 'new', name: 'Flow Owner', password: 'password123', ownerPhone: testPhone('ob_flow_owner') },
    subscription: { mode: 'trial', trialEndDate: iso(10) }, markPaid: false,
  }, admin.id);
  // Trial: outlets are free.
  const trialOutlet = await outletsService.createOutlet({ storeId: created.id, outletCode: 'FLOW-1', displayName: 'Flow one', phone: '9876500020', billing: {} });
  assert.equal((await stores.listOutletBilling(created.id))[0].state, 'trial');
  // The trial ends (moved to the past): the deposit and the outlet are paid in one go.
  await prisma.subscription.update({ where: { storeId: created.id }, data: { trialEndsAt: date(-1) } });
  assert.equal((await stores.listOutletBilling(created.id))[0].blocked, true);
  const invoices = await stores.recordSubscriptionPayments(created.id, { deposit: { planId: deposit.id, discountPercent: 100, note: 'Waived' }, outlets: { outletIds: [trialOutlet.id], planId: standard.id }, method: 'CASH' }, admin.id);
  assert.deepEqual(invoices.map(invoice => [invoice.type, invoice.amount]), [['DEPOSIT', 0], ['RENEWAL', 500_000]]);
  assert.equal((await stores.listOutletBilling(created.id))[0].state, 'active');
});

test('a blocked outlet takes no new expenses and none can be marked paid, while its sibling is unaffected', async () => {
  const expenses = await import('../src/server/services/expenses');
  const org = await setupOrg('expenses', { outletA: date(-5), outletB: date(200), orgPaid: date(200) });
  const input = { title: 'Rent', category: 'Rent', amount: 100, due: iso(3), monthly: false };
  await assert.rejects(expenses.createExpense(org.store.id, { ...input, outletId: org.a.id }), (error: unknown) => error instanceof sessionMod.AuthError && error.reason === 'payment_lapsed');
  const ok = await expenses.createExpense(org.store.id, { ...input, outletId: org.b.id });
  assert.equal(ok.outletId, org.b.id);
  // An expense already on the outlet cannot be paid while it is blocked; renewing restores it.
  const stranded = await prisma.expense.create({ data: { storeId: org.store.id, outletId: org.a.id, title: 'Old', category: 'Rent', amount: 100, dueDate: date(1) } });
  await assert.rejects(expenses.markExpensePaid(org.store.id, stranded.id), (error: unknown) => error instanceof sessionMod.AuthError && error.reason === 'payment_lapsed');
  await stores.recordSubscriptionPayments(org.store.id, { outlets: { outletIds: [org.a.id], amount: 500_000 }, method: 'UPI' });
  assert.ok(await expenses.markExpensePaid(org.store.id, stranded.id));
});

test('a blocked outlet takes no orders, payments or status changes at the service, even for an owner', async () => {
  const orders = await import('../src/server/services/orders');
  const org = await setupOrg('orders', { outletA: date(-5), outletB: date(200), orgPaid: date(200) });
  const product = await prisma.product.create({ data: { storeId: org.store.id, name: 'Shirt', category: 'Wash', type: 'ITEM', price: 5_000, active: true } });
  const input = (key: string) => ({ idempotencyKey: key, customerName: 'C', phone: '9876500301', dueDate: iso(3), entries: [{ productId: product.id, quantity: 1 }] });
  const lapsed = (error: unknown) => error instanceof sessionMod.AuthError && error.reason === 'payment_lapsed';
  await assert.rejects(orders.createOrder(org.store.id, input('blocked-1'), org.owner.id, org.a.id), lapsed);
  const open = await orders.createOrder(org.store.id, input('open-1'), org.owner.id, org.b.id);
  assert.equal(open.outletId, org.b.id);
  // An order already on the outlet cannot move or be paid while it is blocked, and a replay still returns it.
  const stranded = await prisma.order.create({ data: { storeId: org.store.id, outletId: org.a.id, orderNumber: BigInt(9_000_000_001), customerName: 'S', phone: '9876500302', orderDate: date(-1), dueDate: date(2), idempotencyKey: 'stranded-1' } });
  const code = String(stranded.orderNumber);
  await assert.rejects(orders.updateOrderStatus(org.store.id, code, 'In Progress', org.owner.id), lapsed);
  await assert.rejects(orders.recordPayment(org.store.id, code, 100, 'Cash'), lapsed);
  await assert.rejects(orders.deliverOrderWithPayment(org.store.id, code, {}, org.owner.id), lapsed);
  await stores.recordSubscriptionPayments(org.store.id, { outlets: { outletIds: [org.a.id], amount: 500_000 }, method: 'UPI' });
  assert.equal((await orders.updateOrderStatus(org.store.id, code, 'In Progress', org.owner.id)).status, 'In Progress');
});
