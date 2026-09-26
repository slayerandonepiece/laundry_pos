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
    data: { name: 'Owner A', username: 'owner_a_test', passwordHash: ownerPasswordHash },
  });
  await prisma.storeMembership.create({
    data: { userId: owner.id, storeId: storeA.id, role: Role.OWNER, active: true },
  });

  const sessionUser = { id: owner.id, name: owner.name, username: owner.username, isSuperAdmin: false };

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
    data: { name: 'Employee One', username: 'employee_one_test', passwordHash: empPasswordHash },
  });
  await prisma.storeMembership.create({
    data: { userId: employee.id, storeId: store.id, role: Role.EMPLOYEE, active: true },
  });

  // Assign employee only to outlet1
  await prisma.outletMembership.create({
    data: { userId: employee.id, outletId: outlet1.id, active: true, isDefault: true },
  });

  const sessionUser = { id: employee.id, name: employee.name, username: employee.username, isSuperAdmin: false };

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
    data: { name: 'Emp Default', username: 'emp_def_test', passwordHash: 'hash' },
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
    data: { name: 'Emp MultiOrg', username: 'emp_multiorg_test', passwordHash: 'hash' },
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
        username: user.username,
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
    data: { name: 'Login User', username: 'login_user_test', passwordHash },
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
    body: JSON.stringify({ username: 'login_user_test', password }),
  }) as unknown as NextRequest;

  const res = await loginRoute.POST(req);
  assert.equal(res.status, 200);
  const data = await res.json();

  // Backward compatibility: stores exists
  assert.ok(Array.isArray(data.stores));
  assert.equal(data.stores.length, 1);
  assert.equal(data.stores[0].storeId, store.id);

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
