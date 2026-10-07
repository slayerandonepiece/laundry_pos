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
  application_name: 'el-order-import-test',
}) });
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;

let currentToken: string | undefined;
mock.module('next/headers', {
  namedExports: { cookies: async () => ({ get: (name: string) => (name === 'el_session' && currentToken ? { value: currentToken } : undefined), set: () => undefined, delete: () => undefined }) },
});

let imports: typeof import('../src/server/services/order-import');
let orders: typeof import('../src/server/services/orders');
let invoices: typeof import('../src/server/services/order-invoices');
let messages: typeof import('../src/server/services/order-messages');
let payments: typeof import('../src/server/services/platform-payment-methods');
let rollups: typeof import('../src/server/services/dashboard-rollups');
let session: typeof import('../src/server/auth/session');
let actions: typeof import('../src/features/super-admin/actions/order-import.actions');
let orderRoute: typeof import('../src/app/api/v1/orders/[orderCode]/route');

before(async () => {
  imports = await import('../src/server/services/order-import');
  orders = await import('../src/server/services/orders');
  invoices = await import('../src/server/services/order-invoices');
  messages = await import('../src/server/services/order-messages');
  payments = await import('../src/server/services/platform-payment-methods');
  rollups = await import('../src/server/services/dashboard-rollups');
  session = await import('../src/server/auth/session');
  actions = await import('../src/features/super-admin/actions/order-import.actions');
  orderRoute = await import('../src/app/api/v1/orders/[orderCode]/route');
});
after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
});

const DATE = '2026-08-14';
const slug = (key: string) => key.toUpperCase().replace(/[^A-Z0-9]/g, '_');

async function setupOrg(key: string) {
  const store = await prisma.store.create({ data: { id: `store-imp-${key}`, name: `Import ${key}` } });
  await prisma.subscription.create({ data: { storeId: store.id, depositAmount: 0, annualFeeAmount: 0, paidThroughDate: new Date('2100-01-01') } });
  const outlet = await prisma.outlet.create({ data: { outletCode: `IMP${slug(key)}`.slice(0, 20), storeId: store.id, displayName: `Outlet ${key}` } });
  const wash = await prisma.product.create({ data: { storeId: store.id, name: 'Wash & Fold', category: 'Laundry', type: 'WEIGHT', price: 0, active: true } });
  const iron = await prisma.product.create({ data: { storeId: store.id, name: 'Shirt iron', category: 'Laundry', type: 'ITEM', price: 1000, active: true } });
  const retired = await prisma.product.create({ data: { storeId: store.id, name: 'Old service', category: 'Laundry', type: 'ITEM', price: 500, active: false } });
  const make = async (role: string) => prisma.user.create({ data: { name: `${role} ${key}`, phone: testPhone(`imp_${role}_${key}`), passwordHash: await hashPassword('password123'), isSuperAdmin: role === 'admin' } });
  const [owner, employee, admin] = await Promise.all([make('owner'), make('employee'), make('admin')]);
  await prisma.storeMembership.create({ data: { storeId: store.id, userId: owner.id, role: 'OWNER' } });
  await prisma.storeMembership.create({ data: { storeId: store.id, userId: employee.id, role: 'EMPLOYEE' } });
  const cash = await payments.createPlatformPaymentMethod({ code: `IMP_CASH_${slug(key)}`, name: `Cash ${key}`, defaultStage: 'POST_ORDER' });
  const pre = await payments.createPlatformPaymentMethod({ code: `IMP_PRE_${slug(key)}`, name: `Pre ${key}`, defaultStage: 'PRE_ORDER' });
  await payments.saveOrganizationPaymentConfig(store.id, [
    { platformPaymentMethodId: cash.id, enabled: true },
    { platformPaymentMethodId: pre.id, enabled: true },
  ]);
  return { store, outlet, wash, iron, retired, owner, employee, admin, cash, pre };
}
type Org = Awaited<ReturnType<typeof setupOrg>>;

