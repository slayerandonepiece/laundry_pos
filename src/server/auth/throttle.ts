import { normalizePhone } from '@/lib/contactValidation';
import { prisma } from '@/server/db';
import 'server-only';

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_DURATION_MS = 15 * 60 * 1000;

function throttleKey(phone: string, ip?: string): string {
  const cleanUser = normalizePhone(phone);
  const cleanIp = (ip ?? '').trim();
  return `${cleanUser}:${cleanIp}`;
}

type ThrottleResult = { allowed: boolean; retryAfterSeconds?: number };
type ThrottleRow = { count: number; blockedUntil: Date | null };

// Authentication stays available if the throttle store is unavailable. Log the
// failure, but never turn a correct login or password change into a 500.
async function failOpen<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.error('Auth throttle database error:', error);
    return fallback;
  }
}

function resultFor(row: ThrottleRow | null): ThrottleResult {
  const remaining = row?.blockedUntil ? row.blockedUntil.getTime() - Date.now() : 0;
  return remaining > 0 ? { allowed: false, retryAfterSeconds: Math.ceil(remaining / 1000) } : { allowed: true };
}

async function checkKey(key: string): Promise<ThrottleResult> {
  return failOpen(async () => resultFor(await prisma.authThrottle.findUnique({ where: { key } })), { allowed: true });
}

async function recordFailure(key: string): Promise<ThrottleResult> {
  return failOpen(async () => {
    const now = new Date();
    const windowStart = new Date(now.getTime() - WINDOW_MS);
    const blockEnd = new Date(now.getTime() + BLOCK_DURATION_MS);
    // One UPSERT atomically increments the row, even for concurrent failures.
    const rows = await prisma.$queryRaw<ThrottleRow[]>`
      INSERT INTO "auth_throttle" ("key", "count", "windowStartedAt", "blockedUntil", "updatedAt")
      VALUES (${key}, 1, ${now}, NULL, ${now})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "auth_throttle"."windowStartedAt" < ${windowStart}
            OR ("auth_throttle"."blockedUntil" IS NOT NULL AND "auth_throttle"."blockedUntil" <= ${now})
          THEN 1 ELSE "auth_throttle"."count" + 1 END,
        "windowStartedAt" = CASE
          WHEN "auth_throttle"."windowStartedAt" < ${windowStart}
            OR ("auth_throttle"."blockedUntil" IS NOT NULL AND "auth_throttle"."blockedUntil" <= ${now})
          THEN ${now} ELSE "auth_throttle"."windowStartedAt" END,
        "blockedUntil" = CASE
          WHEN "auth_throttle"."windowStartedAt" < ${windowStart}
            OR ("auth_throttle"."blockedUntil" IS NOT NULL AND "auth_throttle"."blockedUntil" <= ${now})
          THEN NULL
          WHEN "auth_throttle"."count" + 1 >= ${MAX_FAILED_ATTEMPTS} THEN ${blockEnd}
          ELSE "auth_throttle"."blockedUntil" END,
        "updatedAt" = ${now}
      RETURNING "count", "blockedUntil"
    `;
    if (Math.random() < 0.01) {
      await failOpen(() => prisma.authThrottle.deleteMany({ where: { updatedAt: { lt: new Date(now.getTime() - 86400000) } } }), undefined);
    }
    return resultFor(rows[0] ?? null);
  }, { allowed: true });
}

async function clearKey(key: string): Promise<void> {
  await failOpen(() => prisma.authThrottle.deleteMany({ where: { key } }).then(() => undefined), undefined);
}

export const checkLoginThrottle = (phone: string, ip?: string) => checkKey(throttleKey(phone, ip));
export const recordFailedLoginAttempt = (phone: string, ip?: string) => recordFailure(throttleKey(phone, ip));
export const clearLoginThrottle = (phone: string, ip?: string) => clearKey(throttleKey(phone, ip));

// Password changes remain keyed by user id, separate from phone/IP login attempts.
const passwordChangeKey = (userId: string) => `password-change:${userId}`;
export const checkPasswordChangeThrottle = (userId: string) => checkKey(passwordChangeKey(userId));
export const recordFailedPasswordChange = (userId: string) => recordFailure(passwordChangeKey(userId));
export const clearPasswordChangeThrottle = (userId: string) => clearKey(passwordChangeKey(userId));
