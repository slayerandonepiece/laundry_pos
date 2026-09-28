import { testPhone } from './test-phone';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { NextRequest } from 'next/server';
import { PrismaClient, Role, OutletStatus } from '../src/generated/prisma/client';
import { hashPassword } from '../src/server/auth/password';
import { generateSessionToken } from '../src/server/auth/token';
import { todayIST, parseCalendarDate } from '../src/server/dates';

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
    application_name: 'el-dashboard-rollups-test',
  }),
});
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
const control = new Pool({ ...connection, max: 2 });

let orders: typeof import('../src/server/services/orders');
let expenses: typeof import('../src/server/services/expenses');
let rollups: typeof import('../src/server/services/dashboard-rollups');
let platformMethods: typeof import('../src/server/services/platform-payment-methods');
let rollupsRoute: typeof import('../src/app/api/v1/dashboard/rollups/route');
let reconcileRoute: typeof import('../src/app/api/v1/dashboard/reconcile/route');

before(async () => {
  orders = await import('../src/server/services/orders');
  expenses = await import('../src/server/services/expenses');
  rollups = await import('../src/server/services/dashboard-rollups');
  platformMethods = await import('../src/server/services/platform-payment-methods');
  rollupsRoute = await import('../src/app/api/v1/dashboard/rollups/route');
  reconcileRoute = await import('../src/app/api/v1/dashboard/reconcile/route');
});

after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
  await control.end();
});

async function setupStoreEnvironment(suffix: string) {
  const store = await prisma.store.create({
    data: { id: `store-rollup-${suffix}`, name: `Store Rollup ${suffix}` },
  });

  const outlet1 = await prisma.outlet.create({
    data: {
      id: `outlet-1-${suffix}`,
      storeId: store.id,
      outletCode: `OUT1-${suffix.toUpperCase()}`,
      displayName: `Outlet 1 ${suffix}`,
      status: OutletStatus.ACTIVE,
    },
  });

  const outlet2 = await prisma.outlet.create({
    data: {
      id: `outlet-2-${suffix}`,
      storeId: store.id,
      outletCode: `OUT2-${suffix.toUpperCase()}`,
      displayName: `Outlet 2 ${suffix}`,
      status: OutletStatus.ACTIVE,
    },
  });

  const owner = await prisma.user.create({
    data: {
      phone: testPhone(`owner_rollup_${suffix}`),
      email: `owner-rollup-${suffix}@example.com`,
      name: `Owner Rollup ${suffix}`,
      passwordHash: await hashPassword('password123'),
      isSuperAdmin: false,
    },
  });

  await prisma.storeMembership.create({
    data: {
      userId: owner.id,
      storeId: store.id,
      role: Role.OWNER,
    },
  });

  const product = await prisma.product.create({
    data: {
      storeId: store.id,
      name: `Wash Service ${suffix}`,
      category: 'LAUNDRY',
      type: 'ITEM',
      price: 100,
      active: true,
    },
  });

  const cleanSuffix = suffix.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const platMethod = await platformMethods.createPlatformPaymentMethod({
    code: `CASH_${cleanSuffix}`,
    name: 'Cash',
  });
  await platformMethods.setOrganizationPaymentMethodEnabled(store.id, platMethod.id, true);

  return { store, outlet1, outlet2, owner, product, platMethod };
}

