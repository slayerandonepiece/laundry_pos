import { testPhone } from './test-phone';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../src/generated/prisma/client';
import type { OnboardStoreInput } from '../src/features/super-admin/types';
import type { recordSubscriptionPayment as RecordPayment } from '../src/server/services/stores';

const socket = process.env.QA_SUBSCRIPTION_PG_SOCKET;
if (!socket?.startsWith('/tmp/el-subscription-test-') || !socket.endsWith('/socket')) {
  throw new Error('Run npm run test:subscription-payments to create an isolated PostgreSQL cluster.');
}
const connection = { host: socket, user: 'subscription_test', database: 'postgres', port: 5432 };
const control = new Pool({ ...connection, max: 2 });
const prisma = new PrismaClient({
  adapter: new PrismaPg({ ...connection, max: 5, application_name: 'el-subscription-service-test' }),
  transactionOptions: { timeout: 15_000, maxWait: 15_000 },
});
let recordSubscriptionPayment: typeof RecordPayment;
let onboardStore: typeof import('../src/server/services/stores').onboardStore;
const iso = (date: Date | null) => date?.toISOString().slice(0, 10);
const initialDate = new Date('2100-03-01T00:00:00.000Z');

before(async () => {
  // Use the application's existing singleton hook before importing the actual
  // service. Only the driver changes (local PostgreSQL); no query or business
  // logic is mocked. No production module or DATABASE_URL is modified.
  (globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
  ({ recordSubscriptionPayment, onboardStore } = await import('../src/server/services/stores'));
});

after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
  await control.end();
});

async function fixture(id: string, withSubscription = true) {
  await prisma.store.create({
    data: {
      id, name: `Subscription test ${id}`,
      ...(withSubscription ? { subscription: { create: { depositAmount: 100_000, annualFeeAmount: 50_000, paidThroughDate: initialDate } } } : {}),
    },
  });
}

async function waitForTwoBlockedCalls() {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const { rows } = await control.query<{ waiting: number }>(`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE datname = current_database()
        AND application_name = 'el-subscription-service-test'
        AND wait_event_type = 'Lock'
    `);
    if (rows[0].waiting === 2) return;
    await delay(20);
  }
  throw new Error('Both real renewal transactions did not reach the lock barrier.');
}

test('two overlapping renewal calls grant two consecutive terms and two invoices', async () => {
  const storeId = 'concurrent-renewals';
  await fixture(storeId);
  const blocker = await control.connect();
  await blocker.query('BEGIN');
  await blocker.query('SELECT id FROM subscriptions WHERE "storeId" = $1 FOR UPDATE', [storeId]);

  // Before the fix both calls read the old date, then block on UPDATE.
  // After the fix both block on SELECT FOR UPDATE, before reading the date.
  const pending = Promise.allSettled([
    recordSubscriptionPayment(storeId, { type: 'RENEWAL', amount: 50_000, method: 'UPI', notes: 'First concurrent payment' }),
    recordSubscriptionPayment(storeId, { type: 'RENEWAL', amount: 50_000, method: 'CASH', notes: 'Second concurrent payment' }),
  ]);
  let barrierError: unknown;
  try {
    await waitForTwoBlockedCalls();
  } catch (error) {
    barrierError = error;
  } finally {
    await blocker.query('COMMIT');
    blocker.release();
  }
  const results = await pending;
  if (barrierError) throw barrierError;
  assert.ok(results.every(result => result.status === 'fulfilled'), JSON.stringify(results));

  const subscription = await prisma.subscription.findUniqueOrThrow({ where: { storeId } });
  const invoices = await prisma.subscriptionPayment.findMany({ where: { storeId }, orderBy: { coversFrom: 'asc' } });
  const periods = invoices.map(invoice => [iso(invoice.coversFrom), iso(invoice.coversTo)]);
  console.log(JSON.stringify({ invoices: invoices.length, periods, paidThrough: iso(subscription.paidThroughDate) }));
  assert.equal(invoices.length, 2);
  assert.equal(new Set(invoices.map(invoice => invoice.invoiceSeq)).size, 2);
  assert.equal(invoices.reduce((sum, invoice) => sum + invoice.amount, 0), 100_000);
  assert.deepEqual(periods, [['2100-03-01', '2101-03-01'], ['2101-03-01', '2102-03-01']]);
  assert.equal(iso(subscription.paidThroughDate), '2102-03-01');
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const persisted = invoices.find(invoice => invoice.invoiceSeq === result.value.invoiceSeq)!;
    assert.equal(result.value.coversFrom, iso(persisted.coversFrom));
    assert.equal(result.value.coversTo, iso(persisted.coversTo));
    assert.equal(result.value.storeName, `Subscription test ${storeId}`);
  }
});

