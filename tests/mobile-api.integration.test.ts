import { testPhone } from './test-phone';
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import type { NextRequest } from "next/server";
import {
  PrismaClient,
  Role,
  StoreStatus,
} from "../src/generated/prisma/client";
import { generateSessionToken } from "../src/server/auth/token";

const socket = process.env.QA_SUBSCRIPTION_PG_SOCKET;
if (
  !socket?.startsWith("/tmp/el-subscription-test-") ||
  !socket.endsWith("/socket")
) {
  throw new Error(
    "Run npm run test:subscription-payments to create an isolated PostgreSQL cluster.",
  );
}

const connection = {
  host: socket,
  user: "subscription_test",
  database: "postgres",
  port: 5432,
};
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    ...connection,
    max: 10,
    application_name: "el-mobile-api-test",
  }),
});
const control = new Pool({ ...connection, max: 2 });

// Route handlers under test
let ordersRoute: typeof import("../src/app/api/v1/orders/route");
let orderDetailRoute: typeof import("../src/app/api/v1/orders/[orderCode]/route");
let orderPaymentsRoute: typeof import("../src/app/api/v1/orders/[orderCode]/payments/route");
let orderStatusRoute: typeof import("../src/app/api/v1/orders/[orderCode]/status/route");
let orderInvoiceRoute: typeof import("../src/app/api/v1/orders/[orderCode]/invoice/route");
let employeesRoute: typeof import("../src/app/api/v1/employees/route");
let expensesRoute: typeof import("../src/app/api/v1/expenses/route");
let paymentMethodsRoute: typeof import("../src/app/api/v1/payment-methods/route");
let paymentMethodDetailRoute: typeof import("../src/app/api/v1/payment-methods/[id]/route");
let profileRoute: typeof import("../src/app/api/v1/profile/route");
let parseOrderCode: (code: string) => number | null;

before(async () => {
  (globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
  const ordersMod = await import("../src/server/services/orders");
  parseOrderCode = ordersMod.parseOrderCode;
  [
    ordersRoute,
    orderDetailRoute,
    orderPaymentsRoute,
    orderStatusRoute,
    orderInvoiceRoute,
    employeesRoute,
    expensesRoute,
    paymentMethodsRoute,
    paymentMethodDetailRoute,
    profileRoute,
  ] = await Promise.all([
    import("../src/app/api/v1/orders/route"),
    import("../src/app/api/v1/orders/[orderCode]/route"),
    import("../src/app/api/v1/orders/[orderCode]/payments/route"),
    import("../src/app/api/v1/orders/[orderCode]/status/route"),
    import("../src/app/api/v1/orders/[orderCode]/invoice/route"),
    import("../src/app/api/v1/employees/route"),
    import("../src/app/api/v1/expenses/route"),
    import("../src/app/api/v1/payment-methods/route"),
    import("../src/app/api/v1/payment-methods/[id]/route"),
    import("../src/app/api/v1/profile/route"),
  ]);
});

after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
  await control.end();
});

function createReq(
  url: string,
  opts: {
    method?: string;
    token?: string;
    storeId?: string;
    body?: unknown;
  },
): NextRequest {
  const headers = new Headers();
  if (opts.token) headers.set("Authorization", `Bearer ${opts.token}`);
  if (opts.storeId) headers.set("X-Store-Id", opts.storeId);
  if (opts.body) headers.set("Content-Type", "application/json");

  return new Request(url, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }) as unknown as NextRequest;
}

async function createTestFixture(
  suffix: string,
  opts?: {
    role?: Role;
    userActive?: boolean;
    credentialVersion?: number;
    sessionExpired?: boolean;
    membershipActive?: boolean;
    storeStatus?: StoreStatus;
    storeDeletedAt?: Date | null;
    subscriptionPaidThrough?: Date | null;
  },
) {
  const store = await prisma.store.create({
    data: {
      id: `store-${suffix}`,
      name: `Store ${suffix}`,
      status: opts?.storeStatus ?? StoreStatus.ACTIVE,
      deletedAt: opts?.storeDeletedAt ?? null,
      subscription:
        opts?.subscriptionPaidThrough !== undefined
          ? {
              create: {
                depositAmount: 100_000,
                annualFeeAmount: 50_000,
                paidThroughDate: opts.subscriptionPaidThrough,
              },
            }
          : undefined,
    },
  });

  const user = await prisma.user.create({
    data: {
      name: `User ${suffix}`,
      phone: testPhone(`user-${suffix}`),
      passwordHash: "not-used",
      active: opts?.userActive ?? true,
      credentialVersion: opts?.credentialVersion ?? 1,
    },
  });

  await prisma.storeMembership.create({
    data: {
      storeId: store.id,
      userId: user.id,
      role: opts?.role ?? Role.OWNER,
      active: opts?.membershipActive ?? true,
    },
  });

  const token = generateSessionToken();
  const session = await prisma.session.create({
    data: {
      token,
      userId: user.id,
      credentialVersion: 1, // session issued at credentialVersion 1
      expiresAt: opts?.sessionExpired
        ? new Date(Date.now() - 3600_000)
        : new Date(Date.now() + 86400_000),
    },
  });

  const product = await prisma.product.create({
    data: {
      storeId: store.id,
      name: "Dry Cleaning",
      category: "Dry Clean",
      type: "ITEM",
      price: 10_000, // 100 INR
    },
  });

  const cash = await prisma.storePaymentMethod.create({
    data: {
      storeId: store.id,
      name: "Cash",
      active: true,
    },
  });

  return { store, user, session, token, product, cash };
}

