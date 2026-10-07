import { testPhone } from './test-phone';
import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../src/server/auth/password';
import { todayIST } from '../src/server/dates';

const socket = process.env.QA_SUBSCRIPTION_PG_SOCKET;
if (!socket?.startsWith('/tmp/el-subscription-test-') || !socket.endsWith('/socket')) {
  throw new Error('Run npm run test:subscription-payments to create an isolated PostgreSQL cluster.');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({
  host: socket, user: 'subscription_test', database: 'postgres', port: 5432,
  application_name: 'el-org-settings-test',
}) });
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;

// The web actions read the session from the request cookie. Serve whichever
// token the test sets, as a browser would.
let currentToken: string | undefined;
mock.module('next/headers', {
  namedExports: { cookies: async () => ({ get: (name: string) => (name === 'el_session' && currentToken ? { value: currentToken } : undefined), set: () => undefined, delete: () => undefined }) },
});

let orders: typeof import('../src/server/services/orders');
let payments: typeof import('../src/server/services/platform-payment-methods');
let templates: typeof import('../src/server/services/message-templates');
let defaults: typeof import('../src/server/services/org-defaults');
let actions: typeof import('../src/features/super-admin/actions/org-settings.actions');
let tabs: typeof import('../src/features/super-admin/actions/store-tabs.actions');
let session: typeof import('../src/server/auth/session');
let clientTemplates: typeof import('../src/features/super-admin/messageTemplates');
let clientStages: typeof import('../src/lib/paymentStage');

before(async () => {
  orders = await import('../src/server/services/orders');
  payments = await import('../src/server/services/platform-payment-methods');
  templates = await import('../src/server/services/message-templates');
  defaults = await import('../src/server/services/org-defaults');
  actions = await import('../src/features/super-admin/actions/org-settings.actions');
  tabs = await import('../src/features/super-admin/actions/store-tabs.actions');
  session = await import('../src/server/auth/session');
  clientTemplates = await import('../src/features/super-admin/messageTemplates');
  clientStages = await import('../src/lib/paymentStage');
});
after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
});

async function login(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return (await session.createSessionRow(user.id, user.credentialVersion)).token;
}

async function setupOrg(key: string) {
  const store = await prisma.store.create({ data: { id: `store-os-${key}`, name: `Org settings ${key}` } });
  await prisma.subscription.create({ data: { storeId: store.id, depositAmount: 0, annualFeeAmount: 0, paidThroughDate: new Date('2100-01-01') } });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Wash', category: 'Laundry', type: 'ITEM', price: 100, active: true } });
  const make = (role: 'owner' | 'employee' | 'admin') => hashPassword('password123').then(passwordHash => prisma.user.create({ data: { name: `${role} ${key}`, phone: testPhone(`os_${role}_${key}`), passwordHash, isSuperAdmin: role === 'admin' } }));
  const [owner, employee, admin] = await Promise.all([make('owner'), make('employee'), make('admin')]);
  await prisma.storeMembership.create({ data: { storeId: store.id, userId: owner.id, role: 'OWNER' } });
  await prisma.storeMembership.create({ data: { storeId: store.id, userId: employee.id, role: 'EMPLOYEE' } });
  return { store, product, owner, employee, admin };
}

type Org = Awaited<ReturnType<typeof setupOrg>>;
const byCode = async (code: string) => prisma.platformPaymentMethod.findUniqueOrThrow({ where: { code } });

// Three platform methods with distinct stages plus the seeded Cash on delivery.
async function setupMethods(key: string) {
  const pre = await payments.createPlatformPaymentMethod({ code: `OS_PRE_${key}`, name: `Pre ${key}`, defaultStage: 'PRE_ORDER' });
  const post = await payments.createPlatformPaymentMethod({ code: `OS_POST_${key}`, name: `Post ${key}`, defaultStage: 'POST_ORDER' });
  const both = await payments.createPlatformPaymentMethod({ code: `OS_BOTH_${key}`, name: `Both ${key}`, defaultStage: 'BOTH' });
  const cod = await byCode('COD');
  return { pre, post, both, cod };
}

