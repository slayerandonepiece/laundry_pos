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

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    host: socket,
    user: 'subscription_test',
    database: 'postgres',
    port: 5432,
    max: 10,
    application_name: 'el-employee-outlet-assignment-test',
  }),
});
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;

let employees: typeof import('../src/server/services/employees');

before(async () => {
  employees = await import('../src/server/services/employees');
});

after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
});

/** An organization able to write (paid far ahead), with an owner and two outlets. */
async function org(key: string) {
  const store = await prisma.store.create({ data: { id: `store-assign-${key}`, name: `Assign ${key}` } });
  await prisma.subscription.create({
    data: { storeId: store.id, depositAmount: 0, annualFeeAmount: 0, paidThroughDate: new Date('2100-01-01') },
  });
  const [o1, o2] = await Promise.all(
    [1, 2].map(n =>
      prisma.outlet.create({
        data: { storeId: store.id, outletCode: `ASG-${key}-${n}`, displayName: `${key} outlet ${n}`, status: OutletStatus.ACTIVE },
      }),
    ),
  );
  const owner = await prisma.user.create({
    data: { name: `Owner ${key}`, phone: testPhone(`assign_owner_${key}`), passwordHash: await hashPassword('password123') },
  });
  await prisma.storeMembership.create({ data: { userId: owner.id, storeId: store.id, role: Role.OWNER, active: true } });
  return { store, o1, o2 };
}

function draft(key: string, extra: Record<string, unknown> = {}) {
  return {
    name: `Emp ${key}`,
    phone: testPhone(`assign_emp_${key}`),
    password: 'password123',
    active: true,
    ...extra,
  };
}

test('an owner can assign employees to their own outlets with a default', async () => {
  const a = await org('ok');
  const created = await employees.createEmployee(a.store.id, draft('ok', {
    outlets: [a.o1.id, a.o2.id],
    defaultOutletId: a.o2.id,
  }));
  assert.deepEqual(created.outlets?.map(o => o.id).sort(), [a.o1.id, a.o2.id].sort());
  assert.equal(created.defaultOutletId, a.o2.id);

  const updated = await employees.updateEmployee(a.store.id, {
    id: created.id,
    ...draft('ok'),
    outlets: [a.o1.id],
    defaultOutletId: a.o1.id,
  });
  assert.deepEqual(updated.outlets?.map(o => o.id), [a.o1.id]);
  assert.equal(updated.defaultOutletId, a.o1.id);
});

test('an ordinary update without outlets leaves the assignments alone', async () => {
  const a = await org('keep');
  const created = await employees.createEmployee(a.store.id, draft('keep', { outlets: [a.o1.id, a.o2.id], defaultOutletId: a.o1.id }));
  const renamed = await employees.updateEmployee(a.store.id, { id: created.id, ...draft('keep'), name: 'Renamed' });
  assert.equal(renamed.name, 'Renamed');
  assert.equal(renamed.outlets?.length, 2);
  assert.equal(renamed.defaultOutletId, a.o1.id);
});

test("an owner cannot give an employee another organization's outlet (create)", async () => {
  const mine = await org('mine-create');
  const theirs = await org('theirs-create');
  await assert.rejects(
    employees.createEmployee(mine.store.id, draft('cross-create', { outlets: [theirs.o1.id], defaultOutletId: theirs.o1.id })),
    /outlet/i,
  );
  // Nothing was created for the rejected request.
  assert.equal(await prisma.outletMembership.count({ where: { outletId: theirs.o1.id } }), 0);
  assert.equal(await prisma.user.count({ where: { phone: testPhone('assign_emp_cross-create') } }), 0);
});

test("an owner cannot give an employee another organization's outlet (update)", async () => {
  const mine = await org('mine-update');
  const theirs = await org('theirs-update');
  const created = await employees.createEmployee(mine.store.id, draft('cross-update', { outlets: [mine.o1.id], defaultOutletId: mine.o1.id }));

  await assert.rejects(
    employees.updateEmployee(mine.store.id, {
      id: created.id,
      ...draft('cross-update'),
      outlets: [mine.o1.id, theirs.o1.id],
      defaultOutletId: mine.o1.id,
    }),
    /outlet/i,
  );
  assert.equal(await prisma.outletMembership.count({ where: { outletId: theirs.o1.id } }), 0);
  // The rejected request also left the employee's real assignment as it was.
  const memberships = await prisma.outletMembership.findMany({ where: { userId: created.id } });
  assert.deepEqual(memberships.map(m => m.outletId), [mine.o1.id]);
});

test('an unknown or inactive outlet is refused', async () => {
  const a = await org('inactive');
  const closed = await prisma.outlet.create({
    data: { storeId: a.store.id, outletCode: 'ASG-inactive-closed', displayName: 'Closed', status: OutletStatus.CLOSED },
  });
  await assert.rejects(employees.createEmployee(a.store.id, draft('unknown', { outlets: ['no-such-outlet'] })), /outlet/i);
  await assert.rejects(employees.createEmployee(a.store.id, draft('closed', { outlets: [closed.id] })), /outlet/i);
});

test('the default outlet must be one of the chosen outlets', async () => {
  const a = await org('default');
  await assert.rejects(
    employees.createEmployee(a.store.id, draft('bad-default', { outlets: [a.o1.id], defaultOutletId: a.o2.id })),
    /default/i,
  );
});

test('a repeated outlet id is stored once', async () => {
  const a = await org('dupe');
  const created = await employees.createEmployee(a.store.id, draft('dupe', { outlets: [a.o1.id, a.o1.id], defaultOutletId: a.o1.id }));
  assert.equal(created.outlets?.length, 1);
});
