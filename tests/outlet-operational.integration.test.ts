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
let bulkSyncRoute: typeof import('../src/app/api/v1/orders/bulk-sync/route');
let createOrdersRoute: typeof import('../src/app/api/v1/orders/route');

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
  bulkSyncRoute = await import('../src/app/api/v1/orders/bulk-sync/route');
  createOrdersRoute = await import('../src/app/api/v1/orders/route');
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

test('B3.5: Offline batch files each queued order against its own outlet', async () => {
  const ctx = await setupStoreWithOutlets('b35');

  // An owner queues one order per outlet while offline, then syncs while the
  // app happens to be scoped to outlet 1. Each order must keep the outlet it
  // was actually taken at, not inherit the scope active at flush time.
  const req = new NextRequest('http://localhost/api/v1/orders/bulk-sync', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.tokenOwner}`,
      'X-Store-Id': ctx.store.id,
      'X-Outlet-Id': ctx.outlet1.id,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      actions: [
        {
          clientActionId: 'a1',
          type: 'create_order',
          offlineCode: 'OFF-1',
          payload: {
            idempotencyKey: 'b35-key-1',
            phone: '9876543210',
            dueDate: '2100-01-01',
            entries: [{ productId: ctx.product.id, quantity: 1 }],
            outletId: ctx.outlet1.id,
          },
        },
        {
          clientActionId: 'a2',
          type: 'create_order',
          offlineCode: 'OFF-2',
          payload: {
            idempotencyKey: 'b35-key-2',
            phone: '9876543211',
            dueDate: '2100-01-01',
            entries: [{ productId: ctx.product.id, quantity: 1 }],
            outletId: ctx.outlet2.id,
          },
        },
      ],
    }),
  });

  const res = await bulkSyncRoute.POST(req);
  assert.equal(res.status, 200);
  const { results } = (await res.json()) as {
    results: { clientActionId: string; status: string; order?: { id: string } }[];
  };
  assert.equal(results.length, 2);
  assert.ok(results.every(r => r.status === 'success'));

  const first = await prisma.order.findFirst({ where: { idempotencyKey: 'b35-key-1' } });
  const second = await prisma.order.findFirst({ where: { idempotencyKey: 'b35-key-2' } });
  assert.equal(first?.outletId, ctx.outlet1.id);
  assert.equal(second?.outletId, ctx.outlet2.id);
});

test('B3.6: Conflicting outlet between header and body is rejected, not silently resolved', async () => {
  const ctx = await setupStoreWithOutlets('b36');

  const req = new NextRequest('http://localhost/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.tokenOwner}`,
      'X-Store-Id': ctx.store.id,
      'X-Outlet-Id': ctx.outlet1.id,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      idempotencyKey: 'b36-key-1',
      phone: '9876543210',
      dueDate: '2100-01-01',
      entries: [{ productId: ctx.product.id, quantity: 1 }],
      outletId: ctx.outlet2.id,
    }),
  });

  const res = await createOrdersRoute.POST(req);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Conflicting outlet/);
  assert.equal(await prisma.order.count({ where: { idempotencyKey: 'b36-key-1' } }), 0);
});

type SyncResult = {
  clientActionId: string;
  status: string;
  error?: string;
  order?: { id: string; offlineId?: string; status: string; payments: { amount: number; clientActionId?: string }[] };
};

async function bulkSync(token: string, storeId: string, outletId: string, actions: unknown[]) {
  const res = await bulkSyncRoute.POST(new NextRequest('http://localhost/api/v1/orders/bulk-sync', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Store-Id': storeId,
      'X-Outlet-Id': outletId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ actions }),
  }));
  assert.equal(res.status, 200);
  return ((await res.json()) as { results: SyncResult[] }).results;
}

