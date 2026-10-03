import { testPhone } from './test-phone';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import type { NextRequest } from 'next/server';
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
  adapter: new PrismaPg({
    ...connection,
    max: 10,
    application_name: 'el-outlet-auth-test',
  }),
});
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
const control = new Pool({ ...connection, max: 2 });

let loginRoute: typeof import('../src/app/api/v1/auth/login/route');
let requireOutletSession: typeof import('../src/server/auth/session').requireOutletSession;
let AuthError: typeof import('../src/server/auth/session').AuthError;
let assignDefaultOutlet: typeof import('../src/server/services/outlets').assignDefaultOutlet;
let assignEmployeeToOutlet: typeof import('../src/server/services/outlets').assignEmployeeToOutlet;
let updateEmployee: typeof import('../src/server/services/employees').updateEmployee;
let toggleEmployeeActive: typeof import('../src/server/services/employees').toggleEmployeeActive;

before(async () => {
  loginRoute = await import('../src/app/api/v1/auth/login/route');
  const sessionMod = await import('../src/server/auth/session');
  requireOutletSession = sessionMod.requireOutletSession;
  AuthError = sessionMod.AuthError;
  const outletsMod = await import('../src/server/services/outlets');
  assignDefaultOutlet = outletsMod.assignDefaultOutlet;
  assignEmployeeToOutlet = outletsMod.assignEmployeeToOutlet;
  const empMod = await import('../src/server/services/employees');
  updateEmployee = empMod.updateEmployee;
  toggleEmployeeActive = empMod.toggleEmployeeActive;
});

after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
  await control.end();
});

test('B2.1: Owner has access to all active outlets in their store and is denied cross-store outlets', async () => {
  const storeA = await prisma.store.create({ data: { name: 'Org A' } });
  const storeB = await prisma.store.create({ data: { name: 'Org B' } });

  const outletA1 = await prisma.outlet.create({
    data: { storeId: storeA.id, outletCode: 'OUT-A1', displayName: 'Outlet A1', status: OutletStatus.ACTIVE },
  });
  const outletA2 = await prisma.outlet.create({
    data: { storeId: storeA.id, outletCode: 'OUT-A2', displayName: 'Outlet A2', status: OutletStatus.ACTIVE },
  });
  const outletB1 = await prisma.outlet.create({
    data: { storeId: storeB.id, outletCode: 'OUT-B1', displayName: 'Outlet B1', status: OutletStatus.ACTIVE },
  });

  const ownerPasswordHash = await hashPassword('password123');
  const owner = await prisma.user.create({
    data: { name: 'Owner A', phone: testPhone('owner_a_test'), passwordHash: ownerPasswordHash },
  });
  await prisma.storeMembership.create({
    data: { userId: owner.id, storeId: storeA.id, role: Role.OWNER, active: true },
  });

  const sessionUser = { id: owner.id, name: owner.name, phone: owner.phone, isSuperAdmin: false };

  // Owner can access outlet A1
  const sessionA1 = await requireOutletSession(storeA.id, outletA1.id, undefined, sessionUser);
  assert.equal(sessionA1.outletId, outletA1.id);
  assert.equal(sessionA1.storeId, storeA.id);

  // Owner can access outlet A2 without explicit OutletMembership
  const sessionA2 = await requireOutletSession(storeA.id, outletA2.id, undefined, sessionUser);
  assert.equal(sessionA2.outletId, outletA2.id);

  // Cross-organization denial: Owner A cannot access Outlet B1 (throws FORBIDDEN)
  await assert.rejects(
    async () => requireOutletSession(storeB.id, outletB1.id, undefined, sessionUser),
    (err: unknown) => err instanceof AuthError && err.code === 'FORBIDDEN',
  );

  // Header spoofing denial: Passing storeA with outletB1 throws FORBIDDEN
  await assert.rejects(
    async () => requireOutletSession(storeA.id, outletB1.id, undefined, sessionUser),
    (err: unknown) => err instanceof AuthError && err.code === 'FORBIDDEN',
  );
});