test('Task B6: transactional rollups on order creation, status update, and payments', async () => {
  const env = await setupStoreEnvironment('b6-orders');
  const todayStr = todayIST();
  const todayDate = parseCalendarDate(todayStr);

  // 1. Create order with initial payment
  const order1 = await orders.createOrder(
    env.store.id,
    {
      idempotencyKey: `idem-b6-1`,
      phone: '9876543210',
      customerName: 'Customer 1',
      dueDate: todayStr,
      entries: [{ productId: env.product.id, quantity: 3 }],
      initialPayment: { amount: 150, method: 'Cash' },
    },
    env.owner.id,
    env.outlet1.id,
  );

  // Assert DailyOutletSummary after creation
  const summary1 = await prisma.dailyOutletSummary.findUnique({
    where: {
      storeId_outletId_businessDate: {
        storeId: env.store.id,
        outletId: env.outlet1.id,
        businessDate: todayDate,
      },
    },
  });

  assert.ok(summary1);
  assert.equal(summary1.ordersCreatedCount, 1);
  assert.equal(summary1.grossOrderAmount, 300); // 3 * 100
  assert.equal(summary1.paymentsCollectedAmount, 150);
  assert.equal(summary1.ordersCompletedCount, 0);

  // Assert DailyOutletServiceSummary
  const serviceSummary1 = await prisma.dailyOutletServiceSummary.findUnique({
    where: {
      storeId_outletId_serviceName_businessDate: {
        storeId: env.store.id,
        outletId: env.outlet1.id,
        serviceName: env.product.name,
        businessDate: todayDate,
      },
    },
  });

  assert.ok(serviceSummary1);
  assert.equal(serviceSummary1.orderCount, 1);
  assert.equal(serviceSummary1.piecesCount, 3);
  assert.equal(serviceSummary1.amount, 300);

  // 2. Record second payment for the remaining balance
  await orders.recordPayment(env.store.id, order1.id, 150, 'Cash', 'pay-action-b6-1');

  const summaryAfterPay = await prisma.dailyOutletSummary.findUnique({
    where: {
      storeId_outletId_businessDate: {
        storeId: env.store.id,
        outletId: env.outlet1.id,
        businessDate: todayDate,
      },
    },
  });
  assert.equal(summaryAfterPay?.paymentsCollectedAmount, 300);

  // 3. Complete the order
  await orders.updateOrderStatus(env.store.id, order1.id, 'Delivered', env.owner.id);

  const summaryAfterDelivery = await prisma.dailyOutletSummary.findUnique({
    where: {
      storeId_outletId_businessDate: {
        storeId: env.store.id,
        outletId: env.outlet1.id,
        businessDate: todayDate,
      },
    },
  });
  assert.equal(summaryAfterDelivery?.ordersCompletedCount, 1);

  // Re-opening a delivered order must reverse the completion counter on the
  // original completion business date.
  await orders.updateOrderStatus(env.store.id, order1.id, 'Ready', env.owner.id);
  const summaryAfterReopen = await prisma.dailyOutletSummary.findUnique({
    where: {
      storeId_outletId_businessDate: {
        storeId: env.store.id,
        outletId: env.outlet1.id,
        businessDate: todayDate,
      },
    },
  });
  assert.equal(summaryAfterReopen?.ordersCompletedCount, 0);
});

test('Task B6: service order count is distinct per order and service', async () => {
  const env = await setupStoreEnvironment('b6-distinct-service');
  const todayStr = todayIST();
  const todayDate = parseCalendarDate(todayStr);

  // createOrder rejects duplicate product lines, but the rollup helper is
  // independently defensive because historical/imported data can contain
  // them. Two same-service lines still represent one service-order.
  await prisma.$transaction(tx => rollups.applyOrderCreationRollup(tx, {
    storeId: env.store.id,
    outletId: env.outlet1.id,
    orderDate: todayDate,
    lines: [
      { name: env.product.name, quantity: 1, amount: 100 },
      { name: env.product.name, quantity: 2, amount: 200 },
    ],
  }));

  const summary = await prisma.dailyOutletServiceSummary.findUnique({
    where: {
      storeId_outletId_serviceName_businessDate: {
        storeId: env.store.id,
        outletId: env.outlet1.id,
        serviceName: env.product.name,
        businessDate: todayDate,
      },
    },
  });
  assert.equal(summary?.orderCount, 1);
  assert.equal(summary?.piecesCount, 3);
  assert.equal(summary?.amount, 300);

});

test('Task B6: transactional rollups on expenses creation and markExpensePaid', async () => {
  const env = await setupStoreEnvironment('b6-exp');
  const todayStr = todayIST();
  const todayDate = parseCalendarDate(todayStr);

  // 1. Create expense already paid
  await expenses.createExpense(
    env.store.id,
    {
      title: 'Cleaning Supplies',
      category: 'SUPPLIES',
      amount: 450,
      due: todayStr,
      monthly: false,
      paidToday: true,
      outletId: env.outlet1.id,
    },
    env.outlet1.id,
  );

  const summary1 = await prisma.dailyOutletSummary.findUnique({
    where: {
      storeId_outletId_businessDate: {
        storeId: env.store.id,
        outletId: env.outlet1.id,
        businessDate: todayDate,
      },
    },
  });
  assert.equal(summary1?.expensesAmount, 450);

  // 2. Create unpaid expense, then mark as paid
  const exp2 = await expenses.createExpense(
    env.store.id,
    {
      title: 'Electricity',
      category: 'UTILITIES',
      amount: 600,
      due: todayStr,
      monthly: false,
      paidToday: false,
      outletId: env.outlet1.id,
    },
    env.outlet1.id,
  );

  // Before paying exp2, expensesAmount remains 450
  const summaryBeforePaid = await prisma.dailyOutletSummary.findUnique({
    where: {
      storeId_outletId_businessDate: {
        storeId: env.store.id,
        outletId: env.outlet1.id,
        businessDate: todayDate,
      },
    },
  });
  assert.equal(summaryBeforePaid?.expensesAmount, 450);

  // Mark paid
  await expenses.markExpensePaid(env.store.id, exp2.id);

  const summaryAfterPaid = await prisma.dailyOutletSummary.findUnique({
    where: {
      storeId_outletId_businessDate: {
        storeId: env.store.id,
        outletId: env.outlet1.id,
        businessDate: todayDate,
      },
    },
  });
  assert.equal(summaryAfterPaid?.expensesAmount, 1050);
});

