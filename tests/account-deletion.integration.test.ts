import { testPhone } from './test-phone';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { NextRequest } from 'next/server';
import { PrismaClient, Role } from '../src/generated/prisma/client';
import { hashPassword } from '../src/server/auth/password';
import { generateSessionToken } from '../src/server/auth/token';
import { parseCalendarDate } from '../src/server/dates';
import { ConflictError } from '../src/server/errors';

const socket = process.env.QA_SUBSCRIPTION_PG_SOCKET;
if (!socket?.startsWith('/tmp/el-subscription-test-') || !socket.endsWith('/socket')) {
  throw new Error('Run npm run test:subscription-payments to create an isolated PostgreSQL cluster.');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({
  host: socket, user: 'subscription_test', database: 'postgres', port: 5432,
  application_name: 'el-account-deletion-test',
}) });
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;

let deletion: typeof import('../src/app/api/v1/account/deletion/route');
let restoreRoute: typeof import('../src/app/api/v1/account/deletion/restore/route');
let login: typeof import('../src/app/api/v1/auth/login/route');
let status: typeof import('../src/app/api/v1/auth/status/route');
let products: typeof import('../src/app/api/v1/products/route');
let cron: typeof import('../src/app/api/cron/account-deletion/route');
let svc: typeof import('../src/server/services/account-deletion');

before(async () => {
  deletion = await import('../src/app/api/v1/account/deletion/route');
  restoreRoute = await import('../src/app/api/v1/account/deletion/restore/route');
  login = await import('../src/app/api/v1/auth/login/route');
  status = await import('../src/app/api/v1/auth/status/route');
  products = await import('../src/app/api/v1/products/route');
  cron = await import('../src/app/api/cron/account-deletion/route');
  svc = await import('../src/server/services/account-deletion');
});
after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
});

const PASSWORD = 'password123';
let counter = 0;

async function makeUser(key: string, role: Role | null, storeId?: string) {
  const user = await prisma.user.create({ data: { name: `User ${key}`, phone: testPhone(`deletion-${key}`), passwordHash: await hashPassword(PASSWORD) } });
  if (role && storeId) await prisma.storeMembership.create({ data: { userId: user.id, storeId, role } });
  return user;
}
async function tokenFor(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const token = generateSessionToken();
  await prisma.session.create({ data: { userId, token, credentialVersion: user.credentialVersion, expiresAt: new Date(Date.now() + 86400000) } });
  return token;
}
async function org(options: { demo?: boolean } = {}) {
  const key = `org${++counter}${options.demo ? 'demo' : ''}`;
  const store = await prisma.store.create({ data: { id: `store-${key}`, name: `Org ${key}`, isReviewDemo: options.demo ?? false } });
  await prisma.subscription.create({ data: { storeId: store.id, depositAmount: 0, annualFeeAmount: 0, paidThroughDate: parseCalendarDate('2100-01-01') } });
  const outlet = await prisma.outlet.create({ data: { storeId: store.id, outletCode: `OUT-${key}`, displayName: 'Main' } });
  const owner = await makeUser(`${key}-owner`, Role.OWNER, store.id);
  const employee = await makeUser(`${key}-employee`, Role.EMPLOYEE, store.id);
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Wash', category: 'Laundry', type: 'ITEM', price: 100 } });
  const order = await prisma.order.create({
    data: {
      storeId: store.id, outletId: outlet.id, customerName: 'Customer', phone: '9000000999', dueDate: new Date(), 
      lines: { create: [{ productId: product.id, name: 'Wash', quantity: 1, unit: 'pcs', amount: 100 }] },
      payments: { create: [{ amount: 100, method: 'Cash', storeId: store.id, outletId: outlet.id }] },
      statusEvents: { create: [{ status: 'PENDING', byUserId: employee.id, storeId: store.id, outletId: outlet.id }] },
    },
  });
  await prisma.subscriptionPayment.create({ data: { storeId: store.id, type: 'DEPOSIT', amount: 500000, method: 'CASH', paidAt: new Date(), reference: 'UPI-REF-SECRET', notes: 'owner said call 9999999999' } });
  return { store, outlet, owner, employee, order, ownerToken: await tokenFor(owner.id), employeeToken: await tokenFor(employee.id) };
}

