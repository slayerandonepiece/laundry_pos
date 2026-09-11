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
let paymentMethodsRoute: typeof import("../src/app/api/v1/payment-methods/route");
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
    paymentMethodsRoute,
    profileRoute,
  ] = await Promise.all([
    import("../src/app/api/v1/orders/route"),
    import("../src/app/api/v1/orders/[orderCode]/route"),
    import("../src/app/api/v1/orders/[orderCode]/payments/route"),
    import("../src/app/api/v1/orders/[orderCode]/status/route"),
    import("../src/app/api/v1/orders/[orderCode]/invoice/route"),
    import("../src/app/api/v1/employees/route"),
    import("../src/app/api/v1/payment-methods/route"),
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
      username: `user-${suffix}`,
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

  // 7. Wrong role: EMPLOYEE attempts owner-only action (POST /api/v1/payment-methods) -> 403
  const empFixture = await createTestFixture("b61-employee", {
    role: Role.EMPLOYEE,
  });
  const empRoleReq = createReq("http://localhost/api/v1/payment-methods", {
    token: empFixture.token,
    storeId: empFixture.store.id,
    body: { name: "New Method" },
  });
  const empRoleRes = await paymentMethodsRoute.POST(empRoleReq);
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
  const lapsedRes = await ordersRoute.GET(lapsedReq);
  assert.equal(lapsedRes.status, 403);
  const lapsedBody = await lapsedRes.json();
  assert.equal(lapsedBody.error, "Forbidden");
  assert.equal(lapsedBody.reason, "payment_lapsed");
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
