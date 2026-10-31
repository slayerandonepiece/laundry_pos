import { testPhone } from './test-phone';
import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { NextRequest } from 'next/server';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../src/server/auth/password';
import { parseCalendarDate, todayIST } from '../src/server/dates';

const socket = process.env.QA_SUBSCRIPTION_PG_SOCKET;
if (!socket?.startsWith('/tmp/el-subscription-test-') || !socket.endsWith('/socket')) {
  throw new Error('Run npm run test:subscription-payments to create an isolated PostgreSQL cluster.');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({
  host: socket, user: 'subscription_test', database: 'postgres', port: 5432,
  application_name: 'el-order-corrections-test',
}) });
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;

let currentToken: string | undefined;
mock.module('next/headers', {
  namedExports: { cookies: async () => ({ get: (name: string) => (name === 'el_session' && currentToken ? { value: currentToken } : undefined), set: () => undefined, delete: () => undefined }) },
});

let orders: typeof import('../src/server/services/orders');
let payments: typeof import('../src/server/services/platform-payment-methods');
let session: typeof import('../src/server/auth/session');
let webActions: typeof import('../src/features/admin/actions/orders.actions');
let adminActions: typeof import('../src/features/super-admin/actions/order-corrections.actions');
let cancelRoute: typeof import('../src/app/api/v1/orders/[orderCode]/cancel/route');
let detailRoute: typeof import('../src/app/api/v1/orders/[orderCode]/route');

before(async () => {
  orders = await import('../src/server/services/orders');
  payments = await import('../src/server/services/platform-payment-methods');
  session = await import('../src/server/auth/session');
  webActions = await import('../src/features/admin/actions/orders.actions');
  adminActions = await import('../src/features/super-admin/actions/order-corrections.actions');
  cancelRoute = await import('../src/app/api/v1/orders/[orderCode]/cancel/route');
  detailRoute = await import('../src/app/api/v1/orders/[orderCode]/route');
});
after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
});

const today = todayIST();
const slug = (key: string) => key.toUpperCase().replace(/[^A-Z0-9]/g, '_');

async function setupOrg(key: string) {
  const store = await prisma.store.create({ data: { id: `store-cor-${key}`, name: `Corrections ${key}` } });
  await prisma.subscription.create({ data: { storeId: store.id, depositAmount: 0, annualFeeAmount: 0, paidThroughDate: new Date('2100-01-01') } });
  const outlet = await prisma.outlet.create({ data: { outletCode: `COR${slug(key)}`.slice(0, 20), storeId: store.id, displayName: `Outlet ${key}` } });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Wash', category: 'Laundry', type: 'ITEM', price: 10000, active: true } });
  const make = async (role: string) => prisma.user.create({ data: { name: `${role} ${key}`, phone: testPhone(`cor_${role}_${key}`), passwordHash: await hashPassword('password123'), isSuperAdmin: role === 'admin' } });
  const [owner, employee, admin] = await Promise.all([make('owner'), make('employee'), make('admin')]);
  await prisma.storeMembership.create({ data: { storeId: store.id, userId: owner.id, role: 'OWNER' } });
  await prisma.storeMembership.create({ data: { storeId: store.id, userId: employee.id, role: 'EMPLOYEE' } });
  await prisma.outletMembership.create({ data: { userId: employee.id, outletId: outlet.id, isDefault: true } });
  const cash = await payments.createPlatformPaymentMethod({ code: `COR_CASH_${slug(key)}`, name: `Cash ${key}`, defaultStage: 'BOTH' });
  await payments.saveOrganizationPaymentConfig(store.id, [{ platformPaymentMethodId: cash.id, enabled: true }]);
  return { store, outlet, product, owner, employee, admin, cash };
}
type Org = Awaited<ReturnType<typeof setupOrg>>;

const newOrder = (org: Org, key: string, quantity = 2, extra: object = {}) => orders.createOrder(org.store.id, {
  idempotencyKey: key, customerName: 'Ravi', phone: '9876543210', dueDate: today,
  entries: [{ productId: org.product.id, quantity }], outletId: org.outlet.id, ...extra,
}, org.owner.id, org.outlet.id);