function call(method: string, path: string, token: string, storeId: string, body?: object) {
  return new NextRequest(`http://localhost/api/v1/${path}`, {
    method, headers: { authorization: `Bearer ${token}`, 'x-store-id': storeId, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const requestDeletion = (token: string, storeId: string) => deletion.POST(call('POST', 'account/deletion', token, storeId, { storeId }));
const doLogin = (phone: string, password = PASSWORD) => login.POST(new NextRequest('http://localhost/api/v1/auth/login', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, password }),
}));
const dueNow = (userId: string) => prisma.accountDeletionRequest.updateMany({ where: { userId, status: 'PENDING' }, data: { scheduledFor: new Date(Date.now() - 1000) } });

test('request creates one PENDING row, is idempotent, locks the org and ends sessions', async () => {
  const f = await org();
  const first = await requestDeletion(f.ownerToken, f.store.id);
  assert.equal(first.status, 200);
  const body = await first.json();
  assert.equal(body.status, 'PENDING');
  assert.equal(body.scope, 'ORGANIZATION');
  const days = (new Date(body.scheduledFor).getTime() - new Date(body.requestedAt).getTime()) / 86400000;
  assert.ok(Math.abs(days - 90) < 0.01, 'default grace is 90 days');

  const second = await requestDeletion(await tokenFor(f.owner.id), f.store.id);
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), body);
  assert.equal(await prisma.accountDeletionRequest.count({ where: { userId: f.owner.id } }), 1);
  assert.ok((await prisma.store.findUniqueOrThrow({ where: { id: f.store.id } })).deletionScheduledFor);
  // The first token died when the request was made.
  assert.equal((await status.GET(call('GET', 'auth/status', f.ownerToken, f.store.id))).status, 401);
});

test('owner gets ORGANIZATION scope, employee gets SELF and the org is not locked by it', async () => {
  const f = await org();
  const res = await requestDeletion(f.employeeToken, f.store.id);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).scope, 'SELF');
  const row = await prisma.accountDeletionRequest.findFirstOrThrow({ where: { userId: f.employee.id } });
  assert.equal(row.role, 'EMPLOYEE');
  assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: f.store.id } })).deletionScheduledFor, null);
  assert.equal((await products.GET(call('GET', 'products', await tokenFor(f.owner.id), f.store.id))).status, 200);
});

test('SELF is rejected with 409 for a user who owns an organization', async () => {
  const f = await org();
  const other = await org();
  const both = await makeUser('both-roles', Role.EMPLOYEE, f.store.id);
  await prisma.storeMembership.create({ data: { userId: both.id, storeId: other.store.id, role: Role.OWNER } });
  const res = await requestDeletion(await tokenFor(both.id), f.store.id);
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /delete your store first/i);
  assert.equal(await prisma.accountDeletionRequest.count({ where: { userId: both.id } }), 0);
});

test('a pending user can log in and sees deletionScheduledFor; others do not; every other endpoint is 403 deletion_pending', async () => {
  const f = await org();
  const clean = await (await doLogin(f.owner.phone)).json();
  assert.equal('deletionScheduledFor' in clean.user, false);

  const requested = await (await requestDeletion(f.ownerToken, f.store.id)).json();
  const res = await doLogin(f.owner.phone);
  assert.equal(res.status, 200);
  const loggedIn = await res.json();
  assert.equal(loggedIn.user.deletionScheduledFor, requested.scheduledFor);
  assert.equal(loggedIn.stores[0].blockedReason, 'deletion_pending');

  const s = await status.GET(call('GET', 'auth/status', loggedIn.token, f.store.id));
  assert.equal(s.status, 200);
  assert.equal((await s.json()).user.deletionScheduledFor, requested.scheduledFor);

  const blocked = await products.GET(call('GET', 'products', loggedIn.token, f.store.id));
  assert.equal(blocked.status, 403);
  assert.deepEqual(await blocked.json(), { error: 'Forbidden', reason: 'deletion_pending' });

  // The org lock also stops the owner's employee (who has no request of their own).
  const employee = await products.GET(call('GET', 'products', await tokenFor(f.employee.id), f.store.id));
  assert.equal(employee.status, 403);
  assert.equal((await employee.json()).reason, 'deletion_pending');
  const empLogin = await (await doLogin(f.employee.phone)).json();
  assert.equal(empLogin.stores[0].blockedReason, 'deletion_pending');
});