test('deposit records an invoice without advancing the renewal date', async () => {
  const storeId = 'deposit-only';
  await fixture(storeId);
  const invoice = await recordSubscriptionPayment(storeId, { type: 'DEPOSIT', amount: 100_000, method: 'CASH' });
  const subscription = await prisma.subscription.findUniqueOrThrow({ where: { storeId } });
  assert.equal(iso(subscription.paidThroughDate), iso(initialDate));
  assert.equal(iso(subscription.depositPaidAt), invoice.paidAt);
  assert.equal(invoice.coversFrom, undefined);
  assert.equal(invoice.coversTo, undefined);
  assert.equal(await prisma.subscriptionPayment.count({ where: { storeId } }), 1);
});

test('missing subscription rejects without creating any invoice', async () => {
  const storeId = 'without-subscription';
  await fixture(storeId, false);
  await assert.rejects(recordSubscriptionPayment(storeId, { type: 'RENEWAL', amount: 50_000, method: 'UPI' }), /no subscription yet/);
  assert.equal(await prisma.subscriptionPayment.count({ where: { storeId } }), 0);
});

test('invoice write failure rolls back the paid-through update', async () => {
  const storeId = 'invoice-failure';
  await fixture(storeId);
  // A real PostgreSQL failure after the service's subscription UPDATE.
  await control.query(`
    CREATE FUNCTION reject_test_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW."storeId" = 'invoice-failure' THEN RAISE EXCEPTION 'test invoice rejected'; END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER reject_test_invoice BEFORE INSERT ON subscription_payments
      FOR EACH ROW EXECUTE FUNCTION reject_test_invoice();
  `);
  try {
    await assert.rejects(recordSubscriptionPayment(storeId, { type: 'RENEWAL', amount: 50_000, method: 'UPI' }), /test invoice rejected/);
    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { storeId } });
    assert.equal(iso(subscription.paidThroughDate), iso(initialDate));
    assert.equal(await prisma.subscriptionPayment.count({ where: { storeId } }), 0);
  } finally {
    await control.query('DROP TRIGGER reject_test_invoice ON subscription_payments; DROP FUNCTION reject_test_invoice();');
  }
});


async function onboardingFixture(suffix: string): Promise<{ adminId: string; input: OnboardStoreInput }> {
  const admin = await prisma.user.create({ data: { name: 'Onboarding admin', phone: testPhone(`onboard_admin_${suffix}`), passwordHash: 'unused-test-hash', isSuperAdmin: true } });
  const plan = await prisma.subscriptionPlan.create({ data: { name: `Onboarding plan ${suffix}`, depositAmount: 10_000, annualFeeAmount: 5_000 } });
  return {
    adminId: admin.id,
    input: {
      storeName: `Onboarding regression ${suffix}`, address: '', phone: '+91 80000 00001',
      owner: { mode: 'new', name: 'New owner', password: 'temporary-password1', ownerPhone: testPhone(`onboard_owner_${suffix}`) },
      subscription: { mode: 'plan', planId: plan.id, discountAmount: 0 }, markPaid: false,
    },
  };
}

test('onboarding rejects missing organization phone without creating organization or owner', async () => {
  const { adminId, input } = await onboardingFixture('org_phone');
  for (const phone of ['', '   ']) {
    await assert.rejects(onboardStore({ ...input, phone }, adminId), /Enter a contact phone number for this organization/);
  }
  assert.equal(await prisma.store.count({ where: { name: input.storeName } }), 0);
  assert.equal(await prisma.user.count({ where: { phone: testPhone('onboard_owner_org_phone') } }), 0);
});

test('onboarding requires a separate phone for new owners', async () => {
  const { adminId, input } = await onboardingFixture('owner_phone');
  assert.equal(input.owner.mode, 'new');
  if (input.owner.mode !== 'new') throw new Error('Expected new-owner fixture.');
  for (const ownerPhone of ['', '   ', undefined]) {
    const invalid = { ...input, owner: { ...input.owner, ownerPhone } } as OnboardStoreInput;
    await assert.rejects(onboardStore(invalid, adminId), /phone|Invalid input/);
  }
  assert.equal(await prisma.store.count({ where: { name: input.storeName } }), 0);
  assert.equal(await prisma.user.count({ where: { phone: input.owner.ownerPhone } }), 0);
});

