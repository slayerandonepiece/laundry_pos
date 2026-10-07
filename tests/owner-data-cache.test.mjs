import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

// Exercise service cache boundaries without reading environment files or a DB.
const entries = new Map();
const configurations = [];
let clock = 0;
const cache = {
  unstable_cache(callback, keyParts, options) {
    configurations.push({ keyParts, options });
    return async (...args) => {
      const key = JSON.stringify([keyParts, args]);
      const hit = entries.get(key);
      if (hit && hit.expires > clock) return hit.value;
      const value = await callback(...args);
      entries.set(key, { value, tags: options.tags, expires: clock + options.revalidate });
      return value;
    };
  },
  revalidateTag(tag, profile) {
    assert.deepEqual(profile, { expire: 0 });
    for (const [key, entry] of entries) if (entry.tags.includes(tag)) entries.delete(key);
  },
};
mock.module('next/cache', { namedExports: cache, defaultExport: cache });
const product = { id: 'service', storeId: 'a', name: 'Wash', category: 'Laundry', active: true, type: 'ITEM', price: 100, slabs: [] };
const prisma = {
  product: {
    findMany: mock.fn(async ({ where }) => [{ ...product, name: where.storeId }]),
    findUnique: async () => null,
    upsert: async () => product,
  },
  productSlab: { deleteMany: async () => ({ count: 0 }) },
  storeMembership: {
    findMany: mock.fn(async () => []),
  },
  $transaction: async callback => callback(prisma),
};
mock.module(new URL('../src/server/db.ts', import.meta.url).href, { namedExports: { prisma } });
const products = await import('../src/server/services/products.ts');
const employees = await import('../src/server/services/employees.ts');

test('owner list caches partition stores, TTL and successful mutations; employees are never cached', async () => {
  assert.equal((await products.listProducts('a'))[0].name, 'a');
  await products.listProducts('a');
  assert.equal(prisma.product.findMany.mock.callCount(), 1);
  assert.equal((await products.listProducts('b'))[0].name, 'b');
  assert.equal(prisma.product.findMany.mock.callCount(), 2);
  await employees.listEmployees('a');
  await employees.listEmployees('a');
  await employees.listEmployees('b');
  // listEmployees is deliberately uncached (revalidateTag only marks entries stale), so every call reads.
  assert.equal(prisma.storeMembership.findMany.mock.callCount(), 3);
  clock = 61;
  await products.listProducts('a');
  await employees.listEmployees('a');
  assert.equal(prisma.product.findMany.mock.callCount(), 3);
  assert.equal(prisma.storeMembership.findMany.mock.callCount(), 4);
  clock = 121;
  await products.listProducts('b');
  const beforeSave = prisma.product.findMany.mock.callCount();
  await products.saveProduct('a', { id: 'new', name: 'Wash', category: 'Laundry', active: true, type: 'item', price: 100 });
  await products.listProducts('a');
  assert.equal(prisma.product.findMany.mock.callCount(), beforeSave + 1);
  await products.listProducts('b');
  assert.equal(prisma.product.findMany.mock.callCount(), beforeSave + 1);
  await products.listProducts('a');
  const reads = prisma.product.findMany.mock.callCount();
  await assert.rejects(products.saveProduct('a', { id: 'bad' }));
  await products.listProducts('a');
  assert.equal(prisma.product.findMany.mock.callCount(), reads);
  for (const { keyParts, options } of configurations) {
    const domain = keyParts[0];
    assert.deepEqual(options.tags, [domain, keyParts[1]]);
    assert.equal(options.revalidate, 60);
  }
});