const login = async (userId: string) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return (await session.createSessionRow(user.id, user.credentialVersion)).token;
};
const rollup = async (org: Org) => {
  const summary = await prisma.dailyOutletSummary.findUnique({ where: { storeId_outletId_businessDate: { storeId: org.store.id, outletId: org.outlet.id, businessDate: parseCalendarDate(today) } } });
  const services = await prisma.dailyOutletServiceSummary.findMany({ where: { storeId: org.store.id, outletId: org.outlet.id, businessDate: parseCalendarDate(today) } });
  return {
    summary: summary && { created: summary.ordersCreatedCount, completed: summary.ordersCompletedCount, gross: summary.grossOrderAmount, collected: summary.paymentsCollectedAmount },
    services: services.map(row => [row.serviceName, row.piecesCount, row.orderCount, row.amount]),
  };
};
const request = (url: string, token: string | undefined, storeId: string, body?: unknown) => new Request(url, {
  method: body ? 'POST' : 'GET',
  headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'X-Store-Id': storeId, 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
}) as unknown as NextRequest;
const params = (orderCode: string) => ({ params: Promise.resolve({ orderCode }) });
const audit = (org: Org, action: string) => prisma.auditLog.findMany({ where: { storeId: org.store.id, action }, orderBy: { createdAt: 'asc' } });

test('cancelling before delivery removes the order and reverses its rollups exactly', async () => {
  const org = await setupOrg('cancel');
  const keep = await newOrder(org, 'cancel-keep', 1);
  await orders.recordPayment(org.store.id, keep.id, 10000, org.cash.name);
  const before = await rollup(org);
  const order = await newOrder(org, 'cancel-1', 3);
  await orders.recordPayment(org.store.id, order.id, 10000, org.cash.name);
  await orders.updateOrderStatus(org.store.id, order.id, 'Ready', org.owner.id);
  assert.notDeepEqual(await rollup(org), before);

  await orders.cancelOrder(org.store.id, order.id, org.owner.id, 'Customer changed their mind');
  const after = await rollup(org);
  assert.deepEqual(after.summary, before.summary, 'totals are back to what they were');
  assert.deepEqual(after.services.map(([name, pieces, count, amount]) => [name, pieces, count, amount]), before.services, 'service totals are back too');
  assert.equal(await orders.getOrder(org.store.id, order.id), null);
  assert.deepEqual((await orders.listOrders(org.store.id)).map(item => item.id), [keep.id], 'it leaves the order list');
  // Devices that had it learn it is gone.
  const sync = await orders.listOrdersSince(org.store.id, null, 100);
  assert.deepEqual(sync.orders.map(item => [item.id, item.deleted]).sort(), [[keep.id, false], [order.id, true]].sort());
  // It cannot be changed, paid or cancelled again.
  await assert.rejects(orders.updateOrderStatus(org.store.id, order.id, 'Delivered', org.owner.id), /Order not found/);
  await assert.rejects(orders.recordPayment(org.store.id, order.id, 100, org.cash.name), /Order not found/);
  await assert.rejects(orders.cancelOrder(org.store.id, order.id, org.owner.id, 'again'), /Order not found/);
  const [entry] = await audit(org, 'CANCEL_ORDER');
  assert.deepEqual([entry.actorId, entry.entityId, (entry.afterJson as { reason: string }).reason], [org.owner.id, order.id, 'Customer changed their mind']);
  assert.equal(await audit(org, 'CANCEL_ORDER').then(rows => rows.length), 1);
});

test('delivered orders cannot be cancelled and a reason is required', async () => {
  const org = await setupOrg('final');
  const order = await newOrder(org, 'final-1', 1);
  await assert.rejects(orders.cancelOrder(org.store.id, order.id, org.owner.id, ''), /Reason must be at least 3 characters/);
  await assert.rejects(orders.cancelOrder(org.store.id, order.id, org.owner.id, 'ab'), /Reason must be at least 3 characters/);
  await orders.deliverOrderWithPayment(org.store.id, order.id, { method: org.cash.name }, org.owner.id);
  const before = await rollup(org);
  await assert.rejects(orders.cancelOrder(org.store.id, order.id, org.owner.id, 'Too late'), /Delivered orders are final and cannot be cancelled/);
  assert.deepEqual(await rollup(org), before);
  assert.equal((await orders.getOrder(org.store.id, order.id))?.status, 'Delivered');
  assert.equal((await audit(org, 'CANCEL_ORDER')).length, 0);
  const other = await setupOrg('final-other');
  await assert.rejects(orders.cancelOrder(other.store.id, order.id, other.owner.id, 'Not mine'), /Order not found/);
});

