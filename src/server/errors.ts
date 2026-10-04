import 'server-only';

// Thrown by services for expected, user-facing validation failures (e.g. a
// duplicate phone, a wrong current password). Server Actions catch this
// specifically and return { ok: false, error: message } as plain data, so the
// message reaches the client reliably regardless of how the framework
// handles thrown-error messages across the server/client boundary.
export class ValidationError extends Error {}

// Thrown when a request is well-formed but conflicts with current state (e.g.
// restoring when nothing is pending). The mobile API answers these with 409.
export class ConflictError extends Error {}