const sheet = (org: Org, rows: object[], extra: object = {}) => ({ storeId: org.store.id, outletId: org.outlet.id, date: DATE, paymentMethod: org.cash.name, rows, ...extra }) as import('../src/server/services/order-import').OrderImportInput;
const standard = [
  { phone: '9222222222', name: '', service: 'Wash & Fold', quantity: '3.5', price: '210' },
  { phone: '9222222222', name: '', service: 'Shirt iron', quantity: '6', price: '90' },
  { phone: '9845012345', name: 'Priya Sharma', service: 'Shirt iron', quantity: '2', price: '40.50' },
];
const date = parseCalendarDate(DATE);

async function seedKnownCustomers(org: Org) {
  for (const [phone, name] of [['9222222222', 'Ravi'], ['9845012345', 'Priya']]) {
    await prisma.order.create({ data: { storeId: org.store.id, outletId: org.outlet.id, customerName: name, phone, dueDate: new Date('2026-01-01') } });
  }
}

// What the daily rollups should hold for these orders, computed straight from the order rows.
async function freshAggregate(org: Org) {
  const rows = await prisma.order.findMany({ where: { storeId: org.store.id, importBatchId: { not: null } }, include: { lines: true, payments: true } });
  const services = new Map<string, { piecesCount: number; orderCount: number; amount: number }>();
  for (const order of rows) {
    const seen = new Set<string>();
    for (const line of order.lines) {
      const entry = services.get(line.name) ?? { piecesCount: 0, orderCount: 0, amount: 0 };
      entry.piecesCount += Math.round(Number(line.quantity));
      entry.amount += line.amount;
      if (!seen.has(line.name)) { entry.orderCount += 1; seen.add(line.name); }
      services.set(line.name, entry);
    }
  }
  return {
    summary: {
      ordersCreatedCount: rows.length, ordersCompletedCount: rows.length,
      grossOrderAmount: rows.reduce((sum, order) => sum + order.lines.reduce((s, line) => s + line.amount, 0), 0),
      paymentsCollectedAmount: rows.reduce((sum, order) => sum + order.payments.reduce((s, payment) => s + payment.amount, 0), 0),
    },
    services: Object.fromEntries([...services.entries()].sort()),
  };
}
async function stored(org: Org) {
  const summary = await prisma.dailyOutletSummary.findUnique({ where: { storeId_outletId_businessDate: { storeId: org.store.id, outletId: org.outlet.id, businessDate: date } } });
  const services = await prisma.dailyOutletServiceSummary.findMany({ where: { storeId: org.store.id, outletId: org.outlet.id, businessDate: date }, orderBy: { serviceName: 'asc' } });
  return {
    summary: summary && { ordersCreatedCount: summary.ordersCreatedCount, ordersCompletedCount: summary.ordersCompletedCount, grossOrderAmount: summary.grossOrderAmount, paymentsCollectedAmount: summary.paymentsCollectedAmount },
    services: Object.fromEntries(services.map(row => [row.serviceName, { piecesCount: row.piecesCount, orderCount: row.orderCount, amount: row.amount }])),
  };
}

