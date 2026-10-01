import { testPhone } from './test-phone';
import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { PrismaClient, Role, OutletStatus } from '../src/generated/prisma/client';
import { hashPassword } from '../src/server/auth/password';

const socket = process.env.QA_SUBSCRIPTION_PG_SOCKET;
if (!socket?.startsWith('/tmp/el-subscription-test-') || !socket.endsWith('/socket')) {
  throw new Error('Run npm run test:subscription-payments to create an isolated PostgreSQL cluster.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ host: socket, user: 'subscription_test', database: 'postgres', port: 5432, max: 10, application_name: 'el-auth-hardening-test' }),
});
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;

type Handler = { GET?: (req: NextRequest) => Promise<Response>; POST?: (req: NextRequest) => Promise<Response> };
let loginRoute: Handler;
let statusRoute: Handler;
let setPasswordRoute: Handler;
let changePasswordRoute: Handler;
let logoutRoute: Handler;
let ordersRoute: Handler;
let membershipsRoute: Handler;
let store: { id: string };
let outlet: { id: string };

before(async () => {
  loginRoute = await import('../src/app/api/v1/auth/login/route');
  statusRoute = await import('../src/app/api/v1/auth/status/route');
  setPasswordRoute = await import('../src/app/api/v1/auth/set-password/route');
  changePasswordRoute = await import('../src/app/api/v1/auth/change-password/route');
  logoutRoute = await import('../src/app/api/v1/auth/logout/route');
  ordersRoute = await import('../src/app/api/v1/orders/route');
  membershipsRoute = await import('../src/app/api/v1/memberships/route');
  store = await prisma.store.create({ data: { id: 'store-auth-hardening', name: 'Auth hardening' } });
  await prisma.subscription.create({ data: { storeId: store.id, depositAmount: 0, annualFeeAmount: 0, paidThroughDate: new Date('2100-01-01') } });
  outlet = await prisma.outlet.create({ data: { storeId: store.id, outletCode: 'AUTH-A', displayName: 'Auth A', status: OutletStatus.ACTIVE } });
});

after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
});

async function makeEmployee(key: string, opts: { mustChangePassword?: boolean; active?: boolean } = {}) {
  const user = await prisma.user.create({
    data: {
      name: key,
      phone: testPhone(`auth_hardening_${key}`),
      passwordHash: await hashPassword('old-password-1'),
      mustChangePassword: opts.mustChangePassword ?? false,
      active: opts.active ?? true,
    },
  });
  await prisma.storeMembership.create({ data: { userId: user.id, storeId: store.id, role: Role.EMPLOYEE, active: true } });
  await prisma.outletMembership.create({ data: { userId: user.id, outletId: outlet.id, active: true, isDefault: true } });
  return user;
}

let ipCounter = 0;
const post = (path: string, body: object, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.0.${++ipCounter}`, ...headers },
    body: JSON.stringify(body),
  });
const authed = (token: string, extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${token}`, ...extra });

async function login(phone: string, password: string) {
  return loginRoute.POST!(post('/api/v1/auth/login', { phone, password }));
}

test('M3: a mustChangePassword session can only reach set/change-password, logout and status', async () => {
  const user = await makeEmployee('must-change', { mustChangePassword: true });
  const res = await login(user.phone, 'old-password-1');
  assert.equal(res.status, 200);
  const { token, user: loggedIn } = await res.json();
  assert.equal(loggedIn.mustChangePassword, true);
  const scope = { 'x-store-id': store.id, 'x-outlet-id': outlet.id };

  const blocked = await ordersRoute.GET!(new NextRequest('http://localhost/api/v1/orders', { headers: authed(token, scope) }));
  assert.equal(blocked.status, 403);
  assert.deepEqual(await blocked.json(), { error: 'Forbidden', reason: 'must_change_password' });
  const memberships = await membershipsRoute.GET!(new NextRequest('http://localhost/api/v1/memberships', { headers: authed(token) }));
  assert.equal(memberships.status, 403);

  const status = await statusRoute.GET!(new NextRequest('http://localhost/api/v1/auth/status', { headers: authed(token) }));
  assert.equal(status.status, 200);
  assert.equal((await status.json()).user.mustChangePassword, true);

  // First-login flow: set-password hands back a fresh, fully usable token.
  const set = await setPasswordRoute.POST!(post('/api/v1/auth/set-password', { newPassword: 'brand-new-pass-1' }, authed(token)));
  assert.equal(set.status, 200);
  const fresh = (await set.json()).token as string;
  const ok = await ordersRoute.GET!(new NextRequest('http://localhost/api/v1/orders', { headers: authed(fresh, scope) }));
  assert.equal(ok.status, 200);
});