test('only an owner can cancel: on the web and on the mobile route', async () => {
  const org = await setupOrg('roles');
  const owner = await login(org.owner.id);
  const employee = await login(org.employee.id);
  const order = await newOrder(org, 'roles-1');

  currentToken = undefined;
  await assert.rejects(webActions.cancelOrderAction(order.id, 'Nope'), (error: { code?: string }) => error.code === 'UNAUTHENTICATED');
  currentToken = employee;
  await assert.rejects(webActions.cancelOrderAction(order.id, 'Nope'), (error: { code?: string }) => error.code === 'FORBIDDEN');
  assert.equal((await orders.getOrder(org.store.id, order.id))?.status, 'Pending');

  currentToken = undefined; // the mobile routes use bearer tokens only
  const url = `http://localhost/api/v1/orders/${order.id}/cancel`;
  assert.equal((await cancelRoute.POST(request(url, undefined, org.store.id, { reason: 'Nope' }), params(order.id))).status, 401);
  assert.equal((await cancelRoute.POST(request(url, employee, org.store.id, { reason: 'Nope' }), params(order.id))).status, 403);
  assert.equal((await cancelRoute.POST(request(url, owner, org.store.id, { reason: 'x' }), params(order.id))).status, 400);
  assert.equal((await orders.getOrder(org.store.id, order.id))?.status, 'Pending', 'every refused call left the order alone');

  currentToken = owner;
  assert.deepEqual(await webActions.cancelOrderAction(order.id, 'ab'), { ok: false, error: 'Reason must be at least 3 characters.' });
  assert.deepEqual(await webActions.cancelOrderAction(order.id, 'Customer asked to cancel'), { ok: true });
  currentToken = undefined;
  assert.equal(await orders.getOrder(org.store.id, order.id), null);

  // The mobile route works for the owner and another organization's owner cannot reach it.
  const second = await newOrder(org, 'roles-2');
  const secondUrl = `http://localhost/api/v1/orders/${second.id}/cancel`;
  const other = await setupOrg('roles-other');
  assert.equal((await cancelRoute.POST(request(secondUrl, await login(other.owner.id), other.store.id, { reason: 'Not mine' }), params(second.id))).status, 404);
  const cancelled = await cancelRoute.POST(request(secondUrl, owner, org.store.id, { reason: 'Duplicate order' }), params(second.id));
  assert.equal(cancelled.status, 200);
  assert.deepEqual(await cancelled.json(), { ok: true });
  assert.equal((await detailRoute.GET(request(`http://localhost/api/v1/orders/${second.id}`, owner, org.store.id), params(second.id))).status, 404);
  const delivered = await newOrder(org, 'roles-3', 1);
  await orders.deliverOrderWithPayment(org.store.id, delivered.id, { method: org.cash.name }, org.owner.id);
  const finalRes = await cancelRoute.POST(request(`http://localhost/api/v1/orders/${delivered.id}/cancel`, owner, org.store.id, { reason: 'Too late' }), params(delivered.id));
  assert.equal(finalRes.status, 400);
  assert.match((await finalRes.json()).error, /final/);
});

test('a Super Admin can correct a delivered order, and every correction is audited with the old and new values', async () => {
  const org = await setupOrg('correct');
  const order = await newOrder(org, 'correct-1', 3);
  assert.equal((await orders.getOrder(org.store.id, order.id))?.name, 'Ravi');
  // Not delivered yet: nothing to correct.
  await assert.rejects(orders.correctDeliveredOrder(org.store.id, order.id, org.admin.id, { type: 'customer', customerName: 'Ravi Kumar', phone: '9876543210', reason: 'Spelling' }), /only available after delivery/);
  await orders.deliverOrderWithPayment(org.store.id, order.id, { method: org.cash.name }, org.owner.id);
  const before = await rollup(org);

  const view = await orders.correctDeliveredOrder(org.store.id, order.id, org.admin.id, { type: 'customer', customerName: 'Ravi Kumar', phone: '9876500001', reason: 'Wrong number was typed' });
  assert.deepEqual([view.customerName, view.phone], ['Ravi Kumar', '9876500001']);
  assert.deepEqual(await rollup(org), before, 'a customer fix does not touch the totals');
  const [customer] = await audit(org, 'CORRECT_ORDER_CUSTOMER');
  assert.deepEqual([customer.actorId, customer.entityId], [org.admin.id, order.id]);
  assert.deepEqual(customer.beforeJson, { customerName: 'Ravi', phone: '9876543210' });
  assert.deepEqual(customer.afterJson, { customerName: 'Ravi Kumar', phone: '9876500001', reason: 'Wrong number was typed' });
  await assert.rejects(orders.correctDeliveredOrder(org.store.id, order.id, org.admin.id, { type: 'customer', customerName: 'Ravi Kumar', phone: '9876500001', reason: 'Same again' }), /different customer/);
  await assert.rejects(orders.correctDeliveredOrder(org.store.id, order.id, org.admin.id, { type: 'customer', customerName: 'X', phone: '9876500002', reason: '' }), /Reason must be at least 3 characters/);
  await assert.rejects(orders.correctDeliveredOrder(org.store.id, order.id, org.admin.id, { type: 'customer', customerName: 'X', phone: '123', reason: 'Bad phone' }));

  const paymentId = view.payments[0].id;
  assert.equal(view.payments[0].amount, 30000);
  const adjusted = await orders.correctDeliveredOrder(org.store.id, order.id, org.admin.id, { type: 'payment', paymentId, amount: 25000, reason: 'Customer got a discount' });
  assert.equal(adjusted.payments[0].amount, 25000);
  assert.equal((await rollup(org)).summary?.collected, (before.summary?.collected ?? 0) - 5000, 'the daily collected total follows the payment');
  const [adjust] = await audit(org, 'ADJUST_ORDER_PAYMENT');
  assert.deepEqual([adjust.actorId, adjust.entityId], [org.admin.id, paymentId]);
  assert.deepEqual(adjust.beforeJson, { orderCode: order.id, amount: 30000, method: org.cash.name });
  assert.deepEqual(adjust.afterJson, { orderCode: order.id, amount: 25000, method: org.cash.name, reason: 'Customer got a discount' });
  await assert.rejects(orders.correctDeliveredOrder(org.store.id, order.id, org.admin.id, { type: 'payment', paymentId, amount: 25000, reason: 'No change' }), /different payment amount/);
  await assert.rejects(orders.correctDeliveredOrder(org.store.id, order.id, org.admin.id, { type: 'payment', paymentId, amount: 30001, reason: 'Too much' }), /cannot exceed the order total/);
  await assert.rejects(orders.correctDeliveredOrder(org.store.id, order.id, org.admin.id, { type: 'payment', paymentId: 'nope', amount: 1, reason: 'Unknown' }), /Payment not found/);

  const voided = await orders.correctDeliveredOrder(org.store.id, order.id, org.admin.id, { type: 'payment', paymentId, amount: 0, reason: 'Payment was recorded by mistake' });
  assert.equal(voided.payments[0].amount, 0);
  assert.equal((await rollup(org)).summary?.collected, before.summary?.collected && before.summary.collected - 30000);
  assert.equal((await audit(org, 'VOID_ORDER_PAYMENT')).length, 1);
  assert.equal((await audit(org, 'ADJUST_ORDER_PAYMENT')).length, 1);

  // A correction in one organization cannot reach another's order.
  const other = await setupOrg('correct-other');
  await assert.rejects(orders.correctDeliveredOrder(other.store.id, order.id, other.admin.id, { type: 'customer', customerName: 'X', phone: '9876500003', reason: 'Not mine' }), /Order not found/);
  assert.equal(await orders.getDeliveredOrderForCorrection(other.store.id, order.id), null);
  assert.equal((await orders.getOrder(org.store.id, order.id))?.name, 'Ravi Kumar');
});