test('Selected expense paid date controls rollup date and rejects invalid dates', async () => {
  const env = await setupStoreEnvironment('paid-date');
  const date = new Date(Date.parse(todayIST()) - 86400000).toISOString().slice(0, 10);
  const expense = await expenses.createExpense(env.store.id, {
    title: 'Backdated bill', category: 'SUPPLIES', amount: 300, due: todayIST(),
    monthly: false, paidToday: false, outletId: env.outlet1.id,
  });
  await assert.rejects(expenses.markExpensePaid(env.store.id, expense.id, '2026-02-30'));
  await assert.rejects(expenses.markExpensePaid(env.store.id, expense.id, '2099-01-01'));
  const result = await expenses.markExpensePaid(env.store.id, expense.id, date);
  assert.equal(result.paid, date);
  const retry = await expenses.markExpensePaid(env.store.id, expense.id, todayIST());
  assert.equal(retry.paid, date);
  const summary = await prisma.dailyOutletSummary.findUnique({ where: {
    storeId_outletId_businessDate: { storeId: env.store.id, outletId: env.outlet1.id, businessDate: parseCalendarDate(date) },
  } });
  assert.equal(summary?.expensesAmount, 300);
});

test('Task B6: retries and idempotent flows do not double count or inflate totals', async () => {
  const env = await setupStoreEnvironment('b6-idempotent');
  const todayStr = todayIST();
  const todayDate = parseCalendarDate(todayStr);

  // 1. Create order
  const order = await orders.createOrder(
    env.store.id,
    {
      idempotencyKey: `idem-retry-b6`,
      phone: '9876543210',
      customerName: 'Retry Customer',
      dueDate: todayStr,
      entries: [{ productId: env.product.id, quantity: 2 }],
      initialPayment: { amount: 100, method: 'Cash' },
    },
    env.owner.id,
    env.outlet1.id,
  );

  // Replay create order with identical idempotencyKey
  await orders.createOrder(
    env.store.id,
    {
      idempotencyKey: `idem-retry-b6`,
      phone: '9876543210',
      customerName: 'Retry Customer',
      dueDate: todayStr,
      entries: [{ productId: env.product.id, quantity: 2 }],
      initialPayment: { amount: 100, method: 'Cash' },
    },
    env.owner.id,
    env.outlet1.id,
  );

  let summary = await prisma.dailyOutletSummary.findUnique({
    where: {
      storeId_outletId_businessDate: {
        storeId: env.store.id,
        outletId: env.outlet1.id,
        businessDate: todayDate,
      },
    },
  });
  assert.equal(summary?.ordersCreatedCount, 1);
  assert.equal(summary?.grossOrderAmount, 200);
  assert.equal(summary?.paymentsCollectedAmount, 100);

  // 2. Replay payment with clientActionId
  await orders.recordPayment(env.store.id, order.id, 50, 'Cash', 'client-action-retry-1');
  await orders.recordPayment(env.store.id, order.id, 50, 'Cash', 'client-action-retry-1');

  summary = await prisma.dailyOutletSummary.findUnique({
    where: {
      storeId_outletId_businessDate: {
        storeId: env.store.id,
        outletId: env.outlet1.id,
        businessDate: todayDate,
      },
    },
  });
  assert.equal(summary?.paymentsCollectedAmount, 150);

  // 3. Replay status Delivered
  await orders.updateOrderStatus(env.store.id, order.id, 'Delivered', env.owner.id);
  await orders.updateOrderStatus(env.store.id, order.id, 'Delivered', env.owner.id);

  summary = await prisma.dailyOutletSummary.findUnique({
    where: {
      storeId_outletId_businessDate: {
        storeId: env.store.id,
        outletId: env.outlet1.id,
        businessDate: todayDate,
      },
    },
  });
  assert.equal(summary?.ordersCompletedCount, 1);
});

