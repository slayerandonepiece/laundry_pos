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

const connection = {
  host: socket,
  user: 'subscription_test',
  database: 'postgres',
  port: 5432,
};
const prisma = new PrismaClient({
  adapter: new PrismaPg({ ...connection, max: 10, application_name: 'el-multi-outlet-lifecycle-test' }),
});
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;

let orders: typeof import('../src/server/services/orders');
let expenses: typeof import('../src/server/services/expenses');
let platformMethods: typeof import('../src/server/services/platform-payment-methods');
let session: typeof import('../src/server/auth/session');
let rollups: typeof import('../src/server/services/dashboard-rollups');

before(async () => {
  orders = await import('../src/server/services/orders');
  expenses = await import('../src/server/services/expenses');
  platformMethods = await import('../src/server/services/platform-payment-methods');
  session = await import('../src/server/auth/session');
  rollups = await import('../src/server/services/dashboard-rollups');
});

after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
});

/**
 * One brand-new organization with three outlets, an owner, and two employees
 * whose outlet grants differ. The existing B2-B6 suites each verify one
 * mechanism in isolation; this fixture exercises them together the way a real
 * tenant does, so aggregation and isolation are checked against each other
 * rather than against hand-written expectations.
 */
async function setupBlueWave(suffix: string) {
  const store = await prisma.store.create({
    data: { id: `store-bw-${suffix}`, name: `Blue Wave Laundry ${suffix}` },
  });

  const makeOutlet = (code: string, displayName: string) =>
    prisma.outlet.create({
      data: { storeId: store.id, outletCode: `${code}-${suffix}`, displayName, status: OutletStatus.ACTIVE },
    });

  const gachibowli = await makeOutlet('BWHYDGCH01', 'Gachibowli');
  const kukatpally = await makeOutlet('BWHYDKPH01', 'Kukatpally');
  const madhapur = await makeOutlet('BWHYDMDP01', 'Madhapur');

  const passwordHash = await hashPassword('password123');

  const owner = await prisma.user.create({
    data: { name: 'Blue Wave Owner', phone: testPhone(`bwowner_${suffix}`), passwordHash },
  });
  await prisma.storeMembership.create({
    data: { userId: owner.id, storeId: store.id, role: Role.OWNER, active: true },
  });

  // staff1 works a single outlet; staff2 works two, defaulting to Kukatpally.
  const staff1 = await prisma.user.create({
    data: { name: 'Blue Wave Staff One', phone: testPhone(`bwstaff1_${suffix}`), passwordHash },
  });
  await prisma.storeMembership.create({
    data: { userId: staff1.id, storeId: store.id, role: Role.EMPLOYEE, active: true },
  });
  await prisma.outletMembership.create({
    data: { userId: staff1.id, outletId: gachibowli.id, active: true, isDefault: true },
  });

  const staff2 = await prisma.user.create({
    data: { name: 'Blue Wave Staff Two', phone: testPhone(`bwstaff2_${suffix}`), passwordHash },
  });
  await prisma.storeMembership.create({
    data: { userId: staff2.id, storeId: store.id, role: Role.EMPLOYEE, active: true },
  });
  await prisma.outletMembership.create({
    data: { userId: staff2.id, outletId: kukatpally.id, active: true, isDefault: true },
  });
  await prisma.outletMembership.create({
    data: { userId: staff2.id, outletId: madhapur.id, active: true, isDefault: false },
  });

  // Services are organization-wide, not per outlet.
  const washFold = await prisma.product.create({
    data: { storeId: store.id, name: 'Wash & Fold', category: 'General', type: 'ITEM', price: 8_000, active: true },
  });
  const dryClean = await prisma.product.create({
    data: { storeId: store.id, name: 'Dry Clean', category: 'General', type: 'ITEM', price: 15_000, active: true },
  });

  const clean = suffix.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const cash = await platformMethods.createPlatformPaymentMethod({ code: `CASH_${clean}`, name: 'Cash' });
  const upi = await platformMethods.createPlatformPaymentMethod({ code: `UPI_${clean}`, name: 'UPI' });
  await platformMethods.setOrganizationPaymentMethodEnabled(store.id, cash.id, true);
  await platformMethods.setOrganizationPaymentMethodEnabled(store.id, upi.id, true);

  return { store, gachibowli, kukatpally, madhapur, owner, staff1, staff2, washFold, dryClean, cash, upi };
}

