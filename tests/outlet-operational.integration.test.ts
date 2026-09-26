import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { NextRequest } from 'next/server';
import { PrismaClient, Role, OutletStatus } from '../src/generated/prisma/client';
import { hashPassword } from '../src/server/auth/password';

const socket = process.env.QA_SUBSCRIPTION_PG_SOCKET;
if (!socket?.startsWith('/tmp/el-subscription-test-') || !socket.endsWith('/socket')) {
  throw new Error('Run npm run test:subscription-payments to create an isolated PostgreSQL cluster.');
}

const connection = {
  host: socket,
  user: 'subscription_test',
  database: 'postgres',
  port: 5432,
};
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    ...connection,
    max: 10,
    application_name: 'el-outlet-ops-test',
  }),
});
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
const control = new Pool({ ...connection, max: 2 });

let orders: typeof import('../src/server/services/orders');
let expenses: typeof import('../src/server/services/expenses');
let invoices: typeof import('../src/server/services/order-invoices');
let platformMethods: typeof import('../src/server/services/platform-payment-methods');
let getOrderRoute: typeof import('../src/app/api/v1/orders/[orderCode]/route');
let paymentRoute: typeof import('../src/app/api/v1/orders/[orderCode]/payments/route');
let statusRoute: typeof import('../src/app/api/v1/orders/[orderCode]/status/route');
let listOrdersRoute: typeof import('../src/app/api/v1/orders/route');
let syncOrdersRoute: typeof import('../src/app/api/v1/orders/sync/route');

import { generateSessionToken } from '../src/server/auth/token';

before(async () => {
  orders = await import('../src/server/services/orders');
  expenses = await import('../src/server/services/expenses');
  invoices = await import('../src/server/services/order-invoices');
  platformMethods = await import('../src/server/services/platform-payment-methods');
  getOrderRoute = await import('../src/app/api/v1/orders/[orderCode]/route');
  paymentRoute = await import('../src/app/api/v1/orders/[orderCode]/payments/route');
  statusRoute = await import('../src/app/api/v1/orders/[orderCode]/status/route');
  listOrdersRoute = await import('../src/app/api/v1/orders/route');
  syncOrdersRoute = await import('../src/app/api/v1/orders/sync/route');
});

after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
  await control.end();
});

async function setupStoreWithOutlets(suffix: string) {
  const store = await prisma.store.create({
    data: { id: `store-ops-${suffix}`, name: `Store Ops ${suffix}` },
  });

  const outlet1 = await prisma.outlet.create({
    data: {
      storeId: store.id,
      outletCode: `OUT-1-${suffix}`,
      displayName: `Outlet 1 ${suffix}`,
      status: OutletStatus.ACTIVE,
    },
  });

  const outlet2 = await prisma.outlet.create({
    data: {
      storeId: store.id,
      outletCode: `OUT-2-${suffix}`,
      displayName: `Outlet 2 ${suffix}`,
      status: OutletStatus.ACTIVE,
    },
  });

  const passwordHash = await hashPassword('password123');

  const emp1User = await prisma.user.create({
    data: { name: `Emp 1 ${suffix}`, username: `emp1_${suffix}`, passwordHash },
  });
  await prisma.storeMembership.create({
    data: { userId: emp1User.id, storeId: store.id, role: Role.EMPLOYEE, active: true },
  });
  await prisma.outletMembership.create({
    data: { userId: emp1User.id, outletId: outlet1.id, active: true, isDefault: true },
  });

  const emp2User = await prisma.user.create({
    data: { name: `Emp 2 ${suffix}`, username: `emp2_${suffix}`, passwordHash },
  });
  await prisma.storeMembership.create({
    data: { userId: emp2User.id, storeId: store.id, role: Role.EMPLOYEE, active: true },
  });
  await prisma.outletMembership.create({
    data: { userId: emp2User.id, outletId: outlet2.id, active: true, isDefault: true },
  });

  const ownerUser = await prisma.user.create({
    data: { name: `Owner ${suffix}`, username: `owner_${suffix}`, passwordHash },
  });
  await prisma.storeMembership.create({
    data: { userId: ownerUser.id, storeId: store.id, role: Role.OWNER, active: true },
  });

  const product = await prisma.product.create({
    data: {
      storeId: store.id,
      name: `Laundry ${suffix}`,
      category: 'General',
      type: 'ITEM',
      price: 10_000,
      active: true,
    },
  });

  const cash = await prisma.storePaymentMethod.create({
    data: { storeId: store.id, name: 'Cash', active: true },
  });

  // Outlet-owned orders require an explicitly enabled platform payment
  // method (B4); the legacy StorePaymentMethod above only keeps historical,
  // pre-outlet orders operable.
  const cleanSuffix = suffix.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const cashPlatformMethod = await platformMethods.createPlatformPaymentMethod({
    code: `CASH_${cleanSuffix}`,
    name: 'Cash',
  });
  await platformMethods.setOrganizationPaymentMethodEnabled(store.id, cashPlatformMethod.id, true);

  // Create active sessions for test auth headers
  const tokenEmp1 = generateSessionToken();
  const tokenEmp2 = generateSessionToken();
  const tokenOwner = generateSessionToken();

  await prisma.session.create({
    data: { token: tokenEmp1, userId: emp1User.id, credentialVersion: 1, expiresAt: new Date(Date.now() + 86400000) },
  });
  await prisma.session.create({
    data: { token: tokenEmp2, userId: emp2User.id, credentialVersion: 1, expiresAt: new Date(Date.now() + 86400000) },
  });
  await prisma.session.create({
    data: { token: tokenOwner, userId: ownerUser.id, credentialVersion: 1, expiresAt: new Date(Date.now() + 86400000) },
  });

  return {
    store,
    outlet1,
    outlet2,
    emp1User,
    emp2User,
    ownerUser,
    tokenEmp1,
    tokenEmp2,
    tokenOwner,
    product,
    cash,
    cashPlatformMethod,
  };
}