// B6.1 Auth matrix: no token / expired / revoked / deactivated user / stale credentialVersion / wrong store / wrong role
test("B6.1: Auth matrix enforcement across route handlers", async () => {
  const fixture = await createTestFixture("b61-base");

  // 1. No token -> 401
  const noTokenReq = createReq("http://localhost/api/v1/orders", {
    storeId: fixture.store.id,
  });
  const noTokenRes = await ordersRoute.GET(noTokenReq);
  assert.equal(noTokenRes.status, 401);
  assert.equal((await noTokenRes.json()).error, "Unauthorized");

  // 2. Expired token -> 401
  const expiredFixture = await createTestFixture("b61-expired", {
    sessionExpired: true,
  });
  const expiredReq = createReq("http://localhost/api/v1/orders", {
    token: expiredFixture.token,
    storeId: expiredFixture.store.id,
  });
  const expiredRes = await ordersRoute.GET(expiredReq);
  assert.equal(expiredRes.status, 401);
  assert.equal((await expiredRes.json()).error, "Unauthorized");

  // 3. Revoked / unknown token -> 401
  const revokedReq = createReq("http://localhost/api/v1/orders", {
    token: generateSessionToken(),
    storeId: fixture.store.id,
  });
  const revokedRes = await ordersRoute.GET(revokedReq);
  assert.equal(revokedRes.status, 401);
  assert.equal((await revokedRes.json()).error, "Unauthorized");

  // 4. Deactivated user (user.active = false) -> 401
  const deactivatedFixture = await createTestFixture("b61-deactivated", {
    userActive: false,
  });
  const deactivatedReq = createReq("http://localhost/api/v1/orders", {
    token: deactivatedFixture.token,
    storeId: deactivatedFixture.store.id,
  });
  const deactivatedRes = await ordersRoute.GET(deactivatedReq);
  assert.equal(deactivatedRes.status, 401);
  assert.equal((await deactivatedRes.json()).error, "Unauthorized");

  // 5. Stale credentialVersion (user.credentialVersion bumped to 2 while session is 1) -> 401
  const staleFixture = await createTestFixture("b61-stale", {
    credentialVersion: 2,
  });
  const staleReq = createReq("http://localhost/api/v1/orders", {
    token: staleFixture.token,
    storeId: staleFixture.store.id,
  });
  const staleRes = await ordersRoute.GET(staleReq);
  assert.equal(staleRes.status, 401);
  assert.equal((await staleRes.json()).error, "Unauthorized");

  // 6. Wrong store (token for store A used against non-existent or unrelated store B) -> 403
  const wrongStoreReq = createReq("http://localhost/api/v1/orders", {
    token: fixture.token,
    storeId: "store-unrelated-random",
  });
  const wrongStoreRes = await ordersRoute.GET(wrongStoreReq);
  assert.equal(wrongStoreRes.status, 403);
  assert.equal((await wrongStoreRes.json()).error, "Forbidden");

  // 7. Wrong role: EMPLOYEE attempts owner-only action
  // (PATCH /api/v1/payment-methods/{id}) -> 403
  const empFixture = await createTestFixture("b61-employee", {
    role: Role.EMPLOYEE,
  });
  const empRoleReq = createReq("http://localhost/api/v1/payment-methods/some-id", {
    token: empFixture.token,
    storeId: empFixture.store.id,
    body: { enabled: true },
  });
  const empRoleRes = await paymentMethodDetailRoute.PATCH(empRoleReq, {
    params: Promise.resolve({ id: "some-id" }),
  });
  assert.equal(empRoleRes.status, 403);
  assert.equal((await empRoleRes.json()).error, "Forbidden");

  // EMPLOYEE also forbidden on GET /api/v1/employees
  const empListReq = createReq("http://localhost/api/v1/employees", {
    token: empFixture.token,
    storeId: empFixture.store.id,
  });
  const empListRes = await employeesRoute.GET(empListReq);
  assert.equal(empListRes.status, 403);
  assert.equal((await empListRes.json()).error, "Forbidden");
});

// B6.2: Each of the four FORBIDDEN reasons returns 403 with the right reason
test("B6.2: Four 403 FORBIDDEN reasons return appropriate reason codes", async () => {
  // 1. membership_inactive
  const inactiveMembershipFixture = await createTestFixture("b62-mem-inact", {
    membershipActive: false,
  });
  const memReq = createReq("http://localhost/api/v1/orders", {
    token: inactiveMembershipFixture.token,
    storeId: inactiveMembershipFixture.store.id,
  });
  const memRes = await ordersRoute.GET(memReq);
  assert.equal(memRes.status, 403);
  const memBody = await memRes.json();
  assert.equal(memBody.error, "Forbidden");
  assert.equal(memBody.reason, "membership_inactive");

  // 2. store_locked
  const lockedFixture = await createTestFixture("b62-locked", {
    storeStatus: StoreStatus.LOCKED,
  });
  const lockedReq = createReq("http://localhost/api/v1/orders", {
    token: lockedFixture.token,
    storeId: lockedFixture.store.id,
  });
  const lockedRes = await ordersRoute.GET(lockedReq);
  assert.equal(lockedRes.status, 403);
  const lockedBody = await lockedRes.json();
  assert.equal(lockedBody.error, "Forbidden");
  assert.equal(lockedBody.reason, "store_locked");

  // 3. store_archived
  const archivedFixture = await createTestFixture("b62-archived", {
    storeDeletedAt: new Date(),
  });
  const archivedReq = createReq("http://localhost/api/v1/orders", {
    token: archivedFixture.token,
    storeId: archivedFixture.store.id,
  });
  const archivedRes = await ordersRoute.GET(archivedReq);
  assert.equal(archivedRes.status, 403);
  const archivedBody = await archivedRes.json();
  assert.equal(archivedBody.error, "Forbidden");
  assert.equal(archivedBody.reason, "store_archived");

  // 4. payment_lapsed
  const pastDate = new Date("2020-01-01T00:00:00.000Z");
  const lapsedFixture = await createTestFixture("b62-lapsed", {
    subscriptionPaidThrough: pastDate,
  });
  const lapsedReq = createReq("http://localhost/api/v1/orders", {
    token: lapsedFixture.token,
    storeId: lapsedFixture.store.id,
  });
  // Expired subscriptions are read-only: historical GET/export remains
  // available while every mutation is denied by the normal writable guards.
  const lapsedRes = await ordersRoute.GET(lapsedReq);
  assert.equal(lapsedRes.status, 200);
});