test('onboarding persists distinct organization and owner phones and enables only active payment methods', async () => {
  const { adminId, input } = await onboardingFixture('persist_phones');
  const active = await prisma.platformPaymentMethod.create({ data: { code: 'ONBOARD_ACTIVE_REGRESSION', name: 'Onboarding active', active: true } });
  const inactive = await prisma.platformPaymentMethod.create({ data: { code: 'ONBOARD_INACTIVE_REGRESSION', name: 'Onboarding inactive', active: false } });
  const store = await onboardStore(input, adminId);
  const organization = await prisma.store.findUniqueOrThrow({ where: { id: store.id }, include: { memberships: { include: { user: true } }, subscription: true, organizationPaymentMethods: true } });
  assert.equal(organization.phone, input.phone);
  assert.equal(organization.memberships[0].user.phone, input.owner.mode === 'new' ? input.owner.ownerPhone : '');
  assert.equal(store.ownerPhone, input.owner.mode === 'new' ? input.owner.ownerPhone : '');
  assert.equal(organization.organizationPaymentMethods.find(method => method.platformPaymentMethodId === active.id)?.enabled, true);
  assert.equal(organization.organizationPaymentMethods.some(method => method.platformPaymentMethodId === inactive.id), false);
  assert.equal(organization.subscription?.paidThroughDate, null);
  assert.equal(await prisma.subscriptionPayment.count({ where: { storeId: store.id } }), 0);
});

test('existing-owner onboarding preserves contact phone and needs no new-owner phone', async () => {
  const { adminId, input } = await onboardingFixture('existing_owner');
  for (const phone of ['917000000003', '917000000004']) {
    const owner = await prisma.user.create({ data: { name: 'Existing owner', phone, passwordHash: 'unused-test-hash' } });
    const store = await onboardStore({ ...input, storeName: `${input.storeName} ${owner.id}`, owner: { mode: 'existing', userId: owner.id } }, adminId);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).phone, phone);
    assert.equal(store.phone, input.phone);
    assert.equal(store.ownerId, owner.id);
  }
});

test('payment enablement failure rolls back new organization and owner atomically', async () => {
  const { adminId, input } = await onboardingFixture('atomic_failure');
  await prisma.platformPaymentMethod.create({ data: { code: 'ONBOARD_ROLLBACK_REGRESSION', name: 'Onboarding rollback', active: true } });
  await control.query(`CREATE FUNCTION reject_onboarding_payment_method() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM stores WHERE id = NEW."storeId" AND name = 'Onboarding regression atomic_failure') THEN
        RAISE EXCEPTION 'forced onboarding payment enablement failure';
      END IF;
      RETURN NEW;
    END;
  $$`);
  await control.query('CREATE TRIGGER reject_onboarding_method BEFORE INSERT ON organization_payment_methods FOR EACH ROW EXECUTE FUNCTION reject_onboarding_payment_method()');
  try {
    await assert.rejects(onboardStore(input, adminId), /forced onboarding payment enablement failure/);
    assert.equal(await prisma.store.count({ where: { name: input.storeName } }), 0);
    assert.equal(await prisma.user.count({ where: { phone: testPhone('onboard_owner_atomic_failure') } }), 0);
  } finally {
    await control.query('DROP TRIGGER reject_onboarding_method ON organization_payment_methods');
    await control.query('DROP FUNCTION reject_onboarding_payment_method()');
  }
});


test('onboarding accepts discounts above the deposit and total, including waived deposits', async () => {
  for (const [suffix, waived, discount, expectedDeposit, expectedRenewal] of [
    ['discount_fee', false, 12000, 0, 3000],
    ['discount_all', false, 20000, 0, 0],
    ['discount_waived', true, 3000, 0, 2000],
  ] as const) {
    const { adminId, input } = await onboardingFixture(suffix);
    if (input.subscription.mode !== 'plan') throw new Error('Expected plan fixture.');
    await prisma.subscriptionPlan.update({ where: { id: input.subscription.planId }, data: { depositWaivedByDefault: waived } });
    const store = await onboardStore({ ...input, subscription: { ...input.subscription, discountAmount: discount, chargeDepositAnyway: true }, markPaid: true }, adminId);
    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { storeId: store.id } });
    assert.equal(subscription.discountAmount, discount);
    assert.equal(subscription.depositAmount, waived ? 0 : 10000);
    const payments = await prisma.subscriptionPayment.findMany({ where: { storeId: store.id } });
    assert.equal(payments.find(payment => payment.type === 'DEPOSIT')?.amount ?? 0, expectedDeposit);
    assert.equal(payments.find(payment => payment.type === 'RENEWAL')?.amount ?? 0, expectedRenewal);
  }
});

