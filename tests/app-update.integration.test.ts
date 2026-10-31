import { testPhone } from './test-phone';
import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { NextRequest } from 'next/server';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../src/server/auth/password';
import { generateSessionToken } from '../src/server/auth/token';
import { computeUpdateAdvice, computeUpdateLevel, parseVersion, type UpdateConfig } from '../src/server/app-update';

const socket = process.env.QA_SUBSCRIPTION_PG_SOCKET;
if (!socket?.startsWith('/tmp/el-subscription-test-') || !socket.endsWith('/socket')) {
  throw new Error('Run npm run test:subscription-payments to create an isolated PostgreSQL cluster.');
}
const prisma = new PrismaClient({
  adapter: new PrismaPg({ host: socket, user: 'subscription_test', database: 'postgres', port: 5432, max: 5, application_name: 'el-app-update-test' }),
});
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;

// Routes call handleApiRoute without a request, so it reads headers via
// next/headers; outside a Next request scope that is mocked here.
let currentHeaders = new Headers();
mock.module('next/headers', { namedExports: { headers: async () => currentHeaders } });

let statusRoute: typeof import('../src/app/api/v1/auth/status/route');
let productsRoute: typeof import('../src/app/api/v1/products/route');
let settings: typeof import('../src/server/services/app-update-settings');

before(async () => {
  statusRoute = await import('../src/app/api/v1/auth/status/route');
  productsRoute = await import('../src/app/api/v1/products/route');
  settings = await import('../src/server/services/app-update-settings');
});
after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
});

const both: UpdateConfig = {
  ios: { softMinVersion: '1.1.0', urgentMinVersion: '1.0.5' },
  android: { softMinVersion: '2.0.0', urgentMinVersion: null },
};

test('computeUpdateLevel table', () => {
  const rows: [string | undefined, string | null | undefined, null, UpdateConfig | null | undefined, string][] = [
    // platform, version, (unused), config, expected
    ['ios', '1.0.4', null, both, 'urgent'],
    ['ios', '1.0.5', null, both, 'soft'],      // equal to urgent min is not urgent
    ['ios', '1.0.9', null, both, 'soft'],
    ['ios', '1.1.0', null, both, 'none'],      // equal to soft min is not soft
    ['ios', '1.10.0', null, both, 'none'],     // numeric, not lexicographic
    ['ios', '0.9.9', null, both, 'urgent'],
    ['IOS', ' 1.0.9 ', null, both, 'soft'],
    ['android', '1.9.9', null, both, 'soft'],
    ['android', '2.0.0', null, both, 'none'],
    ['android', '0.1.0', null, both, 'soft'],  // urgent unset, soft set
    ['ios', '1.1', null, both, 'none'],        // short version = 1.1.0
    ['ios', '1', null, both, 'urgent'],
    ['ios', undefined, null, both, 'none'],
    ['ios', null, null, both, 'none'],
    ['ios', '', null, both, 'none'],
    [undefined, '1.0.0', null, both, 'none'],
    ['', '1.0.0', null, both, 'none'],
    ['windows', '0.0.1', null, both, 'none'],
    ['ios', 'garbage', null, both, 'none'],
    ['ios', '1.0.0-beta', null, both, 'none'],
    ['ios', '1.0.0+2', null, both, 'none'],    // build suffix is not a version name
    ['ios', '1.0.0.0', null, both, 'none'],
    ['ios', '-1.0.0', null, both, 'none'],
    ['ios', '1.0.4', null, {}, 'none'],
    ['ios', '1.0.4', null, null, 'none'],
    ['ios', '1.0.4', null, undefined, 'none'],
    ['ios', '1.0.4', null, { ios: { softMinVersion: null, urgentMinVersion: null } }, 'none'],
    ['ios', '1.0.4', null, { ios: { softMinVersion: 'junk', urgentMinVersion: 'junk' } }, 'none'],
    ['ios', '1.0.4', null, { android: { urgentMinVersion: '9.0.0' } }, 'none'], // other platform's config only
  ];
  for (const [platform, version, , config, expected] of rows) {
    assert.equal(computeUpdateLevel(platform, version, config), expected, `${platform} ${version} ${JSON.stringify(config)}`);
  }
  assert.deepEqual(parseVersion('1.2.3'), [1, 2, 3]);
  assert.equal(parseVersion('1.2.3.4'), null);
});

test('computeUpdateLevel never throws on hostile input', () => {
  const hostile = { get ios(): never { throw new Error('boom'); } } as unknown as UpdateConfig;
  assert.equal(computeUpdateLevel('ios', '1.0.0', hostile), 'none');
});

