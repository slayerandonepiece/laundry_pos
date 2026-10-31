import { testPhone } from './test-phone';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../src/server/auth/password';
import { todayIST } from '../src/server/dates';

const socket = process.env.QA_SUBSCRIPTION_PG_SOCKET;
if (!socket?.startsWith('/tmp/el-subscription-test-') || !socket.endsWith('/socket')) {
  throw new Error('Run npm run test:subscription-payments to create an isolated PostgreSQL cluster.');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({
  host: socket, user: 'subscription_test', database: 'postgres', port: 5432,
  application_name: 'el-document-numbering-test',
}) });
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
let orders: typeof import('../src/server/services/orders');
let invoices: typeof import('../src/server/services/order-invoices');
let numbering: typeof import('../src/server/numbering');
let orgNumbering: typeof import('../src/server/services/org-numbering');
let storesService: typeof import('../src/server/services/stores');

before(async () => {
  orders = await import('../src/server/services/orders');
  invoices = await import('../src/server/services/order-invoices');
  numbering = await import('../src/server/numbering');
  orgNumbering = await import('../src/server/services/org-numbering');
  storesService = await import('../src/server/services/stores');
});
after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
});

async function setupOrg(key: string) {
  const store = await prisma.store.create({ data: { id: `store-num-${key}`, name: `Numbering ${key}` } });
  await prisma.subscription.create({ data: { storeId: store.id, depositAmount: 0, annualFeeAmount: 0, paidThroughDate: new Date('2100-01-01') } });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Wash', category: 'Laundry', type: 'ITEM', price: 100, active: true } });
  const actor = await prisma.user.create({ data: { name: `Owner ${key}`, phone: testPhone(`numbering_${key}`), passwordHash: await hashPassword('password123') } });
  return { store, product, actor };
}

type Org = Awaited<ReturnType<typeof setupOrg>>;
const newOrder = (org: Org, key: string) => orders.createOrder(org.store.id, {
  idempotencyKey: key, phone: '9876543210', dueDate: todayIST(), entries: [{ productId: org.product.id, quantity: 1 }],
}, org.actor.id);

// An order that is delivered and paid in full on `orderDate`, so an invoice may be issued.
async function settledOrder(org: Org, key: string, orderDate: string) {
  const order = await newOrder(org, key);
  const number = orders.parseOrderCode(order.id)!;
  const row = await prisma.order.update({
    where: { storeId_orderNumber: { storeId: org.store.id, orderNumber: number } },
    data: { orderDate: new Date(`${orderDate}T00:00:00.000Z`), status: 'DELIVERED', completedAt: new Date(`${orderDate}T00:00:00.000Z`) },
  });
  await prisma.payment.create({ data: { orderId: row.id, storeId: org.store.id, amount: 100, method: 'Cash', paidAt: new Date(`${orderDate}T00:00:00.000Z`) } });
  return order;
}

test('financial year ends in March IST and invoice/receipt numbers are a single line', () => {
  assert.equal(numbering.financialYearEnding('2027-03-31'), 2027);
  assert.equal(numbering.financialYearEnding('2027-04-01'), 2028);
  assert.equal(numbering.financialYearEnding('2026-12-31'), 2027);
  assert.equal(numbering.formatDocumentNumber('INVOICE', '001', 2027, 632), 'IN001/27/0000632');
  assert.equal(numbering.formatDocumentNumber('RECEIPT', '00999', 2028, BigInt(1)), 'RC00999/28/0000001');
  assert.throws(() => numbering.financialYearEnding('27-03-2027'));
});

test('order codes: new orders are a plain 10-digit number and legacy EL- codes still resolve', () => {
  assert.equal(orders.toOrderCode(BigInt(1_000_004_314)), '1000004314');
  assert.equal(orders.toOrderCode(847), 'EL-847');
  assert.equal(orders.parseOrderCode('1000004314'), 1_000_004_314);
  assert.equal(orders.parseOrderCode('EL-847'), 847);
  assert.equal(orders.parseOrderCode(' EL-847 '), 847);
  for (const bad of ['', 'EL-', 'EL-1234567890', '847', '999999999', '10000043140', 'ORD-5', '1000000000x']) {
    assert.equal(orders.parseOrderCode(bad), null, bad);
  }
});