test('B2.2: Employee requires explicit active OutletMembership and cannot spoof unauthorized outlets', async () => {
  const store = await prisma.store.create({ data: { name: 'Org Emp Test' } });
  const outlet1 = await prisma.outlet.create({
    data: { storeId: store.id, outletCode: 'OUT-EMP-1', displayName: 'Outlet Emp 1' },
  });
  const outlet2 = await prisma.outlet.create({
    data: { storeId: store.id, outletCode: 'OUT-EMP-2', displayName: 'Outlet Emp 2' },
  });

  const empPasswordHash = await hashPassword('password123');
  const employee = await prisma.user.create({
    data: { name: 'Employee One', phone: testPhone('employee_one_test'), passwordHash: empPasswordHash },
  });
  await prisma.storeMembership.create({
    data: { userId: employee.id, storeId: store.id, role: Role.EMPLOYEE, active: true },
  });

  // Assign employee only to outlet1
  await prisma.outletMembership.create({
    data: { userId: employee.id, outletId: outlet1.id, active: true, isDefault: true },
  });

  const sessionUser = { id: employee.id, name: employee.name, phone: employee.phone, isSuperAdmin: false };

  // Access to assigned outlet1 succeeds
  const session1 = await requireOutletSession(store.id, outlet1.id, Role.EMPLOYEE, sessionUser);
  assert.equal(session1.outletId, outlet1.id);
  assert.equal(session1.storeRole, Role.EMPLOYEE);

  // Access to unassigned outlet2 is rejected (unauthorized outlet spoofing)
  await assert.rejects(
    async () => requireOutletSession(store.id, outlet2.id, Role.EMPLOYEE, sessionUser),
    (err: unknown) => err instanceof AuthError && err.code === 'FORBIDDEN',
  );

  // Deactivated outlet membership is rejected
  await prisma.outletMembership.update({
    where: { userId_outletId: { userId: employee.id, outletId: outlet1.id } },
    data: { active: false },
  });

  await assert.rejects(
    async () => requireOutletSession(store.id, outlet1.id, Role.EMPLOYEE, sessionUser),
    (err: unknown) => err instanceof AuthError && err.code === 'FORBIDDEN',
  );
});

test('B2.3: Transactional default outlet assignment guarantees at most one default outlet', async () => {
  const store = await prisma.store.create({ data: { name: 'Org Default Test' } });
  const o1 = await prisma.outlet.create({ data: { storeId: store.id, outletCode: 'DEF-1', displayName: 'Def 1' } });
  const o2 = await prisma.outlet.create({ data: { storeId: store.id, outletCode: 'DEF-2', displayName: 'Def 2' } });

  const user = await prisma.user.create({
    data: { name: 'Emp Default', phone: testPhone('emp_def_test'), passwordHash: 'hash' },
  });
  await prisma.storeMembership.create({
    data: { userId: user.id, storeId: store.id, role: Role.EMPLOYEE, active: true },
  });

  // Assign o1 as default
  await assignEmployeeToOutlet(user.id, store.id, o1.id, true);
  let mems = await prisma.outletMembership.findMany({ where: { userId: user.id } });
  assert.equal(mems.find(m => m.outletId === o1.id)?.isDefault, true);

  // Assign o2 as non-default
  await assignEmployeeToOutlet(user.id, store.id, o2.id, false);
  mems = await prisma.outletMembership.findMany({ where: { userId: user.id } });
  assert.equal(mems.find(m => m.outletId === o1.id)?.isDefault, true);
  assert.equal(mems.find(m => m.outletId === o2.id)?.isDefault, false);

  // Switch default to o2
  await assignDefaultOutlet(user.id, store.id, o2.id);
  mems = await prisma.outletMembership.findMany({ where: { userId: user.id } });
  assert.equal(mems.find(m => m.outletId === o1.id)?.isDefault, false);
  assert.equal(mems.find(m => m.outletId === o2.id)?.isDefault, true);

  // Total defaults is exactly 1
  const defaultCount = mems.filter(m => m.isDefault).length;
  assert.equal(defaultCount, 1);
});

test('B2.4: Employee cannot be active in a second organization', async () => {
  const store1 = await prisma.store.create({ data: { name: 'Org 1' } });
  const store2 = await prisma.store.create({ data: { name: 'Org 2' } });

  const user = await prisma.user.create({
    data: { name: 'Emp MultiOrg', phone: testPhone('emp_multiorg_test'), passwordHash: 'hash' },
  });
  await prisma.storeMembership.create({
    data: { userId: user.id, storeId: store1.id, role: Role.EMPLOYEE, active: true },
  });

  // Create inactive membership in store2
  await prisma.storeMembership.create({
    data: { userId: user.id, storeId: store2.id, role: Role.EMPLOYEE, active: false },
  });

  // Activating in store2 via toggleEmployeeActive must fail
  await assert.rejects(
    async () => toggleEmployeeActive(store2.id, user.id),
    /An employee cannot be active in more than one organization\./,
  );

  // Activating in store2 via updateEmployee must fail
  await assert.rejects(
    async () =>
      updateEmployee(store2.id, {
        id: user.id,
        name: user.name,
        phone: user.phone,
        active: true,
      }),
    /An employee cannot be active in more than one organization\./,
  );
});