test('an import saves delivered, paid orders grouped by customer, with the rollups a fresh aggregate gives', async () => {
  const org = await setupOrg('main');
  await seedKnownCustomers(org);
  const preview = await imports.previewOrderImport(sheet(org, standard));
  assert.equal(preview.ok, true);
  assert.deepEqual([preview.rowCount, preview.orderCount, preview.totalAmount], [3, 2, 34050]);
  assert.equal(await prisma.importBatch.count({ where: { storeId: org.store.id } }), 0, 'a preview writes nothing');

  const batch = await imports.importOrders(sheet(org, standard), org.admin.id, 'main-key-1');
  assert.deepEqual([batch.status, batch.orderCount, batch.rowCount, batch.totalAmount, batch.paymentMethod, batch.businessDate], ['IMPORTED', 2, 3, 34050, `Cash main`, DATE]);

  const imported = await prisma.order.findMany({ where: { importBatchId: { not: null } }, orderBy: { orderNumber: 'asc' }, include: { lines: true, payments: true, statusEvents: true } });
  assert.deepEqual(imported.map(order => Number(order.orderNumber)), [1_000_000_001, 1_000_000_002]);
  const first = imported[0];
  assert.deepEqual([first.phone, first.customerName, first.status, first.isImported], ['9222222222', 'Ravi', 'DELIVERED', true]);
  assert.equal(first.lines.length, 2);
  assert.deepEqual(first.lines.map(line => [line.name, line.unit, Number(line.quantity), line.amount]).sort(), [['Shirt iron', 'pcs', 6, 9000], ['Wash & Fold', 'kg', 3.5, 21000]]);
  assert.equal(first.payments.length, 1);
  assert.deepEqual([first.payments[0].amount, first.payments[0].method, first.payments[0].receiptNumber, first.payments[0].paidAt.toISOString().slice(0, 10)], [30000, 'Cash main', null, DATE]);
  assert.deepEqual([first.orderDate, first.dueDate, first.completedAt].map(value => value?.toISOString().slice(0, 10)), [DATE, DATE, DATE]);
  assert.deepEqual(first.statusEvents.map(event => [event.status, event.byUserId, event.at.toISOString()]), [['DELIVERED', org.admin.id, `${DATE}T06:30:00.000Z`]]);
  assert.equal(imported[1].customerName, 'Priya Sharma', 'a typed name wins over the name on file');

  // Rollups equal what the orders say, and equal what a full reconcile rebuilds.
  const expected = await freshAggregate(org);
  assert.deepEqual(await stored(org), expected);
  assert.deepEqual(expected.summary, { ordersCreatedCount: 2, ordersCompletedCount: 2, grossOrderAmount: 34050, paymentsCollectedAmount: 34050 });
  assert.deepEqual(expected.services['Shirt iron'], { piecesCount: 8, orderCount: 2, amount: 13050 });
  await rollups.reconcileDailyOutletRollups(org.store.id, org.outlet.id, DATE, DATE, org.admin.id);
  assert.deepEqual(await stored(org), expected, 'the import rollups match a full reconcile');
  assert.equal(await prisma.orderInvoice.count({ where: { storeId: org.store.id } }), 0, 'no invoice is created');
  assert.equal(await prisma.payment.count({ where: { storeId: org.store.id, receiptNumber: { not: null } } }), 0, 'no receipt number is consumed');
  assert.equal((await prisma.auditLog.findMany({ where: { storeId: org.store.id, action: 'IMPORT_ORDERS' } })).length, 1);
});

test('undo removes the batch and restores the rollups exactly; undoing again is a no-op', async () => {
  const org = await setupOrg('undo');
  await seedKnownCustomers(org);
  // Another import on the same day must be untouched by undoing the first.
  const keep = await imports.importOrders(sheet(org, [{ phone: '9000000001', name: 'Keep', service: 'Shirt iron', quantity: '1', price: '10' }]), org.admin.id, 'undo-keep');
  const after = await stored(org);
  const batch = await imports.importOrders(sheet(org, standard), org.admin.id, 'undo-key');
  assert.notDeepEqual(await stored(org), after);
  const undone = await imports.undoImportBatch(org.store.id, batch.id, org.admin.id);
  assert.deepEqual([undone.status, undone.canUndo], ['UNDONE', false]);
  assert.deepEqual(await stored(org), after, 'rollups are exactly what they were before the undone import');
  assert.equal(await prisma.order.count({ where: { importBatchId: batch.id } }), 0);
  assert.equal(await prisma.payment.count({ where: { storeId: org.store.id, method: 'Cash undo', amount: { gt: 1000 } } }), 0);
  assert.equal(await prisma.order.count({ where: { importBatchId: keep.id } }), 1);
  assert.deepEqual(await stored(org), await freshAggregate(org));

  const again = await imports.undoImportBatch(org.store.id, batch.id, org.admin.id);
  assert.equal(again.status, 'UNDONE');
  assert.deepEqual(await stored(org), after, 'a second undo changes nothing');
  assert.equal((await prisma.auditLog.findMany({ where: { storeId: org.store.id, action: 'UNDO_ORDER_IMPORT' } })).length, 1);
  assert.equal((await imports.listImportBatches(org.store.id)).filter(item => item.status === 'UNDONE').length, 1);
  await assert.rejects(imports.undoImportBatch(org.store.id, 'missing', org.admin.id), /Import not found/);
  const other = await setupOrg('undo-other');
  await assert.rejects(imports.undoImportBatch(other.store.id, keep.id, org.admin.id), /Import not found/);
  assert.equal(await prisma.order.count({ where: { importBatchId: keep.id } }), 1, 'another organization cannot undo this batch');
});

