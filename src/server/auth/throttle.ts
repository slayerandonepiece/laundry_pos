import { normalizePhone } from '@/lib/contactValidation';
import 'server-only';

interface AttemptRecord {
  count: number;
  firstAttemptAt: number;
  blockedUntil?: number;
}

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// This throttle is limited to one warm serverless instance; attempts are not shared across instances.
const attempts = new Map<string, AttemptRecord>();

// Cleanup stale entries every 10 minutes
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of attempts.entries()) {
    if ((record.blockedUntil && record.blockedUntil < now) || (now - record.firstAttemptAt > WINDOW_MS)) {
      attempts.delete(key);
    }
  }
}, 10 * 60 * 1000);

if (typeof cleanupInterval.unref === 'function') {
  cleanupInterval.unref();
}

function throttleKey(phone: string, ip?: string): string {
  const cleanUser = normalizePhone(phone);
  const cleanIp = (ip ?? '').trim();
  return `${cleanUser}:${cleanIp}`;
}

export function checkLoginThrottle(phone: string, ip?: string): { allowed: boolean; retryAfterSeconds?: number } {
  const key = throttleKey(phone, ip);
  const record = attempts.get(key);
  if (!record) return { allowed: true };

  const now = Date.now();
  if (record.blockedUntil) {
    if (now < record.blockedUntil) {
      const retryAfterSeconds = Math.ceil((record.blockedUntil - now) / 1000);
      return { allowed: false, retryAfterSeconds };
    }
    // Block duration expired, reset record
    attempts.delete(key);
    return { allowed: true };
  }

  return { allowed: true };
}

export function recordFailedLoginAttempt(phone: string, ip?: string): { allowed: boolean; retryAfterSeconds?: number } {
  const key = throttleKey(phone, ip);
  const now = Date.now();
  const record = attempts.get(key);

  if (!record || (now - record.firstAttemptAt > WINDOW_MS)) {
    attempts.set(key, { count: 1, firstAttemptAt: now });
    return { allowed: true };
  }

  record.count += 1;
  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.blockedUntil = now + BLOCK_DURATION_MS;
    const retryAfterSeconds = Math.ceil(BLOCK_DURATION_MS / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  return { allowed: true };
}

export function clearLoginThrottle(phone: string, ip?: string): void {
  const key = throttleKey(phone, ip);
  attempts.delete(key);
}