// B6.3: Idempotent order creation — same key twice, one row
test("B6.3: Idempotent order creation returns identical order and creates only one row", async () => {
  const fixture = await createTestFixture("b63-idemp");
  const payload = {
    idempotencyKey: "idemp-qa-unique-key-1",
    customerName: "Aarav Sharma",
    phone: "9876543210",
    dueDate: "2100-01-15",
    entries: [{ productId: fixture.product.id, quantity: 2 }],
    initialPayment: { amount: 5_000, method: "Cash" },
  };

  const req1 = createReq("http://localhost/api/v1/orders", {
    token: fixture.token,
    storeId: fixture.store.id,
    body: payload,
  });
  const res1 = await ordersRoute.POST(req1);
  assert.equal(res1.status, 201);
  const order1 = await res1.json();
  assert.ok(order1.id);
  const order1Total = order1.lines.reduce(
    (s: number, l: { amount: number }) => s + l.amount,
    0,
  );
  assert.equal(order1Total, 20_000); // 2 * 10,000 paise

  // Repeat the exact same request with identical idempotency key
  const req2 = createReq("http://localhost/api/v1/orders", {
    token: fixture.token,
    storeId: fixture.store.id,
    body: payload,
  });
  const res2 = await ordersRoute.POST(req2);
  assert.ok(res2.status === 200 || res2.status === 201);
  const order2 = await res2.json();

  // Must match the original order
  assert.equal(order2.id, order1.id);
  assert.equal(order2.orderNumber, order1.orderNumber);

  // Must have created exactly 1 row in the orders table
  const count = await prisma.order.count({
    where: {
      storeId: fixture.store.id,
      idempotencyKey: "idemp-qa-unique-key-1",
    },
  });
  assert.equal(count, 1);
});

// B6.4: Concurrent payment cannot overpay
test("B6.4: Concurrent payment row locking prevents overpayment", async () => {
  const fixture = await createTestFixture("b64-concur");

  // Create an order of 10,000 paise with 0 initial payment
  const createReqObj = createReq("http://localhost/api/v1/orders", {
    token: fixture.token,
    storeId: fixture.store.id,
    body: {
      idempotencyKey: "idemp-b64-concur",
      customerName: "Concurrency Customer",
      phone: "9876543210",
      dueDate: "2100-01-20",
      entries: [{ productId: fixture.product.id, quantity: 1 }], // total: 10,000 paise
    },
  });
  const createRes = await ordersRoute.POST(createReqObj);
  assert.equal(createRes.status, 201);
  const createdOrder = await createRes.json();
  const orderCode = createdOrder.id; // e.g. "ORD-X"

  // Attempt two concurrent payments of 8,000 paise each against a 10,000 paise balance.
  // One must succeed, the other must be rejected because 8,000 > remaining 2,000 balance.
  const payReq1 = createReq(
    `http://localhost/api/v1/orders/${orderCode}/payments`,
    {
      token: fixture.token,
      storeId: fixture.store.id,
      body: { amount: 8_000, method: "Cash" },
    },
  );
  const payReq2 = createReq(
    `http://localhost/api/v1/orders/${orderCode}/payments`,
    {
      token: fixture.token,
      storeId: fixture.store.id,
      body: { amount: 8_000, method: "Cash" },
    },
  );

  const [result1, result2] = await Promise.all([
    orderPaymentsRoute.POST(payReq1, {
      params: Promise.resolve({ orderCode }),
    }),
    orderPaymentsRoute.POST(payReq2, {
      params: Promise.resolve({ orderCode }),
    }),
  ]);

  const statuses = [result1.status, result2.status].sort();
  // One must be 201 and one must be 400
  assert.equal(statuses[0], 201);
  assert.equal(statuses[1], 400);

  // Check the error message on the failed call
  const failedBody =
    result1.status === 400 ? await result1.json() : await result2.json();
  assert.match(
    failedBody.error,
    /Payment must be no more than the outstanding balance/,
  );

  // Check payments in database: exactly 1 payment of 8,000 paise
  const orderNumber = parseOrderCode(orderCode);
  assert.notEqual(orderNumber, null);
  const payments = await prisma.payment.findMany({
    where: { order: { orderNumber: orderNumber! } },
  });
  assert.equal(payments.length, 1);
  assert.equal(payments[0].amount, 8_000);
});

