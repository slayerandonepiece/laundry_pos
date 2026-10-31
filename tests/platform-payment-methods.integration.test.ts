import { testPhone } from './test-phone';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { NextRequest } from 'next/server';
import { PrismaClient, Role, OutletStatus } from '../src/generated/prisma/client';
import { hashPassword } from '../src/server/auth/password';
import { generateSessionToken } from '../src/server/auth/token';

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
    application_name: 'el-platform-payments-test',
  }),
});
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
const control = new Pool({ ...connection, max: 2 });

let platformService: typeof import('../src/server/services/platform-payment-methods');
let orders: typeof import('../src/server/services/orders');
let superAdminMethodsRoute: typeof import('../src/app/api/v1/super-admin/payment-methods/route');
let superAdminMethodIdRoute: typeof import('../src/app/api/v1/super-admin/payment-methods/[id]/route');
let orgMethodsPlatformRoute: typeof import('../src/app/api/v1/payment-methods/platform/route');
let orgMethodPlatformIdRoute: typeof import('../src/app/api/v1/payment-methods/platform/[id]/route');

before(async () => {
  platformService = await import('../src/server/services/platform-payment-methods');
  orders = await import('../src/server/services/orders');
  superAdminMethodsRoute = await import('../src/app/api/v1/super-admin/payment-methods/route');
  superAdminMethodIdRoute = await import('../src/app/api/v1/super-admin/payment-methods/[id]/route');
  orgMethodsPlatformRoute = await import('../src/app/api/v1/payment-methods/platform/route');
  orgMethodPlatformIdRoute = await import('../src/app/api/v1/payment-methods/platform/[id]/route');
});

after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
  await control.end();
});

async function setupContext(suffix: string) {
  const store = await prisma.store.create({
    data: { id: `store-pay-${suffix}`, name: `Store Pay ${suffix}` },
  });

  const outlet = await prisma.outlet.create({
    data: {
      storeId: store.id,
      outletCode: `OUT-P-${suffix}`,
      displayName: `Outlet Pay ${suffix}`,
      status: OutletStatus.ACTIVE,
    },
  });

  const passwordHash = await hashPassword('password123');

  const superAdmin = await prisma.user.create({
    data: { name: `SA ${suffix}`, phone: testPhone(`sa_${suffix}`), passwordHash, isSuperAdmin: true },
  });

  const owner = await prisma.user.create({
    data: { name: `Owner ${suffix}`, phone: testPhone(`owner_p_${suffix}`), passwordHash },
  });
  await prisma.storeMembership.create({
    data: { userId: owner.id, storeId: store.id, role: Role.OWNER, active: true },
  });

  const emp = await prisma.user.create({
    data: { name: `Emp ${suffix}`, phone: testPhone(`emp_p_${suffix}`), passwordHash },
  });
  await prisma.storeMembership.create({
    data: { userId: emp.id, storeId: store.id, role: Role.EMPLOYEE, active: true },
  });
  await prisma.outletMembership.create({
    data: { userId: emp.id, outletId: outlet.id, active: true, isDefault: true },
  });

  const tokenSuperAdmin = generateSessionToken();
  const tokenOwner = generateSessionToken();
  const tokenEmp = generateSessionToken();

  await prisma.session.create({
    data: { token: tokenSuperAdmin, userId: superAdmin.id, credentialVersion: 1, expiresAt: new Date(Date.now() + 86400000) },
  });
  await prisma.session.create({
    data: { token: tokenOwner, userId: owner.id, credentialVersion: 1, expiresAt: new Date(Date.now() + 86400000) },
  });
  await prisma.session.create({
    data: { token: tokenEmp, userId: emp.id, credentialVersion: 1, expiresAt: new Date(Date.now() + 86400000) },
  });

  const product = await prisma.product.create({
    data: {
      storeId: store.id,
      name: `Pay Item ${suffix}`,
      category: 'General',
      type: 'ITEM',
      price: 10_000,
      active: true,
    },
  });

  return {
    store,
    outlet,
    superAdmin,
    owner,
    emp,
    tokenSuperAdmin,
    tokenOwner,
    tokenEmp,
    product,
  };
}