const newOrder = (org: Org, key: string, extra: object = {}) => orders.createOrder(org.store.id, {
  idempotencyKey: key, phone: '9876543210', dueDate: todayIST(), entries: [{ productId: org.product.id, quantity: 1 }], ...extra,
}, org.owner.id);

test('stage rules: Cash on delivery can only be pre-order, everywhere it can be set', async () => {
  assert.throws(() => payments.validatePaymentStage('COD', 'POST_ORDER'), /only appear when the order is placed/);
  assert.throws(() => payments.validatePaymentStage('COD', 'BOTH'), /only appear when the order is placed/);
  assert.equal(payments.validatePaymentStage('COD', 'PRE_ORDER'), 'PRE_ORDER');
  assert.equal(payments.validatePaymentStage('UPI', 'BOTH'), 'BOTH');
  assert.throws(() => payments.validatePaymentStage('UPI', 'SOMETIMES'));
  assert.equal(payments.stageAllows('BOTH', 'POST_ORDER'), true);
  assert.equal(payments.stageAllows('PRE_ORDER', 'POST_ORDER'), false);
  assert.equal(payments.stageAllows('POST_ORDER', 'PRE_ORDER'), false);
  // The client mirror agrees with the server rules.
  assert.deepEqual(clientStages.allowedPaymentStages('COD'), ['PRE_ORDER']);
  assert.deepEqual(clientStages.allowedPaymentStages('UPI'), ['PRE_ORDER', 'POST_ORDER', 'BOTH']);
  const cod = await byCode('COD');
  await assert.rejects(payments.updatePlatformPaymentMethod(cod.id, { defaultStage: 'BOTH' }), /only appear when the order is placed/);
  await assert.rejects(payments.createPlatformPaymentMethod({ code: 'COD', name: 'Again', defaultStage: 'POST_ORDER' }), /already exists|only appear/);
});

test('saving an organization payment table validates the whole set and is tenant-scoped', async () => {
  const a = await setupOrg('table-a');
  const b = await setupOrg('table-b');
  const m = await setupMethods('table');
  const row = (method: { id: string }, enabled: boolean) => ({ platformPaymentMethodId: method.id, enabled });

  await assert.rejects(payments.saveOrganizationPaymentConfig(a.store.id, [row(m.both, false)]), /Enable at least one payment method/);
  await assert.rejects(payments.saveOrganizationPaymentConfig(a.store.id, [row(m.pre, true), row(m.cod, true)]), /appears after the order/);
  await assert.rejects(payments.saveOrganizationPaymentConfig(a.store.id, [row(m.post, true), row(m.post, false)]), /more than once/);
  await assert.rejects(payments.saveOrganizationPaymentConfig('missing-store', [row(m.post, true)]), /Organization not found/);
  assert.equal(await prisma.organizationPaymentMethod.count({ where: { storeId: a.store.id } }), 0, 'a rejected save writes nothing');

  const saved = await payments.saveOrganizationPaymentConfig(a.store.id, [row(m.cod, true), row(m.post, true), row(m.both, false)]);
  const mine = new Map(saved.map(method => [method.code, method]));
  assert.deepEqual([mine.get('COD')?.enabled, mine.get('COD')?.stage], [true, 'PRE_ORDER']);
  assert.deepEqual([mine.get(m.post.code)?.enabled, mine.get(m.post.code)?.stage], [true, 'POST_ORDER']);
  assert.equal(mine.get(m.both.code)?.enabled, false);
  // Organization B is untouched.
  assert.equal(await prisma.organizationPaymentMethod.count({ where: { storeId: b.store.id } }), 0);
  assert.equal((await payments.listOrganizationPaymentMethods(b.store.id)).some(method => method.enabled), false);
  // Stage is the catalogue's, never the organization's: a catalogue edit shows up with no organization write.
  const rowsBefore = await prisma.organizationPaymentMethod.findMany({ where: { storeId: a.store.id }, orderBy: { platformPaymentMethodId: 'asc' } });
  await payments.updatePlatformPaymentMethod(m.post.id, { defaultStage: 'BOTH' });
  const again = await payments.listOrganizationPaymentMethods(a.store.id);
  assert.equal(again.find(method => method.code === m.post.code)?.stage, 'BOTH');
  assert.equal(again.find(method => method.code === m.post.code)?.enabled, true);
  assert.deepEqual(await prisma.organizationPaymentMethod.findMany({ where: { storeId: a.store.id }, orderBy: { platformPaymentMethodId: 'asc' } }), rowsBefore, 'no organization row changed');
  assert.equal(again.find(method => method.code === 'COD')?.stage, 'PRE_ORDER', 'methods omitted from a save keep their state');
});