// B6.5: Invoice refuses to generate before settlement (B5.1)
test("B6.5: Invoice refuses generation before full payment and delivery", async () => {
  const fixture = await createTestFixture("b65-invoice");

  // Create an order of 10,000 paise with partial payment 5,000 paise
  const createRes = await ordersRoute.POST(
    createReq("http://localhost/api/v1/orders", {
      token: fixture.token,
      storeId: fixture.store.id,
      body: {
        idempotencyKey: "idemp-b65-invoice",
        customerName: "Invoice Test Customer",
        phone: "9876543210",
        dueDate: "2100-01-25",
        entries: [{ productId: fixture.product.id, quantity: 1 }], // 10,000 paise
        initialPayment: { amount: 5_000, method: "Cash" },
      },
    }),
  );
  const order = await createRes.json();
  const orderCode = order.id;

  // 1. Partially paid and Pending -> Invoice generation refused (400)
  const invReq1 = createReq(
    `http://localhost/api/v1/orders/${orderCode}/invoice`,
    {
      token: fixture.token,
      storeId: fixture.store.id,
    },
  );
  const invRes1 = await orderInvoiceRoute.GET(invReq1, {
    params: Promise.resolve({ orderCode }),
  });
  assert.equal(invRes1.status, 400);
  const body1 = await invRes1.json();
  assert.match(body1.error, /delivered|paid in full/i);

  // Also check order detail endpoint indicates canGenerate: false
  const detailReq1 = createReq(`http://localhost/api/v1/orders/${orderCode}`, {
    token: fixture.token,
    storeId: fixture.store.id,
  });
  const detailRes1 = await orderDetailRoute.GET(detailReq1, {
    params: Promise.resolve({ orderCode }),
  });
  assert.equal(detailRes1.status, 200);
  const detailBody1 = await detailRes1.json();
  assert.equal(detailBody1.invoice.canGenerate, false);
  assert.equal(detailBody1.invoice.exists, false);

  // 2. Pay in full, but still Pending (not Delivered) -> Invoice generation refused (400)
  const payRes = await orderPaymentsRoute.POST(
    createReq(`http://localhost/api/v1/orders/${orderCode}/payments`, {
      token: fixture.token,
      storeId: fixture.store.id,
      body: { amount: 5_000, method: "Cash" },
    }),
    { params: Promise.resolve({ orderCode }) },
  );
  assert.equal(payRes.status, 201);

  const invRes2 = await orderInvoiceRoute.GET(invReq1, {
    params: Promise.resolve({ orderCode }),
  });
  assert.equal(invRes2.status, 400);
  const body2 = await invRes2.json();
  assert.match(body2.error, /delivered/i);

  // 3. Mark delivered -> now paid in full AND delivered -> Invoice generation succeeds (200)
  const statusRes = await orderStatusRoute.PATCH(
    createReq(`http://localhost/api/v1/orders/${orderCode}/status`, {
      token: fixture.token,
      storeId: fixture.store.id,
      body: { status: "Delivered" },
    }),
    { params: Promise.resolve({ orderCode }) },
  );
  assert.equal(statusRes.status, 200);

  const invRes3 = await orderInvoiceRoute.GET(invReq1, {
    params: Promise.resolve({ orderCode }),
  });
  assert.equal(invRes3.status, 200);
  const invoice = await invRes3.json();
  assert.ok(invoice.invoiceSeq);
  assert.match(invoice.accessToken, /^[A-Za-z0-9_-]{43}$/);

  // Verify order detail now reflects invoice.exists = true and canGenerate = true
  const detailRes2 = await orderDetailRoute.GET(detailReq1, {
    params: Promise.resolve({ orderCode }),
  });
  const detailBody2 = await detailRes2.json();
  assert.equal(detailBody2.invoice.exists, true);
  assert.equal(detailBody2.invoice.canGenerate, true);
  assert.equal(detailBody2.invoice.accessToken, invoice.accessToken);
});

// B6.6: Cross-store isolation: a token for store A cannot read store B, even with X-Store-Id spoofed
test("B6.6: Cross-store isolation blocks unauthorized store access and data leaking", async () => {
  const storeA = await createTestFixture("b66-store-a");
  const storeB = await createTestFixture("b66-store-b");

  // Create an order in store B
  const createOrderBRes = await ordersRoute.POST(
    createReq("http://localhost/api/v1/orders", {
      token: storeB.token,
      storeId: storeB.store.id,
      body: {
        idempotencyKey: "idemp-b66-order-b",
        customerName: "Store B Customer",
        phone: "9876543210",
        dueDate: "2100-02-01",
        entries: [{ productId: storeB.product.id, quantity: 1 }],
      },
    }),
  );
  assert.equal(createOrderBRes.status, 201);
  const orderB = await createOrderBRes.json();
  const orderCodeB = orderB.id;

  // 1. User A uses token A, but passes X-Store-Id: storeB.id to list orders -> 403 Forbidden
  const spoofListReq = createReq("http://localhost/api/v1/orders", {
    token: storeA.token,
    storeId: storeB.store.id,
  });
  const spoofListRes = await ordersRoute.GET(spoofListReq);
  assert.equal(spoofListRes.status, 403);
  assert.equal((await spoofListRes.json()).error, "Forbidden");

  // 2. User A uses token A, passes X-Store-Id: storeB.id to access Store B's order detail -> 403 Forbidden
  const spoofDetailReq = createReq(
    `http://localhost/api/v1/orders/${orderCodeB}`,
    {
      token: storeA.token,
      storeId: storeB.store.id,
    },
  );
  const spoofDetailRes = await orderDetailRoute.GET(spoofDetailReq, {
    params: Promise.resolve({ orderCode: orderCodeB }),
  });
  assert.equal(spoofDetailRes.status, 403);
  assert.equal((await spoofDetailRes.json()).error, "Forbidden");

  // 3. User A uses token A, passes Store A header (or default), but asks for Order B's code -> 404 Order not found
  const crossDetailReq = createReq(
    `http://localhost/api/v1/orders/${orderCodeB}`,
    {
      token: storeA.token,
      storeId: storeA.store.id,
    },
  );
  const crossDetailRes = await orderDetailRoute.GET(crossDetailReq, {
    params: Promise.resolve({ orderCode: orderCodeB }),
  });
  assert.equal(crossDetailRes.status, 404);
  assert.equal((await crossDetailRes.json()).error, "Order not found.");
});