test('trial onboarding validates real future dates and creates no paid term or invoice', async () => {
  const { todayIST, addDays } = await import('../src/server/dates');
  const { adminId, input } = await onboardingFixture('free_trial');
  for (const trialEndDate of ['2026-02-31', todayIST(), '2020-01-01', 'abc']) {
    await assert.rejects(onboardStore({ ...input, subscription: { mode: 'trial', trialEndDate } }, adminId), /date/i);
  }
  await assert.rejects(onboardStore({ ...input, subscription: { mode: 'trial', trialEndDate: addDays(todayIST(), 30) }, markPaid: true }, adminId), /free trial/i);
  const trialEndDate = addDays(todayIST(), 30);
  const store = await onboardStore({ ...input, subscription: { mode: 'trial', trialEndDate } }, adminId);
  const subscription = await prisma.subscription.findUniqueOrThrow({ where: { storeId: store.id } });
  assert.equal(iso(subscription.trialEndsAt), trialEndDate);
  assert.equal(subscription.paidThroughDate, null);
  assert.equal(subscription.planId, null);
  assert.equal(await prisma.subscriptionPayment.count({ where: { storeId: store.id } }), 0);
});

test('custom onboarding preserves negotiated terms and optional payment metadata', async () => {
  const { adminId, input } = await onboardingFixture('custom_terms');
  const store = await onboardStore({ ...input, subscription: { mode: 'custom', depositAmount: 23400, annualFeeAmount: 56700 }, markPaid: true, paymentMethod: 'CASH', paymentReference: 'custom-reference', notes: 'Negotiated' }, adminId);
  const subscription = await prisma.subscription.findUniqueOrThrow({ where: { storeId: store.id } });
  assert.equal(subscription.depositAmount, 23400);
  assert.equal(subscription.annualFeeAmount, 56700);
  assert.equal(subscription.notes, 'Negotiated');
  assert.ok(subscription.paidThroughDate);
  const invoices = await prisma.subscriptionPayment.findMany({ where: { storeId: store.id } });
  assert.equal(invoices.length, 2);
  assert.equal(invoices.reduce((sum, invoice) => sum + invoice.amount, 0), 80100);
  assert.ok(invoices.every(invoice => invoice.method === 'CASH' && invoice.reference === 'custom-reference' && invoice.recordedById === adminId));
});

test('plan onboarding records UPI invoices atomically and leaves unpaid mode unchanged', async () => {
  const { adminId, input } = await onboardingFixture('paid_plan');
  const store = await onboardStore({ ...input, markPaid: true, paymentMethod: 'UPI', paymentReference: 'upi-reference' }, adminId);
  const invoices = await prisma.subscriptionPayment.findMany({ where: { storeId: store.id } });
  assert.equal(invoices.length, 2);
  assert.ok(invoices.every(invoice => invoice.method === 'UPI' && invoice.reference === 'upi-reference' && invoice.recordedById === adminId));
  assert.ok(invoices.find(invoice => invoice.type === 'RENEWAL')?.coversTo);
});

test('onboarding contact/name/password validation accepts formatted phones and rejects invalid input', async () => {
  const { adminId, input } = await onboardingFixture('validated_owner');
  if (input.owner.mode !== 'new') throw new Error('Expected new owner.');
  for (const phone of ['abc', '12345', '+1234567890123456']) {
    await assert.rejects(onboardStore({ ...input, phone }, adminId), /phone/);
    await assert.rejects(onboardStore({ ...input, owner: { ...input.owner, ownerPhone: phone } }, adminId), /phone/);
  }
  for (const password of ['password', '12345678', 'pass123']) {
    await assert.rejects(onboardStore({ ...input, owner: { ...input.owner, password } }, adminId), /8 characters/);
  }
  await assert.rejects(onboardStore({ ...input, owner: { ...input.owner, name: 'A' } }, adminId), /2 characters/);
  const store = await onboardStore({ ...input, phone: '+91 98765 43210', owner: { ...input.owner, ownerPhone: '+91 98765 43211', password: 'pass1234' } }, adminId);
  assert.equal(store.phone, '+91 98765 43210');
});

test('no-deposit plan stores zero, and default trial survives update and duplication', async () => {
  const plans = await import('../src/server/services/subscription-plans');
  const plan = await plans.createPlan({ name: 'No deposit regression', depositAmount: 99999, annualFeeAmount: 50000, depositWaivedByDefault: true, defaultTrialDays: 30, notes: '' });
  assert.equal(plan.depositAmount, 0);
  assert.equal(plan.defaultTrialDays, 30);
  const duplicate = await plans.duplicatePlan(plan.id);
  assert.equal(duplicate.defaultTrialDays, 30);
  assert.equal(duplicate.depositAmount, 0);
  await assert.rejects(plans.updatePlan(plan.id, { name: plan.name, depositAmount: 0, annualFeeAmount: 1, depositWaivedByDefault: true, defaultTrialDays: -1, notes: '' }));
});
