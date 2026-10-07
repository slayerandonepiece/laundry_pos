import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const socket = process.env.QA_SUBSCRIPTION_PG_SOCKET;
if (!socket?.startsWith('/tmp/el-subscription-test-') || !socket.endsWith('/socket')) {
  throw new Error('Run npm run test:subscription-payments to create an isolated PostgreSQL cluster.');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ host: socket, user: 'subscription_test', database: 'postgres', port: 5432, application_name: 'el-sub-terms-test' }) });
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;

let stores: typeof import('../src/server/services/stores');
let plans: typeof import('../src/server/services/subscription-plans');
before(async () => {
  stores = await import('../src/server/services/stores');
  plans = await import('../src/server/services/subscription-plans');
});
after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
});

const makePlan = (key: string, over: Partial<{ depositAmount: number; annualFeeAmount: number; depositWaivedByDefault: boolean }> = {}) =>
  plans.createPlan({ name: `Terms ${key}`, depositAmount: 10_000, annualFeeAmount: 5_000, depositWaivedByDefault: false, ...over } as never);
async function makeStore(key: string, subscription: object) {
  const store = await prisma.store.create({ data: { id: `store-terms-${key}`, name: `Terms ${key}` } });
  await prisma.subscription.create({ data: { storeId: store.id, ...subscription } as never });
  return store.id;
}
const terms = async (storeId: string) => { const s = (await stores.getStore(storeId))!; return [s.depositAmount, s.annualFeeAmount]; };

test('an organization on a plan follows the plan price live, with nothing stored per organization', async () => {
  const plan = await makePlan('live');
  const a = await makeStore('live-a', { planId: plan.id, depositAmount: null, annualFeeAmount: null });
  const b = await makeStore('live-b', { planId: plan.id, depositAmount: null, annualFeeAmount: null });
  assert.deepEqual(await terms(a), [10_000, 5_000]);
  await plans.updatePlan(plan.id, { name: plan.name, depositAmount: 20_000, annualFeeAmount: 8_000, depositWaivedByDefault: false } as never);
  assert.deepEqual([await terms(a), await terms(b)], [[20_000, 8_000], [20_000, 8_000]]);
  const row = await prisma.subscription.findUniqueOrThrow({ where: { storeId: a } });
  assert.deepEqual([row.depositAmount, row.annualFeeAmount], [null, null]);
});

test('an override, a waived-by-default plan, and custom terms are respected', async () => {
  const plan = await makePlan('override', { depositWaivedByDefault: true });
  const overridden = await makeStore('ov', { planId: plan.id, depositAmount: null, annualFeeAmount: 3_000 });
  const custom = await makeStore('custom', { depositAmount: 700, annualFeeAmount: 900 });
  assert.deepEqual(await terms(overridden), [0, 3_000], 'waived plan deposit is zero, annual fee is the stored override');
  await plans.updatePlan(plan.id, { name: plan.name, depositAmount: 1, annualFeeAmount: 9_999, depositWaivedByDefault: true } as never);
  assert.deepEqual(await terms(overridden), [0, 3_000]);
  assert.deepEqual(await terms(custom), [700, 900], 'custom terms never follow a plan');
});

test('changing plan stores a price only when it differs from the plan; a paid deposit stays frozen', async () => {
  const plan = await makePlan('change');
  const other = await makePlan('change2', { depositAmount: 50_000, annualFeeAmount: 30_000 });
  const id = await makeStore('change', { depositAmount: 100, annualFeeAmount: 200 });
  await plans.changeStorePlan(id, { planId: plan.id, depositAmount: 10_000, annualFeeAmount: 5_000 });
  let row = await prisma.subscription.findUniqueOrThrow({ where: { storeId: id } });
  assert.deepEqual([row.depositAmount, row.annualFeeAmount], [null, null], 'equal to the plan: follow it');
  await plans.changeStorePlan(id, { planId: plan.id, annualFeeAmount: 4_000 });
  row = await prisma.subscription.findUniqueOrThrow({ where: { storeId: id } });
  assert.deepEqual([row.depositAmount, row.annualFeeAmount], [null, 4_000], 'a different fee is a negotiated override');

  await stores.recordSubscriptionPayment(id, { type: 'DEPOSIT', amount: 10_000, method: 'CASH' } as never);
  row = await prisma.subscription.findUniqueOrThrow({ where: { storeId: id } });
  assert.equal(row.depositAmount, 10_000, 'paying the deposit freezes its amount');
  await plans.updatePlan(plan.id, { name: plan.name, depositAmount: 99_000, annualFeeAmount: 5_000, depositWaivedByDefault: false } as never);
  assert.equal((await terms(id))[0], 10_000, 'a later plan edit does not rewrite a paid deposit');
  await plans.changeStorePlan(id, { planId: other.id });
  assert.equal((await terms(id))[0], 10_000, 'nor does moving to another plan');
});

test('archiving a plan and detaching its organizations writes down their current price', async () => {
  const plan = await makePlan('archive');
  const id = await makeStore('archive', { planId: plan.id, depositAmount: null, annualFeeAmount: null });
  await plans.archivePlan(plan.id);
  const row = await prisma.subscription.findUniqueOrThrow({ where: { storeId: id } });
  assert.deepEqual([row.planId, row.depositAmount, row.annualFeeAmount], [null, 10_000, 5_000]);
  assert.deepEqual(await terms(id), [10_000, 5_000]);
});

test('the migration clears only prices identical to the plan and keeps overrides, custom terms and paid deposits', async () => {
  const plan = await makePlan('mig');
  const same = await makeStore('mig-same', { planId: plan.id, depositAmount: 10_000, annualFeeAmount: 5_000 });
  const diff = await makeStore('mig-diff', { planId: plan.id, depositAmount: 10_000, annualFeeAmount: 4_500 });
  const paid = await makeStore('mig-paid', { planId: plan.id, depositAmount: 10_000, annualFeeAmount: 5_000, depositPaidAt: new Date('2026-01-01') });
  const custom = await makeStore('mig-custom', { depositAmount: 10_000, annualFeeAmount: 5_000 });
  const sql = readFileSync(new URL('../prisma/migrations/20261007160000_subscription_terms_follow_plan/migration.sql', import.meta.url), 'utf8');
  await prisma.$executeRawUnsafe(sql);
  const read = async (storeId: string) => { const r = await prisma.subscription.findUniqueOrThrow({ where: { storeId } }); return [r.depositAmount, r.annualFeeAmount]; };
  assert.deepEqual(await read(same), [null, null]);
  assert.deepEqual(await read(diff), [null, 4_500]);
  assert.deepEqual(await read(paid), [10_000, null], 'a paid deposit stays frozen');
  assert.deepEqual(await read(custom), [10_000, 5_000]);
});