function call(route: { GET: (req: NextRequest) => Promise<Response> }, path: string, headers: Record<string, string>, token?: string) {
  currentHeaders = new Headers(headers);
  return route.GET(new NextRequest(`http://localhost${path}`, {
    headers: { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  }));
}

test('X-Update-Level is on every response, errors included, and never alters status or body', async () => {
  await settings.saveAppUpdateSetting({ platform: 'ios', softMinVersion: '1.1.0', urgentMinVersion: '1.0.5' }, 'test');

  const old = { 'x-app-platform': 'ios', 'x-app-version': '1.0.0', 'x-app-build': '3' };
  // 401: unauthenticated error response carries the header.
  let res = await call(statusRoute, '/api/v1/auth/status', old);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'Unauthorized' });
  assert.equal(res.headers.get('X-Update-Level'), 'urgent');
  assert.equal(res.headers.get('X-Update-Min-Version'), '1.0.5', 'urgent carries the urgent minimum');
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store');

  // Legacy builds send no headers: none.
  res = await call(statusRoute, '/api/v1/auth/status', {});
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('X-Update-Level'), 'none');

  // Up to date, soft, garbage.
  res = await call(statusRoute, '/api/v1/auth/status', { 'x-app-platform': 'ios', 'x-app-version': '1.1.0' });
  assert.equal(res.headers.get('X-Update-Level'), 'none');
  assert.equal(res.headers.get('X-Update-Min-Version'), null, 'none carries no minimum');
  res = await call(statusRoute, '/api/v1/auth/status', { 'x-app-platform': 'ios', 'x-app-version': '1.0.9' });
  assert.equal(res.headers.get('X-Update-Level'), 'soft');
  assert.equal(res.headers.get('X-Update-Min-Version'), '1.1.0', 'soft carries the soft minimum');
  res = await call(statusRoute, '/api/v1/auth/status', { 'x-app-platform': 'ios', 'x-app-version': 'x.y' });
  assert.equal(res.headers.get('X-Update-Level'), 'none');
  // Android has no config row.
  res = await call(statusRoute, '/api/v1/auth/status', { 'x-app-platform': 'android', 'x-app-version': '0.0.1' });
  assert.equal(res.headers.get('X-Update-Level'), 'none');

  // 200 and 403 responses.
  const hash = await hashPassword('password123');
  const user = await prisma.user.create({ data: { name: 'Updater', phone: testPhone('app_update_user'), passwordHash: hash, mustChangePassword: true } });
  const token = generateSessionToken();
  await prisma.session.create({ data: { id: `sess-upd-${token.slice(0, 16)}`, userId: user.id, token, credentialVersion: user.credentialVersion, expiresAt: new Date(Date.now() + 86400000) } });
  res = await call(statusRoute, '/api/v1/auth/status', old, token);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('X-Update-Level'), 'urgent');
  res = await call(productsRoute, '/api/v1/products', old, token);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).reason, 'must_change_password');
  assert.equal(res.headers.get('X-Update-Level'), 'urgent');
});

test('a cold instance with the database down sends no update headers and the response is unchanged', async () => {
  settings.clearUpdateConfigCache();
  const original = prisma.appUpdateSetting.findMany;
  prisma.appUpdateSetting.findMany = (() => Promise.reject(new Error('db down'))) as typeof original;
  try {
    const res = await call(statusRoute, '/api/v1/auth/status', { 'x-app-platform': 'ios', 'x-app-version': '1.0.0' });
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: 'Unauthorized' });
    assert.equal(res.headers.get('X-Update-Level'), null, 'no snapshot: say nothing rather than none');
    assert.equal(res.headers.get('X-Update-Min-Version'), null);
  } finally {
    prisma.appUpdateSetting.findMany = original;
    settings.clearUpdateConfigCache();
  }
});

test('saving settings validates versions and clears blanks to unset', async () => {
  await assert.rejects(() => settings.saveAppUpdateSetting({ platform: 'ios', softMinVersion: 'abc' }, 'test'), /version/);
  await assert.rejects(() => settings.saveAppUpdateSetting({ platform: 'web', softMinVersion: '1.0.0' }, 'test'), /platform/);
  const saved = await settings.saveAppUpdateSetting({ platform: 'ios', softMinVersion: '', urgentMinVersion: ' ' }, 'test');
  assert.deepEqual(saved, { platform: 'ios', softMinVersion: null, urgentMinVersion: null });
  const res = await call(statusRoute, '/api/v1/auth/status', { 'x-app-platform': 'ios', 'x-app-version': '0.0.1' });
  assert.equal(res.headers.get('X-Update-Level'), 'none');
});