test('B2.5: POST /api/v1/auth/login returns additive organizations array with outlets', async () => {
  const store = await prisma.store.create({ data: { name: 'Org Login Test' } });
  const outlet1 = await prisma.outlet.create({
    data: { storeId: store.id, outletCode: 'LOGIN-OUT-1', displayName: 'Login Out 1' },
  });

  const password = 'Password@123';
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { name: 'Login User', phone: testPhone('login_user_test'), passwordHash },
  });
  await prisma.storeMembership.create({
    data: { userId: user.id, storeId: store.id, role: Role.EMPLOYEE, active: true },
  });
  await prisma.outletMembership.create({
    data: { userId: user.id, outletId: outlet1.id, active: true, isDefault: true },
  });

  const req = new Request('http://localhost/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: testPhone('login_user_test'), password }),
  }) as unknown as NextRequest;

  const res = await loginRoute.POST(req);
  assert.equal(res.status, 200);
  const data = await res.json();

  // Backward compatibility: stores exists
  assert.ok(Array.isArray(data.stores));
  assert.equal(data.stores.length, 1);
  assert.equal(data.stores[0].storeId, store.id);
  assert.equal(data.stores[0].trialEndsAt, null);
  assert.equal(data.stores[0].subscriptionState, 'ACTIVE');

  // Additive organizations array exists
  assert.ok(Array.isArray(data.organizations));
  assert.equal(data.organizations.length, 1);
  const org = data.organizations[0];
  assert.equal(org.id, store.id);
  assert.equal(org.name, store.name);
  assert.equal(org.role, Role.EMPLOYEE);
  assert.equal(org.defaultOutletId, outlet1.id);
  assert.equal(org.allowedOutlets.length, 1);
  assert.equal(org.allowedOutlets[0].id, outlet1.id);
  assert.equal(org.allowedOutlets[0].outletCode, 'LOGIN-OUT-1');
  assert.equal(org.allowedOutlets[0].isDefault, true);
});

test('phone login normalizes formatting, returns phone in auth status, and rejects username login', async () => {
  const phone = testPhone('phone-login-regression');
  const password = 'Password123';
  await prisma.user.create({ data: { name: 'Phone login', phone, passwordHash: await hashPassword(password), isSuperAdmin: true } });
  const request = (body: object) => new Request('http://localhost/api/v1/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) as unknown as NextRequest;
  const response = await loginRoute.POST(request({ phone: `+${phone.slice(0, 3)} (${phone.slice(3, 7)})-${phone.slice(7)}`, password }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.user.phone, phone);
  assert.equal('username' in result.user, false);
  const statusRoute = await import('../src/app/api/v1/auth/status/route');
  const status = await statusRoute.GET(new Request('http://localhost/api/v1/auth/status', { headers: { Authorization: `Bearer ${result.token}` } }) as unknown as NextRequest);
  assert.equal(status.status, 200);
  assert.equal((await status.json()).user.phone, phone);
  assert.equal((await loginRoute.POST(request({ username: phone, password }))).status, 400);
  assert.equal((await loginRoute.POST(request({ phone, password: 'wrong-password' }))).status, 401);
  const throttle = await import('../src/server/auth/throttle');
  await throttle.clearLoginThrottle(phone, 'phone-regression');
  for (let i = 0; i < 5; i++) await throttle.recordFailedLoginAttempt(`+${phone}`, 'phone-regression');
  assert.equal((await throttle.checkLoginThrottle(phone, 'phone-regression')).allowed, false);
  await throttle.clearLoginThrottle(phone, 'phone-regression');
});

test('platform phone changes revoke sessions; formatting-only updates preserve credentials', async () => {
  const platform = await import('../src/server/services/platform-users');
  const sessions = await import('../src/server/auth/session');
  const phone = testPhone('platform-phone-regression');
  const user = await platform.createUser({ name: 'Phone platform user', phone: `+${phone}`, password: 'password123' });
  assert.equal(user.phone, phone);
  await assert.rejects(platform.createUser({ name: 'Duplicate', phone, password: 'password123' }), /already registered/);
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const session = await sessions.createSessionRow(user.id, row.credentialVersion);
  await platform.updateUser(user.id, { name: user.name, phone: `(${phone})` });
  assert.ok(await sessions.getSessionFromToken(session.token));
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).credentialVersion, row.credentialVersion);
  const nextPhone = testPhone('platform-new-phone-regression');
  await platform.updateUser(user.id, { name: user.name, phone: nextPhone });
  assert.equal(await sessions.getSessionFromToken(session.token), null);
  assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).credentialVersion, row.credentialVersion + 1);
  const stores = await import('../src/server/services/stores');
  assert.equal((await stores.lookupOwnerByPhone(`+${nextPhone}`))?.id, user.id);
  assert.equal(await stores.lookupOwnerByPhone(phone), null);
});

