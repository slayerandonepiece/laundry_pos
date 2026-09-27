import 'server-only';

// Order/payment/expense "dates" are Asia/Kolkata calendar days (e.g. "2026-09-07"),
// stored as Postgres DATE columns with no time component. Parse/format through
// UTC midnight so no server timezone can shift the day by re-interpreting it.

export function parseCalendarDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid calendar date: ${value}`);
  const date = new Date(`${value}T00:00:00.000Z`);
  // Date silently rolls invalid days forward (e.g. Feb 31 -> Mar 3); reject anything
  // that doesn't round-trip back to the exact input instead of accepting it.
  if (formatCalendarDate(date) !== value) throw new Error(`Invalid calendar date: ${value}`);
  return date;
}

export function formatCalendarDate(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

// Today's calendar date in Asia/Kolkata, matching admin.data.ts's today().
export function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// Adds a number of calendar days to a 'YYYY-MM-DD' date, returning the same
// format. Shared by the payment-lapse warning window (session.ts/actions.ts)
// and stores.ts's own "expiring soon" window — same date math, one place.
export function addDays(date: string, days: number): string {
  return formatCalendarDate(new Date(parseCalendarDate(date).getTime() + days * 86400000));
}