test('orders accept only pre-order methods at punch and only post-order methods for later payments', async () => {
  const org = await setupOrg('enforce');
  const m = await setupMethods('enforce');
  await payments.saveOrganizationPaymentConfig(org.store.id, [
    { platformPaymentMethodId: m.pre.id, enabled: true },
    { platformPaymentMethodId: m.post.id, enabled: true },
    { platformPaymentMethodId: m.both.id, enabled: true },
    { platformPaymentMethodId: m.cod.id, enabled: true },
  ]);
  // At punch: pre-order and both are fine; post-order only is not.
  assert.equal((await newOrder(org, 'enforce-1', { entries: [{ productId: org.product.id, quantity: 2 }], initialPayment: { amount: 50, method: m.pre.name } })).payments[0].method, m.pre.name);
  assert.equal((await newOrder(org, 'enforce-2', { initialPayment: { amount: 50, method: m.both.name } })).payments.length, 1);
  await assert.rejects(newOrder(org, 'enforce-3', { initialPayment: { amount: 50, method: m.post.name } }), /can't be used when placing the order/);

  // Later payments: post-order and both work; pre-order only does not.
  const order = await newOrder(org, 'enforce-4', { entries: [{ productId: org.product.id, quantity: 3 }] });
  await assert.rejects(orders.recordPayment(org.store.id, order.id, 50, m.pre.name), /can't be used after the order is placed/);
  assert.equal((await orders.recordPayment(org.store.id, order.id, 100, m.post.name)).payments.length, 1);
  assert.equal((await orders.recordPayment(org.store.id, order.id, 100, m.both.name)).payments.length, 2);
  // A method the organization has not enabled is never usable.
  const other = await setupOrg('enforce-other');
  await assert.rejects(orders.recordPayment(other.store.id, (await newOrder(other, 'enforce-other-1')).id, 10, m.post.name), /no longer available/);
});

test('a catalogue stage change reaches every organization at once, with no organization write', async () => {
  const org = await setupOrg('live-stage');
  const other = await setupOrg('live-stage-2');
  const m = await setupMethods('live');
  for (const o of [org, other]) {
    await payments.saveOrganizationPaymentConfig(o.store.id, [{ platformPaymentMethodId: m.post.id, enabled: true }, { platformPaymentMethodId: m.cod.id, enabled: true }]);
  }
  const rowsBefore = await prisma.organizationPaymentMethod.findMany({ where: { storeId: { in: [org.store.id, other.store.id] } }, orderBy: [{ storeId: 'asc' }, { platformPaymentMethodId: 'asc' }] });
  const stageOf = async (o: Org) => (await payments.listOrganizationPaymentMethods(o.store.id)).find(method => method.code === m.post.code)?.stage;
  assert.deepEqual([await stageOf(org), await stageOf(other)], ['POST_ORDER', 'POST_ORDER']);

  // POST_ORDER: refused at punch, accepted for payments and for delivery.
  await assert.rejects(newOrder(org, 'live-1', { initialPayment: { amount: 50, method: m.post.name } }), /can't be used when placing the order/);
  const open = await newOrder(org, 'live-2', { entries: [{ productId: org.product.id, quantity: 2 }] });
  assert.equal((await orders.recordPayment(org.store.id, open.id, 50, m.post.name)).payments.length, 1);
  const toDeliver = await newOrder(org, 'live-3');
  assert.equal((await orders.deliverOrderWithPayment(org.store.id, toDeliver.id, { method: m.post.name }, org.owner.id)).status, 'Delivered');

  // One catalogue edit flips it for both organizations. PRE_ORDER: accepted at punch, refused for payments and delivery.
  await payments.updatePlatformPaymentMethod(m.post.id, { defaultStage: 'PRE_ORDER' });
  assert.deepEqual([await stageOf(org), await stageOf(other)], ['PRE_ORDER', 'PRE_ORDER']);
  assert.equal((await newOrder(org, 'live-4', { initialPayment: { amount: 50, method: m.post.name } })).payments.length, 1);
  await assert.rejects(orders.recordPayment(org.store.id, open.id, 50, m.post.name), /can't be used after the order is placed/);
  const blocked = await newOrder(org, 'live-5');
  await assert.rejects(orders.deliverOrderWithPayment(org.store.id, blocked.id, { method: m.post.name }, org.owner.id), /can't be used after the order is placed/);

  // COD is never post-order, and the catalogue refuses to make it so.
  await assert.rejects(orders.deliverOrderWithPayment(org.store.id, blocked.id, { method: 'COD' }, org.owner.id), /Cash on delivery can't be recorded as a payment/);
  await assert.rejects(payments.updatePlatformPaymentMethod(m.cod.id, { defaultStage: 'POST_ORDER' }), /only appear when the order is placed/);

  // Enabled flags are exactly what they were, and nothing was written to organization rows.
  assert.deepEqual(await prisma.organizationPaymentMethod.findMany({ where: { storeId: { in: [org.store.id, other.store.id] } }, orderBy: [{ storeId: 'asc' }, { platformPaymentMethodId: 'asc' }] }), rowsBefore);
  assert.equal((await payments.listOrganizationPaymentMethods(org.store.id)).filter(method => method.enabled).length, 2);
});

test('Cash on delivery records no payment: allowed at punch with zero, rejected with an amount, never recorded later', async () => {
  const org = await setupOrg('cod');
  const m = await setupMethods('cod');
  await payments.saveOrganizationPaymentConfig(org.store.id, [
    { platformPaymentMethodId: m.cod.id, enabled: true },
    { platformPaymentMethodId: m.post.id, enabled: true },
  ]);
  const unpaid = await newOrder(org, 'cod-1', { initialPayment: { amount: 0, method: 'COD' } });
  assert.equal(unpaid.payments.length, 0, 'COD at punch leaves the order unpaid');
  assert.equal(await prisma.payment.count({ where: { storeId: org.store.id } }), 0);
  await assert.rejects(newOrder(org, 'cod-2', { initialPayment: { amount: 50, method: 'COD' } }), /Cash on delivery can't be recorded as a payment/);
  await assert.rejects(newOrder(org, 'cod-3', { initialPayment: { amount: 50, method: 'Cash on delivery' } }), /Cash on delivery can't be recorded as a payment/);
  await assert.rejects(orders.recordPayment(org.store.id, unpaid.id, 50, 'COD'), /Cash on delivery can't be recorded as a payment/);
  await assert.rejects(orders.recordPayment(org.store.id, unpaid.id, 50, 'Cash on delivery'), /Cash on delivery can't be recorded as a payment/);
  assert.equal((await orders.recordPayment(org.store.id, unpaid.id, 100, m.post.name)).payments.length, 1);
});

test('new organizations get only the default methods and inherit templates, and defaults need a post-order method', async () => {
  const org = await setupOrg('defaults');
  // Run the defaults inside a transaction we always roll back, so the global
  // platform flags other test files read are never visible changed.
  const rollback = new Error('rollback');
  await assert.rejects(prisma.$transaction(async tx => {
    await tx.platformPaymentMethod.updateMany({ data: { enabledByDefault: false } });
    await tx.platformPaymentMethod.updateMany({ where: { code: { in: ['COD'] } }, data: { enabledByDefault: true } });
    await assert.rejects(defaults.applyOrganizationDefaults(tx, org.store.id), /at least one default payment method that appears after the order/);
    assert.equal(await tx.organizationPaymentMethod.count({ where: { storeId: org.store.id } }), 0, 'nothing is written when the check fails');
    assert.equal(await tx.organizationMessageTemplate.count({ where: { storeId: org.store.id } }), 0);
    throw rollback;
  }), error => error === rollback);
  await prisma.$transaction(async tx => {
    await defaults.applyOrganizationDefaults(tx, org.store.id);
  });
  const rows = await prisma.organizationPaymentMethod.findMany({ where: { storeId: org.store.id }, include: { platformPaymentMethod: true } });
  const defaultCodes = (await prisma.platformPaymentMethod.findMany({ where: { active: true, enabledByDefault: true } })).map(method => method.code).sort();
  assert.deepEqual(rows.map(row => row.platformPaymentMethod.code).sort(), defaultCodes);
  assert.ok(rows.every(row => row.enabled));
  assert.equal(await prisma.organizationMessageTemplate.count({ where: { storeId: org.store.id } }), 0, 'templates are inherited, not copied');
  assert.ok((await templates.listOrganizationMessageTemplates(org.store.id)).every(template => template.inherited));
});

test('templates reject unknown placeholders, over-long text and a missing {link}; the client mirror agrees', async () => {
  assert.throws(() => templates.validateMessageTemplate('READY', 'Hi {customer} {nope} {link}'), /Unknown placeholder: \{nope\}/);
  assert.throws(() => templates.validateMessageTemplate('READY', 'Hi {customer} {nope} {worse} {link}'), /Unknown placeholders: \{nope\}, \{worse\}/);
  assert.throws(() => templates.validateMessageTemplate('READY', 'Your order is ready'), /must include \{link\}/);
  assert.throws(() => templates.validateMessageTemplate('DELIVERED', 'Delivered {orderNo}'), /must include \{link\}/);
  assert.throws(() => templates.validateMessageTemplate('PENDING', ''), /required/);
  assert.throws(() => templates.validateMessageTemplate('PENDING', 'x'.repeat(templates.MAX_MESSAGE_TEMPLATE_LENGTH + 1)), /characters or fewer/);
  assert.equal(templates.validateMessageTemplate('PENDING', '  Hi {customer}  '), 'Hi {customer}');
  assert.equal(templates.validateMessageTemplate('READY', 'Ready {link}'), 'Ready {link}');
  // The browser editor and the server accept and reject the same text.
  assert.deepEqual([...clientTemplates.MESSAGE_PLACEHOLDERS], [...templates.ALLOWED_MESSAGE_PLACEHOLDERS]);
  assert.deepEqual([...clientTemplates.MESSAGE_STATUS_ORDER], [...templates.MESSAGE_STATUS_KEYS]);
  for (const [status, body] of [['READY', 'Hi {customer} {link}'], ['READY', 'no link'], ['PENDING', '{bad}'], ['DELIVERED', 'x {link} {invoiceNo}'], ['PENDING', '']] as const) {
    let serverOk = true;
    try { templates.validateMessageTemplate(status, body); } catch { serverOk = false; }
    assert.equal(clientTemplates.messageProblem(status, body) === '', serverOk, `${status}: ${body}`);
  }
});

test('an organization inherits the platform defaults and keeps a row only for wording that differs', async () => {
  const a = await setupOrg('fallback-a');
  const b = await setupOrg('fallback-b');
  const platform = await templates.listPlatformMessageTemplates();
  assert.equal(platform.length, 4);
  const inherited = await templates.listOrganizationMessageTemplates(a.store.id);
  assert.equal(inherited.length, 4);
  assert.ok(inherited.every(template => template.inherited));
  assert.deepEqual(inherited.map(template => template.body), platform.map(template => template.body));

  const edits = inherited.map(template => ({ statusKey: template.statusKey, body: template.statusKey === 'READY' ? 'A-only ready {link}' : template.body, enabled: template.statusKey === 'DELIVERED' ? false : template.enabled, attachment: template.attachment }));
  const saved = await templates.saveOrganizationMessageTemplates(a.store.id, edits, a.admin.id);
  assert.equal(saved.find(template => template.statusKey === 'READY')?.body, 'A-only ready {link}');
  assert.equal(saved.find(template => template.statusKey === 'DELIVERED')?.enabled, false);
  assert.deepEqual(saved.filter(template => !template.inherited).map(template => template.statusKey).sort(), ['DELIVERED', 'READY'], 'only the edited statuses become overrides');
  assert.equal(await prisma.organizationMessageTemplate.count({ where: { storeId: a.store.id } }), 2);
  // Organization B still sees the platform defaults.
  const mine = await templates.listOrganizationMessageTemplates(b.store.id);
  assert.ok(mine.every(template => template.inherited));
  assert.equal(mine.find(template => template.statusKey === 'READY')?.body, platform.find(template => template.statusKey === 'READY')?.body);
  // Saving needs every status, and rejects duplicates and invalid text without writing.
  await assert.rejects(templates.saveOrganizationMessageTemplates(b.store.id, edits.slice(0, 3), b.admin.id), /every order status/);
  await assert.rejects(templates.saveOrganizationMessageTemplates(b.store.id, [...edits.slice(0, 3), edits[0]], b.admin.id), /Duplicate/);
  await assert.rejects(templates.saveOrganizationMessageTemplates(b.store.id, edits.map(edit => (edit.statusKey === 'READY' ? { ...edit, body: 'no link' } : edit)), b.admin.id), /must include/);
  assert.equal(await prisma.organizationMessageTemplate.count({ where: { storeId: b.store.id } }), 0);
  // Restoring one template drops only that organization's override.
  await templates.restoreOrganizationMessageTemplate(a.store.id, 'READY');
  const restored = await templates.listOrganizationMessageTemplates(a.store.id);
  assert.equal(restored.find(template => template.statusKey === 'READY')?.inherited, true);
  assert.equal(restored.find(template => template.statusKey === 'DELIVERED')?.inherited, false);
  // Saving a status back as the default drops its override instead of storing a copy.
  const asDefaults = restored.map(template => ({ statusKey: template.statusKey, body: template.defaultBody, enabled: template.defaultEnabled, attachment: template.defaultAttachment }));
  await templates.saveOrganizationMessageTemplates(a.store.id, asDefaults, a.admin.id);
  assert.equal(await prisma.organizationMessageTemplate.count({ where: { storeId: a.store.id } }), 0);
});

test('a platform template edit reaches inheriting organizations and not overridden ones', async () => {
  const inheriting = await setupOrg('live-tpl-a');
  const overriding = await setupOrg('live-tpl-b');
  const original = (await templates.listPlatformMessageTemplates()).find(template => template.statusKey === 'PENDING')!;
  const mine = (await templates.listOrganizationMessageTemplates(overriding.store.id)).map(template => ({ statusKey: template.statusKey, body: template.statusKey === 'PENDING' ? 'Custom pending {link}' : template.body, enabled: template.enabled, attachment: template.attachment }));
  await templates.saveOrganizationMessageTemplates(overriding.store.id, mine, overriding.admin.id);
  try {
    await templates.savePlatformMessageTemplate('PENDING', { body: 'New platform pending {link}', defaultEnabled: original.defaultEnabled, defaultAttachment: original.defaultAttachment });
    const body = async (org: Org) => (await templates.listOrganizationMessageTemplates(org.store.id)).find(template => template.statusKey === 'PENDING')?.body;
    assert.equal(await body(inheriting), 'New platform pending {link}');
    assert.equal(await body(overriding), 'Custom pending {link}');
  } finally {
    await templates.savePlatformMessageTemplate('PENDING', { body: original.body, defaultEnabled: original.defaultEnabled, defaultAttachment: original.defaultAttachment });
  }
});

test('the inherit-defaults migration removes only rows identical to the platform default', async () => {
  const org = await setupOrg('tpl-migration');
  const platform = await templates.listPlatformMessageTemplates();
  const ready = platform.find(template => template.statusKey === 'READY')!;
  const pending = platform.find(template => template.statusKey === 'PENDING')!;
  await prisma.organizationMessageTemplate.createMany({ data: [
    { storeId: org.store.id, statusKey: 'READY', body: ready.body, enabled: ready.defaultEnabled, attachment: ready.defaultAttachment },
    { storeId: org.store.id, statusKey: 'PENDING', body: 'Own wording {link}', enabled: pending.defaultEnabled, attachment: pending.defaultAttachment },
  ] });
  const sql = (await import('node:fs')).readFileSync(new URL('../prisma/migrations/20261007140000_message_templates_inherit_defaults/migration.sql', import.meta.url), 'utf8');
  await prisma.$executeRawUnsafe(sql);
  const left = await prisma.organizationMessageTemplate.findMany({ where: { storeId: org.store.id } });
  assert.deepEqual(left.map(row => [row.statusKey, row.body]), [['PENDING', 'Own wording {link}']]);
});

test('only a Super Admin can change payment methods or templates; owners and employees cannot', async () => {
  const org = await setupOrg('roles');
  const m = await setupMethods('roles');
  const tokens = { owner: await login(org.owner.id), employee: await login(org.employee.id), admin: await login(org.admin.id) };
  const config = [{ platformPaymentMethodId: m.post.id, enabled: true }];
  const inputs = (await templates.listOrganizationMessageTemplates(org.store.id)).map(template => ({ statusKey: template.statusKey, body: template.body, enabled: template.enabled, attachment: template.attachment }));
  const originalReady = (await templates.listPlatformMessageTemplates()).find(template => template.statusKey === 'READY')!;
  const platformInput = { body: 'Default {link}', defaultEnabled: true, defaultAttachment: 'NONE' as const };
  const calls: [string, () => Promise<unknown>][] = [
    ['save payments', () => actions.saveOrganizationPaymentsAction(org.store.id, config)],
    ['save messages', () => actions.saveOrganizationMessagesAction(org.store.id, inputs)],
    ['restore message', () => actions.restoreOrganizationMessageAction(org.store.id, 'READY')],
    ['save platform message', () => actions.savePlatformMessageAction('READY', platformInput)],
    ['payments tab', () => tabs.fetchStorePaymentsDataAction(org.store.id)],
    ['messages tab', () => tabs.fetchStoreMessagesDataAction(org.store.id)],
  ];
  const denied = (code: string) => (error: unknown) => (error as { code?: string }).code === code;
  for (const [name, call] of calls) {
    currentToken = undefined;
    await assert.rejects(call(), denied('UNAUTHENTICATED'), `${name}: signed out`);
    currentToken = tokens.owner;
    await assert.rejects(call(), denied('FORBIDDEN'), `${name}: owner`);
    currentToken = tokens.employee;
    await assert.rejects(call(), denied('FORBIDDEN'), `${name}: employee`);
  }
  assert.equal(await prisma.organizationPaymentMethod.count({ where: { storeId: org.store.id } }), 0, 'denied calls wrote nothing');
  assert.equal(await prisma.organizationMessageTemplate.count({ where: { storeId: org.store.id } }), 0);

  currentToken = tokens.admin;
  const saved = await actions.saveOrganizationPaymentsAction(org.store.id, config);
  assert.equal(saved.ok, true);
  const bad = await actions.saveOrganizationPaymentsAction(org.store.id, [{ platformPaymentMethodId: m.post.id, enabled: false }]);
  assert.deepEqual([bad.ok, bad.error], [false, 'Enable at least one payment method.']);
  assert.equal((await actions.saveOrganizationMessagesAction(org.store.id, inputs)).ok, true);
  const badMessage = await actions.saveOrganizationMessagesAction(org.store.id, inputs.map(input => (input.statusKey === 'READY' ? { ...input, body: 'no link here' } : input)));
  assert.equal(badMessage.ok, false);
  assert.match(badMessage.error ?? '', /must include \{link\}/);
  assert.equal((await actions.restoreOrganizationMessageAction(org.store.id, 'READY')).ok, true);
  assert.equal((await actions.savePlatformMessageAction('READY', platformInput)).ok, true);
  assert.equal((await templates.listPlatformMessageTemplates()).find(template => template.statusKey === 'READY')?.body, 'Default {link}');
  // Put the shared platform default back so other tests see the original wording.
  await actions.savePlatformMessageAction('READY', { body: originalReady.body, defaultEnabled: originalReady.defaultEnabled, defaultAttachment: originalReady.defaultAttachment });
  // Every change is audited with the acting Super Admin.
  const audit = await prisma.auditLog.findMany({ where: { storeId: org.store.id, actorId: org.admin.id } });
  assert.deepEqual([...new Set(audit.map(entry => entry.action))].sort(), ['RESTORE_ORGANIZATION_MESSAGE_TEMPLATE', 'UPDATE_ORGANIZATION_MESSAGE_TEMPLATES', 'UPDATE_ORGANIZATION_PAYMENT_METHODS']);
  assert.equal((await prisma.auditLog.count({ where: { action: 'UPDATE_PLATFORM_MESSAGE_TEMPLATE', actorId: org.admin.id } })) >= 1, true);
  currentToken = undefined;
});
