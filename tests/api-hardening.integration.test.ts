import { testPhone } from './test-phone';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { NextRequest } from 'next/server';
import { PrismaClient, Role, OutletStatus } from '../src/generated/prisma/client';
import { hashPassword } from '../src/server/auth/password';
import { generateSessionToken } from '../src/server/auth/token';
import { todayIST } from '../src/server/dates';

const socket = process.env.QA_SUBSCRIPTION_PG_SOCKET;
if (!socket?.startsWith('/tmp/el-subscription-test-') || !socket.endsWith('/socket')) {
  throw new Error('Run npm run test:subscription-payments to create an isolated PostgreSQL cluster.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    host: socket,
    user: 'subscription_test',
    database: 'postgres',
    port: 5432,
    max: 10,
    application_name: 'el-api-hardening-test',
  }),
});
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;

let rollupsRoute: typeof import('../src/app/api/v1/dashboard/rollups/route');
let reconcileRoute: typeof import('../src/app/api/v1/dashboard/reconcile/route');
let dashboardRoute: typeof import('../src/app/api/v1/dashboard/route');
let orders: typeof import('../src/server/services/orders');
let f: Awaited<ReturnType<typeof fixture>>;

before(async () => {
  orders = await import('../src/server/services/orders');
  rollupsRoute = await import('../src/app/api/v1/dashboard/rollups/route');
  reconcileRoute = await import('../src/app/api/v1/dashboard/reconcile/route');
  dashboardRoute = await import('../src/app/api/v1/dashboard/route');
  f = await fixture();
});

after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
});

async function login(userId: string) {
  const token = generateSessionToken();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await prisma.session.create({
    data: { id: `sess-hard-${token.slice(0, 16)}`, userId, token, credentialVersion: user.credentialVersion, expiresAt: new Date(Date.now() + 86400000) },
  });
  return token;
}

async function fixture() {
  const store = await prisma.store.create({ data: { id: 'store-api-hardening', name: 'API hardening' } });
  await prisma.subscription.create({
    data: { storeId: store.id, depositAmount: 0, annualFeeAmount: 0, paidThroughDate: new Date('2100-01-01') },
  });
  const [outletA, outletB] = await Promise.all(
    ['A', 'B'].map(n => prisma.outlet.create({ data: { storeId: store.id, outletCode: `HARD-${n}`, displayName: `Outlet ${n}`, status: OutletStatus.ACTIVE } })),
  );
  const hash = await hashPassword('password123');
  const user = (key: string) => prisma.user.create({ data: { name: key, phone: testPhone(`api_hardening_${key}`), passwordHash: hash } });
  const [owner, empA, empB, empNone] = await Promise.all([user('owner'), user('empA'), user('empB'), user('empNone')]);
  await prisma.storeMembership.createMany({
    data: [
      { userId: owner.id, storeId: store.id, role: Role.OWNER, active: true },
      { userId: empA.id, storeId: store.id, role: Role.EMPLOYEE, active: true },
      { userId: empB.id, storeId: store.id, role: Role.EMPLOYEE, active: true },
      { userId: empNone.id, storeId: store.id, role: Role.EMPLOYEE, active: true },
    ],
  });
  await prisma.outletMembership.createMany({ data: [
    { userId: empA.id, outletId: outletA.id, active: true, isDefault: true },
    { userId: empB.id, outletId: outletB.id, active: true, isDefault: true },
  ] });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Hardening wash', category: 'LAUNDRY', type: 'ITEM', price: 100, active: true } });
  await prisma.dailyOutletSummary.createMany({
    data: [outletA, outletB].map(o => ({
      storeId: store.id, outletId: o.id, businessDate: new Date(`${todayIST()}T00:00:00.000Z`),
      ordersCreatedCount: 1, grossOrderAmount: 100, expensesAmount: 40,
    })),
  });
  return {
    store, outletA, outletB, owner, empA, empB, empNone, product,
    tokens: { owner: await login(owner.id), empA: await login(empA.id), empNone: await login(empNone.id) },
  };
}

function get(path: string, token: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'x-store-id': f.store.id, ...headers },
  });
}

