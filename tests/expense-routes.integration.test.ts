import { testPhone } from './test-phone';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { NextRequest } from 'next/server';
import { PrismaClient, Role } from '../src/generated/prisma/client';
import { hashPassword } from '../src/server/auth/password';
import { generateSessionToken } from '../src/server/auth/token';
import { parseCalendarDate, todayIST } from '../src/server/dates';

const socket = process.env.QA_SUBSCRIPTION_PG_SOCKET;
if (!socket?.startsWith('/tmp/el-subscription-test-') || !socket.endsWith('/socket')) {
  throw new Error('Run npm run test:subscription-payments to create an isolated PostgreSQL cluster.');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({
  host: socket, user: 'subscription_test', database: 'postgres', port: 5432,
  application_name: 'el-expense-routes-test',
}) });
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;

let routes: typeof import('../src/app/api/v1/expenses/[id]/route');
let payRoute: typeof import('../src/app/api/v1/expenses/[id]/pay/route');
let listRoute: typeof import('../src/app/api/v1/expenses/route');
let expenses: typeof import('../src/server/services/expenses');
let f: Awaited<ReturnType<typeof fixture>>;

before(async () => {
  routes = await import('../src/app/api/v1/expenses/[id]/route');
  payRoute = await import('../src/app/api/v1/expenses/[id]/pay/route');
  listRoute = await import('../src/app/api/v1/expenses/route');
  expenses = await import('../src/server/services/expenses');
  f = await fixture();
});
after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
});

async function user(name: string) {
  return prisma.user.create({ data: { name, phone: testPhone('expense_route_' + name), passwordHash: await hashPassword('password123') } });
}
async function token(userId: string) {
  const value = generateSessionToken();
  const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await prisma.session.create({ data: { userId, token: value, credentialVersion: row.credentialVersion, expiresAt: new Date(Date.now() + 86400000) } });
  return value;
}
async function fixture() {
  const store = await prisma.store.create({ data: { id: 'store-expense-routes', name: 'Expense routes' } });
  const other = await prisma.store.create({ data: { id: 'store-expense-routes-other', name: 'Other expense routes' } });
  await prisma.subscription.createMany({ data: [store.id, other.id].map(storeId => ({
    storeId, depositAmount: 0, annualFeeAmount: 0, paidThroughDate: parseCalendarDate('2100-01-01'),
  })) });
  const a = await prisma.outlet.create({ data: { storeId: store.id, outletCode: 'EXP-A', displayName: 'A' } });
  const b = await prisma.outlet.create({ data: { storeId: store.id, outletCode: 'EXP-B', displayName: 'B' } });
  const owner = await user('owner');
  const employee = await user('employee');
  const otherOwner = await user('other_owner');
  await prisma.storeMembership.createMany({ data: [
    { storeId: store.id, userId: owner.id, role: Role.OWNER },
    { storeId: store.id, userId: employee.id, role: Role.EMPLOYEE },
    { storeId: other.id, userId: otherOwner.id, role: Role.OWNER },
  ] });
  return { store, other, a, b, tokens: {
    owner: await token(owner.id), employee: await token(employee.id), otherOwner: await token(otherOwner.id),
  } };
}
function request(method: string, id: string, tokenValue = f.tokens.owner, body?: object, storeId = f.store.id, extra: Record<string, string> = {}) {
  return new NextRequest(`http://localhost/api/v1/expenses/${id}`, {
    method, headers: { authorization: `Bearer ${tokenValue}`, 'x-store-id': storeId, 'content-type': 'application/json', ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function params(id: string) { return { params: Promise.resolve({ id }) }; }
function input(extra: Record<string, unknown> = {}) {
  return { title: 'Rent', category: 'Fixed', amount: 100, due: todayIST(), monthly: false, ...extra };
}
async function total(outletId: string, date: string) {
  const row = await prisma.dailyOutletSummary.findUnique({ where: {
    storeId_outletId_businessDate: { storeId: f.store.id, outletId, businessDate: parseCalendarDate(date) },
  } });
  return row?.expensesAmount ?? 0;
}

test('PUT updates fields and outlet; omitted and null outlet become organization-wide', async () => {
  const row = await expenses.createExpense(f.store.id, input(), f.a.id);
  const due = '2026-09-12';
  const changed = await routes.PUT(request('PUT', row.id, f.tokens.owner,
    { title: 'Water', category: 'Utilities', amount: 220, due, outletId: f.b.id },
    f.store.id, { 'x-outlet-id': f.a.id }), params(row.id));
  assert.equal(changed.status, 200);
  assert.deepEqual(await changed.json(), { id: row.id, outletId: f.b.id, title: 'Water', category: 'Utilities', amount: 220, due, monthly: false });
  const wide = await routes.PUT(request('PUT', row.id, f.tokens.owner, { title: 'Water', category: 'Utilities', amount: 220, due }), params(row.id));
  assert.equal(wide.status, 200);
  assert.equal((await wide.json()).outletId, undefined);
  const nullable = await routes.PUT(request('PUT', row.id, f.tokens.owner, { title: 'Water', category: 'Utilities', amount: 220, due, outletId: null }), params(row.id));
  assert.equal(nullable.status, 200);
  assert.equal((await nullable.json()).outletId, undefined);
});

test('paid expense PUT moves the paid-date rollup between outlets', async () => {
  const paidDate = '2026-09-10';
  const row = await expenses.createExpense(f.store.id, input(), f.a.id);
  await expenses.markExpensePaid(f.store.id, row.id, paidDate);
  assert.equal(await total(f.a.id, paidDate), 100);
  const res = await routes.PUT(request('PUT', row.id, f.tokens.owner,
    { title: 'Moved', category: 'Fixed', amount: 250, due: todayIST(), outletId: f.b.id }), params(row.id));
  assert.equal(res.status, 200);
  assert.equal(await total(f.a.id, paidDate), 0);
  assert.equal(await total(f.b.id, paidDate), 250);
});

test('recurring PUT cannot change month; DELETE deactivates series and GET does not regenerate', async () => {
  const row = await expenses.createExpense(f.store.id, input({ due: '2026-08-15', monthly: true }), f.a.id);
  const bad = await routes.PUT(request('PUT', row.id, f.tokens.owner,
    { title: 'Rent', category: 'Fixed', amount: 100, due: '2026-09-15', outletId: f.a.id }), params(row.id));
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /original month/);
  const deleted = await routes.DELETE(request('DELETE', row.id), params(row.id));
  assert.equal(deleted.status, 204);
  assert.equal(await deleted.text(), '');
  assert.equal((await prisma.recurringExpenseSeries.findUniqueOrThrow({ where: { id: row.seriesId } })).active, false);
  const listed = await listRoute.GET(request('GET', row.id));
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).some((expense: { id: string }) => expense.id === row.id), false);
  assert.equal(await prisma.expense.count({ where: { seriesId: row.seriesId } }), 0);
});

test('plain DELETE removes a paid expense and reverses its rollup', async () => {
  const date = '2026-09-11';
  const row = await expenses.createExpense(f.store.id, input(), f.a.id);
  await expenses.markExpensePaid(f.store.id, row.id, date);
  assert.equal(await total(f.a.id, date), 100);
  const res = await routes.DELETE(request('DELETE', row.id), params(row.id));
  assert.equal(res.status, 204);
  assert.equal(await prisma.expense.findUnique({ where: { id: row.id } }), null);
  assert.equal(await total(f.a.id, date), 0);
});

test('pay accepts a chosen past date, defaults to IST today, rejects future dates and is idempotent', async () => {
  const past = '2026-09-09';
  const row = await expenses.createExpense(f.store.id, input(), f.a.id);
  const first = await payRoute.POST(request('POST', row.id, f.tokens.owner, { paidDate: past }), params(row.id));
  assert.equal(first.status, 200);
  assert.equal((await first.json()).paid, past);
  assert.equal(await total(f.a.id, past), 100);
  const again = await payRoute.POST(request('POST', row.id, f.tokens.owner, { paidDate: past }), params(row.id));
  assert.equal(again.status, 200);
  assert.equal(await total(f.a.id, past), 100);
  for (const body of [undefined, {}]) {
    const next = await expenses.createExpense(f.store.id, input(), f.a.id);
    const res = await payRoute.POST(request('POST', next.id, f.tokens.owner, body), params(next.id));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).paid, todayIST());
  }
  const future = await expenses.createExpense(f.store.id, input(), f.a.id);
  const futureDate = '2100-01-01';
  assert.equal((await payRoute.POST(request('POST', future.id, f.tokens.owner, { paidDate: futureDate }), params(future.id))).status, 400);
});