test('a stale snapshot answers at once from memory, and one shared refresh brings in the new value', async () => {
  await settings.saveAppUpdateSetting({ platform: 'ios', softMinVersion: '1.1.0', urgentMinVersion: null }, 'test');
  assert.equal(settings.getUpdateLevel('ios', '1.5.0'), 'none');

  // Change the row behind the cache's back, then let the snapshot go stale.
  await prisma.appUpdateSetting.update({ where: { platform: 'ios' }, data: { softMinVersion: '2.0.0' } });
  settings.expireUpdateConfigCache();
  assert.equal(settings.needsUpdateConfigRefresh(), true);
  assert.equal(settings.getUpdateLevel('ios', '1.5.0'), 'none', 'old value is served while stale');

  let lookups = 0;
  const original = prisma.appUpdateSetting.findMany;
  prisma.appUpdateSetting.findMany = ((...args: Parameters<typeof original>) => {
    lookups += 1;
    return original.apply(prisma.appUpdateSetting, args);
  }) as typeof original;
  try {
    await Promise.all([1, 2, 3, 4, 5].map(() => settings.refreshUpdateConfig()));
  } finally {
    prisma.appUpdateSetting.findMany = original;
  }
  assert.equal(lookups, 1, 'concurrent refreshes share one lookup');
  assert.equal(settings.getUpdateLevel('ios', '1.5.0'), 'soft');
  assert.equal(settings.needsUpdateConfigRefresh(), false, 'fresh snapshot needs no refresh');
});

test('a slow refresh that finishes late is kept, not dropped', async () => {
  await settings.saveAppUpdateSetting({ platform: 'ios', softMinVersion: '1.1.0', urgentMinVersion: null }, 'test');
  await prisma.appUpdateSetting.update({ where: { platform: 'ios' }, data: { softMinVersion: '3.0.0' } });
  settings.expireUpdateConfigCache();

  const original = prisma.appUpdateSetting.findMany;
  prisma.appUpdateSetting.findMany = (async (...args: Parameters<typeof original>) => {
    await new Promise(resolve => setTimeout(resolve, 400));
    return original.apply(prisma.appUpdateSetting, args);
  }) as typeof original;
  try {
    await settings.refreshUpdateConfig();
  } finally {
    prisma.appUpdateSetting.findMany = original;
  }
  assert.equal(settings.getUpdateLevel('ios', '2.0.0'), 'soft');
});

test('a failed refresh keeps the last good snapshot and backs off', async () => {
  await settings.saveAppUpdateSetting({ platform: 'ios', softMinVersion: '1.1.0', urgentMinVersion: '1.0.5' }, 'test');
  assert.equal(settings.getUpdateLevel('ios', '1.0.0'), 'urgent');
  settings.expireUpdateConfigCache();

  const original = prisma.appUpdateSetting.findMany;
  prisma.appUpdateSetting.findMany = (() => Promise.reject(new Error('db down'))) as typeof original;
  try {
    await settings.refreshUpdateConfig();
  } finally {
    prisma.appUpdateSetting.findMany = original;
  }
  assert.equal(settings.getUpdateLevel('ios', '1.0.0'), 'urgent', 'last good value survives a failure');
  assert.equal(settings.needsUpdateConfigRefresh(), false, 'no retry storm while backing off');
});

test('a cold instance answers none without waiting, then learns the values from the first refresh', async () => {
  await settings.saveAppUpdateSetting({ platform: 'ios', softMinVersion: '1.1.0', urgentMinVersion: null }, 'test');
  settings.clearUpdateConfigCache();
  assert.equal(settings.getUpdateAdvice('ios', '1.0.0'), null, 'cold: no advice, not "none"');
  assert.equal(settings.getUpdateLevel('ios', '1.0.0'), 'none');
  assert.equal(settings.needsUpdateConfigRefresh(), true);
  await settings.refreshUpdateConfig();
  assert.equal(settings.getUpdateLevel('ios', '1.0.0'), 'soft');
});

test('the level memo is bounded and ignores oversized header values', () => {
  const huge = '9'.repeat(500);
  assert.equal(settings.getUpdateLevel('ios', huge), 'none');
  for (let i = 0; i < 300; i += 1) settings.getUpdateLevel('ios', `1.0.${i}`);
  assert.equal(settings.getUpdateLevel('ios', '1.0.0'), 'soft');
});

test('computeUpdateAdvice names the minimum behind the level', () => {
  const config: UpdateConfig = { ios: { softMinVersion: ' 1.1.0 ', urgentMinVersion: '1.0.5' } };
  assert.deepEqual(computeUpdateAdvice('ios', '1.0.4', config), { level: 'urgent', minVersion: '1.0.5' });
  assert.deepEqual(computeUpdateAdvice('ios', '1.0.9', config), { level: 'soft', minVersion: '1.1.0' });
  assert.deepEqual(computeUpdateAdvice('ios', '1.1.0', config), { level: 'none', minVersion: null });
  assert.deepEqual(computeUpdateAdvice('ios', 'x.y', config), { level: 'none', minVersion: null });
  assert.deepEqual(computeUpdateAdvice('web', '1.0.0', config), { level: 'none', minVersion: null });
  assert.deepEqual(computeUpdateAdvice('ios', '1.0.0', undefined), { level: 'none', minVersion: null });
});
