import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../src/generated/prisma/client';
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
const iso = (date: Date | null) => date?.toISOString().slice(0, 10);
const initialDate = new Date('2100-03-01T00:00:00.000Z');

before(async () => {
  // Use the application's existing singleton hook before importing the actual
  // service. Only the driver changes (local PostgreSQL); no query or business
  // logic is mocked. No production module or DATABASE_URL is modified.
  (globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
  ({ recordSubscriptionPayment } = await import('../src/server/services/stores'));
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
