import { testPhone } from './test-phone';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../src/server/auth/password';
import { addDays, parseCalendarDate, todayIST } from '../src/server/dates';

const socket = process.env.QA_SUBSCRIPTION_PG_SOCKET;
if (!socket?.startsWith('/tmp/el-subscription-test-') || !socket.endsWith('/socket')) {
  throw new Error('Run npm run test:subscription-payments to create an isolated PostgreSQL cluster.');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({
  host: socket, user: 'subscription_test', database: 'postgres', port: 5432,
  application_name: 'el-sales-search-test',
}) });
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;

let orders: typeof import('../src/server/services/orders');
let payments: typeof import('../src/server/services/platform-payment-methods');

before(async () => {
  orders = await import('../src/server/services/orders');
  payments = await import('../src/server/services/platform-payment-methods');
});
after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
});

const today = todayIST();
const yesterday = addDays(today, -1);
const later = addDays(today, 5);
const Q1 = { from: '2026-01-01', to: '2026-03-31' };
const slug = (key: string) => key.toUpperCase().replace(/[^A-Z0-9]/g, '_');

async function setupOrg(key: string) {
  const store = await prisma.store.create({ data: { id: `store-sales-${key}`, name: `Sales ${key}` } });
  await prisma.subscription.create({ data: { storeId: store.id, depositAmount: 0, annualFeeAmount: 0, paidThroughDate: new Date('2100-01-01') } });
  const outletA = await prisma.outlet.create({ data: { outletCode: `SLA${slug(key)}`.slice(0, 20), storeId: store.id, displayName: `A ${key}` } });
  const outletB = await prisma.outlet.create({ data: { outletCode: `SLB${slug(key)}`.slice(0, 20), storeId: store.id, displayName: `B ${key}` } });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Wash', category: 'Laundry', type: 'ITEM', price: 10000, active: true } });
  const owner = await prisma.user.create({ data: { name: `Owner ${key}`, phone: testPhone(`sales_owner_${key}`), passwordHash: await hashPassword('password123') } });
  await prisma.storeMembership.create({ data: { storeId: store.id, userId: owner.id, role: 'OWNER' } });
  const cash = await payments.createPlatformPaymentMethod({ code: `SL_CASH_${slug(key)}`, name: `Cash ${key}`, defaultStage: 'BOTH' });
  await payments.saveOrganizationPaymentConfig(store.id, [{ platformPaymentMethodId: cash.id, enabled: true }]);
  return { store, outletA, outletB, product, owner, cash };
}
type Org = Awaited<ReturnType<typeof setupOrg>>;

/** Create an order through the service, then place it on the given dates and status. */
async function place(org: Org, key: string, data: { name?: string; phone?: string; date: string; due: string; status?: 'PENDING' | 'IN_PROGRESS' | 'READY' | 'DELIVERED'; paid?: number; outlet?: 'A' | 'B'; cancelled?: boolean; imported?: boolean }) {
  const outletId = data.outlet === 'B' ? org.outletB.id : org.outletA.id;
  const order = await orders.createOrder(org.store.id, {
    idempotencyKey: `${org.store.id}-${key}`, customerName: data.name ?? 'Walk-in', phone: data.phone ?? '9000000000', dueDate: today,
    entries: [{ productId: org.product.id, quantity: 2 }], outletId,
    ...(data.paid ? { initialPayment: { amount: data.paid, method: org.cash.name } } : {}),
  }, org.owner.id, outletId);
  await prisma.order.update({
    where: { storeId_orderNumber: { storeId: org.store.id, orderNumber: orders.parseOrderCode(order.id)! } },
    data: { orderDate: parseCalendarDate(data.date), dueDate: parseCalendarDate(data.due), status: data.status ?? 'PENDING', legacyCancelled: data.cancelled ?? false, isImported: data.imported ?? false },
  });
  return order.id;
}

const ids = (result: { orders: { id: string }[] }) => result.orders.map(order => order.id);

