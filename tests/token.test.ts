import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

const env = process.env as Record<string, string | undefined>;
const original = { NODE_ENV: env.NODE_ENV, SESSION_SECRET: env.SESSION_SECRET };

afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
});

test('L1: production refuses to sign invoice tokens without SESSION_SECRET', async () => {
  const token = await import('../src/server/auth/token');
  env.NODE_ENV = 'production';
  delete env.SESSION_SECRET;
  assert.throws(() => token.getSubscriptionInvoiceToken(1), /SESSION_SECRET/);
  assert.throws(() => token.isValidSubscriptionInvoiceToken(1, 'anything'), /SESSION_SECRET/);
  env.SESSION_SECRET = 'unit-test-secret';
  const value = token.getSubscriptionInvoiceToken(1);
  assert.equal(token.isValidSubscriptionInvoiceToken(1, value), true);
  assert.equal(token.isValidSubscriptionInvoiceToken(2, value), false);
});

test('L1: outside production a dev fallback secret keeps working; wrong-length tokens are rejected', async () => {
  const token = await import('../src/server/auth/token');
  env.NODE_ENV = 'test';
  delete env.SESSION_SECRET;
  const value = token.getSubscriptionInvoiceToken(7);
  assert.equal(token.isValidSubscriptionInvoiceToken(7, value), true);
  assert.equal(token.isValidSubscriptionInvoiceToken(7, value.slice(1)), false);
  assert.equal(token.isValidSubscriptionInvoiceToken(7, value + 'x'), false);
});
