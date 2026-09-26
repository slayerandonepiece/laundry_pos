import 'server-only';
import { createHmac, randomBytes } from 'node:crypto';

// Reuses the exact same 32 random bytes encoded as base64url pattern as OrderInvoice.accessToken
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function isValidSessionToken(token: string): boolean {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

const INVOICE_SECRET = process.env.SESSION_SECRET || 'subscription-invoice-fallback-secret-2026';

export function getSubscriptionInvoiceToken(invoiceSeq: number): string {
  return createHmac('sha256', INVOICE_SECRET)
    .update(`subscription-invoice:${invoiceSeq}`)
    .digest('base64url');
}

export function isValidSubscriptionInvoiceToken(invoiceSeq: number, token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const expected = getSubscriptionInvoiceToken(invoiceSeq);
  return token === expected;
}