test('B3.1: Order creation records outletId, initial payment and status event record storeId & outletId', async () => {
  const ctx = await setupStoreWithOutlets('b3-1');

  const order = await orders.createOrder(
    ctx.store.id,
    {
      idempotencyKey: 'idemp-b3-1',
      customerName: 'Test Customer',
      phone: '9876543210',
      dueDate: '2026-12-31',
      entries: [{ productId: ctx.product.id, quantity: 2 }],
      initialPayment: { amount: 5000, method: 'Cash' },
      outletId: ctx.outlet1.id,
    },
    ctx.emp1User.id,
  );

  assert.equal(order.outletId, ctx.outlet1.id);

  // Verify order in database
  const dbOrder = await prisma.order.findUnique({
    where: { idempotencyKey: 'idemp-b3-1' },
    include: { payments: true, statusEvents: true },
  });
  assert.ok(dbOrder);
  assert.equal(dbOrder.outletId, ctx.outlet1.id);
  assert.equal(dbOrder.storeId, ctx.store.id);

  // Verify initial payment has storeId and outletId
  assert.equal(dbOrder.payments.length, 1);
  assert.equal(dbOrder.payments[0].storeId, ctx.store.id);
  assert.equal(dbOrder.payments[0].outletId, ctx.outlet1.id);

  // Verify initial status event has storeId and outletId
  assert.equal(dbOrder.statusEvents.length, 1);
  assert.equal(dbOrder.statusEvents[0].storeId, ctx.store.id);
  assert.equal(dbOrder.statusEvents[0].outletId, ctx.outlet1.id);
});

test('B3.2: Subsequent payment and status update preserve originating outletId on new rows', async () => {
  const ctx = await setupStoreWithOutlets('b3-2');

  const order = await orders.createOrder(
    ctx.store.id,
    {
      idempotencyKey: 'idemp-b3-2',
      customerName: 'Payment Customer',
      phone: '9876543210',
      dueDate: '2026-12-31',
      entries: [{ productId: ctx.product.id, quantity: 2 }],
      outletId: ctx.outlet1.id,
    },
    ctx.ownerUser.id,
  );

  // Record payment
  await orders.recordPayment(ctx.store.id, order.id, 10000, 'Cash');

  // Verify payment has storeId and outletId matching the order
  const payments = await prisma.payment.findMany({
    where: { order: { orderNumber: orders.parseOrderCode(order.id)! } },
  });
  assert.equal(payments.length, 1);
  assert.equal(payments[0].storeId, ctx.store.id);
  assert.equal(payments[0].outletId, ctx.outlet1.id);

  // Update status to In Progress
  await orders.updateOrderStatus(ctx.store.id, order.id, 'In Progress', ctx.ownerUser.id);

  const events = await prisma.statusEvent.findMany({
    where: { order: { orderNumber: orders.parseOrderCode(order.id)! }, status: 'IN_PROGRESS' },
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].storeId, ctx.store.id);
  assert.equal(events[0].outletId, ctx.outlet1.id);
});

