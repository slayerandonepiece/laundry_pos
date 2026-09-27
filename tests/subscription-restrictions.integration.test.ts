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
    application_name: 'el-sub-restrict-test',
  }),
});
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
const control = new Pool({ ...connection, max: 2 });

let orders: typeof import('../src/server/services/orders');
let expenses: typeof import('../src/server/services/expenses');
let employees: typeof import('../src/server/services/employees');
let stores: typeof import('../src/server/services/stores');
let sessionMod: typeof import('../src/server/auth/session');

before(async () => {
  orders = await import('../src/server/services/orders');
  expenses = await import('../src/server/services/expenses');
  employees = await import('../src/server/services/employees');
  stores = await import('../src/server/services/stores');
  sessionMod = await import('../src/server/auth/session');
});

after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
  await control.end();
});

async function setupOrg(suffix: string, subOpts?: { trialEndsAt?: Date; paidThroughDate?: Date }) {
  const store = await prisma.store.create({
    data: { id: `store-sub-${suffix}`, name: `Store Sub ${suffix}` },
  });

  const outlet1 = await prisma.outlet.create({
    data: {
      storeId: store.id,
      outletCode: `OUT-S1-${suffix}`,
      displayName: `Outlet S1 ${suffix}`,
      status: OutletStatus.ACTIVE,
    },
  });

  const outlet2 = await prisma.outlet.create({
    data: {
      storeId: store.id,
      outletCode: `OUT-S2-${suffix}`,
      displayName: `Outlet S2 ${suffix}`,
      status: OutletStatus.ACTIVE,
    },
  });

  if (subOpts) {
    await prisma.subscription.create({
      data: {
        storeId: store.id,
        depositAmount: 0,
        annualFeeAmount: 0,
        trialEndsAt: subOpts.trialEndsAt ?? null,
        paidThroughDate: subOpts.paidThroughDate ?? null,
      },
    });
  }

  const passwordHash = await hashPassword('password123');

  const owner = await prisma.user.create({
    data: { name: `Owner ${suffix}`, phone: testPhone(`owner_sub_${suffix}`), passwordHash },
  });
  await prisma.storeMembership.create({
    data: { userId: owner.id, storeId: store.id, role: Role.OWNER, active: true },
  });

  const tokenOwner = generateSessionToken();
  await prisma.session.create({
    data: { token: tokenOwner, userId: owner.id, credentialVersion: 1, expiresAt: new Date(Date.now() + 86400000) },
  });

  const product = await prisma.product.create({
    data: {
      storeId: store.id,
      name: `Sub Item ${suffix}`,
      category: 'General',
      type: 'ITEM',
      price: 10_000,
      active: true,
    },
  });

  const cash = await prisma.storePaymentMethod.create({
    data: { storeId: store.id, name: 'Cash', active: true },
  });

  return {
    store,
    outlet1,
    outlet2,
    owner,
    tokenOwner,
    product,
    cash,
  };
}

test('B5.1: Trial expiry, subscription expiry, and access state calculations', async () => {
  // 1. Active trial (expires in 14 days)
  const ctxTrial = await setupOrg('trial-active', {
    trialEndsAt: new Date(Date.now() + 14 * 86400000),
  });
  const statusTrial = await sessionMod.getStoreAccessStatus(ctxTrial.owner.id, ctxTrial.store.id);
  assert.equal(statusTrial?.subscriptionState, 'TRIAL');
  assert.equal(statusTrial?.blockedReason, undefined);

  // 2. Expired trial (expired 2 days ago, no paid subscription)
  const ctxTrialExp = await setupOrg('trial-expired', {
    trialEndsAt: new Date(Date.now() - 2 * 86400000),
  });
  const statusTrialExp = await sessionMod.getStoreAccessStatus(ctxTrialExp.owner.id, ctxTrialExp.store.id);
  assert.equal(statusTrialExp?.subscriptionState, 'RESTRICTED');
  assert.equal(statusTrialExp?.blockedReason, 'payment_lapsed');

  // 3. Active subscription (paid through next year)
  const ctxActiveSub = await setupOrg('sub-active', {
    paidThroughDate: new Date(Date.now() + 365 * 86400000),
  });
  const statusActiveSub = await sessionMod.getStoreAccessStatus(ctxActiveSub.owner.id, ctxActiveSub.store.id);
  assert.equal(statusActiveSub?.subscriptionState, 'ACTIVE');
  assert.equal(statusActiveSub?.blockedReason, undefined);

  // 4. Expired subscription (paid through last year)
  const ctxExpSub = await setupOrg('sub-expired', {
    paidThroughDate: new Date(Date.now() - 30 * 86400000),
  });
  const statusExpSub = await sessionMod.getStoreAccessStatus(ctxExpSub.owner.id, ctxExpSub.store.id);
  assert.equal(statusExpSub?.subscriptionState, 'RESTRICTED');
  assert.equal(statusExpSub?.blockedReason, 'payment_lapsed');
});

