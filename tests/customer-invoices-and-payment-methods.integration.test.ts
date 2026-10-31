import { testPhone } from './test-phone';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../src/generated/prisma/client';

const socket = process.env.QA_SUBSCRIPTION_PG_SOCKET;
if (!socket?.startsWith('/tmp/el-subscription-test-') || !socket.endsWith('/socket')) {
  throw new Error('Run npm run test:subscription-payments to create an isolated PostgreSQL cluster.');
}

const connection = { host: socket, user: 'subscription_test', database: 'postgres', port: 5432 };
const prisma = new PrismaClient({ adapter: new PrismaPg({ ...connection, max: 5, application_name: 'el-customer-invoice-test' }) });
const control = new Pool({ ...connection, max: 2 });
let orders: typeof import('../src/server/services/orders');
let invoices: typeof import('../src/server/services/order-invoices');

before(async () => {
  (globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
  [orders, invoices] = await Promise.all([
    import('../src/server/services/orders'),
    import('../src/server/services/order-invoices'),
  ]);
});

after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
  await control.end();
});

async function fixture(suffix: string) {
  const store = await prisma.store.create({ data: { id: `customer-${suffix}`, name: `Customer QA ${suffix}`, address: 'Test address', phone: '9876543210' } });
  const user = await prisma.user.create({ data: { name: 'QA Owner', phone: testPhone(`qa-${suffix}`), passwordHash: 'not-used' } });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Wash & Fold', category: 'Laundry', type: 'ITEM', price: 12_500 } });
  const code = `CI_${suffix.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
  const cash = await prisma.platformPaymentMethod.create({ data: { code, name: 'Cash', defaultStage: 'BOTH' } });
  await prisma.organizationPaymentMethod.create({ data: { storeId: store.id, platformPaymentMethodId: cash.id, enabled: true } });
  return { store, user, product, cash };
}

test('public invoice token is stable, resolves without auth, and rejects tampering', async () => {
  const { store, user, product } = await fixture('invoice');
  const order = await orders.createOrder(store.id, {
    idempotencyKey: 'invoice-order', customerName: 'Invoice Customer', phone: '9876543210',
    dueDate: '2100-03-05', entries: [{ productId: product.id, quantity: 2 }],
    initialPayment: { amount: 25_000, method: 'Cash' },
  }, user.id);
  await orders.updateOrderStatus(store.id, order.id, 'Delivered', user.id);

  const first = await invoices.getOrCreateOrderInvoice(store.id, order.id);
  const second = await invoices.getOrCreateOrderInvoice(store.id, order.id);
  assert.equal(first.accessToken, second.accessToken);
  assert.match(first.accessToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(await invoices.getOrderInvoiceByToken(first.accessToken.slice(0, -1) + (first.accessToken.endsWith('A') ? 'B' : 'A')), null);

  assert.equal((await invoices.getOrderInvoiceByToken(first.accessToken))?.orderCode, order.id);
  assert.equal(await invoices.getOrderInvoiceByToken('x'.repeat(43)), null);
});

test('payment names remain snapshots after a platform rename, and a disabled method is refused', async () => {
  const one = await fixture('methods-one');
  const order = await orders.createOrder(one.store.id, {
    idempotencyKey: 'methods-order', phone: '9876543210', dueDate: '2100-03-05',
    entries: [{ productId: one.product.id, quantity: 1 }], initialPayment: { amount: 2_500, method: 'Cash' },
  }, one.user.id);
  await prisma.platformPaymentMethod.update({ where: { id: one.cash.id }, data: { name: 'Credit card' } });
  const saved = await prisma.payment.findFirstOrThrow({ where: { order: { storeId: one.store.id, orderNumber: orders.parseOrderCode(order.id)! } } });
  assert.equal(saved.method, 'Cash');

  await prisma.organizationPaymentMethod.updateMany({ where: { storeId: one.store.id }, data: { enabled: false } });
  await assert.rejects(orders.recordPayment(one.store.id, order.id, 1_000, 'Credit card'), /no longer available/);
});
