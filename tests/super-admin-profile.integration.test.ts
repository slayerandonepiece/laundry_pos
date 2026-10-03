import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword, verifyPassword } from '../src/server/auth/password';
import { testPhone } from './test-phone';

const socket = process.env.QA_SUBSCRIPTION_PG_SOCKET;
if (!socket?.startsWith('/tmp/el-subscription-test-') || !socket.endsWith('/socket')) throw new Error('Use the disposable subscription integration runner.');
const prisma = new PrismaClient({ adapter: new PrismaPg({ host: socket, user: 'subscription_test', database: 'postgres', port: 5432 }) });
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
let profile: typeof import('../src/server/services/super-admin-profile');
let passwords: typeof import('../src/server/services/profile');
before(async () => {
  profile = await import('../src/server/services/super-admin-profile');
  passwords = await import('../src/server/services/profile');
});
after(async () => { delete (globalThis as unknown as { prisma?: PrismaClient }).prisma; await prisma.$disconnect(); });

async function fixture(suffix: string, isSuperAdmin = true) {
  const user = await prisma.user.create({ data: { name: 'Test Admin', phone: testPhone(`profile_${suffix}`), passwordHash: await hashPassword('OldPassword123'), isSuperAdmin } });
  await prisma.session.create({ data: { userId: user.id, token: `profile-session-${suffix}`, credentialVersion: user.credentialVersion, expiresAt: new Date(Date.now() + 86400000) } });
  return user;
}

test('self profile validates details and preserves credentials when login phone is unchanged', async () => {
  const user = await fixture('details');
  await assert.rejects(profile.saveSuperAdminProfile(user.id, { name: 'A', phone: user.phone, email: '' }), /at least 2/);
  await assert.rejects(profile.saveSuperAdminProfile(user.id, { name: 'Admin', phone: user.phone, email: 'invalid' }), /email/);
  const result = await profile.saveSuperAdminProfile(user.id, { name: 'Updated Admin', phone: user.phone, email: 'admin@example.com', isSuperAdmin: false });
  assert.equal(result.signInAgain, false);
  assert.equal(result.profile.name, 'Updated Admin');
  const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(stored.isSuperAdmin, true);
  assert.equal(stored.credentialVersion, 1);
  assert.equal(await prisma.session.count({ where: { userId: user.id } }), 1);
});

test('self profile excludes owner accounts and prevents duplicate login phones', async () => {
  const owner = await fixture('owner', false);
  const admin = await fixture('conflict');
  await assert.rejects(profile.getSuperAdminProfile(owner.id), /not found/);
  await assert.rejects(profile.saveSuperAdminProfile(owner.id, { name: 'Owner', phone: owner.phone, email: '' }), /not found/);
  await assert.rejects(profile.saveSuperAdminProfile(admin.id, { name: 'Admin', phone: owner.phone, email: '' }), /already registered/);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).phone, admin.phone);
});

test('login phone changes invalidate every session and increment the credential version', async () => {
  const user = await fixture('phone');
  const nextPhone = testPhone('profile_next_phone');
  const result = await profile.saveSuperAdminProfile(user.id, { name: user.name, phone: nextPhone, email: '' });
  assert.equal(result.signInAgain, true);
  assert.equal(result.profile.phone, nextPhone);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).credentialVersion, 2);
  assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0);
});

test('shared password change rejects incorrect current password and revokes sessions on success', async () => {
  const user = await fixture('password');
  await assert.rejects(passwords.changeUserPassword(user.id, 'incorrect', 'NewPassword123'), /incorrect/);
  assert.equal(await prisma.session.count({ where: { userId: user.id } }), 1);
  await assert.rejects(passwords.changeUserPassword(user.id, 'OldPassword123', 'short'), /at least 8/);
  await passwords.changeUserPassword(user.id, 'OldPassword123', 'NewPassword123');
  const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.ok(await verifyPassword('NewPassword123', stored.passwordHash));
  assert.equal(stored.credentialVersion, 2);
  assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0);
});
