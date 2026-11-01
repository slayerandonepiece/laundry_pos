import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const socket = process.env.QA_SUBSCRIPTION_PG_SOCKET;
if (!socket?.startsWith('/tmp/el-subscription-test-') || !socket.endsWith('/socket')) {
  throw new Error('Run npm run test:subscription-payments to create an isolated PostgreSQL cluster.');
}
const prisma = new PrismaClient({
  adapter: new PrismaPg({ host: socket, user: 'subscription_test', database: 'postgres', port: 5432, max: 5, application_name: 'el-health-test' }),
});
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;

let healthRoute: typeof import('../src/app/api/v1/health/route');

before(async () => {
  healthRoute = await import('../src/app/api/v1/health/route');
});
after(async () => {
  delete (globalThis as unknown as { prisma?: PrismaClient }).prisma;
  await prisma.$disconnect();
});

test('GET /health returns 200 {ok:true} with no Authorization and no x-store-id, and is not cacheable', async () => {
  const res = await healthRoute.GET();
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.match(res.headers.get('cache-control') ?? '', /no-store/);
});