// Task A: Paginate/limit orders list endpoint
test("Task A: GET /api/v1/orders supports limit and sort query parameters", async () => {
  const fixture = await createTestFixture("orders-limit-sort");

  // Create 3 orders with distinct idempotency keys
  for (let i = 1; i <= 3; i++) {
    const createRes = await ordersRoute.POST(
      createReq("http://localhost/api/v1/orders", {
        token: fixture.token,
        storeId: fixture.store.id,
        body: {
          idempotencyKey: `idemp-limit-sort-${i}`,
          customerName: `Customer ${i}`,
          phone: "9876543210",
          dueDate: "2100-01-20",
          entries: [{ productId: fixture.product.id, quantity: 1 }],
        },
      }),
    );
    assert.equal(createRes.status, 201);
  }

  // 1. Without params: returns all 3 orders, newest first
  const allReq = createReq("http://localhost/api/v1/orders", {
    token: fixture.token,
    storeId: fixture.store.id,
  });
  const allRes = await ordersRoute.GET(allReq);
  assert.equal(allRes.status, 200);
  const allOrders = await allRes.json();
  assert.equal(allOrders.length, 3);
  assert.equal(allOrders[0].name, "Customer 3");

  // 2. With limit=2 and sort=recent: returns 2 orders, newest first
  const limitReq = createReq("http://localhost/api/v1/orders?limit=2&sort=recent", {
    token: fixture.token,
    storeId: fixture.store.id,
  });
  const limitRes = await ordersRoute.GET(limitReq);
  assert.equal(limitRes.status, 200);
  const limitOrders = await limitRes.json();
  assert.equal(limitOrders.length, 2);
  assert.equal(limitOrders[0].name, "Customer 3");
  assert.equal(limitOrders[1].name, "Customer 2");

  // 3. With limit=1: returns 1 order (newest)
  const singleReq = createReq("http://localhost/api/v1/orders?limit=1", {
    token: fixture.token,
    storeId: fixture.store.id,
  });
  const singleRes = await ordersRoute.GET(singleReq);
  assert.equal(singleRes.status, 200);
  const singleOrders = await singleRes.json();
  assert.equal(singleOrders.length, 1);
  assert.equal(singleOrders[0].name, "Customer 3");

  // 4. Invalid limit (negative or non-numeric): ignored, returns all 3 orders
  const invalidReq = createReq("http://localhost/api/v1/orders?limit=-5", {
    token: fixture.token,
    storeId: fixture.store.id,
  });
  const invalidRes = await ordersRoute.GET(invalidReq);
  assert.equal(invalidRes.status, 200);
  const invalidOrders = await invalidRes.json();
  assert.equal(invalidOrders.length, 3);
});

// Task B: Employee profile read access
test("Task B: Employee can read store profile, but cannot update it", async () => {
  const fixture = await createTestFixture("employee-profile", {
    role: Role.EMPLOYEE,
  });

  // 1. Employee GET /api/v1/profile -> 200 OK with store details
  const getReq = createReq("http://localhost/api/v1/profile", {
    token: fixture.token,
    storeId: fixture.store.id,
  });
  const getRes = await profileRoute.GET(getReq);
  assert.equal(getRes.status, 200);
  const profile = await getRes.json();
  assert.equal(profile.name, fixture.user.name);
  assert.equal(profile.store, fixture.store.name);
  assert.ok("phone" in profile);
  assert.ok("email" in profile);
  assert.ok("address" in profile);

  // 2. Employee PUT /api/v1/profile -> 403 Forbidden (owner-only)
  const putReq = createReq("http://localhost/api/v1/profile", {
    token: fixture.token,
    storeId: fixture.store.id,
    body: {
      name: "Attempted Hack",
      phone: "9876543210",
      email: "test@example.com",
      store: "Hacked Store",
      address: "123 Street",
    },
  });
  const putRes = await profileRoute.PUT(putReq);
  assert.equal(putRes.status, 403);
  assert.equal((await putRes.json()).error, "Forbidden");
});