test('employee and other-store owner cannot edit or delete; missing IDs return 400', async () => {
  const row = await expenses.createExpense(f.store.id, input(), f.a.id);
  const body = { title: 'Edit', category: 'Fixed', amount: 200, due: todayIST() };
  for (const method of ['PUT', 'DELETE'] as const) {
    const call = method === 'PUT' ? routes.PUT : routes.DELETE;
    assert.equal((await call(request(method, row.id, f.tokens.employee, body), params(row.id))).status, 403);
    assert.equal((await call(request(method, row.id, f.tokens.otherOwner, body, f.other.id), params(row.id))).status, 400);
    assert.equal((await call(request(method, 'missing', f.tokens.owner, body), params('missing'))).status, 400);
  }
});

test('lapsed subscription forbids PUT, DELETE and pay', async () => {
  const row = await expenses.createExpense(f.store.id, input(), f.a.id);
  await prisma.subscription.update({ where: { storeId: f.store.id }, data: { paidThroughDate: parseCalendarDate('2020-01-01') } });
  try {
    const body = { title: 'Edit', category: 'Fixed', amount: 200, due: todayIST() };
    for (const response of [
      await routes.PUT(request('PUT', row.id, f.tokens.owner, body), params(row.id)),
      await routes.DELETE(request('DELETE', row.id), params(row.id)),
      await payRoute.POST(request('POST', row.id), params(row.id)),
    ]) {
      assert.equal(response.status, 403);
      assert.equal((await response.json()).reason, 'payment_lapsed');
    }
  } finally {
    await prisma.subscription.update({ where: { storeId: f.store.id }, data: { paidThroughDate: parseCalendarDate('2100-01-01') } });
  }
});