test('B3.7: A create retried with the same offlineId returns one order', async () => {
  const ctx = await setupStoreWithOutlets('b37');
  const offlineId = '7f1c2d3e-0000-4000-8000-000000000b37';
  const payload = (idempotencyKey: string) => ({
    idempotencyKey,
    offlineId,
    phone: '9876543210',
    dueDate: '2100-01-01',
    entries: [{ productId: ctx.product.id, quantity: 1 }],
    outletId: ctx.outlet1.id,
  });

  // First attempt: direct create.
  const first = await createOrdersRoute.POST(new NextRequest('http://localhost/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.tokenOwner}`,
      'X-Store-Id': ctx.store.id,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload('b37-key-1')),
  }));
  assert.equal(first.status, 201);
  const firstOrder = (await first.json()) as { id: string; offlineId?: string };
  assert.equal(firstOrder.offlineId, offlineId);

  // Retry in a later bulk-sync request, even with a regenerated idempotency key.
  const results = await bulkSync(ctx.tokenOwner, ctx.store.id, ctx.outlet1.id, [
    { clientActionId: 'b37-a1', type: 'create_order', offlineCode: offlineId, payload: payload('b37-key-2') },
  ]);
  assert.equal(results[0].status, 'success');
  assert.equal(results[0].order?.id, firstOrder.id);

  assert.equal(await prisma.order.count({ where: { storeId: ctx.store.id, offlineId } }), 1);
  assert.equal(await prisma.order.count({ where: { storeId: ctx.store.id } }), 1);

  // offlineId is unique per organization, not globally: another store may reuse it.
  const other = await setupStoreWithOutlets('b37-other');
  const otherOrder = await orders.createOrder(other.store.id, {
    ...payload('b37-other-key'),
    entries: [{ productId: other.product.id, quantity: 1 }],
    outletId: other.outlet1.id,
  }, other.ownerUser.id);
  assert.notEqual(otherOrder.id, firstOrder.id);
  assert.equal(otherOrder.offlineId, offlineId);
});

test('B3.8: update_status and record_payment resolve an offlineId synced in an earlier request', async () => {
  const ctx = await setupStoreWithOutlets('b38');
  const offlineId = '7f1c2d3e-0000-4000-8000-000000000b38';

  // Request 1: only the create syncs.
  const created = await bulkSync(ctx.tokenOwner, ctx.store.id, ctx.outlet1.id, [
    {
      clientActionId: 'b38-a1',
      type: 'create_order',
      offlineCode: offlineId,
      payload: {
        idempotencyKey: 'b38-key-1',
        offlineId,
        phone: '9876543210',
        dueDate: '2100-01-01',
        entries: [{ productId: ctx.product.id, quantity: 1 }],
        outletId: ctx.outlet1.id,
      },
    },
  ]);
  assert.equal(created[0].status, 'success');
  const code = created[0].order!.id;

  // Request 2: the device still only knows the order by its offlineId.
  const later = await bulkSync(ctx.tokenOwner, ctx.store.id, ctx.outlet1.id, [
    { clientActionId: 'b38-a2', type: 'update_status', orderRef: offlineId, status: 'Ready' },
    { clientActionId: 'b38-a3', type: 'record_payment', orderRef: offlineId, amount: 4_000, method: 'Cash' },
    { clientActionId: 'b38-a4', type: 'update_status', orderRef: 'never-synced-offline-id', status: 'Ready' },
  ]);
  assert.equal(later[0].status, 'success');
  assert.equal(later[0].order?.id, code);
  assert.equal(later[0].order?.status, 'Ready');
  assert.equal(later[1].status, 'success');
  assert.equal(later[1].order?.id, code);
  assert.deepEqual(later[1].order?.payments.map(p => p.amount), [4_000]);
  assert.equal(later[2].status, 'skipped');
  assert.equal(later[2].error, 'Referenced order was not created yet.');

  // Replaying request 2 does not record the payment twice.
  const replay = await bulkSync(ctx.tokenOwner, ctx.store.id, ctx.outlet1.id, [
    { clientActionId: 'b38-a3', type: 'record_payment', orderRef: offlineId, amount: 4_000, method: 'Cash' },
  ]);
  assert.equal(replay[0].status, 'success');
  assert.equal(await prisma.payment.count({ where: { order: { storeId: ctx.store.id } } }), 1);

  // Another organization cannot resolve this store's offlineId.
  const other = await setupStoreWithOutlets('b38-other');
  const foreign = await bulkSync(other.tokenOwner, other.store.id, other.outlet1.id, [
    { clientActionId: 'b38-x1', type: 'update_status', orderRef: offlineId, status: 'Delivered' },
  ]);
  assert.equal(foreign[0].status, 'skipped');
  const row = await prisma.order.findFirstOrThrow({ where: { storeId: ctx.store.id, offlineId } });
  assert.equal(row.status, 'READY');
});

