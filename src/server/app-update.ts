// App-update advisory: computes the X-Update-Level response header from the
// X-App-Platform / X-App-Version request headers. Pure logic lives here so it
// is testable without a database; the DB-backed config loader is in
// services/app-update-settings.ts. Nothing in this file may throw.

export type UpdateLevel = 'none' | 'soft' | 'urgent';
export type AppPlatform = 'ios' | 'android';
export interface UpdateThresholds {
  softMinVersion?: string | null;
  urgentMinVersion?: string | null;
}
export type UpdateConfig = Partial<Record<AppPlatform, UpdateThresholds>>;

export const APP_PLATFORMS: readonly AppPlatform[] = ['ios', 'android'];

/** Parses "1.2.3" (also "1.2" / "1"; missing parts are 0). Anything else is null. */
export function parseVersion(value: string | null | undefined): [number, number, number] | null {
  const match = /^(\d{1,6})(?:\.(\d{1,6}))?(?:\.(\d{1,6}))?$/.exec((value ?? '').trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function lessThan(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

export interface UpdateAdvice {
  level: UpdateLevel;
  /** The minimum version that triggered the level (urgent or soft); null for none. */
  minVersion: string | null;
}

const NO_ADVICE: UpdateAdvice = { level: 'none', minVersion: null };

export function computeUpdateAdvice(
  platform: string | null | undefined,
  version: string | null | undefined,
  config: UpdateConfig | null | undefined,
): UpdateAdvice {
  try {
    const key = (platform ?? '').trim().toLowerCase();
    if (!APP_PLATFORMS.includes(key as AppPlatform)) return NO_ADVICE;
    const current = parseVersion(version);
    const thresholds = config?.[key as AppPlatform];
    if (!current || !thresholds) return NO_ADVICE;
    const urgent = parseVersion(thresholds.urgentMinVersion);
    if (urgent && lessThan(current, urgent)) {
      return { level: 'urgent', minVersion: (thresholds.urgentMinVersion ?? '').trim() };
    }
    const soft = parseVersion(thresholds.softMinVersion);
    if (soft && lessThan(current, soft)) {
      return { level: 'soft', minVersion: (thresholds.softMinVersion ?? '').trim() };
    }
    return NO_ADVICE;
  } catch {
    return NO_ADVICE;
  }
}

export function computeUpdateLevel(
  platform: string | null | undefined,
  version: string | null | undefined,
  config: UpdateConfig | null | undefined,
): UpdateLevel {
  return computeUpdateAdvice(platform, version, config).level;
}