test('restore works, unlocks the organization, and a second restore is 409', async () => {
  const f = await org();
  await requestDeletion(f.ownerToken, f.store.id);
  const token = await tokenFor(f.owner.id);
  const res = await restoreRoute.POST(call('POST', 'account/deletion/restore', token, f.store.id));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'RESTORED' });
  const row = await prisma.accountDeletionRequest.findFirstOrThrow({ where: { userId: f.owner.id } });
  assert.equal(row.status, 'RESTORED');
  assert.ok(row.restoredAt);
  assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: f.store.id } })).deletionScheduledFor, null);
  assert.equal((await products.GET(call('GET', 'products', token, f.store.id))).status, 200);
  assert.equal((await products.GET(call('GET', 'products', await tokenFor(f.employee.id), f.store.id))).status, 200);

  const again = await restoreRoute.POST(call('POST', 'account/deletion/restore', token, f.store.id));
  assert.equal(again.status, 409);
});

test('restore after the wipe completed is 409 (service level; the account no longer exists)', async () => {
  const f = await org();
  await requestDeletion(f.ownerToken, f.store.id);
  await dueNow(f.owner.id);
  assert.equal((await svc.runDueDeletions()).completed >= 1, true);
  await assert.rejects(() => svc.restoreAccountDeletion(f.owner.id), ConflictError);
  const row = await prisma.accountDeletionRequest.findFirstOrThrow({ where: { userId: f.owner.id } });
  await assert.rejects(() => svc.restoreDeletionRequestById(row.id));
});

test('cron wipes only due rows, leaves a tracking row with no personal fields, and login then fails generically', async () => {
  const due = await org();
  const notDue = await org();
  await requestDeletion(due.ownerToken, due.store.id);
  await requestDeletion(notDue.ownerToken, notDue.store.id);
  await dueNow(due.owner.id);

  const summary = await svc.runDueDeletions();
  assert.ok(summary.completed >= 1);
  assert.equal(summary.failed, 0);

  assert.equal(await prisma.store.count({ where: { id: due.store.id } }), 0);
  assert.equal(await prisma.order.count({ where: { storeId: due.store.id } }), 0);
  assert.equal(await prisma.product.count({ where: { storeId: due.store.id } }), 0);
  assert.equal(await prisma.user.count({ where: { id: { in: [due.owner.id, due.employee.id] } } }), 0);
  assert.equal(await prisma.store.count({ where: { id: notDue.store.id } }), 1);
  assert.equal(await prisma.user.count({ where: { id: notDue.owner.id } }), 1);

  const row = await prisma.accountDeletionRequest.findFirstOrThrow({ where: { userId: due.owner.id } });
  assert.equal(row.status, 'COMPLETED');
  assert.ok(row.completedAt);
  assert.deepEqual(Object.keys(row).sort(), ['completedAt', 'id', 'organizationId', 'requestedAt', 'requestedVia', 'restoredAt', 'role', 'scheduledFor', 'scope', 'status', 'userId']);
  const dump = JSON.stringify(row);
  for (const secret of [due.owner.phone, due.owner.name, `Org ${due.store.id}`, due.store.name]) assert.equal(dump.includes(secret), false);

  // Billing facts are kept without reference, notes, recorder or organization name.
  const archived = await prisma.billingRecordArchive.findMany({ where: { organizationId: due.store.id } });
  assert.equal(archived.length, 1);
  assert.equal(archived[0].amount, 500000);
  const archiveDump = JSON.stringify(archived[0]);
  assert.equal(/UPI-REF-SECRET|9999999999/.test(archiveDump), false);

  // Same generic error as an unknown number.
  const wiped = await doLogin(due.owner.phone);
  const unknown = await doLogin(testPhone('never-existed'));
  assert.equal(wiped.status, 401);
  assert.deepEqual(await wiped.json(), await unknown.json());
});