test('B4.1: Super admin creates, updates, and controls platform payment methods; unauthorized users denied', async () => {
  const ctx = await setupContext('b4-1');

  // Super admin creates platform payment method
  const reqCreate = new NextRequest('http://localhost/api/v1/super-admin/payment-methods', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.tokenSuperAdmin}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code: 'upi_qr', name: 'UPI QR' }),
  });
  const resCreate = await superAdminMethodsRoute.POST(reqCreate);
  assert.equal(resCreate.status, 201);
  const created = await resCreate.json();
  assert.equal(created.code, 'UPI_QR'); // normalized uppercase
  assert.equal(created.name, 'UPI QR');
  assert.equal(created.active, true);

  // Non-super-admin (owner) is DENIED creating platform payment method (403)
  const reqOwnerDenied = new NextRequest('http://localhost/api/v1/super-admin/payment-methods', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.tokenOwner}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code: 'crypto', name: 'Crypto' }),
  });
  const resOwnerDenied = await superAdminMethodsRoute.POST(reqOwnerDenied);
  assert.equal(resOwnerDenied.status, 403);

  // Super admin renames method
  const reqPatch = new NextRequest(`http://localhost/api/v1/super-admin/payment-methods/${created.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${ctx.tokenSuperAdmin}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: 'Bharat UPI QR' }),
  });
  const resPatch = await superAdminMethodIdRoute.PATCH(reqPatch, {
    params: Promise.resolve({ id: created.id }),
  });
  assert.equal(resPatch.status, 200);
  const updated = await resPatch.json();
  assert.equal(updated.name, 'Bharat UPI QR');
  assert.equal(updated.code, 'UPI_QR'); // code remains unchanged
});

test('B4.2: Owners and employees cannot enable or disable platform methods; the list stays readable', async () => {
  const ctx = await setupContext('b4-2');

  const method = await platformService.createPlatformPaymentMethod({
    code: 'CARD_POS',
    name: 'Card POS Terminal',
  });

  // Owner lists platform methods: new global methods are opt-in.
  const reqList = new NextRequest('http://localhost/api/v1/payment-methods/platform', {
    headers: {
      Authorization: `Bearer ${ctx.tokenOwner}`,
      'X-Store-Id': ctx.store.id,
    },
  });
  const resList = await orgMethodsPlatformRoute.GET(reqList);
  assert.equal(resList.status, 200);
  const list = await resList.json();
  const cardMethod = list.find((m: { id: string }) => m.id === method.id);
  assert.ok(cardMethod);
  assert.equal(cardMethod.enabled, false);

  // Owners cannot enable or disable methods; the platform administrator does that.
  const reqEnable = new NextRequest(`http://localhost/api/v1/payment-methods/platform/${method.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${ctx.tokenOwner}`,
      'X-Store-Id': ctx.store.id,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ enabled: true }),
  });
  const resEnable = await orgMethodPlatformIdRoute.PATCH(reqEnable, {
    params: Promise.resolve({ id: method.id }),
  });
  assert.equal(resEnable.status, 403);
  assert.equal((await resEnable.json()).code, 'payment_methods_managed_by_platform');

  // Disabling is blocked the same way.
  const reqDisable = new NextRequest(`http://localhost/api/v1/payment-methods/platform/${method.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${ctx.tokenOwner}`,
      'X-Store-Id': ctx.store.id,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ enabled: false }),
  });
  const resDisable = await orgMethodPlatformIdRoute.PATCH(reqDisable, {
    params: Promise.resolve({ id: method.id }),
  });
  assert.equal(resDisable.status, 403);
  const listAfter = await (await orgMethodsPlatformRoute.GET(new NextRequest('http://localhost/api/v1/payment-methods/platform', {
    headers: { Authorization: `Bearer ${ctx.tokenOwner}`, 'X-Store-Id': ctx.store.id },
  }))).json();
  assert.equal(listAfter.find((m: { id: string }) => m.id === method.id).enabled, false);

  // Employee is DENIED toggling organization payment method
  const reqEmpDenied = new NextRequest(`http://localhost/api/v1/payment-methods/platform/${method.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${ctx.tokenEmp}`,
      'X-Store-Id': ctx.store.id,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ enabled: true }),
  });
  const resEmpDenied = await orgMethodPlatformIdRoute.PATCH(reqEmpDenied, {
    params: Promise.resolve({ id: method.id }),
  });
  assert.equal(resEmpDenied.status, 403);
});

test('B4.3: Payment creation with platform payment method records platformPaymentMethodId and blocks disabled methods', async () => {
  const ctx = await setupContext('b4-3');

  const cashMethod = await platformService.createPlatformPaymentMethod({
    code: 'GLOBAL_CASH',
    name: 'Global Cash',
  });

  const disabledMethod = await platformService.createPlatformPaymentMethod({
    code: 'GLOBAL_CHEQUE',
    name: 'Global Cheque',
  });

  // New outlet payments require an explicit organization opt-in.
  await platformService.setOrganizationPaymentMethodEnabled(ctx.store.id, cashMethod.id, true);

  // Explicitly disable cheque for this organization
  await platformService.setOrganizationPaymentMethodEnabled(ctx.store.id, disabledMethod.id, false);

  // 1. Order with active platform payment method succeeds and populates platformPaymentMethodId
  const order = await orders.createOrder(
    ctx.store.id,
    {
      idempotencyKey: 'idemp-plat-1',
      customerName: 'Plat Customer',
      phone: '9876543210',
      dueDate: '2026-12-31',
      entries: [{ productId: ctx.product.id, quantity: 1 }],
      initialPayment: { amount: 5000, method: 'GLOBAL_CASH' },
      outletId: ctx.outlet.id,
    },
    ctx.owner.id,
  );

  assert.ok(order);
  const dbPayment = await prisma.payment.findFirst({
    where: { order: { storeId: ctx.store.id, orderNumber: orders.parseOrderCode(order.id)! } },
  });
  assert.ok(dbPayment);
  assert.equal(dbPayment.platformPaymentMethodId, cashMethod.id);
  assert.equal(dbPayment.method, 'Global Cash'); // snapshot name

  // 2. Order with disabled platform payment method is REJECTED
  await assert.rejects(
    async () =>
      orders.createOrder(
        ctx.store.id,
        {
          idempotencyKey: 'idemp-plat-disabled',
          customerName: 'Bad Customer',
          phone: '9876543210',
          dueDate: '2026-12-31',
          entries: [{ productId: ctx.product.id, quantity: 1 }],
          initialPayment: { amount: 5000, method: 'GLOBAL_CHEQUE' },
          outletId: ctx.outlet.id,
        },
        ctx.owner.id,
      ),
    (err: unknown) => err instanceof Error && err.message === 'That payment method is no longer available.',
  );

  // 3. Global reports can aggregate payments by platformPaymentMethodId
  const aggregation = await prisma.payment.groupBy({
    by: ['platformPaymentMethodId'],
    _sum: { amount: true },
    where: { platformPaymentMethodId: cashMethod.id },
  });
  assert.equal(aggregation.length, 1);
  assert.equal(aggregation[0]._sum.amount, 5000);
});

