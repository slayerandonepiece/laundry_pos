import 'server-only';
import { randomBytes } from 'node:crypto';

// Reuses the exact same 32 random bytes encoded as base64url pattern as OrderInvoice.accessToken
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function isValidSessionToken(token: string): boolean {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}