test('SELF wipe deletes the employee but keeps the organization and its orders', async () => {
  const f = await org();
  await requestDeletion(f.employeeToken, f.store.id);
  await dueNow(f.employee.id);
  await svc.runDueDeletions();

  assert.equal(await prisma.user.count({ where: { id: f.employee.id } }), 0);
  assert.equal(await prisma.storeMembership.count({ where: { userId: f.employee.id } }), 0);
  assert.equal(await prisma.store.count({ where: { id: f.store.id } }), 1);
  assert.equal(await prisma.user.count({ where: { id: f.owner.id } }), 1);
  assert.equal(await prisma.order.count({ where: { id: f.order.id } }), 1);
  const events = await prisma.statusEvent.findMany({ where: { orderId: f.order.id } });
  assert.equal(events.length, 1);
  assert.equal(events[0].byUserId, null);
  assert.equal((await prisma.accountDeletionRequest.findFirstOrThrow({ where: { userId: f.employee.id } })).status, 'COMPLETED');
});

test('cron never wipes a review-demo organization, and auto-restores its requests after 24h', async () => {
  const demo = await org({ demo: true });
  await requestDeletion(demo.ownerToken, demo.store.id);
  await dueNow(demo.owner.id);
  const first = await svc.runDueDeletions();
  assert.equal(await prisma.store.count({ where: { id: demo.store.id } }), 1);
  assert.equal(await prisma.user.count({ where: { id: demo.owner.id } }), 1);
  assert.equal(first.autoRestoredDemo, 0, 'younger than 24h stays pending');
  assert.equal((await prisma.accountDeletionRequest.findFirstOrThrow({ where: { userId: demo.owner.id } })).status, 'PENDING');
  const demoRequestId = (await prisma.accountDeletionRequest.findFirstOrThrow({ where: { userId: demo.owner.id } })).id;
  await assert.rejects(() => svc.deleteRequestNow(demoRequestId));
  // wipeDeletionRequest is itself guarded, not only the cron's query.
  assert.equal((await svc.wipeDeletionRequest(demoRequestId)).outcome, 'skipped_demo');
  assert.equal(await prisma.store.count({ where: { id: demo.store.id } }), 1);

  await prisma.accountDeletionRequest.updateMany({ where: { userId: demo.owner.id }, data: { requestedAt: new Date(Date.now() - 25 * 3600_000) } });
  const second = await svc.runDueDeletions();
  assert.ok(second.autoRestoredDemo >= 1);
  assert.equal((await prisma.accountDeletionRequest.findFirstOrThrow({ where: { userId: demo.owner.id } })).status, 'RESTORED');
  assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: demo.store.id } })).deletionScheduledFor, null);
});

test('a demo request is also undone lazily on the next sign-in after 24h', async () => {
  const demo = await org({ demo: true });
  await requestDeletion(demo.ownerToken, demo.store.id);
  await prisma.accountDeletionRequest.updateMany({ where: { userId: demo.owner.id }, data: { requestedAt: new Date(Date.now() - 25 * 3600_000) } });
  const res = await (await doLogin(demo.owner.phone)).json();
  assert.equal('deletionScheduledFor' in res.user, false);
  assert.equal(res.stores[0].blockedReason, null);
});

test('cron route refuses without CRON_SECRET and runs with it', async () => {
  const original = process.env.CRON_SECRET;
  try {
    delete process.env.CRON_SECRET;
    assert.equal((await cron.GET(new NextRequest('http://localhost/api/cron/account-deletion', { headers: { authorization: 'Bearer anything' } }))).status, 401);
    process.env.CRON_SECRET = 'test-secret-value';
    assert.equal((await cron.GET(new NextRequest('http://localhost/api/cron/account-deletion'))).status, 401);
    assert.equal((await cron.GET(new NextRequest('http://localhost/api/cron/account-deletion', { headers: { authorization: 'Bearer wrong' } }))).status, 401);
    const ok = await cron.GET(new NextRequest('http://localhost/api/cron/account-deletion', { headers: { authorization: 'Bearer test-secret-value' } }));
    assert.equal(ok.status, 200);
  } finally {
    if (original === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = original;
  }
});