test('B3.3: Employee cross-outlet access denial on API endpoints', async () => {
  const ctx = await setupStoreWithOutlets('b3-3');

  // Create Order 1 in Outlet 1
  const order1 = await orders.createOrder(
    ctx.store.id,
    {
      idempotencyKey: 'idemp-order1',
      customerName: 'Cust 1',
      phone: '9876543210',
      dueDate: '2026-12-31',
      entries: [{ productId: ctx.product.id, quantity: 1 }],
      outletId: ctx.outlet1.id,
    },
    ctx.ownerUser.id,
  );

  // Create Order 2 in Outlet 2
  const order2 = await orders.createOrder(
    ctx.store.id,
    {
      idempotencyKey: 'idemp-order2',
      customerName: 'Cust 2',
      phone: '9876543210',
      dueDate: '2026-12-31',
      entries: [{ productId: ctx.product.id, quantity: 1 }],
      outletId: ctx.outlet2.id,
    },
    ctx.ownerUser.id,
  );

  // 1. Employee 1 can read Order 1
  const reqEmp1Order1 = new NextRequest(`http://localhost/api/v1/orders/${order1.id}`, {
    headers: {
      Authorization: `Bearer ${ctx.tokenEmp1}`,
      'X-Store-Id': ctx.store.id,
    },
  });
  const resEmp1Order1 = await getOrderRoute.GET(reqEmp1Order1, {
    params: Promise.resolve({ orderCode: order1.id }),
  });
  assert.equal(resEmp1Order1.status, 200);

  // 2. Employee 1 is DENIED (403 Forbidden) reading Order 2 from Outlet 2
  const reqEmp1Order2 = new NextRequest(`http://localhost/api/v1/orders/${order2.id}`, {
    headers: {
      Authorization: `Bearer ${ctx.tokenEmp1}`,
      'X-Store-Id': ctx.store.id,
    },
  });
  const resEmp1Order2 = await getOrderRoute.GET(reqEmp1Order2, {
    params: Promise.resolve({ orderCode: order2.id }),
  });
  assert.equal(resEmp1Order2.status, 403);

  // 3. Employee 1 is DENIED recording payment on Order 2
  const reqPay = new NextRequest(`http://localhost/api/v1/orders/${order2.id}/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.tokenEmp1}`,
      'X-Store-Id': ctx.store.id,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount: 5000, method: 'Cash' }),
  });
  const resPay = await paymentRoute.POST(reqPay, {
    params: Promise.resolve({ orderCode: order2.id }),
  });
  assert.equal(resPay.status, 403);

  // 4. Employee 1 is DENIED updating status on Order 2
  const reqStatus = new NextRequest(`http://localhost/api/v1/orders/${order2.id}/status`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${ctx.tokenEmp1}`,
      'X-Store-Id': ctx.store.id,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'In Progress' }),
  });
  const resStatus = await statusRoute.PATCH(reqStatus, {
    params: Promise.resolve({ orderCode: order2.id }),
  });
  assert.equal(resStatus.status, 403);

  // 5. Employee requests must explicitly name their active outlet. There is
  // no fallback to a default outlet, which prevents legacy/null records from
  // entering an outlet-scoped client cache.
  const reqListWithoutOutlet = new NextRequest('http://localhost/api/v1/orders', {
    headers: { Authorization: `Bearer ${ctx.tokenEmp1}`, 'X-Store-Id': ctx.store.id },
  });
  assert.equal((await listOrdersRoute.GET(reqListWithoutOutlet)).status, 403);

  // Employee 1 listing orders for Outlet 1 only gets Outlet 1 orders.
  const reqList = new NextRequest('http://localhost/api/v1/orders', {
    headers: {
      Authorization: `Bearer ${ctx.tokenEmp1}`,
      'X-Store-Id': ctx.store.id,
      'X-Outlet-Id': ctx.outlet1.id,
    },
  });
  const resList = await listOrdersRoute.GET(reqList);
  assert.equal(resList.status, 200);
  const listData = await resList.json();
  assert.equal(listData.length, 1);
  assert.equal(listData[0].id, order1.id);

  // 6. Owner listing orders without outlet filter gets both orders
  const reqOwnerList = new NextRequest('http://localhost/api/v1/orders', {
    headers: {
      Authorization: `Bearer ${ctx.tokenOwner}`,
      'X-Store-Id': ctx.store.id,
    },
  });
  const resOwnerList = await listOrdersRoute.GET(reqOwnerList);
  assert.equal(resOwnerList.status, 200);
  const ownerListData = await resOwnerList.json();
  assert.equal(ownerListData.length, 2);

  // 7. Owner filtering by Outlet 2 gets only Order 2
  const reqOwnerOutlet2 = new NextRequest('http://localhost/api/v1/orders?outletId=' + ctx.outlet2.id, {
    headers: {
      Authorization: `Bearer ${ctx.tokenOwner}`,
      'X-Store-Id': ctx.store.id,
    },
  });
  const resOwnerOutlet2 = await listOrdersRoute.GET(reqOwnerOutlet2);
  assert.equal(resOwnerOutlet2.status, 200);
  const ownerOutlet2Data = await resOwnerOutlet2.json();
  assert.equal(ownerOutlet2Data.length, 1);
  assert.equal(ownerOutlet2Data[0].id, order2.id);

  // 8. Delta sync for Employee 1 only returns Order 1
  const reqSync = new NextRequest('http://localhost/api/v1/orders/sync', {
    headers: {
      Authorization: `Bearer ${ctx.tokenEmp1}`,
      'X-Store-Id': ctx.store.id,
      'X-Outlet-Id': ctx.outlet1.id,
    },
  });
  const resSync = await syncOrdersRoute.GET(reqSync);
  assert.equal(resSync.status, 200);
  const syncData = await resSync.json();
  assert.equal(syncData.orders.length, 1);
  assert.equal(syncData.orders[0].id, order1.id);

  // Legacy orders with no outlet must never be exposed to or modifiable by
  // an employee, even when the employee otherwise belongs to this store.
  const legacy = await orders.createOrder(
    ctx.store.id,
    {
      idempotencyKey: 'legacy-no-outlet', customerName: 'Legacy', phone: '9876543210',
      dueDate: '2026-12-31', entries: [{ productId: ctx.product.id, quantity: 1 }],
    },
    ctx.ownerUser.id,
  );
  // Simulate a row written before the outlet migration. New writes receive a
  // default outlet; only this fixture deliberately represents legacy data.
  await prisma.order.update({
    where: { orderNumber: orders.parseOrderCode(legacy.id)! },
    data: { outletId: null },
  });
  const legacyRequest = new NextRequest(`http://localhost/api/v1/orders/${legacy.id}`, {
    headers: { Authorization: `Bearer ${ctx.tokenEmp1}`, 'X-Store-Id': ctx.store.id },
  });
  assert.equal((await getOrderRoute.GET(legacyRequest, { params: Promise.resolve({ orderCode: legacy.id }) })).status, 403);
});