test('H1: employee rollups require an outlet header, never fall back to store-wide, and hide expenses', async () => {
  const today = todayIST();
  const q = `/api/v1/dashboard/rollups?from=${today}&to=${today}`;
  // No header: refuse instead of using allowedOutlets[0].
  assert.equal((await rollupsRoute.GET(get(q, f.tokens.empA))).status, 403);
  // Employee with zero outlet memberships: refuse even with a header.
  assert.equal((await rollupsRoute.GET(get(q, f.tokens.empNone, { 'x-outlet-id': f.outletA.id }))).status, 403);
  assert.equal((await rollupsRoute.GET(get(q, f.tokens.empNone))).status, 403);
  // Another outlet of the same store: refuse.
  assert.equal((await rollupsRoute.GET(get(q, f.tokens.empA, { 'x-outlet-id': f.outletB.id }))).status, 403);
  // Own outlet: only that outlet, expensesAmount stripped.
  const res = await rollupsRoute.GET(get(q, f.tokens.empA, { 'x-outlet-id': f.outletA.id }));
  assert.equal(res.status, 200);
  const rows = await res.json();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].outletId, f.outletA.id);
  assert.equal(rows[0].grossOrderAmount, 100);
  assert.equal('expensesAmount' in rows[0], false);
  // Owner keeps expensesAmount and may omit the outlet.
  const ownerRows = await (await rollupsRoute.GET(get(q, f.tokens.owner))).json();
  assert.equal(ownerRows.length, 2);
  assert.equal(ownerRows[0].expensesAmount, 40);
});

test('H2: dashboard rejects invalid or oversized from/to ranges with 400', async () => {
  const req = (query: string) => dashboardRoute.GET(get(`/api/v1/dashboard?${query}`, f.tokens.owner));
  for (const query of [
    'granularity=day&from=0001-01-01&to=2099-01-01',
    'from=2020-01-01&to=2026-01-01',
    'from=2026-02-30&to=2026-03-01',
    'from=abc&to=2026-03-01',
    'from=2026-03-02&to=2026-03-01',
  ]) {
    const res = await req(query);
    assert.equal(res.status, 400, query);
    assert.match((await res.json()).error, /date|range|days/i);
  }
  // Valid ranges keep working, including the 366-day upper bound.
  assert.equal((await req('granularity=day&from=2025-01-01&to=2025-12-31')).status, 200);
  assert.equal((await req('granularity=month&from=2025-01-01&to=2026-01-01')).status, 200);
});

test('M6: reconcile rejects spans longer than 92 days', async () => {
  const post = (body: object) => reconcileRoute.POST(new NextRequest('http://localhost/api/v1/dashboard/reconcile', {
    method: 'POST',
    headers: { Authorization: `Bearer ${f.tokens.owner}`, 'x-store-id': f.store.id, 'content-type': 'application/json' },
    body: JSON.stringify({ outletId: f.outletA.id, ...body }),
  }));
  const tooLong = await post({ fromDate: '2000-01-01', toDate: '2026-01-01' });
  assert.equal(tooLong.status, 400);
  assert.match((await tooLong.json()).error, /92 days/);
  assert.equal((await post({ fromDate: '2026-02-30', toDate: '2026-03-01' })).status, 400);
  const ok = await post({ fromDate: '2026-01-01', toDate: '2026-04-02' }); // 92 days inclusive
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).daysReconciled, 92);
  assert.equal((await post({ fromDate: '2026-01-01', toDate: '2026-04-03' })).status, 400);
});

function orderInput(f: Awaited<ReturnType<typeof fixture>>, key: string, extra: Record<string, unknown> = {}) {
  return {
    idempotencyKey: key,
    phone: '9876543210',
    dueDate: todayIST(),
    entries: [{ productId: f.product.id, quantity: 1 }],
    ...extra,
  };
}

test('M4: replaying another outlet\'s idempotencyKey/offlineId never returns its order', async () => {
  const original = await orders.createOrder(f.store.id, orderInput(f, 'm4-key', { offlineId: 'm4-offline' }), f.empA.id, f.outletA.id);
  // Legitimate retry by the same outlet, and by an owner with no outlet restriction.
  assert.equal((await orders.createOrder(f.store.id, orderInput(f, 'm4-key', { offlineId: 'm4-offline' }), f.empA.id, f.outletA.id)).id, original.id);
  assert.equal((await orders.createOrder(f.store.id, orderInput(f, 'm4-key'), f.owner.id)).id, original.id);
  // Another outlet's employee, by key or by offlineId only.
  await assert.rejects(orders.createOrder(f.store.id, orderInput(f, 'm4-key'), f.empB.id, f.outletB.id), /Order not found\./);
  await assert.rejects(orders.createOrder(f.store.id, orderInput(f, 'm4-other-key', { offlineId: 'm4-offline' }), f.empB.id, f.outletB.id), /Order not found\./);
  assert.equal(await prisma.order.count({ where: { storeId: f.store.id, idempotencyKey: 'm4-other-key' } }), 0);
});

