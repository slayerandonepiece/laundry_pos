import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Reuses the exact same 32 random bytes encoded as base64url pattern as OrderInvoice.accessToken
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function isValidSessionToken(token: string): boolean {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

// Resolved on use, not at import, so a production build without the secret
// still succeeds but signing/verifying fails loudly instead of using a public key.
function invoiceSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set in production.');
  }
  return 'dev-only-subscription-invoice-secret';
}

export function getSubscriptionInvoiceToken(invoiceSeq: number): string {
  return createHmac('sha256', invoiceSecret())
    .update(`subscription-invoice:${invoiceSeq}`)
    .digest('base64url');
}

export function isValidSubscriptionInvoiceToken(invoiceSeq: number, token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const expected = getSubscriptionInvoiceToken(invoiceSeq);
  const given = Buffer.from(token);
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