// Task C: the mobile payment list must match what checkout will actually accept
test("Task C: payment methods expose organization methods only", async () => {
  const fixture = await createTestFixture("org-payment-methods");

  const enabledMethod = await prisma.platformPaymentMethod.create({
    data: { code: "TASKC_ENABLED", name: "Task C Enabled", active: true },
  });
  const disabledMethod = await prisma.platformPaymentMethod.create({
    data: { code: "TASKC_DISABLED", name: "Task C Disabled", active: true },
  });
  await prisma.organizationPaymentMethod.create({
    data: { storeId: fixture.store.id, platformPaymentMethodId: enabledMethod.id, enabled: true },
  });
  await prisma.organizationPaymentMethod.create({
    data: { storeId: fixture.store.id, platformPaymentMethodId: disabledMethod.id, enabled: false },
  });
  // A legacy per-store method must never reach the client: an outlet-owned
  // order would reject it at checkout.
  await prisma.storePaymentMethod.create({
    data: { storeId: fixture.store.id, name: "Legacy Only", active: true },
  });

  const listReq = createReq("http://localhost/api/v1/payment-methods", {
    token: fixture.token,
    storeId: fixture.store.id,
  });
  const listRes = await paymentMethodsRoute.GET(listReq);
  assert.equal(listRes.status, 200);
  const listed = (await listRes.json()) as { id: string; name: string; enabled: boolean }[];
  const names = listed.map(m => m.name);
  assert.ok(names.includes("Task C Enabled"));
  assert.ok(!names.includes("Task C Disabled"));
  assert.ok(!names.includes("Legacy Only"));
  assert.ok(listed.every(m => m.enabled === true));

  const allReq = createReq("http://localhost/api/v1/payment-methods?all=true", {
    token: fixture.token,
    storeId: fixture.store.id,
  });
  const allNames = ((await (await paymentMethodsRoute.GET(allReq)).json()) as { name: string }[]).map(m => m.name);
  assert.ok(allNames.includes("Task C Enabled"));
  assert.ok(allNames.includes("Task C Disabled"));

  // Creating a store-local method is retired — it could never pay an outlet order.
  const createRes = await paymentMethodsRoute.POST();
  assert.equal(createRes.status, 410);

  // Owner toggles organization enablement by platform method id.
  const patchReq = createReq(`http://localhost/api/v1/payment-methods/${disabledMethod.id}`, {
    token: fixture.token,
    storeId: fixture.store.id,
    body: { enabled: true },
  });
  const patchRes = await paymentMethodDetailRoute.PATCH(patchReq, {
    params: Promise.resolve({ id: disabledMethod.id }),
  });
  assert.equal(patchRes.status, 200);
  assert.equal((await patchRes.json()).enabled, true);

  const renameReq = createReq(`http://localhost/api/v1/payment-methods/${disabledMethod.id}`, {
    token: fixture.token,
    storeId: fixture.store.id,
    body: { enabled: true, name: "Renamed" },
  });
  const renameRes = await paymentMethodDetailRoute.PATCH(renameReq, {
    params: Promise.resolve({ id: disabledMethod.id }),
  });
  assert.equal(renameRes.status, 400);
});

async function waitForBlocked(count: number) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const { rows } = await control.query<{ waiting: number }>(`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE datname = current_database()
        AND application_name = 'el-mobile-api-test'
        AND wait_event_type = 'Lock'
    `);
    if (rows[0].waiting >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`${count} calls did not reach the lock barrier.`);
}

async function raceBehindLock<T>(
  lockSql: string,
  calls: (() => Promise<T>)[],
) {
  const blocker = await control.connect();
  await blocker.query("BEGIN");
  await blocker.query(lockSql);
  const pending = Promise.allSettled(calls.map((call) => call()));
  try {
    await waitForBlocked(calls.length);
  } finally {
    await blocker.query("COMMIT");
    blocker.release();
  }
  return pending;
}

// Task D: Idempotent expense creation (one-off, monthly, cross-store, no key, race)
test("Task D: POST /api/v1/expenses is idempotent by idempotencyKey", async () => {
  const storeA = await createTestFixture("exp-idemp-a");
  const storeB = await createTestFixture("exp-idemp-b");

  // 1. One-off expense: same idempotencyKey twice -> one row, same id
  const oneOffBody = {
    idempotencyKey: "exp-key-oneoff-1",
    title: "Detergent Bulk",
    category: "Supplies",
    amount: 25_000,
    due: "2026-10-05",
    monthly: false,
  };
  const expRes1 = await expensesRoute.POST(
    createReq("http://localhost/api/v1/expenses", {
      token: storeA.token,
      storeId: storeA.store.id,
      body: oneOffBody,
    }),
  );
  assert.equal(expRes1.status, 201);
  const exp1 = await expRes1.json();
  assert.ok(exp1.id);
  assert.equal(exp1.monthly, false);

  const expRes2 = await expensesRoute.POST(
    createReq("http://localhost/api/v1/expenses", {
      token: storeA.token,
      storeId: storeA.store.id,
      body: oneOffBody,
    }),
  );
  assert.equal(expRes2.status, 201);
  const exp2 = await expRes2.json();
  assert.equal(exp2.id, exp1.id);
  assert.equal(
    await prisma.expense.count({
      where: { storeId: storeA.store.id, idempotencyKey: "exp-key-oneoff-1" },
    }),
    1,
  );

  // 2. Monthly expense: same idempotencyKey twice -> one series + one occurrence row, same id
  const monthlyBody = {
    idempotencyKey: "exp-key-monthly-1",
    title: "Shop Rent",
    category: "Rent",
    amount: 1_500_000,
    due: "2026-10-01",
    monthly: true,
  };
  const mRes1 = await expensesRoute.POST(
    createReq("http://localhost/api/v1/expenses", {
      token: storeA.token,
      storeId: storeA.store.id,
      body: monthlyBody,
    }),
  );
  assert.equal(mRes1.status, 201);
  const mExp1 = await mRes1.json();
  assert.ok(mExp1.id);
  assert.equal(mExp1.monthly, true);
  assert.ok(mExp1.seriesId);

  const mRes2 = await expensesRoute.POST(
    createReq("http://localhost/api/v1/expenses", {
      token: storeA.token,
      storeId: storeA.store.id,
      body: monthlyBody,
    }),
  );
  assert.equal(mRes2.status, 201);
  const mExp2 = await mRes2.json();
  assert.equal(mExp2.id, mExp1.id);
  assert.equal(mExp2.seriesId, mExp1.seriesId);
  assert.equal(
    await prisma.recurringExpenseSeries.count({
      where: { storeId: storeA.store.id },
    }),
    1,
  );
  assert.equal(
    await prisma.expense.count({
      where: { storeId: storeA.store.id, idempotencyKey: "exp-key-monthly-1" },
    }),
    1,
  );

  // 3. Same key from a different store -> rejected (400 Duplicate request key.)
  const crossStoreRes = await expensesRoute.POST(
    createReq("http://localhost/api/v1/expenses", {
      token: storeB.token,
      storeId: storeB.store.id,
      body: oneOffBody,
    }),
  );
  assert.equal(crossStoreRes.status, 400);
  assert.equal((await crossStoreRes.json()).error, "Duplicate request key.");

  // 4. No key -> behaviour unchanged (two calls create two distinct rows)
  const noKeyBody = {
    title: "Packaging Bags",
    category: "Supplies",
    amount: 5_000,
    due: "2026-10-10",
    monthly: false,
  };
  const nkRes1 = await expensesRoute.POST(
    createReq("http://localhost/api/v1/expenses", {
      token: storeA.token,
      storeId: storeA.store.id,
      body: noKeyBody,
    }),
  );
  const nkRes2 = await expensesRoute.POST(
    createReq("http://localhost/api/v1/expenses", {
      token: storeA.token,
      storeId: storeA.store.id,
      body: noKeyBody,
    }),
  );
  assert.equal(nkRes1.status, 201);
  assert.equal(nkRes2.status, 201);
  const nk1 = await nkRes1.json();
  const nk2 = await nkRes2.json();
  assert.notEqual(nk1.id, nk2.id);

  // 5. Concurrent race on the same idempotencyKey -> P2002 caught, both return the winner
  const raceBody = {
    idempotencyKey: "exp-key-race-1",
    title: "Water Bill",
    category: "Utilities",
    amount: 8_000,
    due: "2026-10-15",
    monthly: false,
  };
  const raceResults = await raceBehindLock(
    "LOCK TABLE expenses IN SHARE MODE",
    [1, 2].map(() => async () => {
      const res = await expensesRoute.POST(
        createReq("http://localhost/api/v1/expenses", {
          token: storeA.token,
          storeId: storeA.store.id,
          body: raceBody,
        }),
      );
      assert.equal(res.status, 201);
      return (await res.json()) as { id: string };
    }),
  );
  assert.ok(
    raceResults.every((r) => r.status === "fulfilled"),
    JSON.stringify(raceResults),
  );
  const [r1, r2] = raceResults.map(
    (r) => (r as PromiseFulfilledResult<{ id: string }>).value,
  );
  assert.equal(r1.id, r2.id);
});