test('Task B6: reconciliation service rebuilds exact source-of-truth totals and logs audit record', async () => {
  const env = await setupStoreEnvironment('b6-reconcile');
  const todayStr = todayIST();
  const todayDate = parseCalendarDate(todayStr);

  // Create an order and an expense
  const order = await orders.createOrder(
    env.store.id,
    {
      idempotencyKey: `idem-recon-1`,
      phone: '9876543210',
      dueDate: todayStr,
      entries: [{ productId: env.product.id, quantity: 5 }],
      initialPayment: { amount: 500, method: 'Cash' },
    },
    env.owner.id,
    env.outlet1.id,
  );
  await orders.updateOrderStatus(env.store.id, order.id, 'Delivered', env.owner.id);

  await expenses.createExpense(
    env.store.id,
    {
      title: 'Rent',
      category: 'RENT',
      amount: 1200,
      due: todayStr,
      monthly: false,
      paidToday: true,
      outletId: env.outlet1.id,
    },
    env.outlet1.id,
  );

  // Corrupt summary to test reconciliation restoration
  await prisma.dailyOutletSummary.update({
    where: {
      storeId_outletId_businessDate: {
        storeId: env.store.id,
        outletId: env.outlet1.id,
        businessDate: todayDate,
      },
    },
    data: {
      grossOrderAmount: 9999,
      paymentsCollectedAmount: 9999,
      ordersCompletedCount: 99,
      expensesAmount: 9999,
    },
  });

  // Run reconciliation
  const reconResult = await rollups.reconcileDailyOutletRollups(
    env.store.id,
    env.outlet1.id,
    todayStr,
    todayStr,
    env.owner.id,
  );
  assert.equal(reconResult.daysReconciled, 1);

  // Assert summary restored to authoritative source
  const restoredSummary = await prisma.dailyOutletSummary.findUnique({
    where: {
      storeId_outletId_businessDate: {
        storeId: env.store.id,
        outletId: env.outlet1.id,
        businessDate: todayDate,
      },
    },
  });

  assert.equal(restoredSummary?.grossOrderAmount, 500);
  assert.equal(restoredSummary?.paymentsCollectedAmount, 500);
  assert.equal(restoredSummary?.ordersCreatedCount, 1);
  assert.equal(restoredSummary?.ordersCompletedCount, 1);
  assert.equal(restoredSummary?.expensesAmount, 1200);

  // Assert AuditLog created
  const auditLog = await prisma.auditLog.findFirst({
    where: {
      storeId: env.store.id,
      outletId: env.outlet1.id,
      action: 'RECONCILE_DAILY_ROLLUPS',
    },
  });
  assert.ok(auditLog);
  assert.equal(auditLog.actorId, env.owner.id);
});