test('concurrent order creation in one organization yields consecutive unique numbers from the base', async () => {
  const org = await setupOrg('concurrent');
  const created = await Promise.all(Array.from({ length: 8 }, (_, i) => newOrder(org, `concurrent-${i}`)));
  const numbers = created.map(order => Number(order.id)).sort((a, b) => a - b);
  assert.deepEqual(numbers, Array.from({ length: 8 }, (_, i) => 1_000_000_001 + i));
  assert.ok(created.every(order => /^[1-9]\d{9}$/.test(order.id)));
});

test('invoice and receipt counters are consecutive under concurrency and restart each financial year', async () => {
  const org = await setupOrg('fy');
  const alloc = (date: string) => prisma.$transaction(tx => numbering.allocateInvoiceNumber(tx, org.store.id, date));
  const code = (await prisma.store.findUniqueOrThrow({ where: { id: org.store.id } })).orgCode;
  const batch = await Promise.all(Array.from({ length: 6 }, () => alloc('2026-09-01')));
  assert.deepEqual([...batch].sort(), Array.from({ length: 6 }, (_, i) => `IN${code}/27/${String(i + 1).padStart(7, '0')}`));
  // 31 March is still FY 26-27; 1 April starts FY 27-28 at 1 again.
  assert.equal(await alloc('2027-03-31'), `IN${code}/27/0000007`);
  assert.equal(await alloc('2027-04-01'), `IN${code}/28/0000001`);
  assert.equal(await alloc('2027-04-02'), `IN${code}/28/0000002`);
  // Receipts count independently of invoices.
  assert.equal(await prisma.$transaction(tx => numbering.allocateReceiptNumber(tx, org.store.id, '2026-09-01')), `RC${code}/27/0000001`);
});

test('a rolled-back transaction gives its number back, so there are no gaps', async () => {
  const org = await setupOrg('rollback');
  await assert.rejects(prisma.$transaction(async tx => {
    await numbering.allocateInvoiceNumber(tx, org.store.id, '2026-09-01');
    await numbering.allocateOrderNumber(tx, org.store.id);
    throw new Error('boom');
  }), /boom/);
  const code = (await prisma.store.findUniqueOrThrow({ where: { id: org.store.id } })).orgCode;
  assert.equal(await prisma.$transaction(tx => numbering.allocateInvoiceNumber(tx, org.store.id, '2026-09-01')), `IN${code}/27/0000001`);
  assert.equal(Number(await prisma.$transaction(tx => numbering.allocateOrderNumber(tx, org.store.id))), 1_000_000_001);
});

test('organizations have independent counters and cannot read each other by order number', async () => {
  const a = await setupOrg('iso-a');
  const b = await setupOrg('iso-b');
  const orderA1 = await newOrder(a, 'iso-a-1');
  const orderA2 = await newOrder(a, 'iso-a-2');
  const orderB1 = await newOrder(b, 'iso-b-1');
  assert.equal(orderA1.id, '1000000001');
  assert.equal(orderA2.id, '1000000002');
  assert.equal(orderB1.id, '1000000001');
  // A's second code does not exist in B, and B's own first order is not A's.
  assert.equal(await orders.getOrder(b.store.id, orderA2.id), null);
  assert.equal((await orders.getOrder(b.store.id, orderB1.id))?.phone, '9876543210');
  const rowB = await prisma.order.findUniqueOrThrow({ where: { storeId_orderNumber: { storeId: b.store.id, orderNumber: 1_000_000_001 } } });
  assert.equal(rowB.storeId, b.store.id);
  await assert.rejects(orders.updateOrderStatus(b.store.id, orderA2.id, 'Ready', b.actor.id), /Order not found/);
  await assert.rejects(orders.recordPayment(b.store.id, orderA2.id, 100, 'Cash'), /Order not found/);
});