test('B3.4: Invoices and Expenses preserve outletId', async () => {
  const ctx = await setupStoreWithOutlets('b3-4');

  // Test Order Invoice carries order outletId
  const order = await orders.createOrder(
    ctx.store.id,
    {
      idempotencyKey: 'idemp-invoice-test',
      customerName: 'Invoice Customer',
      phone: '9876543210',
      dueDate: '2026-12-31',
      entries: [{ productId: ctx.product.id, quantity: 1 }],
      initialPayment: { amount: 10_000, method: 'Cash' },
      outletId: ctx.outlet1.id,
    },
    ctx.ownerUser.id,
  );
  await orders.updateOrderStatus(ctx.store.id, order.id, 'Delivered', ctx.ownerUser.id);
  const invData = await invoices.getOrCreateOrderInvoice(ctx.store.id, order.id);
  assert.ok(invData);

  const dbInvoice = await prisma.orderInvoice.findFirst({
    where: { storeId: ctx.store.id, order: { orderNumber: orders.parseOrderCode(order.id)! } },
  });
  assert.ok(dbInvoice);
  assert.equal(dbInvoice.outletId, ctx.outlet1.id);

  // Test Expenses
  const exp1 = await expenses.createExpense(
    ctx.store.id,
    {
      title: 'Detergent Outlet 1',
      category: 'Supplies',
      amount: 1500,
      due: '2026-12-01',
      monthly: false,
      outletId: ctx.outlet1.id,
    },
  );
  assert.equal(exp1.outletId, ctx.outlet1.id);

  const exp2 = await expenses.createExpense(
    ctx.store.id,
    {
      title: 'Electricity Outlet 2',
      category: 'Utilities',
      amount: 4000,
      due: '2026-12-01',
      monthly: false,
      outletId: ctx.outlet2.id,
    },
  );
  assert.equal(exp2.outletId, ctx.outlet2.id);

  // List expenses filtered by Outlet 1
  const outlet1Expenses = await expenses.listExpenses(ctx.store.id, { outletId: ctx.outlet1.id });
  assert.equal(outlet1Expenses.length, 1);
  assert.equal(outlet1Expenses[0].id, exp1.id);

  // List all store expenses
  const allExpenses = await expenses.listExpenses(ctx.store.id);
  assert.equal(allExpenses.length, 2);
});
