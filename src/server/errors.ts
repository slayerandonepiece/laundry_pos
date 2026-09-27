import 'server-only';

// Thrown by services for expected, user-facing validation failures (e.g. a
// duplicate phone, a wrong current password). Server Actions catch this
// specifically and return { ok: false, error: message } as plain data, so the
// message reaches the client reliably regardless of how the framework
// handles thrown-error messages across the server/client boundary.
export class ValidationError extends Error {}
