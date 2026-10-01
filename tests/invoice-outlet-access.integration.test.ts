import { testPhone } from './test-phone';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role, OutletStatus } from '../src/generated/prisma/client';
import { hashPassword } from '../src/server/auth/password';

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
    application_name: 'el-invoice-outlet-access-test',
  }),
});
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;

let session: typeof import('../src/server/auth/session');
let invoices: typeof import('../src/server/services/order-invoices');
let toOrderCode: typeof import('../src/server/services/orders').toOrderCode;
let f: Awaited<ReturnType<typeof fixture>>;

before(async () => {
  session = await import('../src/server/auth/session');
  invoices = await import('../src/server/services/order-invoices');
  toOrderCode = (await import('../src/server/services/orders')).toOrderCode;
  f = await fixture();
});

after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
});

/**
 * One organization, two outlets, an owner, one employee per outlet, and a
 * paid-and-delivered order in each outlet plus one with no outlet.
 */
async function fixture() {
  const store = await prisma.store.create({ data: { id: 'store-invoice-access', name: 'Invoice access' } });
  await prisma.subscription.create({
    data: { storeId: store.id, depositAmount: 0, annualFeeAmount: 0, paidThroughDate: new Date('2100-01-01') },
  });
  const [outletA, outletB] = await Promise.all(
    ['A', 'B'].map(n =>
      prisma.outlet.create({
        data: { storeId: store.id, outletCode: `INV-${n}`, displayName: `Outlet ${n}`, status: OutletStatus.ACTIVE },
      }),
    ),
  );
  const hash = await hashPassword('password123');
  const user = (key: string) => prisma.user.create({ data: { name: key, phone: testPhone(`invoice_access_${key}`), passwordHash: hash } });
  const [owner, empA, empB] = await Promise.all([user('owner'), user('empA'), user('empB')]);
  await prisma.storeMembership.createMany({
    data: [
      { userId: owner.id, storeId: store.id, role: Role.OWNER, active: true },
      { userId: empA.id, storeId: store.id, role: Role.EMPLOYEE, active: true },
      { userId: empB.id, storeId: store.id, role: Role.EMPLOYEE, active: true },
    ],
  });
  await prisma.outletMembership.createMany({
    data: [
      { userId: empA.id, outletId: outletA.id, active: true, isDefault: true },
      { userId: empB.id, outletId: outletB.id, active: true, isDefault: true },
    ],
  });
  const order = (outletId: string | null, name: string, legacyCancelled = false) =>
    prisma.order.create({
      data: {
        storeId: store.id,
        outletId,
        customerName: name,
        phone: '9000000000',
        dueDate: new Date('2026-01-01'),
        status: 'DELIVERED',
        legacyCancelled,
        lines: { create: [{ name: 'Wash', quantity: 1, unit: 'PIECE', amount: 10_000 }] },
        payments: { create: [{ amount: 10_000, method: 'Cash', storeId: store.id, outletId }] },
      },
    });
  const [orderA, orderB, orderNone, orderCancelledA] = await Promise.all([
    order(outletA.id, 'Customer A'),
    order(outletB.id, 'Customer B'),
    order(null, 'No outlet'),
    order(outletA.id, 'Cancelled A', true),
  ]);

  const asUser = (u: { id: string; name: string; phone: string }) =>
    session.requireStoreSession(store.id, undefined, { id: u.id, name: u.name, phone: u.phone, isSuperAdmin: false });
  return {
    codes: { a: toOrderCode(orderA.orderNumber), b: toOrderCode(orderB.orderNumber), none: toOrderCode(orderNone.orderNumber), cancelledA: toOrderCode(orderCancelledA.orderNumber) },
    owner: await asUser(owner),
    empA: await asUser(empA),
    empB: await asUser(empB),
  };
}

const forbidden = (err: unknown) => err instanceof session.AuthError && err.code === 'FORBIDDEN';

test("an employee can read invoices for their own outlet's orders only", async () => {
  await invoices.assertCanReadOrderInvoice(f.empA, f.codes.a);
  await invoices.assertCanReadOrderInvoice(f.empB, f.codes.b);

  // Another outlet's order, in the same organization, reached by its
  // guessable sequential code.
  await assert.rejects(invoices.assertCanReadOrderInvoice(f.empA, f.codes.b), forbidden);
  await assert.rejects(invoices.assertCanReadOrderInvoice(f.empB, f.codes.a), forbidden);
});

test('an employee cannot read an order that belongs to no outlet', async () => {
  await assert.rejects(invoices.assertCanReadOrderInvoice(f.empA, f.codes.none), forbidden);
});

test("an owner can read any outlet's invoice", async () => {
  await invoices.assertCanReadOrderInvoice(f.owner, f.codes.a);
  await invoices.assertCanReadOrderInvoice(f.owner, f.codes.b);
  await invoices.assertCanReadOrderInvoice(f.owner, f.codes.none);
});

test('an unknown order code passes the outlet check, so the invoice lookup can answer not-found', async () => {
  await invoices.assertCanReadOrderInvoice(f.empA, 'EL-999999');
});

test("an employee cannot read another outlet's legacy-cancelled order invoice", async () => {
  // getOrder hides legacyCancelled rows, but getOrCreateOrderInvoice does not.
  await invoices.assertCanReadOrderInvoice(f.empA, f.codes.cancelledA);
  await assert.rejects(invoices.assertCanReadOrderInvoice(f.empB, f.codes.cancelledA), forbidden);
  await invoices.assertCanReadOrderInvoice(f.owner, f.codes.cancelledA);
});