test('legacy EL- orders keep their code and still resolve inside their organization', async () => {
  const org = await setupOrg('legacy');
  const legacy = await prisma.order.create({ data: { storeId: org.store.id, orderNumber: 847, customerName: 'Old', phone: '9876543210', dueDate: new Date('2026-01-01') } });
  assert.equal((await orders.getOrder(org.store.id, 'EL-847'))?.name, 'Old');
  assert.equal(legacy.orderNumber, BigInt(847));
  const fresh = await newOrder(org, 'legacy-new');
  assert.equal(fresh.id, '1000000001');
});

test('an invoice takes the financial year of the order date, not the day it is generated', async () => {
  const org = await setupOrg('invoice-fy');
  const code = (await prisma.store.findUniqueOrThrow({ where: { id: org.store.id } })).orgCode;
  const march = await settledOrder(org, 'inv-march', '2027-03-30');
  const april = await settledOrder(org, 'inv-april', '2027-04-02');
  // Generated "later" in a different year than the orders carry; the order date decides the year.
  const marchInvoice = await invoices.getOrCreateOrderInvoice(org.store.id, march.id);
  const aprilInvoice = await invoices.getOrCreateOrderInvoice(org.store.id, april.id);
  assert.equal(marchInvoice.invoiceNumber, `IN${code}/27/0000001`);
  assert.equal(aprilInvoice.invoiceNumber, `IN${code}/28/0000001`);
  // Repeat calls return the same number and do not consume another.
  assert.equal((await invoices.getOrCreateOrderInvoice(org.store.id, march.id)).invoiceNumber, marchInvoice.invoiceNumber);
  assert.equal(await prisma.orderInvoice.count({ where: { storeId: org.store.id } }), 2);
  // Concurrent first requests for the same order produce exactly one invoice.
  const third = await settledOrder(org, 'inv-race', '2027-04-03');
  const raced = await Promise.all([1, 2, 3].map(() => invoices.getOrCreateOrderInvoice(org.store.id, third.id)));
  assert.equal(new Set(raced.map(invoice => invoice.invoiceNumber)).size, 1);
  assert.equal(raced[0].invoiceNumber, `IN${code}/28/0000002`);
});

