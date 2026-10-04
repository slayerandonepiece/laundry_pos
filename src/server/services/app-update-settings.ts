import 'server-only';
import { prisma } from '@/server/db';
import { ValidationError } from '@/server/errors';
import { APP_PLATFORMS, computeUpdateAdvice, parseVersion, type AppPlatform, type UpdateAdvice, type UpdateConfig, type UpdateLevel } from '@/server/app-update';

// Read on every /api/v1 response, so the request path touches memory only:
// one snapshot per server instance, never a database call and never a wait.
// The snapshot is refreshed after a response goes out, at most once per
// REFRESH_MS, with concurrent requests sharing one lookup. A failed or slow
// refresh keeps the last good snapshot (a late result is kept, not dropped).
// A Super Admin save updates the saving instance at once; other instances pick
// the change up on their next refresh.
const REFRESH_MS = 15_000;
const MEMO_MAX = 200;
const MEMO_KEY_MAX = 64;

interface Snapshot {
  at: number;
  config: UpdateConfig;
  key: string;
  advice: Map<string, UpdateAdvice>;
}

let snapshot: Snapshot | null = null;
let nextAttemptAt = 0;
let inflight: Promise<void> | null = null;

function rowsToConfig(rows: { platform: string; softMinVersion: string | null; urgentMinVersion: string | null }[]): UpdateConfig {
  const config: UpdateConfig = {};
  for (const platform of APP_PLATFORMS) {
    const row = rows.find(r => r.platform === platform);
    if (row) config[platform] = { softMinVersion: row.softMinVersion, urgentMinVersion: row.urgentMinVersion };
  }
  return config;
}

/** Only replaces the snapshot when the values changed, so the level memo survives no-op refreshes. */
function apply(config: UpdateConfig): void {
  const key = JSON.stringify(config);
  if (snapshot && snapshot.key === key) {
    snapshot.at = Date.now();
    return;
  }
  snapshot = { at: Date.now(), config, key, advice: new Map() };
}

/** Never rejects. On failure the last good snapshot stays and the next attempt is delayed. */
export function refreshUpdateConfig(): Promise<void> {
  inflight ??= (async () => {
    try {
      apply(rowsToConfig(await prisma.appUpdateSetting.findMany()));
      nextAttemptAt = 0;
    } catch {
      nextAttemptAt = Date.now() + REFRESH_MS;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** True when a refresh should be scheduled now. Cheap: two comparisons. */
export function needsUpdateConfigRefresh(): boolean {
  if (inflight) return false;
  const now = Date.now();
  if (now < nextAttemptAt) return false;
  return !snapshot || now - snapshot.at >= REFRESH_MS;
}

/**
 * The advice for this app, from memory. Never throws. Null means this instance
 * has no snapshot yet, so it has nothing to say: callers must send no level at
 * all rather than "none", which the app would take as "no update needed".
 */
export function getUpdateAdvice(platform: string | null | undefined, version: string | null | undefined): UpdateAdvice | null {
  try {
    const snap = snapshot;
    if (!snap) return null;
    const memoKey = `${platform ?? ''}|${version ?? ''}`;
    if (memoKey.length > MEMO_KEY_MAX) return computeUpdateAdvice(platform, version, snap.config);
    const hit = snap.advice.get(memoKey);
    if (hit) return hit;
    const advice = computeUpdateAdvice(platform, version, snap.config);
    if (snap.advice.size >= MEMO_MAX) snap.advice.clear();
    snap.advice.set(memoKey, advice);
    return advice;
  } catch {
    return null;
  }
}

/** Convenience for tests and callers that only need the level; none when unknown. */
export function getUpdateLevel(platform: string | null | undefined, version: string | null | undefined): UpdateLevel {
  return getUpdateAdvice(platform, version)?.level ?? 'none';
}

export function clearUpdateConfigCache(): void {
  snapshot = null;
  nextAttemptAt = 0;
}

/** Marks the snapshot old so the next request schedules a refresh (tests, manual invalidation). */
export function expireUpdateConfigCache(): void {
  if (snapshot) snapshot.at = 0;
}

export interface AppUpdateSettingDTO {
  platform: AppPlatform;
  softMinVersion: string | null;
  urgentMinVersion: string | null;
}

/** Uncached, for the Super Admin editor. Always returns one entry per platform. */
export async function listAppUpdateSettings(): Promise<AppUpdateSettingDTO[]> {
  const rows = await prisma.appUpdateSetting.findMany();
  return APP_PLATFORMS.map(platform => {
    const row = rows.find(r => r.platform === platform);
    return { platform, softMinVersion: row?.softMinVersion ?? null, urgentMinVersion: row?.urgentMinVersion ?? null };
  });
}

function clean(value: string | null | undefined, label: string): string | null {
  const text = (value ?? '').trim();
  if (!text) return null;
  if (!parseVersion(text)) throw new ValidationError(`${label} must be a version like 1.2.0.`);
  return text;
}

export async function saveAppUpdateSetting(
  input: { platform: string; softMinVersion?: string | null; urgentMinVersion?: string | null },
  updatedById: string,
): Promise<AppUpdateSettingDTO> {
  if (!(APP_PLATFORMS as readonly string[]).includes(input.platform)) {
    throw new ValidationError('Unknown platform.');
  }
  const softMinVersion = clean(input.softMinVersion, 'Soft minimum version');
  const urgentMinVersion = clean(input.urgentMinVersion, 'Urgent minimum version');
  const row = await prisma.appUpdateSetting.upsert({
    where: { platform: input.platform },
    create: { platform: input.platform, softMinVersion, urgentMinVersion, updatedById },
    update: { softMinVersion, urgentMinVersion, updatedById },
  });
  apply(rowsToConfig(await prisma.appUpdateSetting.findMany()));
  nextAttemptAt = 0;
  return { platform: row.platform as AppPlatform, softMinVersion: row.softMinVersion, urgentMinVersion: row.urgentMinVersion };
}