test('Sales register search: dates, search, statuses, due filters, paging and isolation', async () => {
  const org = await setupOrg('main');
  const other = await setupOrg('other');
  const empty = await setupOrg('empty');

  const o1 = await place(org, 'o1', { name: 'Ravi Kumar', phone: '9876543210', date: '2026-01-10', due: later });
  const o2 = await place(org, 'o2', { name: 'Sita', phone: '9123456789', date: '2026-01-20', due: yesterday, status: 'DELIVERED', paid: 20000, imported: true });
  const o3 = await place(org, 'o3', { name: 'Arun', date: '2026-02-05', due: yesterday, status: 'READY', paid: 5000 });
  const o4 = await place(org, 'o4', { name: 'Meena', date: '2026-02-06', due: today, status: 'IN_PROGRESS' });
  await place(org, 'o5', { name: 'Gone', date: '2026-03-31', due: yesterday, cancelled: true });
  const o6 = await place(org, 'o6', { name: 'Bina', date: '2026-02-10', due: later, outlet: 'B' });
  const o7 = await place(org, 'o7', { name: 'Kiran', date: '2026-01-25', due: yesterday, status: 'DELIVERED' });
  // Same customer details in another organization must never show up.
  await place(other, 'x1', { name: 'Ravi Kumar', phone: '9876543210', date: '2026-01-10', due: yesterday });

  const base = { ...Q1, page: 1, pageSize: 25 as const };
  const all = await orders.searchOrders(org.store.id, base);
  // Newest order date first, cancelled excluded, imported included.
  assert.deepEqual(ids(all), [o6, o4, o3, o7, o2, o1]);
  assert.equal(all.total, 6);
  assert.equal(all.hasOrders, true);
  assert.equal(all.orders.find(order => order.id === o2)?.imported, true);

  // Date range is inclusive and applies to the order date.
  assert.deepEqual(ids(await orders.searchOrders(org.store.id, { ...base, from: '2026-02-05', to: '2026-02-06' })), [o4, o3]);
  const outOfRange = await orders.searchOrders(org.store.id, { ...base, from: '2026-10-01', to: '2026-10-31' });
  assert.equal(outOfRange.total, 0);
  assert.equal(outOfRange.hasOrders, true, 'the store still has orders outside the range');

  // Outlet scope.
  assert.deepEqual(ids(await orders.searchOrders(org.store.id, { ...base, outletId: org.outletA.id })), [o4, o3, o7, o2, o1]);
  assert.deepEqual(ids(await orders.searchOrders(org.store.id, { ...base, outletId: org.outletB.id })), [o6]);

  // Search covers name, phone and order code, case-insensitively, as "name phone code".
  assert.deepEqual(ids(await orders.searchOrders(org.store.id, { ...base, q: 'RAVI' })), [o1]);
  assert.deepEqual(ids(await orders.searchOrders(org.store.id, { ...base, q: '91234' })), [o2]);
  assert.deepEqual(ids(await orders.searchOrders(org.store.id, { ...base, q: o3 })), [o3]);
  assert.deepEqual(ids(await orders.searchOrders(org.store.id, { ...base, q: 'kumar 98765' })), [o1]);
  assert.equal((await orders.searchOrders(org.store.id, { ...base, q: '%' })).total, 0, 'no LIKE wildcards');

  // Work and payment status.
  assert.deepEqual(ids(await orders.searchOrders(org.store.id, { ...base, work: 'Delivered' })), [o7, o2]);
  assert.deepEqual(ids(await orders.searchOrders(org.store.id, { ...base, work: 'Pending' })), [o6, o1]);
  assert.deepEqual(ids(await orders.searchOrders(org.store.id, { ...base, work: 'In Progress' })), [o4]);
  assert.deepEqual(ids(await orders.searchOrders(org.store.id, { ...base, pay: 'Paid' })), [o2]);
  assert.deepEqual(ids(await orders.searchOrders(org.store.id, { ...base, pay: 'Part-paid' })), [o3]);
  assert.deepEqual(ids(await orders.searchOrders(org.store.id, { ...base, pay: 'Unpaid' })), [o6, o4, o7, o1]);
  assert.deepEqual(ids(await orders.searchOrders(org.store.id, { ...base, work: 'Ready', pay: 'Part-paid', q: 'arun' })), [o3]);

  // Due today / Late / attention: open orders by due date, regardless of the period.
  const elsewhere = { ...base, from: '2020-01-01', to: '2020-01-31' };
  assert.deepEqual(ids(await orders.searchOrders(org.store.id, { ...elsewhere, due: 'today' })), [o4]);
  assert.deepEqual(ids(await orders.searchOrders(org.store.id, { ...elsewhere, due: 'late' })), [o3]);
  assert.deepEqual(ids(await orders.searchOrders(org.store.id, { ...elsewhere, due: 'attention' })), [o4, o3]);

  // Store isolation and the empty store.
  const otherAll = await orders.searchOrders(other.store.id, base);
  assert.equal(otherAll.total, 1);
  assert.ok(!otherAll.orders.some(order => ids(all).includes(order.id) && order.name !== 'Ravi Kumar'));
  assert.equal((await orders.searchOrders(other.store.id, { ...base, outletId: org.outletA.id })).total, 0, 'an outlet of another store finds nothing');
  const none = await orders.searchOrders(empty.store.id, base);
  assert.deepEqual({ total: none.total, hasOrders: none.hasOrders }, { total: 0, hasOrders: false });
  const emptyOutlet = await orders.searchOrders(empty.store.id, { ...base, outletId: empty.outletA.id });
  assert.equal(emptyOutlet.hasOrders, false);

  // Pagination: totals, page slices, and a page past the end clamps to the last one.
  for (let index = 0; index < 12; index += 1) {
    await place(empty, `p${index}`, { name: `Page ${index}`, date: `2026-03-${String(index + 1).padStart(2, '0')}`, due: later });
  }
  const first = await orders.searchOrders(empty.store.id, { ...base, pageSize: 10 });
  const second = await orders.searchOrders(empty.store.id, { ...base, pageSize: 10, page: 2 });
  assert.deepEqual([first.total, first.orders.length, second.orders.length, second.page], [12, 10, 2, 2]);
  assert.equal(first.orders[0].name, 'Page 11');
  assert.deepEqual(second.orders.map(order => order.name), ['Page 1', 'Page 0']);
  const beyond = await orders.searchOrders(empty.store.id, { ...base, pageSize: 10, page: 9 });
  assert.equal(beyond.page, 2);
  assert.deepEqual(ids(beyond), ids(second));

  // Input validation.
  await assert.rejects(orders.searchOrders(org.store.id, { ...base, from: '2026-03-01', to: '2026-02-01' }));
  await assert.rejects(orders.searchOrders(org.store.id, { ...base, from: '2026-02-31' }));
  await assert.rejects(orders.searchOrders(org.store.id, { ...base, pageSize: 30 as never }));
});
