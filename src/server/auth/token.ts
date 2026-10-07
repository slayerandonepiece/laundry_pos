import 'server-only';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

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


// Shareable link reference for an owner's subscription invoice: the invoice
// number is encrypted (AES-256-GCM), so the link reveals nothing, cannot be
// altered, and cannot be guessed from a neighbouring invoice.
const linkKey = () => createHash('sha256').update(`subscription-invoice-link:${invoiceSecret()}`).digest();

export function encryptSubscriptionInvoiceRef(invoiceSeq: number): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', linkKey(), iv);
  const body = Buffer.concat([cipher.update(String(invoiceSeq), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

export function decryptSubscriptionInvoiceRef(ref: string): number | null {
  try {
    const raw = Buffer.from(ref, 'base64url');
    if (raw.length < 29) return null;
    const decipher = createDecipheriv('aes-256-gcm', linkKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const seq = Number(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
    return Number.isInteger(seq) && seq > 0 ? seq : null;
  } catch { return null; }
}