test('undo is refused once an imported order has been changed', async () => {
  const org = await setupOrg('changed');
  const batch = await imports.importOrders(sheet(org, standard), org.admin.id, 'changed-key');
  const before = await stored(org);
  await prisma.order.updateMany({ where: { importBatchId: batch.id, phone: '9845012345' }, data: { customerName: 'Corrected by hand' } });
  await assert.rejects(imports.undoImportBatch(org.store.id, batch.id, org.admin.id), /can't be undone because order \d+ was changed/);
  assert.equal(await prisma.order.count({ where: { importBatchId: batch.id } }), 2);
  assert.deepEqual(await stored(org), before);
  assert.equal((await prisma.importBatch.findUniqueOrThrow({ where: { id: batch.id } })).status, 'IMPORTED');
});

test('resubmitting the same import key, even concurrently, imports once', async () => {
  const org = await setupOrg('dupe');
  const results = await Promise.all([1, 2, 3, 4].map(() => imports.importOrders(sheet(org, standard), org.admin.id, 'dupe-key')));
  assert.equal(new Set(results.map(result => result.id)).size, 1);
  assert.equal(await prisma.importBatch.count({ where: { storeId: org.store.id } }), 1);
  assert.equal(await prisma.order.count({ where: { storeId: org.store.id } }), 2);
  assert.equal(await prisma.payment.count({ where: { storeId: org.store.id } }), 2);
  const replay = await imports.importOrders(sheet(org, standard), org.admin.id, 'dupe-key');
  assert.equal(replay.id, results[0].id);
  assert.deepEqual(await stored(org), await freshAggregate(org));
  assert.equal((await stored(org)).summary?.ordersCreatedCount, 2, 'rollups were applied once');
  // A different key is a different import.
  await imports.importOrders(sheet(org, standard), org.admin.id, 'dupe-key-2');
  assert.equal(await prisma.order.count({ where: { storeId: org.store.id } }), 4);
  await assert.rejects(imports.importOrders(sheet(org, standard), org.admin.id, ''), /import key/);
});

test('name rules: a typed name is never replaced, a blank name keeps the customer, and rows share a typed name', async () => {
  const org = await setupOrg('names');
  await seedKnownCustomers(org);
  await imports.importOrders(sheet(org, [
    { phone: '9222222222', name: '', service: 'Shirt iron', quantity: '1', price: '10' },           // blank: keeps "Ravi"
    { phone: '9845012345', name: 'Typed Priya', service: 'Shirt iron', quantity: '1', price: '10' }, // typed beats "Priya"
    { phone: '9333333333', name: '', service: 'Shirt iron', quantity: '1', price: '10' },           // unknown and blank
    { phone: '9444444444', name: '', service: 'Shirt iron', quantity: '1', price: '10' },           // gets the name typed on another row
    { phone: '9444444444', name: 'Meena', service: 'Shirt iron', quantity: '2', price: '20' },
    { phone: '9444444444', name: 'Someone else', service: 'Shirt iron', quantity: '3', price: '30' },
  ], {}), org.admin.id, 'names-key');
  const byPhone = Object.fromEntries((await prisma.order.findMany({ where: { storeId: org.store.id, isImported: true } })).map(order => [order.phone, order.customerName]));
  assert.deepEqual(byPhone, { '9222222222': 'Ravi', '9845012345': 'Typed Priya', '9333333333': '', '9444444444': 'Meena' });
  // The customer's earlier order keeps its own name: nothing was blanked or rewritten.
  assert.equal((await prisma.order.findFirstOrThrow({ where: { storeId: org.store.id, phone: '9845012345', isImported: false } })).customerName, 'Priya');
  const names = await imports.customerNames(org.store.id, ['9222222222', '+91 9333333333', 'x']);
  assert.equal(names.get('9222222222'), 'Ravi');
  assert.equal(names.has('9333333333'), false);
  // Names are per organization.
  const other = await setupOrg('names-other');
  assert.equal((await imports.customerNames(other.store.id, ['9222222222'])).size, 0);
});

test('invalid sheets return precise row errors and write nothing', async () => {
  const org = await setupOrg('invalid');
  const other = await setupOrg('invalid-other');
  const bad = [
    { phone: '12345', name: '', service: 'Shirt iron', quantity: '1', price: '10' },            // row 1: phone
    { phone: '9222222222', name: '', service: 'Dry cleaning', quantity: '1', price: '10' },     // row 2: unknown service
    { phone: '9222222222', name: '', service: 'Shirt iron', quantity: '2.5', price: '10' },      // row 3: item quantity
    { phone: '9222222222', name: '', service: 'Wash & Fold', quantity: '0', price: '10' },       // row 4: quantity
    { phone: '9222222222', name: '', service: 'Wash & Fold', quantity: '1.2345', price: '10' },  // row 5: decimals
    { phone: '9222222222', name: '', service: 'Shirt iron', quantity: '1', price: '-5' },        // row 6: price
    { phone: '9222222222', name: '', service: 'Shirt iron', quantity: '1', price: 'abc' },       // row 7: price
    { phone: '9222222222', name: 'x'.repeat(101), service: 'Shirt iron', quantity: '1', price: '1' }, // row 8: name
    { phone: '9222222222', name: '', service: 'Old service', quantity: '1', price: '5' },        // row 9: fine (retired service)
    { phone: '9222222222', name: '', service: 'shirt IRON', quantity: '1', price: '0' },         // row 10: fine (case, free)
  ];
  const preview = await imports.previewOrderImport(sheet(org, bad));
  assert.equal(preview.ok, false);
  const where = preview.errors.map(error => `${error.row}:${error.field}`).sort();
  assert.deepEqual(where, ['1:phone', '2:service', '3:quantity', '4:quantity', '5:quantity', '6:price', '7:price', '8:name'].sort());
  assert.match(preview.errors.find(error => error.row === 3)!.message, /whole numbers/);
  await assert.rejects(imports.importOrders(sheet(org, bad), org.admin.id, 'invalid-key'), /Enter a customer number|catalogue|whole numbers|quantity|price|Names/);
  assert.equal(await prisma.order.count({ where: { storeId: org.store.id } }), 0);
  assert.equal(await prisma.importBatch.count({ where: { storeId: org.store.id } }), 0);
  assert.equal(await prisma.dailyOutletSummary.count({ where: { storeId: org.store.id } }), 0);

  const general = async (input: ReturnType<typeof sheet>) => (await imports.previewOrderImport(input)).errors.filter(error => error.row === 0).map(error => error.message);
  const good = [standard[0]];
  const anyError = async (input: ReturnType<typeof sheet>) => (await imports.previewOrderImport(input)).errors.map(error => error.message);
  assert.deepEqual(await general(sheet(org, good, { date: '2999-01-01' })), ['The date cannot be in the future.']);
  assert.deepEqual(await general(sheet(org, good, { date: todayIST() })), []);
  assert.deepEqual(await general(sheet(org, good, { date: '2026-02-31' })), ['The date is not a real calendar day.']);
  assert.deepEqual(await general(sheet(org, good, { date: '' })), ['Choose the order date.']);
  assert.deepEqual(await general(sheet(org, [])), ['Add at least one row.']);
  assert.deepEqual(await general(sheet(org, Array.from({ length: imports.MAX_IMPORT_ROWS + 1 }, () => standard[0]))), [`Import at most ${imports.MAX_IMPORT_ROWS} rows at a time.`]);
  assert.match((await anyError(sheet(org, good, { paymentMethod: '' })))[0], /Choose the payment method/);
  assert.match((await anyError(sheet(org, good, { paymentMethod: org.pre.name })))[0], /can't be used after the order is placed/);
  assert.match((await anyError(sheet(org, good, { paymentMethod: 'COD' })))[0], /Cash on delivery|no longer available/);
  assert.match((await anyError(sheet(org, good, { paymentMethod: `Cash ${'invalid-other'}` })))[0], /no longer available/);
  assert.match((await anyError(sheet(org, [{ ...good[0], paymentMethod: org.pre.name }], { paymentMethod: org.cash.name })))[0], /can't be used after the order is placed/);
  assert.deepEqual(await anyError(sheet(org, [{ ...good[0], paymentMethod: org.cash.name }], { paymentMethod: '' })), [], 'a row can name its own method with no sheet default');
  assert.match((await anyError(sheet(org, [good[0], { ...good[0], paymentMethod: 'Cash other' }])))[0] ?? '', /same payment method|no longer available/);
  assert.deepEqual(await general(sheet(org, good, { outletId: other.outlet.id })), ['Choose an outlet that belongs to this organization.']);
  assert.deepEqual(await general(sheet(org, good, { storeId: 'missing-store' })), ['Organization not found.']);
});

test('imported orders stay out of invoices, messages and mobile sync, and cannot be paid or changed', async () => {
  const org = await setupOrg('excluded');
  await imports.importOrders(sheet(org, [standard[0]]), org.admin.id, 'excluded-key');
  const live = await orders.createOrder(org.store.id, { idempotencyKey: 'excluded-live', phone: '9876543210', dueDate: todayIST(), entries: [{ productId: org.iron.id, quantity: 1 }], outletId: org.outlet.id }, org.owner.id, org.outlet.id);
  const code = orders.toOrderCode((await prisma.order.findFirstOrThrow({ where: { storeId: org.store.id, isImported: true } })).orderNumber);

  await assert.rejects(invoices.getOrCreateOrderInvoice(org.store.id, code), /Invoices aren't available for imported orders/);
  const message = await messages.buildOrderMessage(org.store.id, code);
  assert.deepEqual([message.enabled, message.text, message.pdfPath], [false, '', null]);
  const sync = await orders.listOrdersSince(org.store.id, null, 100);
  assert.deepEqual(sync.orders.map(order => order.id), [live.id], 'only the live order reaches devices');
  const listed = await orders.listOrders(org.store.id);
  const imported = listed.find(order => order.id === code)!;
  assert.deepEqual([imported.imported, imported.status, imported.completed, imported.payments.length, imported.history?.length], [true, 'Delivered', DATE, 1, 1], 'it still shows in the order history');
  assert.equal(live.imported, undefined);
  // Delivered is final and it is paid in full, so nothing further can be done to it.
  await assert.rejects(orders.updateOrderStatus(org.store.id, code, 'Ready', org.owner.id), /final/);
  await assert.rejects(orders.recordPayment(org.store.id, code, 100, org.cash.name), /outstanding balance/);

  // The mobile detail route reports that an invoice cannot be generated.
  const user = await prisma.user.findUniqueOrThrow({ where: { id: org.owner.id } });
  const token = (await session.createSessionRow(user.id, user.credentialVersion)).token;
  const response = await orderRoute.GET(new Request(`http://localhost/api/v1/orders/${code}`, { headers: { Authorization: `Bearer ${token}`, 'X-Store-Id': org.store.id } }) as unknown as NextRequest, { params: Promise.resolve({ orderCode: code }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).invoice.canGenerate, false);
});

test('imports use the order number counter and leave no gaps for live orders', async () => {
  const org = await setupOrg('counter');
  const first = await orders.createOrder(org.store.id, { idempotencyKey: 'counter-1', phone: '9876543210', dueDate: todayIST(), entries: [{ productId: org.iron.id, quantity: 1 }] }, org.owner.id);
  await imports.importOrders(sheet(org, standard), org.admin.id, 'counter-key');
  const last = await orders.createOrder(org.store.id, { idempotencyKey: 'counter-2', phone: '9876543210', dueDate: todayIST(), entries: [{ productId: org.iron.id, quantity: 1 }] }, org.owner.id);
  assert.deepEqual([first.id, last.id], ['1000000001', '1000000004']);
});

test('only a Super Admin can import, preview, undo or look up customers', async () => {
  const org = await setupOrg('roles');
  const other = await setupOrg('roles-other');
  const login = async (userId: string) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return (await session.createSessionRow(user.id, user.credentialVersion)).token;
  };
  const tokens = { owner: await login(org.owner.id), employee: await login(org.employee.id), otherOwner: await login(other.owner.id), admin: await login(org.admin.id) };
  const input = sheet(org, [standard[0]]);
  const calls: [string, () => Promise<unknown>][] = [
    ['context', () => actions.fetchImportContextAction(org.store.id)],
    ['preview', () => actions.previewOrderImportAction(input)],
    ['import', () => actions.importOrdersAction(input, 'roles-key')],
    ['undo', () => actions.undoImportBatchAction(org.store.id, 'any')],
    ['lookup', () => actions.lookupImportCustomerNamesAction(org.store.id, ['9222222222'])],
  ];
  const denied = (code: string) => (error: unknown) => (error as { code?: string }).code === code;
  for (const [name, call] of calls) {
    currentToken = undefined;
    await assert.rejects(call(), denied('UNAUTHENTICATED'), `${name}: signed out`);
    for (const role of ['owner', 'employee', 'otherOwner'] as const) {
      currentToken = tokens[role];
      await assert.rejects(call(), denied('FORBIDDEN'), `${name}: ${role}`);
    }
  }
  assert.equal(await prisma.importBatch.count({ where: { storeId: org.store.id } }), 0, 'denied calls wrote nothing');

  currentToken = tokens.admin;
  const context = await actions.fetchImportContextAction(org.store.id);
  assert.deepEqual(context.services.map(service => service.name).sort(), ['Old service', 'Shirt iron', 'Wash & Fold']);
  assert.deepEqual(context.methods.map(method => method.name), [`Cash roles`], 'only methods that can collect after the order are offered');
  assert.deepEqual(context.outlets.map(outlet => outlet.name), ['Outlet roles']);
  const preview = await actions.previewOrderImportAction(input);
  assert.equal(preview.ok, true);
  const result = await actions.importOrdersAction(input, 'roles-key');
  assert.equal(result.ok, true);
  const refused = await actions.importOrdersAction(sheet(org, [{ ...standard[0], service: 'Nope' }]), 'roles-key-2');
  assert.deepEqual(refused.ok, false);
  assert.deepEqual(await actions.lookupImportCustomerNamesAction(org.store.id, ['9222222222']), {});
  if (result.ok) {
    assert.equal((await actions.undoImportBatchAction(org.store.id, result.batch.id)).ok, true);
    // An administrator cannot reach a batch through another organization's id.
    assert.deepEqual(await actions.undoImportBatchAction(other.store.id, result.batch.id), { ok: false, error: 'Import not found.' });
  }
  currentToken = undefined;
});