test('B3.9: Order DTO includes offlineId and payment clientActionId', async () => {
  const ctx = await setupStoreWithOutlets('b39');
  const offlineId = '7f1c2d3e-0000-4000-8000-000000000b39';
  const order = await orders.createOrder(ctx.store.id, {
    idempotencyKey: 'b39-key-1',
    offlineId,
    phone: '9876543210',
    dueDate: '2100-01-01',
    entries: [{ productId: ctx.product.id, quantity: 1 }],
    outletId: ctx.outlet1.id,
  }, ctx.ownerUser.id);

  const paid = await paymentRoute.POST(new NextRequest(`http://localhost/api/v1/orders/${order.id}/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.tokenOwner}`,
      'X-Store-Id': ctx.store.id,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount: 2_500, method: 'Cash', clientActionId: 'b39-pay-1' }),
  }), { params: Promise.resolve({ orderCode: order.id }) });
  assert.equal(paid.status, 201);

  const res = await getOrderRoute.GET(new NextRequest(`http://localhost/api/v1/orders/${order.id}`, {
    headers: { Authorization: `Bearer ${ctx.tokenOwner}`, 'X-Store-Id': ctx.store.id },
  }), { params: Promise.resolve({ orderCode: order.id }) });
  assert.equal(res.status, 200);
  const dto = (await res.json()) as { offlineId?: string; payments: { amount: number; clientActionId?: string }[] };
  assert.equal(dto.offlineId, offlineId);
  assert.deepEqual(dto.payments.map(p => [p.amount, p.clientActionId]), [[2_500, 'b39-pay-1']]);
});

test('B3.10: Web orders have no offlineId', async () => {
  const ctx = await setupStoreWithOutlets('b310');
  // The web createOrderAction passes the editor's input straight through,
  // which never carries an offlineId.
  const web = (key: string) => orders.createOrder(ctx.store.id, {
    idempotencyKey: key,
    phone: '9876543210',
    dueDate: '2100-01-01',
    entries: [{ productId: ctx.product.id, quantity: 1 }],
    initialPayment: { amount: 1_000, method: 'Cash' },
    outletId: ctx.outlet1.id,
  }, ctx.ownerUser.id);

  // Two web orders both store NULL; the per-organization unique index must not collide.
  const first = await web('b310-key-1');
  const second = await web('b310-key-2');
  assert.notEqual(first.id, second.id);
  for (const order of [first, second]) {
    assert.equal(order.offlineId, undefined);
    assert.equal(order.payments.length, 1);
    assert.equal(order.payments[0].clientActionId, undefined);
  }
  const rows = await prisma.order.findMany({ where: { storeId: ctx.store.id } });
  assert.equal(rows.length, 2);
  assert.ok(rows.every(r => r.offlineId === null));

  // Serialized over the API the field is omitted, not null.
  const res = await getOrderRoute.GET(new NextRequest(`http://localhost/api/v1/orders/${first.id}`, {
    headers: { Authorization: `Bearer ${ctx.tokenOwner}`, 'X-Store-Id': ctx.store.id },
  }), { params: Promise.resolve({ orderCode: first.id }) });
  const json = (await res.json()) as Record<string, unknown> & { payments: Record<string, unknown>[] };
  assert.equal('offlineId' in json, false);
  assert.equal('clientActionId' in json.payments[0], false);
});

test('B3.11: A replayed payment clientActionId cannot read or pay another order', async () => {
  const a = await setupStoreWithOutlets('b311-a');
  const b = await setupStoreWithOutlets('b311-b');
  const newOrder = (ctx: typeof a, key: string) => orders.createOrder(ctx.store.id, {
    idempotencyKey: key,
    phone: '9876543210',
    dueDate: '2100-01-01',
    entries: [{ productId: ctx.product.id, quantity: 1 }],
    outletId: ctx.outlet1.id,
  }, ctx.ownerUser.id);

  const orderA = await newOrder(a, 'b311-a-key');
  const orderB1 = await newOrder(b, 'b311-b-key-1');
  const orderB2 = await newOrder(b, 'b311-b-key-2');
  await orders.recordPayment(b.store.id, orderB1.id, 1_000, 'Cash', 'b311-own-pay');

  // Store B replays its own clientActionId against store A's order code.
  await assert.rejects(
    orders.recordPayment(b.store.id, orderA.id, 1_000, 'Cash', 'b311-own-pay'),
    /Order not found/,
  );
  // Same store, different order: rejected rather than returning the wrong order.
  await assert.rejects(
    orders.recordPayment(b.store.id, orderB2.id, 1_000, 'Cash', 'b311-own-pay'),
    /already recorded on another order/,
  );
  // The genuine replay still returns the original order, unchanged.
  const replay = await orders.recordPayment(b.store.id, orderB1.id, 1_000, 'Cash', 'b311-own-pay');
  assert.equal(replay.id, orderB1.id);
  assert.equal(replay.payments.length, 1);
  assert.equal(await prisma.payment.count({ where: { storeId: b.store.id } }), 1);
  assert.equal(await prisma.payment.count({ where: { storeId: a.store.id } }), 0);
});