test('Blue Wave: outlet access resolves per role — owner all three, staff scoped to their grants', async () => {
  const ctx = await setupBlueWave('access');

  const ownerAccess = await session.resolveAllowedOutlets(ctx.owner.id, ctx.store.id, Role.OWNER);
  assert.deepEqual(
    ownerAccess.allowedOutlets.map(o => o.id).sort(),
    [ctx.gachibowli.id, ctx.kukatpally.id, ctx.madhapur.id].sort(),
    'owner should reach every active outlet without explicit membership',
  );

  const staff1Access = await session.resolveAllowedOutlets(ctx.staff1.id, ctx.store.id, Role.EMPLOYEE);
  assert.deepEqual(staff1Access.allowedOutlets.map(o => o.id), [ctx.gachibowli.id]);
  assert.equal(staff1Access.defaultOutletId, ctx.gachibowli.id);

  const staff2Access = await session.resolveAllowedOutlets(ctx.staff2.id, ctx.store.id, Role.EMPLOYEE);
  assert.deepEqual(
    staff2Access.allowedOutlets.map(o => o.id).sort(),
    [ctx.kukatpally.id, ctx.madhapur.id].sort(),
  );
  assert.equal(staff2Access.defaultOutletId, ctx.kukatpally.id, 'Kukatpally was granted as the default');
  assert.ok(
    !staff2Access.allowedOutlets.some(o => o.id === ctx.gachibowli.id),
    'staff2 was never granted Gachibowli',
  );
});