test('M5: concurrent identical Delivered transitions count the completed rollup once', async () => {
  const today = new Date(`${todayIST()}T00:00:00.000Z`);
  const summary = () => prisma.dailyOutletSummary.findUniqueOrThrow({
    where: { storeId_outletId_businessDate: { storeId: f.store.id, outletId: f.outletA.id, businessDate: today } },
  });
  const before = (await summary()).ordersCompletedCount;
  const created = await Promise.all(Array.from({ length: 8 }, (_, i) =>
    orders.createOrder(f.store.id, orderInput(f, `m5-${i}`), f.owner.id, f.outletA.id)));
  // Delivery needs the order paid in full.
  for (const o of created) {
    const row = await prisma.order.findUniqueOrThrow({ where: { storeId_orderNumber: { storeId: f.store.id, orderNumber: orders.parseOrderCode(o.id)! } } });
    await prisma.payment.create({ data: { orderId: row.id, storeId: f.store.id, outletId: f.outletA.id, amount: 100, method: 'Cash', paidAt: today } });
  }
  await Promise.all(created.flatMap(o => [
    orders.updateOrderStatus(f.store.id, o.id, 'Delivered', f.owner.id),
    orders.updateOrderStatus(f.store.id, o.id, 'Delivered', f.owner.id),
  ]));
  assert.equal((await summary()).ordersCompletedCount - before, 8);
  for (const o of created) {
    const events = await prisma.statusEvent.count({ where: { order: { storeId: f.store.id, orderNumber: orders.parseOrderCode(o.id)! }, status: 'DELIVERED' } });
    assert.equal(events, 1);
  }
});

test('M8: bulk-sync action errors are whitelisted; internals are replaced by a generic message', async () => {
  const results = await orders.bulkSyncOrders(f.store.id, [
    { type: 'create_order', clientActionId: 'm8-a', offlineCode: 'm8-a', payload: orderInput(f, 'm8-a', { customerName: 'bad\u0000name' }) },
    { type: 'create_order', clientActionId: 'm8-b', offlineCode: 'm8-b', payload: orderInput(f, 'm8-b', { entries: [{ productId: 'missing', quantity: 1 }] }) },
    { type: 'update_status', clientActionId: 'm8-c', orderRef: 'EL-999999', status: 'Delivered' },
  ] as Parameters<typeof orders.bulkSyncOrders>[1], f.owner.id, f.outletA.id);
  assert.deepEqual(results.map(r => r.status), ['failed', 'failed', 'failed']);
  assert.equal(results[0].error, 'Unexpected error.');
  assert.equal(results[1].error, 'A selected service is no longer available.');
  assert.equal(results[2].error, 'Order not found.');
});

test('L9: employee create/update cap passwords at 128 chars; empty password on update is still allowed', async () => {
  const employees = await import('../src/server/services/employees');
  const long = 'a1'.repeat(65); // 130 chars
  await assert.rejects(employees.createEmployee(f.store.id, { name: 'Long pw', phone: testPhone('l9-long'), password: long, active: true }), /128/);
  const ok = await employees.createEmployee(f.store.id, { name: 'Ok pw', phone: testPhone('l9-ok'), password: 'a1'.repeat(64), active: true });
  await assert.rejects(employees.updateEmployee(f.store.id, { id: ok.id, name: 'Ok pw', phone: testPhone('l9-ok'), password: long, active: true }), /128/);
  const unchanged = await employees.updateEmployee(f.store.id, { id: ok.id, name: 'Renamed', phone: testPhone('l9-ok'), password: '', active: true });
  assert.equal(unchanged.name, 'Renamed');
  // A user who has no membership in this store is refused.
  await assert.rejects(employees.updateEmployee(f.store.id, { id: 'no-such-user', name: 'x', phone: testPhone('l9-x'), active: true }), /Employee not found\./);
  await assert.rejects(employees.toggleEmployeeActive(f.store.id, 'no-such-user'), /Employee not found\./);
});

test('L11: createExpense rejects a header outlet that disagrees with body.outletId', async () => {
  const expenses = await import('../src/server/services/expenses');
  const base = { title: 'Soap', category: 'Supplies', amount: 50, due: todayIST(), monthly: false };
  await assert.rejects(
    expenses.createExpense(f.store.id, { ...base, outletId: f.outletB.id }, f.outletA.id),
    (err: unknown) => err instanceof Error && /Conflicting outlet/.test(err.message) && err.constructor.name === 'ValidationError',
  );
  assert.equal(await prisma.expense.count({ where: { storeId: f.store.id, title: 'Soap' } }), 0);
  // Matching, header-only and body-only outlets keep working.
  await expenses.createExpense(f.store.id, { ...base, outletId: f.outletA.id }, f.outletA.id);
  await expenses.createExpense(f.store.id, base, f.outletA.id);
  await expenses.createExpense(f.store.id, { ...base, outletId: f.outletB.id });
});