async function waitForBlocked(count: number) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const { rows } = await control.query<{ waiting: number }>(`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE datname = current_database()
        AND application_name = 'el-outlet-ops-test'
        AND wait_event_type = 'Lock'
    `);
    if (rows[0].waiting >= count) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`${count} calls did not reach the lock barrier.`);
}

/** Runs the calls while `lockSql` is held, releasing it once all are blocked. */
async function raceBehindLock<T>(lockSql: string, params: unknown[], calls: (() => Promise<T>)[]) {
  const blocker = await control.connect();
  await blocker.query('BEGIN');
  await blocker.query(lockSql, params);
  const pending = Promise.allSettled(calls.map(call => call()));
  try {
    await waitForBlocked(calls.length);
  } finally {
    await blocker.query('COMMIT');
    blocker.release();
  }
  return pending;
}

test('B3.12: Concurrent creates with the same offlineId or idempotencyKey return one order', async () => {
  const ctx = await setupStoreWithOutlets('b312');
  const input = (idempotencyKey: string, offlineId?: string) => ({
    idempotencyKey,
    offlineId,
    phone: '9876543210',
    dueDate: '2100-01-01',
    entries: [{ productId: ctx.product.id, quantity: 1 }],
    outletId: ctx.outlet1.id,
  });

  // Blocking inserts into orders (reads still pass) lets both calls get past
  // the "already exists?" lookup before either inserts.
  const cases = [
    [input('b312-key-1', 'b312-offline'), input('b312-key-2', 'b312-offline')],
    [input('b312-key-3'), input('b312-key-3')],
  ];
  for (const [first, second] of cases) {
    const results = await raceBehindLock('LOCK TABLE orders IN SHARE MODE', [], [
      () => orders.createOrder(ctx.store.id, first, ctx.ownerUser.id),
      () => orders.createOrder(ctx.store.id, second, ctx.ownerUser.id),
    ]);
    assert.ok(results.every(r => r.status === 'fulfilled'), JSON.stringify(results));
    const [a, b] = results.map(r => (r as PromiseFulfilledResult<{ id: string }>).value);
    assert.equal(a.id, b.id);
  }
  assert.equal(await prisma.order.count({ where: { storeId: ctx.store.id } }), 2);
});

test('B3.13: Concurrent payments with the same clientActionId record one payment', async () => {
  const ctx = await setupStoreWithOutlets('b313');
  const order = await orders.createOrder(ctx.store.id, {
    idempotencyKey: 'b313-key',
    phone: '9876543210',
    dueDate: '2100-01-01',
    entries: [{ productId: ctx.product.id, quantity: 1 }],
    outletId: ctx.outlet1.id,
  }, ctx.ownerUser.id);

  const results = await raceBehindLock(
    'SELECT id FROM orders WHERE "orderNumber" = $1 FOR UPDATE',
    [Number(order.id.replace('EL-', ''))],
    [1, 2].map(() => () => orders.recordPayment(ctx.store.id, order.id, 1_000, 'Cash', 'b313-pay')),
  );
  assert.ok(results.every(r => r.status === 'fulfilled'), JSON.stringify(results));
  assert.equal(await prisma.payment.count({ where: { storeId: ctx.store.id } }), 1);
});

