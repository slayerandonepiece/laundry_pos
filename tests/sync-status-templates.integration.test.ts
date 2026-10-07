import { testPhone } from './test-phone';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import type { NextRequest } from 'next/server';
import { PrismaClient } from '../src/generated/prisma/client';
import { generateSessionToken } from '../src/server/auth/token';

const socket = process.env.QA_SUBSCRIPTION_PG_SOCKET;
if (!socket?.startsWith('/tmp/el-subscription-test-') || !socket.endsWith('/socket')) {
  throw new Error('Run npm run test:subscription-payments to create an isolated PostgreSQL cluster.');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({
  host: socket, user: 'subscription_test', database: 'postgres', port: 5432, application_name: 'el-sync-templates-test',
}) });

let templatesRoute: typeof import('../src/app/api/v1/message-templates/route');
let syncRoute: typeof import('../src/app/api/v1/sync/status/route');
let templates: typeof import('../src/server/services/message-templates');

before(async () => {
  (globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
  templatesRoute = await import('../src/app/api/v1/message-templates/route');
  syncRoute = await import('../src/app/api/v1/sync/status/route');
  templates = await import('../src/server/services/message-templates');
  // Platform defaults exist from the migration; make sure all four do.
  for (const [statusKey, body, defaultEnabled] of [
    ['PENDING', 'Hi {customer}, order {orderNo} is placed.', false],
    ['IN_PROGRESS', 'Hi {customer}, order {orderNo} is in progress.', false],
    ['READY', 'Hi {customer}, order {orderNo} is ready: {link}', true],
    ['DELIVERED', 'Hi {customer}, order {orderNo} delivered: {link}', true],
  ] as const) {
    await prisma.platformMessageTemplate.upsert({ where: { statusKey }, create: { statusKey, body, defaultEnabled }, update: {} });
  }
});
after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
});

const req = (url: string, token: string) =>
  new Request(url, { headers: { Authorization: `Bearer ${token}` } }) as unknown as NextRequest;

async function setup(key: string) {
  const store = await prisma.store.create({ data: { id: `store-sync-${key}`, name: `Sync ${key}` } });
  await prisma.subscription.create({ data: { storeId: store.id, depositAmount: 0, annualFeeAmount: 0, paidThroughDate: new Date('2100-01-01') } });
  const member = async (role: 'OWNER' | 'EMPLOYEE') => {
    const user = await prisma.user.create({ data: { name: `${role} ${key}`, phone: testPhone(`sync_${role}_${key}`), passwordHash: 'x' } });
    await prisma.storeMembership.create({ data: { storeId: store.id, userId: user.id, role } });
    const token = generateSessionToken();
    await prisma.session.create({ data: { token, userId: user.id, credentialVersion: 1, expiresAt: new Date(Date.now() + 86_400_000) } });
    return { user, token };
  };
  return { store, owner: await member('OWNER'), employee: await member('EMPLOYEE') };
}

const getTemplates = async (token: string) => {
  const res = await templatesRoute.GET(req('http://localhost/api/v1/message-templates', token));
  assert.equal(res.status, 200);
  return (await res.json()).templates as { statusKey: string; label: string; enabled: boolean; attachment: string; body: string; updatedAt: string }[];
};
const getSync = async (token: string) => {
  const res = await syncRoute.GET(req('http://localhost/api/v1/sync/status', token));
  assert.equal(res.status, 200);
  return (await res.json()) as Record<string, string | null>;
};
const tick = () => new Promise(resolve => setTimeout(resolve, 15));

test('message templates: all four statuses in order for owner and employee, read live from the platform', async () => {
  const org = await setup('tpl');
  for (const who of [org.owner, org.employee]) {
    const rows = await getTemplates(who.token);
    assert.deepEqual(rows.map(row => row.statusKey), ['PENDING', 'IN_PROGRESS', 'READY', 'DELIVERED']);
    assert.deepEqual(rows.map(row => row.label), ['Placed', 'In progress', 'Ready', 'Delivered']);
    assert.ok(rows.every(row => typeof row.body === 'string' && row.attachment && !Number.isNaN(Date.parse(row.updatedAt))));
  }
  const before = await getTemplates(org.employee.token);
  assert.equal(await prisma.organizationMessageTemplate.count({ where: { storeId: org.store.id } }), 0);

  // Platform templates are shared with other test files running against this cluster:
  // edit one no other file reads and put it back.
  const original = (await templates.listPlatformMessageTemplates()).find(row => row.statusKey === 'IN_PROGRESS')!;
  try {
    await tick();
    await templates.savePlatformMessageTemplate('IN_PROGRESS', { body: 'Platform edit {orderNo}', defaultEnabled: !original.defaultEnabled, defaultAttachment: 'INVOICE_PDF' });
    const after = await getTemplates(org.owner.token);
    const row = after.find(r => r.statusKey === 'IN_PROGRESS')!;
    assert.equal(row.body, 'Platform edit {orderNo}');
    assert.equal(row.enabled, !original.defaultEnabled);
    assert.equal(row.attachment, 'INVOICE_PDF');
    assert.notEqual(row.updatedAt, before.find(r => r.statusKey === 'IN_PROGRESS')!.updatedAt, 'inherited updatedAt follows the platform row');
    assert.equal(await prisma.organizationMessageTemplate.count({ where: { storeId: org.store.id } }), 0, 'no organization row was written');
  } finally {
    await templates.savePlatformMessageTemplate('IN_PROGRESS', { body: original.body, defaultEnabled: original.defaultEnabled, defaultAttachment: original.defaultAttachment });
  }

  // An override is read from the organization and does not follow the platform.
  const all = (await templates.listOrganizationMessageTemplates(org.store.id)).map(row => ({ statusKey: row.statusKey, body: row.body, enabled: row.enabled, attachment: row.attachment }));
  await templates.saveOrganizationMessageTemplates(org.store.id, all.map(row => row.statusKey === 'DELIVERED' ? { ...row, body: 'Mine {link}' } : row), org.owner.user.id);
  assert.equal((await getTemplates(org.employee.token)).find(row => row.statusKey === 'DELIVERED')!.body, 'Mine {link}');
});

