import { testPhone } from './test-phone';
import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { NextRequest } from 'next/server';
import { PrismaClient, Role } from '../src/generated/prisma/client';
import { hashPassword } from '../src/server/auth/password';
import { generateSessionToken } from '../src/server/auth/token';
import { parseCalendarDate, todayIST } from '../src/server/dates';

const socket = process.env.QA_SUBSCRIPTION_PG_SOCKET;
if (!socket?.startsWith('/tmp/el-subscription-test-') || !socket.endsWith('/socket')) {
  throw new Error('Run npm run test:subscription-payments to create an isolated PostgreSQL cluster.');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({
  host: socket, user: 'subscription_test', database: 'postgres', port: 5432,
  application_name: 'el-billing-pending-test',
}) });
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
let products: typeof import('../src/app/api/v1/products/route');
let rollups: typeof import('../src/app/api/v1/dashboard/rollups/route');
let f: Awaited<ReturnType<typeof fixture>>;
const originalFlag = process.env.MOBILE_BLOCK_TERMS_NOT_SET;

before(async () => {
  products = await import('../src/app/api/v1/products/route');
  rollups = await import('../src/app/api/v1/dashboard/rollups/route');
  f = await fixture();
});
afterEach(() => {
  if (originalFlag === undefined) delete process.env.MOBILE_BLOCK_TERMS_NOT_SET;
  else process.env.MOBILE_BLOCK_TERMS_NOT_SET = originalFlag;
});
after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
});
async function fixture() {
  const store = await prisma.store.create({ data: { id: 'store-billing-pending', name: 'Billing pending' } });
  await prisma.subscription.create({ data: { storeId: store.id, depositAmount: 0, annualFeeAmount: 0 } });
  const user = await prisma.user.create({ data: { name: 'Owner', phone: testPhone('billing_pending_owner'), passwordHash: await hashPassword('password123') } });
  await prisma.storeMembership.create({ data: { storeId: store.id, userId: user.id, role: Role.OWNER } });
  const token = generateSessionToken();
  await prisma.session.create({ data: { userId: user.id, token, credentialVersion: user.credentialVersion, expiresAt: new Date(Date.now() + 86400000) } });
  return { store, token };
}
function req(method: string, path: string, body?: object) {
  return new NextRequest(`http://localhost/api/v1/${path}`, {
    method, headers: { authorization: `Bearer ${f.token}`, 'x-store-id': f.store.id, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const write = () => products.POST(req('POST', 'products', { id: 'billing-pending-product', name: 'Wash', category: 'Laundry', type: 'item', price: 100, active: true }));
const read = () => rollups.GET(req('GET', `dashboard/rollups?from=${todayIST()}&to=${todayIST()}`));

test('billing pending is default-off; enabled flag blocks writes but permits restricted reads', async () => {
  delete process.env.MOBILE_BLOCK_TERMS_NOT_SET;
  assert.equal((await read()).status, 200);
  assert.equal((await write()).status, 201);
  process.env.MOBILE_BLOCK_TERMS_NOT_SET = 'true';
  const blocked = await write();
  assert.equal(blocked.status, 403);
  assert.equal((await blocked.json()).reason, 'billing_pending');
  assert.equal((await read()).status, 200);
});

test('trial, paid-through date, and active override each allow writes while flag is enabled', async () => {
  process.env.MOBILE_BLOCK_TERMS_NOT_SET = '1';
  const subscription = () => prisma.subscription.update({ where: { storeId: f.store.id }, data: { trialEndsAt: parseCalendarDate('2100-01-01') } });
  await subscription();
  assert.equal((await write()).status, 201);
  await prisma.subscription.update({ where: { storeId: f.store.id }, data: { trialEndsAt: null, paidThroughDate: parseCalendarDate('2100-01-01') } });
  assert.equal((await write()).status, 201);
  await prisma.subscription.update({ where: { storeId: f.store.id }, data: { paidThroughDate: null } });
  await prisma.store.update({ where: { id: f.store.id }, data: { accessGrantedUntil: parseCalendarDate('2100-01-01') } });
  assert.equal((await write()).status, 201);
});