// Task E: Idempotent employee creation (retry, cross-store, no key, race)
test("Task E: POST /api/v1/employees is idempotent by idempotencyKey", async () => {
  const storeA = await createTestFixture("emp-idemp-a");
  const storeB = await createTestFixture("emp-idemp-b");

  const empBody = {
    idempotencyKey: "emp-key-1",
    name: "Rohan Verma",
    phone: testPhone("rohan.idemp.1"),
    password: "password123",
    active: true,
  };

  // 1. First create -> 201
  const res1 = await employeesRoute.POST(
    createReq("http://localhost/api/v1/employees", {
      token: storeA.token,
      storeId: storeA.store.id,
      body: empBody,
    }),
  );
  assert.equal(res1.status, 201);
  const emp1 = await res1.json();
  assert.ok(emp1.id);
  assert.equal(emp1.phone, testPhone("rohan.idemp.1"));

  // 2. Retry with same idempotencyKey -> 200/201 with same id (NOT "phone already in use")
  const res2 = await employeesRoute.POST(
    createReq("http://localhost/api/v1/employees", {
      token: storeA.token,
      storeId: storeA.store.id,
      body: empBody,
    }),
  );
  assert.ok(res2.status === 200 || res2.status === 201);
  const emp2 = await res2.json();
  assert.equal(emp2.id, emp1.id);
  assert.equal(
    await prisma.storeMembership.count({
      where: { storeId: storeA.store.id, idempotencyKey: "emp-key-1" },
    }),
    1,
  );
  assert.equal(
    await prisma.user.count({ where: { phone: testPhone("rohan.idemp.1") } }),
    1,
  );

  // 3. Same key from a different store -> rejected (400 Duplicate request key.)
  const crossRes = await employeesRoute.POST(
    createReq("http://localhost/api/v1/employees", {
      token: storeB.token,
      storeId: storeB.store.id,
      body: {
        ...empBody,
        phone: testPhone("other.phone.b"),
      },
    }),
  );
  assert.equal(crossRes.status, 400);
  assert.equal((await crossRes.json()).error, "Duplicate request key.");

  // 4. No key -> behaviour unchanged (second call with same phone fails with 400 phone in use)
  const noKeyBody = {
    name: "Kiran Rao",
    phone: testPhone("kiran.nokey.1"),
    password: "password123",
    active: true,
  };
  const nkRes1 = await employeesRoute.POST(
    createReq("http://localhost/api/v1/employees", {
      token: storeA.token,
      storeId: storeA.store.id,
      body: noKeyBody,
    }),
  );
  assert.equal(nkRes1.status, 201);

  const nkRes2 = await employeesRoute.POST(
    createReq("http://localhost/api/v1/employees", {
      token: storeA.token,
      storeId: storeA.store.id,
      body: noKeyBody,
    }),
  );
  assert.equal(nkRes2.status, 400);
  assert.match((await nkRes2.json()).error, /phone number is already registered/i);

  // 5. Concurrent race on the same idempotencyKey -> P2002 caught, both return the winner
  const raceEmpBody = {
    idempotencyKey: "emp-key-race-1",
    name: "Priya Nair",
    phone: testPhone("priya.race.1"),
    password: "password123",
    active: true,
  };
  const raceResults = await raceBehindLock(
    "LOCK TABLE users IN SHARE MODE",
    [1, 2].map(() => async () => {
      const res = await employeesRoute.POST(
        createReq("http://localhost/api/v1/employees", {
          token: storeA.token,
          storeId: storeA.store.id,
          body: raceEmpBody,
        }),
      );
      assert.equal(res.status, 201);
      return (await res.json()) as { id: string };
    }),
  );
  assert.ok(
    raceResults.every((r) => r.status === "fulfilled"),
    JSON.stringify(raceResults),
  );
  const [e1, e2] = raceResults.map(
    (r) => (r as PromiseFulfilledResult<{ id: string }>).value,
  );
  assert.equal(e1.id, e2.id);
});

