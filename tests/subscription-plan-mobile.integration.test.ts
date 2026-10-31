import { testPhone } from './test-phone';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import type { NextRequest } from 'next/server';
import { PrismaClient } from '../src/generated/prisma/client';
import { generateSessionToken } from '../src/server/auth/token';

const socket = process.env.QA_SUBSCRIPTION_PG_SOCKET;
if (!socket?.startsWith('/tmp/el-subscription-test-') || !socket.endsWith('/socket')) {
  throw new Error('Run npm run test:subscription-payments to create an isolated PostgreSQL cluster.');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ host: socket, user: 'subscription_test', database: 'postgres', port: 5432, application_name: 'el-plan-mobile-test' }) });

let invoicesRoute: typeof import('../src/app/api/v1/subscription/invoices/route');
let syncRoute: typeof import('../src/app/api/v1/sync/status/route');
let plans: typeof import('../src/server/services/subscription-plans');
before(async () => {
  (globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
  invoicesRoute = await import('../src/app/api/v1/subscription/invoices/route');
  syncRoute = await import('../src/app/api/v1/sync/status/route');
  plans = await import('../src/server/services/subscription-plans');
});
after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
});

const req = (url: string, token: string) => new Request(url, { headers: { Authorization: `Bearer ${token}` } }) as unknown as NextRequest;
const tick = () => new Promise(resolve => setTimeout(resolve, 15));

async function setup(key: string, subscription: object) {
  const store = await prisma.store.create({ data: { id: `store-planm-${key}`, name: `PlanM ${key}` } });
  await prisma.subscription.create({ data: { storeId: store.id, ...subscription } as never });
  const member = async (role: 'OWNER' | 'EMPLOYEE') => {
    const user = await prisma.user.create({ data: { name: `${role} ${key}`, phone: testPhone(`planm_${role}_${key}`), passwordHash: 'x' } });
    await prisma.storeMembership.create({ data: { storeId: store.id, userId: user.id, role } });
    const token = generateSessionToken();
    await prisma.session.create({ data: { token, userId: user.id, credentialVersion: 1, expiresAt: new Date(Date.now() + 86_400_000) } });
    return token;
  };
  return { store, owner: await member('OWNER'), employee: await member('EMPLOYEE') };
}
const billing = async (token: string) => invoicesRoute.GET(req('http://localhost/api/v1/subscription/invoices', token));
const planOf = async (token: string) => { const res = await billing(token); assert.equal(res.status, 200); return (await res.json()).plan; };
const sync = async (token: string) => (await (await syncRoute.GET(req('http://localhost/api/v1/sync/status', token))).json()) as Record<string, string | null>;
const planInput = (name: string, depositAmount: number, annualFeeAmount: number) => ({ name, depositAmount, annualFeeAmount, depositWaivedByDefault: false } as never);

test('owner reads plan name, annual fee and deposit (paise); existing invoices field is unchanged', async () => {
  const plan = await plans.createPlan(planInput('Mobile Plan A', 10_000, 5_000));
  const org = await setup('a', { planId: plan.id, depositAmount: null, annualFeeAmount: null, paidThroughDate: new Date('2100-01-01') });
  const res = await billing(org.owner);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.plan, { planName: 'Mobile Plan A', annualFeeAmount: 5_000, depositAmount: 10_000 });
  assert.ok(Array.isArray(body.invoices));
});

test('custom terms return planName null with the stored amounts; a waived plan deposit is 0', async () => {
  const custom = await setup('custom', { depositAmount: 700, annualFeeAmount: 900, paidThroughDate: new Date('2100-01-01') });
  assert.deepEqual(await planOf(custom.owner), { planName: null, annualFeeAmount: 900, depositAmount: 700 });
  const waived = await plans.createPlan({ name: 'Mobile Waived', depositAmount: 4_000, annualFeeAmount: 2_000, depositWaivedByDefault: true } as never);
  const org = await setup('waived', { planId: waived.id, depositAmount: null, annualFeeAmount: null, paidThroughDate: new Date('2100-01-01') });
  assert.deepEqual(await planOf(org.owner), { planName: 'Mobile Waived', annualFeeAmount: 2_000, depositAmount: 0 });
});

test('employee gets 403 on the billing read, as before', async () => {
  const org = await setup('emp', { depositAmount: 0, annualFeeAmount: 0, paidThroughDate: new Date('2100-01-01') });
  assert.equal((await billing(org.employee)).status, 403);
});

test('a Super Admin plan change is visible with no other write, and planUpdatedAt moves', async () => {
  const plan = await plans.createPlan(planInput('Mobile Live', 10_000, 5_000));
  const org = await setup('live', { planId: plan.id, depositAmount: null, annualFeeAmount: null, paidThroughDate: new Date('2100-01-01') });
  const before = await sync(org.owner);
  assert.ok(before.planUpdatedAt && !Number.isNaN(Date.parse(before.planUpdatedAt)));
  const subRowBefore = await prisma.subscription.findUniqueOrThrow({ where: { storeId: org.store.id } });
  await tick();
  await plans.updatePlan(plan.id, planInput('Mobile Live', 12_000, 7_000));
  assert.deepEqual(await planOf(org.owner), { planName: 'Mobile Live', annualFeeAmount: 7_000, depositAmount: 12_000 });
  const subRowAfter = await prisma.subscription.findUniqueOrThrow({ where: { storeId: org.store.id } });
  assert.equal(subRowAfter.updatedAt.getTime(), subRowBefore.updatedAt.getTime(), 'the organization row itself was not written');
  const after = await sync(org.owner);
  assert.notEqual(after.planUpdatedAt, before.planUpdatedAt, 'plan edit moved planUpdatedAt');
  assert.ok(Date.parse(after.planUpdatedAt!) > Date.parse(before.planUpdatedAt!));
});

test('planUpdatedAt also moves when the organization changes plan or gets an override; employees get null', async () => {
  const one = await plans.createPlan(planInput('Mobile One', 1_000, 500));
  const two = await plans.createPlan(planInput('Mobile Two', 2_000, 900));
  const org = await setup('switch', { planId: one.id, depositAmount: null, annualFeeAmount: null, paidThroughDate: new Date('2100-01-01') });
  const first = (await sync(org.owner)).planUpdatedAt;
  await tick();
  await plans.changeStorePlan(org.store.id, { planId: two.id, depositAmount: 2_000, annualFeeAmount: 900 });
  const second = (await sync(org.owner)).planUpdatedAt;
  assert.notEqual(second, first);
  assert.deepEqual(await planOf(org.owner), { planName: 'Mobile Two', annualFeeAmount: 900, depositAmount: 2_000 });
  assert.equal((await sync(org.employee)).planUpdatedAt, null);
});

test('a restricted (expired) owner can still read plan and billing; a locked store is read-only but readable', async () => {
  const plan = await plans.createPlan(planInput('Mobile Lapsed', 3_000, 1_500));
  const lapsed = await setup('lapsed', { planId: plan.id, depositAmount: null, annualFeeAmount: null, paidThroughDate: new Date('2020-01-01') });
  assert.deepEqual(await planOf(lapsed.owner), { planName: 'Mobile Lapsed', annualFeeAmount: 1_500, depositAmount: 3_000 });
  const stamp = await sync(lapsed.owner);
  assert.ok(stamp.planUpdatedAt);
  const locked = await setup('locked', { planId: plan.id, depositAmount: null, annualFeeAmount: null, paidThroughDate: new Date('2100-01-01') });
  await prisma.store.update({ where: { id: locked.store.id }, data: { status: 'LOCKED' } });
  assert.equal((await billing(locked.owner)).status, 200);
});