test('message templates and sync status stay readable when billing restricts the store (allowRestricted)', async () => {
  const org = await setup('restricted');
  await prisma.subscription.update({ where: { storeId: org.store.id }, data: { paidThroughDate: new Date('2020-01-01') } });
  assert.equal((await templatesRoute.GET(req('http://localhost/api/v1/message-templates', org.owner.token))).status, 200);
  assert.equal((await syncRoute.GET(req('http://localhost/api/v1/sync/status', org.owner.token))).status, 200);
  // A hard lock still refuses, as for every other route.
  await prisma.store.update({ where: { id: org.store.id }, data: { status: 'LOCKED' } });
  assert.equal((await syncRoute.GET(req('http://localhost/api/v1/sync/status', org.owner.token))).status, 403);
  assert.equal((await templatesRoute.GET(new Request('http://localhost/api/v1/message-templates') as unknown as NextRequest)).status, 401);
});

test('sync status: owner-only fields are null for an employee and populated for an owner', async () => {
  const org = await setup('roles');
  await prisma.expense.create({ data: { storeId: org.store.id, title: 'Rent', category: 'Rent', amount: 100, dueDate: new Date('2026-10-01') } });
  await prisma.subscriptionPayment.create({ data: { storeId: org.store.id, type: 'RENEWAL', amount: 100, paidAt: new Date('2026-10-01') } });
  const owner = await getSync(org.owner.token);
  const employee = await getSync(org.employee.token);
  const keys = ['productsUpdatedAt', 'ordersUpdatedAt', 'paymentMethodsUpdatedAt', 'messageTemplatesUpdatedAt', 'profileUpdatedAt', 'expensesUpdatedAt', 'employeesUpdatedAt', 'invoicesUpdatedAt', 'planUpdatedAt'];
  assert.deepEqual(Object.keys(owner).sort(), [...keys].sort());
  for (const key of ['paymentMethodsUpdatedAt', 'messageTemplatesUpdatedAt', 'profileUpdatedAt', 'expensesUpdatedAt', 'employeesUpdatedAt', 'invoicesUpdatedAt', 'planUpdatedAt']) {
    assert.ok(owner[key] && !Number.isNaN(Date.parse(owner[key]!)), `owner ${key}`);
  }
  for (const key of ['expensesUpdatedAt', 'employeesUpdatedAt', 'invoicesUpdatedAt', 'planUpdatedAt']) assert.equal(employee[key], null, `employee ${key}`);
  for (const key of ['paymentMethodsUpdatedAt', 'messageTemplatesUpdatedAt', 'profileUpdatedAt']) assert.equal(employee[key], owner[key]);
});

test('sync status: each updatedAt moves after a change to its dataset', async () => {
  const org = await setup('moves');
  const read = () => getSync(org.owner.token);
  // Platform tables are shared with files running in parallel, so each change is stamped
  // later than anything that exists; that makes "moved" deterministic.
  let n = 0;
  const stamp = () => new Date(Date.UTC(2200, 0, 1, 0, 0, ++n));
  const moved = async (key: string, change: (updatedAt: Date) => Promise<unknown>) => {
    const was = (await read())[key];
    await tick();
    await change(stamp());
    const now = (await read())[key];
    assert.notEqual(now, was, `${key} should change`);
    assert.ok(now);
  };
  const method = await prisma.platformPaymentMethod.create({ data: { code: 'SYNC_M', name: 'Sync method' } });
  await moved('paymentMethodsUpdatedAt', updatedAt => prisma.organizationPaymentMethod.create({ data: { storeId: org.store.id, platformPaymentMethodId: method.id, updatedAt } }));
  await moved('paymentMethodsUpdatedAt', updatedAt => prisma.platformPaymentMethod.update({ where: { id: method.id }, data: { active: false, updatedAt } }));
  await moved('messageTemplatesUpdatedAt', updatedAt => prisma.platformMessageTemplate.update({ where: { statusKey: 'IN_PROGRESS' }, data: { updatedAt } }));
  await moved('messageTemplatesUpdatedAt', updatedAt => prisma.organizationMessageTemplate.create({ data: { storeId: org.store.id, statusKey: 'IN_PROGRESS', body: 'Org {orderNo}', updatedAt } }));
  await moved('profileUpdatedAt', () => prisma.store.update({ where: { id: org.store.id }, data: { phone: '9000000000' } }));
  await moved('expensesUpdatedAt', () => prisma.expense.create({ data: { storeId: org.store.id, title: 'Tea', category: 'Misc', amount: 5, dueDate: new Date('2026-10-02') } }));
  await moved('employeesUpdatedAt', () => prisma.user.update({ where: { id: org.employee.user.id }, data: { name: 'Renamed' } }));
  await moved('invoicesUpdatedAt', () => prisma.subscriptionPayment.create({ data: { storeId: org.store.id, type: 'RENEWAL', amount: 1, paidAt: new Date('2026-10-02') } }));
  await moved('productsUpdatedAt', () => prisma.product.create({ data: { storeId: org.store.id, name: 'P', category: 'C', type: 'ITEM', price: 1, active: true } }));
  await moved('ordersUpdatedAt', () => prisma.order.create({ data: { storeId: org.store.id, customerName: 'C', phone: '9876543210', dueDate: new Date('2026-10-02') } }));
});
