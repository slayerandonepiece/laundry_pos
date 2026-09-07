import 'server-only';

// Order/payment/expense "dates" are Asia/Kolkata calendar days (e.g. "2026-09-07"),
// stored as Postgres DATE columns with no time component. Parse/format through
// UTC midnight so no server timezone can shift the day by re-interpreting it.

export function parseCalendarDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid calendar date: ${value}`);
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatCalendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

// Today's calendar date in Asia/Kolkata, matching admin.data.ts's today().
export function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