test('B3.14: Bulk-sync updates respect the employee outlet grant', async () => {
  const ctx = await setupStoreWithOutlets('b314');
  const newOrder = (key: string, outletId: string, offlineId?: string) => orders.createOrder(ctx.store.id, {
    idempotencyKey: key,
    offlineId,
    phone: '9876543210',
    dueDate: '2100-01-01',
    entries: [{ productId: ctx.product.id, quantity: 1 }],
    outletId,
  }, ctx.ownerUser.id);
  const foreign = await newOrder('b314-key-1', ctx.outlet2.id, 'b314-offline-2');
  const own = await newOrder('b314-key-2', ctx.outlet1.id);

  // Employee 1 is granted outlet 1 only.
  const results = await bulkSync(ctx.tokenEmp1, ctx.store.id, ctx.outlet1.id, [
    { clientActionId: 'b314-a1', type: 'update_status', orderRef: foreign.id, status: 'Ready' },
    { clientActionId: 'b314-a2', type: 'update_status', orderRef: 'b314-offline-2', status: 'Ready' },
    { clientActionId: 'b314-a3', type: 'record_payment', orderRef: foreign.id, amount: 1_000, method: 'Cash' },
    { clientActionId: 'b314-a4', type: 'update_status', orderRef: own.id, status: 'Ready' },
    {
      clientActionId: 'b314-a5',
      type: 'create_order',
      offlineCode: 'b314-new',
      payload: {
        idempotencyKey: 'b314-key-3',
        offlineId: 'b314-new',
        phone: '9876543210',
        dueDate: '2100-01-01',
        entries: [{ productId: ctx.product.id, quantity: 1 }],
        outletId: ctx.outlet1.id,
      },
    },
    { clientActionId: 'b314-a6', type: 'record_payment', orderRef: 'b314-new', amount: 1_000, method: 'Cash' },
  ]);
  assert.deepEqual(results.map(r => r.status), ['failed', 'failed', 'failed', 'success', 'success', 'success']);
  for (const r of results.slice(0, 3)) assert.equal(r.error, "You don't have access to this order's outlet.");

  const untouched = await prisma.order.findFirstOrThrow({ where: { storeId: ctx.store.id, offlineId: 'b314-offline-2' } });
  assert.equal(untouched.status, 'PENDING');
  assert.equal(await prisma.payment.count({ where: { orderId: untouched.id } }), 0);

  // The owner can still act on any outlet's order through bulk-sync.
  const owner = await bulkSync(ctx.tokenOwner, ctx.store.id, ctx.outlet1.id, [
    { clientActionId: 'b314-o1', type: 'update_status', orderRef: 'b314-offline-2', status: 'Ready' },
  ]);
  assert.equal(owner[0].status, 'success');
});

test('B3.15: orderRef is trimmed and an offlineId cannot look like an order code', async () => {
  const ctx = await setupStoreWithOutlets('b315');
  const results = await bulkSync(ctx.tokenOwner, ctx.store.id, ctx.outlet1.id, [
    {
      clientActionId: 'b315-a1',
      type: 'create_order',
      offlineCode: ' b315-offline ',
      payload: {
        idempotencyKey: 'b315-key-1',
        offlineId: ' b315-offline ',
        phone: '9876543210',
        dueDate: '2100-01-01',
        entries: [{ productId: ctx.product.id, quantity: 1 }],
        outletId: ctx.outlet1.id,
      },
    },
    // Same batch: resolved through the trimmed offlineCode.
    { clientActionId: 'b315-a2', type: 'update_status', orderRef: 'b315-offline\n', status: 'In Progress' },
  ]);
  assert.deepEqual(results.map(r => r.status), ['success', 'success']);
  assert.equal(results[0].order?.offlineId, 'b315-offline');

  // Later request: resolved through the stored offlineId.
  const later = await bulkSync(ctx.tokenOwner, ctx.store.id, ctx.outlet1.id, [
    { clientActionId: 'b315-a3', type: 'update_status', orderRef: '  b315-offline', status: 'Ready' },
  ]);
  assert.equal(later[0].status, 'success');
  assert.equal(later[0].order?.status, 'Ready');

  const res = await createOrdersRoute.POST(new NextRequest('http://localhost/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.tokenOwner}`,
      'X-Store-Id': ctx.store.id,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      idempotencyKey: 'b315-key-2',
      offlineId: 'EL-5',
      phone: '9876543210',
      dueDate: '2100-01-01',
      entries: [{ productId: ctx.product.id, quantity: 1 }],
      outletId: ctx.outlet1.id,
    }),
  }));
  assert.equal(res.status, 400);
  assert.equal(await prisma.order.count({ where: { storeId: ctx.store.id } }), 1);
});