test('B5.2: Restricted organization: writes denied across all outlets, reads allowed for historical records', async () => {
  const ctx = await setupOrg('b5-writes', {
    paidThroughDate: new Date(Date.now() - 5 * 86400000), // lapsed 5 days ago
  });

  // Create an existing historical order directly via DB bypass to test read access
  const historicalOrder = await prisma.order.create({
    data: {
      storeId: ctx.store.id,
      outletId: ctx.outlet1.id,
      customerName: 'Old Customer',
      phone: '9876543210',
      dueDate: new Date('2025-01-01'),
      status: 'DELIVERED',
      notes: '',
      lines: { create: [{ name: 'Shirt', quantity: 1, unit: 'pcs', amount: 5000 }] },
    },
  });

  // 1. Read historical order succeeds with allowRestricted
  const reqRead = new NextRequest(`http://localhost/api/v1/orders/EL-${historicalOrder.orderNumber}`, {
    headers: {
      Authorization: `Bearer ${ctx.tokenOwner}`,
      'X-Store-Id': ctx.store.id,
    },
  });
  const sessionAllowed = await sessionMod.requireStoreSessionFromRequest(reqRead, ctx.store.id, Role.OWNER, {
    allowRestricted: true,
  });
  assert.equal(sessionAllowed.storeId, ctx.store.id);

  // 2. Write operations fail across both outlets:
  // 2a. createOrder on Outlet 1 is BLOCKED with payment_lapsed
  await assert.rejects(
    async () =>
      orders.createOrder(
        ctx.store.id,
        {
          idempotencyKey: 'idemp-blocked-1',
          customerName: 'New Cust',
          phone: '9876543210',
          dueDate: '2026-12-31',
          entries: [{ productId: ctx.product.id, quantity: 1 }],
          outletId: ctx.outlet1.id,
        },
        ctx.owner.id,
      ),
    (err: unknown) => err instanceof sessionMod.AuthError && err.reason === 'payment_lapsed',
  );

  // 2b. createOrder on Outlet 2 is ALSO BLOCKED (all-outlet restriction)
  await assert.rejects(
    async () =>
      orders.createOrder(
        ctx.store.id,
        {
          idempotencyKey: 'idemp-blocked-2',
          customerName: 'New Cust 2',
          phone: '9876543210',
          dueDate: '2026-12-31',
          entries: [{ productId: ctx.product.id, quantity: 1 }],
          outletId: ctx.outlet2.id,
        },
        ctx.owner.id,
      ),
    (err: unknown) => err instanceof sessionMod.AuthError && err.reason === 'payment_lapsed',
  );

  // 2c. recordPayment on historical order is BLOCKED
  await assert.rejects(
    async () => orders.recordPayment(ctx.store.id, `EL-${historicalOrder.orderNumber}`, 5000, 'Cash'),
    (err: unknown) => err instanceof sessionMod.AuthError && err.reason === 'payment_lapsed',
  );

  // 2d. updateOrderStatus is BLOCKED
  await assert.rejects(
    async () => orders.updateOrderStatus(ctx.store.id, `EL-${historicalOrder.orderNumber}`, 'Delivered', ctx.owner.id),
    (err: unknown) => err instanceof sessionMod.AuthError && err.reason === 'payment_lapsed',
  );

  // 2e. createExpense is BLOCKED
  await assert.rejects(
    async () =>
      expenses.createExpense(ctx.store.id, {
        title: 'Rent',
        category: 'Rent',
        amount: 10000,
        due: '2026-12-01',
        monthly: false,
      }),
    (err: unknown) => err instanceof sessionMod.AuthError && err.reason === 'payment_lapsed',
  );

  // 2f. createEmployee is BLOCKED
  await assert.rejects(
    async () =>
      employees.createEmployee(ctx.store.id, {
        name: 'New Worker',
        phone: testPhone('worker_new'),
        password: 'password123',
        active: true,
      }),
    (err: unknown) => err instanceof sessionMod.AuthError && err.reason === 'payment_lapsed',
  );
});