test('only a Super Admin can look up or correct a delivered order', async () => {
  const org = await setupOrg('admin');
  const other = await setupOrg('admin-other');
  const order = await newOrder(org, 'admin-1', 1);
  await orders.deliverOrderWithPayment(org.store.id, order.id, { method: org.cash.name }, org.owner.id);
  const tokens = { owner: await login(org.owner.id), employee: await login(org.employee.id), otherOwner: await login(other.owner.id), admin: await login(org.admin.id) };
  const input = { type: 'customer' as const, customerName: 'Fixed', phone: '9876500004', reason: 'Typo in the name' };
  const denied = (code: string) => (error: unknown) => (error as { code?: string }).code === code;
  for (const [name, call] of [
    ['lookup', () => adminActions.fetchCorrectionOrderAction(org.store.id, order.id)],
    ['correct', () => adminActions.correctOrderAction(org.store.id, order.id, input)],
  ] as const) {
    currentToken = undefined;
    await assert.rejects(call(), denied('UNAUTHENTICATED'), `${name}: signed out`);
    for (const role of ['owner', 'employee', 'otherOwner'] as const) {
      currentToken = tokens[role];
      await assert.rejects(call(), denied('FORBIDDEN'), `${name}: ${role}`);
    }
  }
  assert.equal((await orders.getOrder(org.store.id, order.id))?.name, 'Ravi', 'denied calls changed nothing');
  assert.equal((await audit(org, 'CORRECT_ORDER_CUSTOMER')).length, 0);

  currentToken = tokens.admin;
  const found = await adminActions.fetchCorrectionOrderAction(org.store.id, order.id);
  assert.deepEqual(found.ok && [found.order.orderCode, found.order.total, found.order.payments.length], [order.id, 10000, 1]);
  assert.deepEqual(await adminActions.fetchCorrectionOrderAction(other.store.id, order.id), { ok: false, error: 'No delivered order with that number in this organization.' });
  assert.deepEqual(await adminActions.correctOrderAction(org.store.id, order.id, { ...input, reason: '' }), { ok: false, error: 'Reason must be at least 3 characters.' });
  const fixed = await adminActions.correctOrderAction(org.store.id, order.id, input);
  assert.equal(fixed.ok && fixed.order.customerName, 'Fixed');
  assert.deepEqual(await adminActions.correctOrderAction(org.store.id, order.id, input), { ok: false, error: 'Enter a different customer name or phone number.' });
  currentToken = undefined;
});