test('Catalogue ETags support conditional reads only after tenant authorization', async () => {
  const productsRoute = await import('../src/app/api/v1/products/route');
  const a = await createTestFixture('etag-a');
  const b = await createTestFixture('etag-b');
  const request = (token: string, storeId: string, tag?: string) => {
    const req = createReq('http://localhost/api/v1/products', { token, storeId });
    if (tag) req.headers.set('If-None-Match', tag);
    return req;
  };
  const first = await productsRoute.GET(request(a.token, a.store.id));
  const tag = first.headers.get('ETag');
  assert.match(tag ?? '', /^W\/"[a-f0-9]{12}"$/);
  const unchanged = await productsRoute.GET(request(a.token, a.store.id, `"different", ${tag}`));
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), '');
  assert.equal(unchanged.headers.get('Cache-Control'), 'private, max-age=30');
  const forbidden = await productsRoute.GET(request(a.token, b.store.id, tag!));
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.headers.get('ETag'), null);
  const differentStore = await productsRoute.GET(request(b.token, b.store.id, tag!));
  assert.equal(differentStore.status, 200);
  assert.notEqual(differentStore.headers.get('ETag'), tag);
  const methods = await paymentMethodsRoute.GET(createReq('http://localhost/api/v1/payment-methods', { token: a.token, storeId: a.store.id }));
  const req = createReq('http://localhost/api/v1/payment-methods', { token: a.token, storeId: a.store.id });
  req.headers.set('If-None-Match', methods.headers.get('ETag')!);
  assert.equal((await paymentMethodsRoute.GET(req)).status, 304);
});

test('Orders sync accepts ISO timestamps, pages equal timestamps without loss, and returns tombstones', async () => {
  const sync = await import('../src/app/api/v1/orders/sync/route');
  const fixture = await createTestFixture('delta-sync');
  for (let i = 0; i < 3; i++) {
    const response = await ordersRoute.POST(createReq('http://localhost/api/v1/orders', {
      token: fixture.token, storeId: fixture.store.id, body: {
        idempotencyKey: `delta-${i}`, customerName: `Customer ${i}`, phone: '9876543210', dueDate: '2100-01-20', entries: [{ productId: fixture.product.id, quantity: 1 }],
      },
    }));
    assert.equal(response.status, 201);
  }
  const timestamp = new Date('2026-01-01T12:00:00.000Z');
  await prisma.order.updateMany({ where: { storeId: fixture.store.id }, data: { updatedAt: timestamp } });
  const cancelled = await prisma.order.findFirstOrThrow({ where: { storeId: fixture.store.id } });
  await prisma.order.update({ where: { id: cancelled.id }, data: { legacyCancelled: true, updatedAt: timestamp } });
  const read = (since: string) => sync.GET(createReq(`http://localhost/api/v1/orders/sync?limit=1&since=${encodeURIComponent(since)}`, { token: fixture.token, storeId: fixture.store.id }));
  let cursor: string | null = timestamp.toISOString();
  const found: { id: string; deleted: boolean }[] = [];
  do {
    const response = await read(cursor!);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    const result = await response.json();
    assert.ok(Number.isFinite(Date.parse(result.syncedAt)));
    found.push(...result.orders); cursor = result.nextCursor;
  } while (cursor);
  assert.equal(found.length, 3);
  assert.equal(new Set(found.map(order => order.id)).size, 3);
  assert.equal(found.filter(order => order.deleted).length, 1);
  assert.equal((await read('not-a-date')).status, 400);
  assert.equal((await read('2026-02-30T00:00:00.000Z')).status, 400);
  assert.equal((await read('')).status, 400);
  assert.equal((await sync.GET(createReq('http://localhost/api/v1/orders/sync', {}))).status, 401);
  const other = await createTestFixture('delta-other');
  assert.equal((await sync.GET(createReq('http://localhost/api/v1/orders/sync', { token: fixture.token, storeId: other.store.id }))).status, 403);
  const employee = await createTestFixture('delta-employee', { role: Role.EMPLOYEE });
  assert.equal((await sync.GET(createReq('http://localhost/api/v1/orders/sync', { token: employee.token, storeId: employee.store.id }))).status, 403);
});

test('Sync status reports only this store timestamps and enforces authentication', async () => {
  const status = await import('../src/app/api/v1/sync/status/route');
  const a = await createTestFixture('sync-status-a');
  const b = await createTestFixture('sync-status-b');
  const response = await status.GET(createReq('http://localhost/api/v1/sync/status', { token: a.token, storeId: a.store.id }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const result = await response.json();
  assert.equal(result.productsUpdatedAt, a.product.updatedAt.toISOString());
  assert.equal(result.ordersUpdatedAt, null);
  assert.equal((await status.GET(createReq('http://localhost/api/v1/sync/status', {}))).status, 401);
  assert.equal((await status.GET(createReq('http://localhost/api/v1/sync/status', { token: a.token, storeId: b.store.id }))).status, 403);
});