test('M3: change-password and logout stay reachable while mustChangePassword is set', async () => {
  const user = await makeEmployee('must-change-2', { mustChangePassword: true });
  const { token } = await (await login(user.phone, 'old-password-1')).json();
  const change = await changePasswordRoute.POST!(post('/api/v1/auth/change-password', { oldPassword: 'old-password-1', newPassword: 'another-new-pass-1' }, authed(token)));
  assert.equal(change.status, 200);
  const other = await makeEmployee('must-change-3', { mustChangePassword: true });
  const second = (await (await login(other.phone, 'old-password-1')).json()).token;
  const out = await logoutRoute.POST!(post('/api/v1/auth/logout', {}, authed(second)));
  assert.equal(out.status, 200);
});

test('M2: change-password throttles wrong current-password guesses per user and returns 429 + Retry-After', async () => {
  const victim = await makeEmployee('throttle-victim');
  const bystander = await makeEmployee('throttle-bystander');
  const { token } = await (await login(victim.phone, 'old-password-1')).json();
  const bystanderToken = (await (await login(bystander.phone, 'old-password-1')).json()).token;
  const attempt = (oldPassword: string, t = token) =>
    changePasswordRoute.POST!(post('/api/v1/auth/change-password', { oldPassword, newPassword: 'new-password-123' }, authed(t)));
  for (let i = 0; i < 5; i++) assert.equal((await attempt('wrong-guess')).status, 400);
  const blocked = await attempt('old-password-1'); // even the right password is refused while blocked
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.match((await blocked.json()).error, /Too many failed attempts/);
  // Other users are unaffected.
  assert.equal((await attempt('old-password-1', bystanderToken)).status, 200);
});

test('M2: a successful change resets the failure counter', async () => {
  const user = await makeEmployee('throttle-reset');
  const { token } = await (await login(user.phone, 'old-password-1')).json();
  const attempt = (oldPassword: string, newPassword: string, t: string) =>
    changePasswordRoute.POST!(post('/api/v1/auth/change-password', { oldPassword, newPassword }, authed(t)));
  for (let i = 0; i < 4; i++) assert.equal((await attempt('wrong-guess', 'new-password-123', token)).status, 400);
  const ok = await attempt('old-password-1', 'new-password-123', token);
  assert.equal(ok.status, 200);
  const fresh = (await ok.json()).token as string;
  // Counter cleared: four more wrong guesses are still plain 400s.
  for (let i = 0; i < 4; i++) assert.equal((await attempt('wrong-guess', 'new-password-456', fresh)).status, 400);
});

test('M1: login always runs a bcrypt comparison, even for unknown or inactive users', async () => {
  const inactive = await makeEmployee('inactive-user', { active: false });
  const compare = mock.method(bcrypt, 'compare');
  try {
    const unknown = await login('9111111111', 'whatever-password');
    assert.equal(unknown.status, 401);
    assert.equal(compare.mock.callCount(), 1);
    const off = await login(inactive.phone, 'old-password-1');
    assert.equal(off.status, 401);
    assert.equal(compare.mock.callCount(), 2);
    const bad = await login((await makeEmployee('active-user')).phone, 'wrong-password');
    assert.equal(bad.status, 401);
    assert.equal(compare.mock.callCount(), 3);
  } finally {
    compare.mock.restore();
  }
});
