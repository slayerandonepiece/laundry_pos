/** Shared utility helpers for the super-admin feature area. */

import type { StoreListItem } from './types';

/** Returns 1–2 uppercase initials from a display name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || name.slice(0, 2).toUpperCase();
}

/** Badge label + CSS tone class for each organisation payment state. */
export const PAYMENT_STATE_BADGE: Record<StoreListItem['paymentState'], { label: string; cls: string }> = {
  active:   { label: 'Active',       cls: 'good' },
  expiring: { label: 'Expiring',     cls: 'warm' },
  locked:   { label: 'Locked',       cls: 'bad'  },
  unset:    { label: 'Terms not set', cls: 'gray' },
};

/**
 * Returns the number of whole days between two YYYY-MM-DD strings.
 * Positive = future, negative = past.
 */
export function daysUntil(dateStr: string, fromStr: string): number {
  return Math.round(
    (new Date(dateStr + 'T12:00:00').getTime() - new Date(fromStr + 'T12:00:00').getTime()) / 86_400_000
  );
}

/** Formats a Date object or string into a display date (e.g. "19 Sep 2026"). */
export function formatDisplayDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date.includes('T') ? date : date + 'T12:00:00') : date;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
