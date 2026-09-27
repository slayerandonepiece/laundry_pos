import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { testPhone } from './test-phone';

const socket = process.env.QA_SUBSCRIPTION_PG_SOCKET;
if (!socket?.startsWith('/tmp/el-subscription-test-') || !socket.endsWith('/socket')) throw new Error('Use the disposable integration runner.');
const prisma = new PrismaClient({ adapter: new PrismaPg({ host: socket, user: 'subscription_test', database: 'postgres', port: 5432 }) });
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
let service: typeof import('../src/server/services/workspace-announcements');
let admin: string;
let owner: string;
let storeA: string;
let storeB: string;
before(async () => {
  service = await import('../src/server/services/workspace-announcements');
  admin = (await prisma.user.create({ data: { name: 'Announcement Admin', phone: testPhone('announcement_admin'), passwordHash: 'unused', isSuperAdmin: true } })).id;
  owner = (await prisma.user.create({ data: { name: 'Announcement Owner', phone: testPhone('announcement_owner'), passwordHash: 'unused' } })).id;
  storeA = (await prisma.store.create({ data: { name: 'Announcement Store A' } })).id;
  storeB = (await prisma.store.create({ data: { name: 'Announcement Store B' } })).id;
});
after(async () => { delete (globalThis as unknown as { prisma?: PrismaClient }).prisma; await prisma.$disconnect(); });
const base = { message: 'Maintenance notice', audience: 'store', tone: 'warning', storeIds: [] as string[], published: false, actionLabel: '', actionHref: '' };

test('owner cannot write and unsafe/partial links are rejected without records', async () => {
  await assert.rejects(service.saveAnnouncement(owner, base), /Super Admin/);
  for (const actionHref of ['javascript:alert(1)', '//evil.example', '/\\evil.example', 'http://example.test', 'https://user:password@example.test']) {
    await assert.rejects(service.saveAnnouncement(admin, { ...base, actionLabel: 'Read', actionHref }), /local path or an HTTPS/);
  }
  await assert.rejects(service.saveAnnouncement(admin, { ...base, message: ' ' }), /message/);
  await assert.rejects(service.saveAnnouncement(admin, { ...base, actionLabel: 'Read' }), /both/);
  await assert.rejects(service.saveAnnouncement(admin, { ...base, storeIds: ['missing-store'] }), /organizations/);
});
test('draft, targeted publish, revision edit, unpublish and audit are persisted', async () => {
  const draft = await service.saveAnnouncement(admin, { ...base, storeIds: [storeA], actionLabel: 'Details', actionHref: '/admin/profile' });
  assert.equal((await service.publishedAnnouncements('store', storeA)).some(n => n.id === draft.id), false);
  const published = await service.saveAnnouncement(admin, { ...base, storeIds: [storeA], published: true }, { id: draft.id, revision: draft.revision });
  assert.equal(published.revision, 2);
  assert.equal((await service.publishedAnnouncements('store', storeA)).some(n => n.id === draft.id), true);
  assert.deepEqual((await service.publishedAnnouncements('store', storeA)).find(n => n.id === draft.id)?.storeIds, []);
  assert.equal((await service.publishedAnnouncements('store', storeB)).some(n => n.id === draft.id), false);
  assert.equal((await service.publishedAnnouncements('platform')).some(n => n.id === draft.id), false);
  await assert.rejects(service.saveAnnouncement(admin, base, { id: draft.id, revision: draft.revision }), /changed/);
  const edited = await service.saveAnnouncement(admin, { ...base, message: 'Maintenance updated', published: true, storeIds: [storeA] }, { id: draft.id, revision: published.revision });
  assert.equal(edited.revision, 3);
  await service.saveAnnouncement(admin, { ...base, storeIds: [storeA] }, { id: draft.id, revision: edited.revision });
  assert.equal((await service.publishedAnnouncements('store', storeA)).some(n => n.id === draft.id), false);
  assert.equal(await prisma.auditLog.count({ where: { entityType: 'WorkspaceAnnouncement', entityId: draft.id } }), 4);
});
test('everyone and platform targeting work independently of subscription state', async () => {
  const all = await service.saveAnnouncement(admin, { ...base, audience: 'all', published: true });
  const platform = await service.saveAnnouncement(admin, { ...base, audience: 'platform', published: true });
  for (const storeId of [storeA, storeB]) {
    const visible = await service.publishedAnnouncements('store', storeId);
    assert.ok(visible.some(n => n.id === all.id));
    assert.ok(!visible.some(n => n.id === platform.id));
  }
  const visible = await service.publishedAnnouncements('platform');
  assert.ok(visible.some(n => n.id === all.id));
  assert.ok(visible.some(n => n.id === platform.id));
});