test('every payment gets its own receipt number', async () => {
  const org = await setupOrg('receipts');
  {
    const code = `T_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const method = await prisma.platformPaymentMethod.create({ data: { code, name: 'Cash', defaultStage: 'BOTH' } });
    await prisma.organizationPaymentMethod.create({ data: { storeId: org.store.id, platformPaymentMethodId: method.id, enabled: true } });
  }
  const code = (await prisma.store.findUniqueOrThrow({ where: { id: org.store.id } })).orgCode;
  const order = await orders.createOrder(org.store.id, {
    idempotencyKey: 'receipt-order', phone: '9876543210', dueDate: todayIST(),
    entries: [{ productId: org.product.id, quantity: 2 }], initialPayment: { amount: 50, method: 'Cash' },
  }, org.actor.id);
  await orders.recordPayment(org.store.id, order.id, 50, 'Cash');
  const payments = await prisma.payment.findMany({ where: { storeId: org.store.id }, orderBy: { receiptNumber: 'asc' } });
  const fy = numbering.financialYearEnding(todayIST()) % 100;
  assert.deepEqual(payments.map(payment => payment.receiptNumber), [`RC${code}/${fy}/0000001`, `RC${code}/${fy}/0000002`]);
});

test('organization codes are unique by numeric value and immutable once documents exist', async () => {
  const a = await setupOrg('code-a');
  const b = await setupOrg('code-b');
  const sequenceCode = (await prisma.store.findUniqueOrThrow({ where: { id: a.store.id } })).orgCode;
  assert.match(sequenceCode, /^\d{3,5}$/);
  const updated = await orgNumbering.updateStoreNumbering(a.store.id, { orgCode: '07001' });
  assert.equal(updated.orgCode, '07001');
  // 7001 is the same number as 07001, so it is taken.
  await assert.rejects(orgNumbering.updateStoreNumbering(b.store.id, { orgCode: '7001' }), /already in use/);
  await assert.rejects(orgNumbering.updateStoreNumbering(b.store.id, { orgCode: '12' }), /3 to 5 digits/);
  await assert.rejects(orgNumbering.updateStoreNumbering(b.store.id, { orgCode: '123456' }), /3 to 5 digits/);
  await assert.rejects(orgNumbering.updateStoreNumbering(b.store.id, { orgCode: 'AB1' }), /3 to 5 digits/);
  // The first order locks the code.
  await newOrder(b, 'code-b-1');
  const locked = await orgNumbering.getStoreNumbering(b.store.id);
  assert.equal(locked?.locked, true);
  await assert.rejects(orgNumbering.updateStoreNumbering(b.store.id, { orgCode: '08002' }), /can no longer change/);
  // Re-sending the unchanged code is not a change.
  assert.equal((await orgNumbering.updateStoreNumbering(b.store.id, { orgCode: locked!.orgCode })).orgCode, locked!.orgCode);
});

test('the order number base can only be raised and lifts the live counter', async () => {
  const org = await setupOrg('base');
  assert.equal((await newOrder(org, 'base-1')).id, '1000000001');
  await assert.rejects(orgNumbering.updateStoreNumbering(org.store.id, { orderSeqBase: 1_000_000_001 + 0.5 }), /whole number/);
  await assert.rejects(orgNumbering.updateStoreNumbering(org.store.id, { orderSeqBase: 5 }), /whole number/);
  await orgNumbering.updateStoreNumbering(org.store.id, { orderSeqBase: 2_000_000_000 });
  assert.equal((await newOrder(org, 'base-2')).id, '2000000000');
  await assert.rejects(orgNumbering.updateStoreNumbering(org.store.id, { orderSeqBase: 1_500_000_000 }), /can only be raised/);
  assert.equal((await newOrder(org, 'base-3')).id, '2000000001');
});

test('onboarding assigns the next free code or a valid custom one and rejects duplicates', async () => {
  const admin = await prisma.user.create({ data: { name: 'Platform admin', phone: testPhone('numbering_admin'), passwordHash: await hashPassword('password123'), isSuperAdmin: true } });
  const input = (name: string, phoneKey: string, orgCode?: string) => ({
    storeName: name, ...(orgCode !== undefined ? { orgCode } : {}), address: '', phone: '9876543210',
    owner: { mode: 'new' as const, name: 'New Owner', password: 'password123', ownerPhone: testPhone(phoneKey) },
    subscription: { mode: 'custom' as const, depositAmount: 0, annualFeeAmount: 0 }, markPaid: false,
  });
  const custom = await storesService.onboardStore(input('Custom code org', 'numbering_owner_1', '04321'), admin.id);
  assert.equal(custom.orgCode, '04321');
  const auto = await storesService.onboardStore(input('Auto code org', 'numbering_owner_2'), admin.id);
  assert.match(auto.orgCode, /^\d{3,5}$/);
  await assert.rejects(storesService.onboardStore(input('Duplicate code org', 'numbering_owner_3', '4321'), admin.id), /already in use/);
  await assert.rejects(storesService.onboardStore(input('Bad code org', 'numbering_owner_4', 'abc'), admin.id), /3 to 5 digits/);
  // A failed onboarding leaves nothing behind.
  assert.equal(await prisma.store.count({ where: { name: { in: ['Duplicate code org', 'Bad code org'] } } }), 0);
  assert.equal(await prisma.user.count({ where: { phone: { in: [testPhone('numbering_owner_3'), testPhone('numbering_owner_4')] } } }), 0);
  // The sequence keeps handing out free codes even after a custom code is taken.
  const second = await storesService.onboardStore(input('Second auto org', 'numbering_owner_5'), admin.id);
  assert.notEqual(second.orgCode, auto.orgCode);
});