test('phone migration rejects missing and duplicate normalized phones without losing usernames', async () => {
  const { readFile } = await import('node:fs/promises');
  const migration = await readFile(new URL('../prisma/migrations/20260926210000_use_phone_as_login_identifier/migration.sql', import.meta.url), 'utf8');
  const client = await control.connect();
  const schema = 'phone_migration_regression';
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query('CREATE TABLE users (id text PRIMARY KEY, username text NOT NULL, phone text)');
    await client.query("INSERT INTO users VALUES ('1', 'legacy', NULL)");
    await assert.rejects(client.query(migration), /Backfill missing\/invalid phones first/);
    await client.query('ROLLBACK');
    assert.equal((await client.query('SELECT username FROM users')).rows[0].username, 'legacy');
    await client.query("UPDATE users SET phone = '+91 98765 43210'; INSERT INTO users VALUES ('2', 'duplicate', '919876543210')");
    await assert.rejects(client.query(migration), /Resolve duplicate phones first/);
    await client.query('ROLLBACK');
    assert.equal((await client.query('SELECT count(*) FROM users')).rows[0].count, '2');
    await client.query("UPDATE users SET phone = '919876543211' WHERE id = '2'");
    await client.query(migration);
    assert.equal((await client.query("SELECT phone FROM users WHERE id = '1'")).rows[0].phone, '919876543210');
    await assert.rejects(client.query("INSERT INTO users VALUES ('3', NULL)"), /not-null constraint/);
    await assert.rejects(client.query("INSERT INTO users VALUES ('3', '919876543210')"), /unique constraint/);
    assert.equal((await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'users' AND column_name = 'username'", [schema])).rowCount, 0);
  } finally {
    await client.query('ROLLBACK');
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA ${schema} CASCADE`);
    client.release();
  }
});

test('Owner employee password reset preserves identity/outlets, revokes sessions, and rejects other stores/owners', async () => {
  const { resetEmployeePassword } = await import('../src/server/services/employees');
  const { verifyPassword } = await import('../src/server/auth/password');
  const { createSessionRow } = await import('../src/server/auth/session');
  const store = await prisma.store.create({ data: { name: 'Password reset store' } });
  const other = await prisma.store.create({ data: { name: 'Other password reset store' } });
  const employee = await prisma.user.create({ data: { name: 'Password employee', phone: testPhone('password-reset-employee'), passwordHash: await hashPassword('oldpassword123') } });
  await prisma.storeMembership.create({ data: { userId: employee.id, storeId: store.id, role: Role.EMPLOYEE } });
  const outlet = await prisma.outlet.create({ data: { storeId: store.id, outletCode: 'PASSWORD-RESET-OUTLET', displayName: 'Reset outlet' } });
  await prisma.outletMembership.create({ data: { userId: employee.id, outletId: outlet.id, isDefault: true } });
  await createSessionRow(employee.id, employee.credentialVersion);
  await assert.rejects(resetEmployeePassword(other.id, employee.id, 'newpassword123'));
  await assert.rejects(resetEmployeePassword(store.id, employee.id, 'short'));
  assert.equal(await prisma.session.count({ where: { userId: employee.id } }), 1);
  await resetEmployeePassword(store.id, employee.id, 'newpassword123');
  const updated = await prisma.user.findUniqueOrThrow({ where: { id: employee.id } });
  assert.equal(await verifyPassword('newpassword123', updated.passwordHash), true);
  assert.equal(await verifyPassword('oldpassword123', updated.passwordHash), false);
  assert.equal(updated.mustChangePassword, true);
  assert.equal(updated.credentialVersion, employee.credentialVersion + 1);
  assert.equal(updated.phone, employee.phone);
  assert.equal(updated.name, employee.name);
  assert.equal(await prisma.session.count({ where: { userId: employee.id } }), 0);
  assert.equal(await prisma.outletMembership.count({ where: { userId: employee.id, outletId: outlet.id, isDefault: true } }), 1);
  await prisma.storeMembership.update({ where: { userId_storeId: { userId: employee.id, storeId: store.id } }, data: { role: Role.OWNER } });
  await assert.rejects(resetEmployeePassword(store.id, employee.id, 'anotherpassword123'));
});