test('Blue Wave: an employee cannot open an outlet they were not granted', async () => {
  const ctx = await setupBlueWave('denial');
  const actor = { id: ctx.staff1.id, name: ctx.staff1.name, phone: ctx.staff1.phone, isSuperAdmin: false };

  await assert.rejects(
    () => session.requireOutletSession(ctx.store.id, ctx.kukatpally.id, undefined, actor),
    (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN',
    'staff1 holds no Kukatpally membership and must be refused',
  );

  const allowed = await session.requireOutletSession(ctx.store.id, ctx.gachibowli.id, undefined, actor);
  assert.equal(allowed.outletId, ctx.gachibowli.id);
});

test('Blue Wave: orders stay in their originating outlet and never leak across the org', async () => {
  const ctx = await setupBlueWave('isolation');

  const place = (outletId: string, key: string, actorId: string, productId: string, quantity: number) =>
    orders.createOrder(
      ctx.store.id,
      {
        idempotencyKey: `bw-iso-${key}`,
        customerName: `Customer ${key}`,
        phone: '9876500000',
        dueDate: '2026-12-31',
        entries: [{ productId, quantity }],
        outletId,
      },
      actorId,
    );

  const gchOrder = await place(ctx.gachibowli.id, 'gch', ctx.staff1.id, ctx.washFold.id, 1);
  const kphOrder = await place(ctx.kukatpally.id, 'kph', ctx.staff2.id, ctx.washFold.id, 2);
  const mdpOrder = await place(ctx.madhapur.id, 'mdp', ctx.staff2.id, ctx.dryClean.id, 1);

  // Guard against a vacuous comparison: if the DTO ever stops carrying an
  // order code, every assertion below would compare undefined to undefined
  // and pass while isolation was broken.
  for (const order of [gchOrder, kphOrder, mdpOrder]) {
    assert.match(order.id, /^EL-\d+$/, 'order DTO must carry a real order code');
  }

  const gchList = await orders.listOrders(ctx.store.id, { outletId: ctx.gachibowli.id });
  const kphList = await orders.listOrders(ctx.store.id, { outletId: ctx.kukatpally.id });
  const mdpList = await orders.listOrders(ctx.store.id, { outletId: ctx.madhapur.id });

  assert.deepEqual(gchList.map(o => o.id), [gchOrder.id]);
  assert.deepEqual(kphList.map(o => o.id), [kphOrder.id]);
  assert.deepEqual(mdpList.map(o => o.id), [mdpOrder.id]);

  // The owner's "All outlets" view is the unscoped query; it must be exactly
  // the union of the three single-outlet views, with nothing added or dropped.
  const allOutlets = await orders.listOrders(ctx.store.id);
  assert.deepEqual(
    allOutlets.map(o => o.id).sort(),
    [gchOrder.id, kphOrder.id, mdpOrder.id].sort(),
  );
});

test('Blue Wave: owner all-outlet totals equal the sum of the individual outlets', async () => {
  const ctx = await setupBlueWave('totals');

  // Wash & Fold is 8000, Dry Clean 15000 (minor units).
  const placeAndPay = (outletId: string, key: string, actorId: string, productId: string, quantity: number, pay: number, method: string) =>
    orders.createOrder(
      ctx.store.id,
      {
        idempotencyKey: `bw-tot-${key}`,
        customerName: `Customer ${key}`,
        phone: '9876500000',
        dueDate: '2026-12-31',
        entries: [{ productId, quantity }],
        initialPayment: { amount: pay, method },
        outletId,
      },
      actorId,
    );

  await placeAndPay(ctx.gachibowli.id, 'gch', ctx.staff1.id, ctx.washFold.id, 1, 8_000, 'Cash');
  await placeAndPay(ctx.kukatpally.id, 'kph', ctx.staff2.id, ctx.washFold.id, 2, 10_000, 'Cash');
  await placeAndPay(ctx.madhapur.id, 'mdp', ctx.staff2.id, ctx.dryClean.id, 1, 15_000, 'UPI');

  const totalsOf = (rows: Awaited<ReturnType<typeof rollups.getDailyOutletSummaries>>) =>
    rows.reduce(
      (acc, r) => ({
        gross: acc.gross + r.grossOrderAmount,
        collected: acc.collected + r.paymentsCollectedAmount,
        created: acc.created + r.ordersCreatedCount,
      }),
      { gross: 0, collected: 0, created: 0 },
    );

  const perOutlet = await Promise.all(
    [ctx.gachibowli.id, ctx.kukatpally.id, ctx.madhapur.id].map(async outletId =>
      totalsOf(await rollups.getDailyOutletSummaries(ctx.store.id, { outletId })),
    ),
  );

  const summed = perOutlet.reduce(
    (acc, o) => ({ gross: acc.gross + o.gross, collected: acc.collected + o.collected, created: acc.created + o.created }),
    { gross: 0, collected: 0, created: 0 },
  );

  const aggregate = totalsOf(await rollups.getDailyOutletSummaries(ctx.store.id));

  assert.deepEqual(aggregate, summed, 'all-outlets rollup must equal the sum of its outlets');
  assert.equal(aggregate.created, 3);
  assert.equal(aggregate.gross, 8_000 + 16_000 + 15_000);
  assert.equal(aggregate.collected, 8_000 + 10_000 + 15_000);
});

/**
 * Regression: payment-method names are display labels, and the platform
 * catalogue is not tenant-scoped, so the name lookup can match a row owned by
 * a different organization. A tenant still on a legacy StorePaymentMethod must
 * keep working when an unrelated tenant happens to pick the same label — every
 * organization names one of its methods "Cash".
 */
test('a platform method named "Cash" in one org must not break another org legacy "Cash"', async () => {
  const orgA = await prisma.store.create({ data: { id: 'store-xt-a', name: 'Cross Tenant A' } });
  const orgB = await prisma.store.create({ data: { id: 'store-xt-b', name: 'Cross Tenant B' } });

  // Org B is a pre-outlet tenant: its only method is the legacy store row.
  await prisma.storePaymentMethod.create({ data: { storeId: orgB.id, name: 'Cash', active: true } });

  const before = await platformMethods.resolveActivePaymentMethod(orgB.id, 'Cash', { allowLegacy: true });
  assert.equal(before.valid, true, 'baseline: Org B resolves its own legacy method');

  // A different tenant enables a global method that happens to share the label.
  const cash = await platformMethods.createPlatformPaymentMethod({ code: 'CASH_XTENANT', name: 'Cash' });
  await platformMethods.setOrganizationPaymentMethodEnabled(orgA.id, cash.id, true);

  const after = await platformMethods.resolveActivePaymentMethod(orgB.id, 'Cash', { allowLegacy: true });
  assert.equal(after.valid, true, "another org's identically named method must not block Org B");
  assert.equal(after.platformPaymentMethodId, null, 'Org B still resolves the legacy row, not Org A platform method');

  // The outlet-owned path stays strict: legacy methods may not back new
  // outlet payments, so allowLegacy: false must still refuse (B4.4).
  const strict = await platformMethods.resolveActivePaymentMethod(orgB.id, 'Cash', { allowLegacy: false });
  assert.equal(strict.valid, false, 'outlet-owned payments must still reject legacy methods');
});

test('Blue Wave: expenses are owned by the outlet they were recorded against', async () => {
  const ctx = await setupBlueWave('expense');

  await expenses.createExpense(ctx.store.id, {
    outletId: ctx.kukatpally.id,
    title: 'Detergent restock',
    category: 'Supplies',
    amount: 4_500,
    due: '2026-12-15',
    monthly: false,
  });

  const kphExpenses = await expenses.listExpenses(ctx.store.id, { outletId: ctx.kukatpally.id });
  assert.equal(kphExpenses.length, 1);
  assert.equal(kphExpenses[0].title, 'Detergent restock');

  const gchExpenses = await expenses.listExpenses(ctx.store.id, { outletId: ctx.gachibowli.id });
  assert.deepEqual(gchExpenses, [], 'an expense must not appear under a sibling outlet');

  const allExpenses = await expenses.listExpenses(ctx.store.id);
  assert.equal(allExpenses.length, 1, 'the owner all-outlets view still sees it exactly once');
});