test('B5.3: Renewal payment restores full write access across all outlets immediately', async () => {
  const ctx = await setupOrg('b5-renewal', {
    paidThroughDate: new Date(Date.now() - 5 * 86400000), // lapsed
  });

  // Verify currently blocked
  await assert.rejects(
    async () =>
      orders.createOrder(
        ctx.store.id,
        {
          idempotencyKey: 'idemp-blocked-renew',
          customerName: 'Waiting Customer',
          phone: '9876543210',
          dueDate: '2026-12-31',
          entries: [{ productId: ctx.product.id, quantity: 1 }],
          outletId: ctx.outlet1.id,
        },
        ctx.owner.id,
      ),
    (err: unknown) => err instanceof sessionMod.AuthError && err.reason === 'payment_lapsed',
  );

  // Super admin records renewal payment
  const invoice = await stores.recordSubscriptionPayment(ctx.store.id, {
    type: 'RENEWAL',
    amount: 1200000,
    method: 'UPI',
  });
  assert.ok(invoice);

  // Verify subscription status is now ACTIVE
  const status = await sessionMod.getStoreAccessStatus(ctx.owner.id, ctx.store.id);
  assert.equal(status?.subscriptionState, 'ACTIVE');

  // Order creation now succeeds immediately on Outlet 1
  const order1 = await orders.createOrder(
    ctx.store.id,
    {
      idempotencyKey: 'idemp-restored-1',
      customerName: 'Restored Cust 1',
      phone: '9876543210',
      dueDate: '2026-12-31',
      entries: [{ productId: ctx.product.id, quantity: 1 }],
      outletId: ctx.outlet1.id,
    },
    ctx.owner.id,
  );
  assert.ok(order1);

  // Order creation also succeeds immediately on Outlet 2
  const order2 = await orders.createOrder(
    ctx.store.id,
    {
      idempotencyKey: 'idemp-restored-2',
      customerName: 'Restored Cust 2',
      phone: '9876543210',
      dueDate: '2026-12-31',
      entries: [{ productId: ctx.product.id, quantity: 1 }],
      outletId: ctx.outlet2.id,
    },
    ctx.owner.id,
  );
  assert.ok(order2);
});

test('B5.4: Super admin queries expiring subscriptions and sets trial dates', async () => {
  // Create store with trial ending in 5 days
  const trialStore = await setupOrg('sa-trial-exp', {
    trialEndsAt: new Date(Date.now() + 5 * 86400000),
  });

  // Query expiring subscriptions
  const expiringList = await stores.listExpiringSubscriptions(30);
  const found = expiringList.find(s => s.storeId === trialStore.store.id);
  assert.ok(found);
  assert.equal(found.type, 'TRIAL');
  assert.ok(found.daysRemaining <= 6 && found.daysRemaining >= 4);

  // Super admin extends trial
  const nextMonth = '2028-12-31';
  const extended = await stores.setStoreTrial(trialStore.store.id, nextMonth);
  assert.equal(extended.trialEndsAt, nextMonth);

  // Verify updated in DB
  const sub = await prisma.subscription.findUnique({
    where: { storeId: trialStore.store.id },
  });
  assert.ok(sub?.trialEndsAt);
});