test('Task B6: API endpoints GET /api/v1/dashboard/rollups and POST /api/v1/dashboard/reconcile', async () => {
  const env = await setupStoreEnvironment('b6-api');
  const todayStr = todayIST();

  await orders.createOrder(
    env.store.id,
    {
      idempotencyKey: `idem-api-1`,
      phone: '9876543210',
      dueDate: todayStr,
      entries: [{ productId: env.product.id, quantity: 1 }],
      initialPayment: { amount: 100, method: 'Cash' },
    },
    env.owner.id,
    env.outlet1.id,
  );

  const token = generateSessionToken();
  await prisma.session.create({
    data: {
      id: `session-rollups-${Date.now()}`,
      userId: env.owner.id,
      token,
      credentialVersion: 1,
      expiresAt: new Date(Date.now() + 86400000),
    },
  });

  // GET /api/v1/dashboard/rollups?outletId=...
  const reqGet = new NextRequest(
    `http://localhost/api/v1/dashboard/rollups?outletId=${env.outlet1.id}&from=${todayStr}&to=${todayStr}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-store-id': env.store.id,
      },
    },
  );

  const resGet = await rollupsRoute.GET(reqGet);
  assert.equal(resGet.status, 200);
  const jsonGet = await resGet.json();
  assert.equal(jsonGet.length, 1);
  assert.equal(jsonGet[0].outletId, env.outlet1.id);
  assert.equal(jsonGet[0].ordersCreatedCount, 1);
  assert.equal(jsonGet[0].grossOrderAmount, 100);

  // POST /api/v1/dashboard/reconcile
  const reqPost = new NextRequest('http://localhost/api/v1/dashboard/reconcile', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-store-id': env.store.id,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      outletId: env.outlet1.id,
      fromDate: todayStr,
      toDate: todayStr,
    }),
  });

  const resPost = await reconcileRoute.POST(reqPost);
  assert.equal(resPost.status, 200);
  const jsonPost = await resPost.json();
  assert.equal(jsonPost.success, true);
  assert.equal(jsonPost.daysReconciled, 1);
});

test('Expense edits and deletions correct paid totals and enforce store/outlet scope', async () => {
  const env = await setupStoreEnvironment('expense-corrections');
  const other = await setupStoreEnvironment('expense-corrections-other');
  const due = todayIST(), businessDate = parseCalendarDate(due);
  const bill = await expenses.createExpense(env.store.id, { title: 'Wrong bill', category: 'Supplies', amount: 450, due, monthly: false, paidToday: true, outletId: env.outlet1.id });
  const input = { title: 'Corrected bill', category: 'Maintenance', amount: 800, due, outletId: env.outlet2.id };
  await assert.rejects(expenses.updateExpense(other.store.id, bill.id, input));
  await assert.rejects(expenses.deleteExpense(other.store.id, bill.id));
  await assert.rejects(expenses.updateExpense(env.store.id, bill.id, { ...input, outletId: other.outlet1.id }));
  await assert.rejects(expenses.updateExpense(env.store.id, bill.id, { ...input, due: '2026-02-30' }));
  const updated = await expenses.updateExpense(env.store.id, bill.id, input);
  assert.equal(updated.paid, due);
  assert.equal(updated.amount, 800);
  const summary = (outletId: string) => prisma.dailyOutletSummary.findUniqueOrThrow({ where: { storeId_outletId_businessDate: { storeId: env.store.id, outletId, businessDate } } });
  assert.equal((await summary(env.outlet1.id)).expensesAmount, 0);
  assert.equal((await summary(env.outlet2.id)).expensesAmount, 800);
  // Retrying an edit must not inflate totals.
  await expenses.updateExpense(env.store.id, bill.id, input);
  assert.equal((await summary(env.outlet2.id)).expensesAmount, 800);
  const results = await Promise.allSettled([expenses.deleteExpense(env.store.id, bill.id), expenses.deleteExpense(env.store.id, bill.id)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await summary(env.outlet2.id)).expensesAmount, 0);
  assert.equal(await prisma.expense.findUnique({ where: { id: bill.id } }), null);
});

test('Deleting a monthly expense stops regeneration and retains other recorded bills', async () => {
  const env = await setupStoreEnvironment('expense-series-delete');
  const due = todayIST();
  const bill = await expenses.createExpense(env.store.id, { title: 'Mistaken monthly bill', category: 'Supplies', amount: 200, due, monthly: true, outletId: env.outlet1.id });
  const before = await expenses.listExpenses(env.store.id);
  assert.ok(before.length >= 2);
  await assert.rejects(expenses.updateExpense(env.store.id, bill.id, { title: bill.title, category: bill.category, amount: 200, due: '2099-01-01' }));
  await expenses.deleteExpense(env.store.id, bill.id);
  await Promise.all([expenses.listExpenses(env.store.id), expenses.listExpenses(env.store.id)]);
  const after = await expenses.listExpenses(env.store.id);
  assert.ok(!after.some(expense => expense.id === bill.id));
  assert.equal(after.length, before.length - 1);
  assert.equal((await prisma.recurringExpenseSeries.findUniqueOrThrow({ where: { id: bill.seriesId } })).active, false);
});

test('Correcting legacy paid expenses rebuilds missing summaries without negative totals', async () => {
  const env = await setupStoreEnvironment('legacy-expense-correction');
  const due = todayIST(), date = parseCalendarDate(due);
  const old = await prisma.expense.create({ data: { storeId: env.store.id, outletId: env.outlet1.id, title: 'Legacy bill', category: 'Other', amount: 500, dueDate: date, paidAt: date } });
  await prisma.expense.create({ data: { storeId: env.store.id, outletId: env.outlet1.id, title: 'Retained legacy bill', category: 'Other', amount: 200, dueDate: date, paidAt: date } });
  await expenses.updateExpense(env.store.id, old.id, { title: old.title, category: old.category, amount: 600, due, outletId: env.outlet1.id });
  const summary = () => prisma.dailyOutletSummary.findUniqueOrThrow({ where: { storeId_outletId_businessDate: { storeId: env.store.id, outletId: env.outlet1.id, businessDate: date } } });
  assert.equal((await summary()).expensesAmount, 800);
  await expenses.deleteExpense(env.store.id, old.id);
  assert.equal((await summary()).expensesAmount, 200);
});