test('temporary access restores auth and writes, expires, and never overrides locked or archived stores', async () => {
  const { todayIST, addDays } = await import('../src/server/dates');
  const fixture = await setupOrg('temporary_override', { paidThroughDate: new Date('2020-01-01') });
  const storeId = fixture.store.id;
  const membership = await prisma.storeMembership.findFirstOrThrow({ where: { storeId, role: 'OWNER' }, include: { user: true } });
  const user = { id: membership.userId, name: membership.user.name, phone: membership.user.phone, isSuperAdmin: false, mustChangePassword: false };
  await assert.rejects(sessionMod.assertStoreWritable(storeId));
  await assert.rejects(stores.grantTemporaryAccess(storeId, addDays(todayIST(), 31)), /30 days/);
  await assert.rejects(stores.grantTemporaryAccess(storeId, '2026-02-31'), /valid calendar/);
  await stores.grantTemporaryAccess(storeId, addDays(todayIST(), 7));
  assert.equal((await sessionMod.getStoreAccessStatus(membership.userId, storeId))?.blockedReason, undefined);
  await sessionMod.assertStoreWritable(storeId);
  await sessionMod.requireStoreSession(storeId, undefined, user);
  await prisma.store.update({ where: { id: storeId }, data: { accessGrantedUntil: new Date('2020-01-01') } });
  await assert.rejects(sessionMod.assertStoreWritable(storeId));
  await stores.grantTemporaryAccess(storeId, addDays(todayIST(), 7));
  for (const data of [{ status: 'LOCKED' as const }, { status: 'ACTIVE' as const, deletedAt: new Date() }]) {
    await prisma.store.update({ where: { id: storeId }, data });
    await assert.rejects(sessionMod.assertStoreWritable(storeId));
    await assert.rejects(sessionMod.requireStoreSession(storeId, undefined, user));
    if (data.status === 'LOCKED') {
      const read = await sessionMod.requireStoreSession(storeId, undefined, user, { allowLockedReadOnly: true });
      assert.equal(read.storeId, storeId);
      await assert.rejects(sessionMod.requireStoreSession(storeId, 'EMPLOYEE', user, { allowLockedReadOnly: true }));
      await assert.rejects(sessionMod.requireStoreSession(storeId, undefined, { ...user, id: 'unrelated-user' }, { allowLockedReadOnly: true }));
      await prisma.storeMembership.update({ where: { id: membership.id }, data: { active: false } });
      await assert.rejects(sessionMod.requireStoreSession(storeId, undefined, user, { allowLockedReadOnly: true }));
      await prisma.storeMembership.update({ where: { id: membership.id }, data: { active: true } });
    } else {
      await assert.rejects(sessionMod.requireStoreSession(storeId, undefined, user, { allowLockedReadOnly: true }));
    }
    assert.ok((await sessionMod.getStoreAccessStatus(membership.userId, storeId))?.blockedReason);
  }
});

test('trial extension restores an expired paid term consistently and gates outlet creation', async () => {
  const { todayIST, addDays } = await import('../src/server/dates');
  const { createOutlet } = await import('../src/server/services/outlets');
  const fixture = await setupOrg('trial_extension', { paidThroughDate: new Date('2020-01-01'), trialEndsAt: new Date('2020-02-01') });
  const storeId = fixture.store.id;
  const owner = await prisma.storeMembership.findFirstOrThrow({ where: { storeId, role: 'OWNER' } });
  const input = { storeId, outletCode: 'TRIAL-EXTENSION-REGRESSION', displayName: 'Trial outlet', phone: '+91 98765 43210' };
  await assert.rejects(createOutlet(input), /active subscription or trial/);
  await assert.rejects(stores.setStoreTrial(storeId, '2026-02-31'), /valid calendar/);
  await stores.setStoreTrial(storeId, addDays(todayIST(), 30));
  await sessionMod.assertStoreWritable(storeId);
  assert.equal((await sessionMod.getStoreAccessStatus(owner.userId, storeId))?.blockedReason, undefined);
  assert.ok(await createOutlet(input));
  const unset = await setupOrg('unset_outlet');
  await assert.rejects(createOutlet({ ...input, storeId: unset.store.id, outletCode: 'UNSET-OUTLET-REGRESSION' }), /active subscription or trial/);
});

test('employee phone validation rejects invalid create/update and accepts formatted phone', async () => {
  const fixture = await setupOrg('employee_phone', { paidThroughDate: new Date('2100-01-01') });
  const input = { name: 'Phone employee', phone: testPhone('phone_employee_regression'), password: 'password123', active: true };
  await assert.rejects(employees.createEmployee(fixture.store.id, { ...input, phone: 'abc' }), /phone/);
  const employee = await employees.createEmployee(fixture.store.id, { ...input, phone: '+91 98765 43210' });
  await assert.rejects(employees.updateEmployee(fixture.store.id, { ...input, id: employee.id, phone: 'abc' }), /phone/);
  assert.equal(employee.phone, '919876543210');
  const session = await sessionMod.createSessionRow(employee.id, employee.credentialVersion);
  const unchanged = await employees.updateEmployee(fixture.store.id, { ...input, password: undefined, id: employee.id, phone: '+91 (98765) 43210' });
  assert.equal(unchanged.credentialVersion, employee.credentialVersion);
  assert.ok(await sessionMod.getSessionFromToken(session.token));
  const changed = await employees.updateEmployee(fixture.store.id, { ...input, password: undefined, id: employee.id, phone: testPhone('changed-employee-phone') });
  assert.equal(changed.credentialVersion, employee.credentialVersion + 1);
  assert.equal(await sessionMod.getSessionFromToken(session.token), null);
  assert.equal(await prisma.session.count({ where: { userId: employee.id } }), 0);

});
