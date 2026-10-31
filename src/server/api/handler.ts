import 'server-only';
import { createHash } from 'node:crypto';
import { ZodError } from 'zod';
import {
  AuthError,
  getSessionFromRequest,
  requireStoreSession,
  requireOutletSession,
  requireSuperAdmin,
  type StoreSession,
  type OutletSession,
  type SessionUser,
  type StoreSessionOptions,
} from '@/server/auth/session';
import { headers as nextHeaders } from 'next/headers';
import { after } from 'next/server';
import { getUpdateAdvice, needsUpdateConfigRefresh, refreshUpdateConfig } from '@/server/services/app-update-settings';
import { ConflictError, ValidationError } from '@/server/errors';
import { getPendingDeletion } from '@/server/services/account-deletion';
import { isKnownSafeMessage } from '@/server/api/public-errors';
import type { Role } from '@/generated/prisma/client';

export function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
    },
  });
}

export function formatApiError(error: unknown): Response {
  if (error instanceof AuthError) {
    if (error.code === 'UNAUTHENTICATED') {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    if (error.code === 'FORBIDDEN') {
      return jsonResponse({ error: 'Forbidden', reason: error.reason }, 403);
    }
  }

  if (error instanceof ConflictError) {
    return jsonResponse({ error: error.message }, 409);
  }

  if (error instanceof ValidationError) {
    return jsonResponse({ error: error.message }, 400);
  }

  if (error instanceof ZodError) {
    const message = error.issues.map(i => i.message).join(', ') || 'Validation error';
    return jsonResponse({ error: message, issues: error.issues }, 400);
  }

  if (error instanceof SyntaxError) {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  if (error instanceof Error && error.name === 'Error') {
    if (isKnownSafeMessage(error.message)) {
      const status = error.message.endsWith('not found.') ? 404 : 400;
      return jsonResponse({ error: error.message }, status);
    }
  }

  console.error('API 500 error:', error);
  return jsonResponse({ error: 'Internal server error' }, 500);
}

export function resolveStoreIdFromRequest(req: Request): string | undefined {
  const header = req.headers.get('x-store-id') ?? req.headers.get('X-Store-Id');
  if (header?.trim()) return header.trim();
  try {
    const url = new URL(req.url);
    const query = url.searchParams.get('storeId');
    if (query?.trim()) return query.trim();
  } catch {
    // ignore
  }
  return undefined;
}

export function resolveOutletIdFromRequest(req: Request): string | undefined {
  const header = req.headers.get('x-outlet-id') ?? req.headers.get('X-Outlet-Id');
  if (header?.trim()) return header.trim();
  try {
    const url = new URL(req.url);
    const query = url.searchParams.get('outletId');
    if (query?.trim()) return query.trim();
  } catch {
    // ignore
  }
  return undefined;
}

// A mobile (bearer) session whose user must still set a new password may only
// reach the endpoints that pass allowMustChangePassword (status, set/change
// password, logout); every other API route refuses it here.
//
// A user with a PENDING account-deletion request may only reach the endpoints
// that pass allowDeletionPending (/auth/*, /account/deletion/*); everything
// else answers 403 'deletion_pending' until they restore.
export async function requireApiAuth(
  req: Request,
  options?: { allowMustChangePassword?: boolean; allowDeletionPending?: boolean },
): Promise<SessionUser> {
  const session = await getSessionFromRequest(req);
  if (!session) throw new AuthError('UNAUTHENTICATED');
  if (session.mustChangePassword && !options?.allowMustChangePassword) {
    throw new AuthError('FORBIDDEN', 'must_change_password');
  }
  if (!options?.allowDeletionPending && await getPendingDeletion(session.id)) {
    throw new AuthError('FORBIDDEN', 'deletion_pending');
  }
  return session;
}

export async function requireApiSuperAdmin(req: Request): Promise<SessionUser> {
  const session = await requireApiAuth(req);
  return requireSuperAdmin(session);
}

export async function requireApiStoreSession(
  req: Request,
  role?: Role,
  options?: StoreSessionOptions,
): Promise<StoreSession> {
  const session = await requireApiAuth(req);
  const storeId = resolveStoreIdFromRequest(req);
  return requireStoreSession(storeId, role, session, options);
}

export async function requireApiOutletSession(
  req: Request,
  role?: Role,
  options?: StoreSessionOptions,
): Promise<OutletSession> {
  const session = await requireApiAuth(req);
  const storeId = resolveStoreIdFromRequest(req);
  const outletId = resolveOutletIdFromRequest(req);
  if (!outletId) {
    throw new AuthError('FORBIDDEN');
  }
  return requireOutletSession(storeId, outletId, role, session, options);
}

async function runApiRoute(
  handler: () => Promise<Response>,
  options?: { request: Request; cacheTtlSeconds: number },
): Promise<Response> {
  try {
    const res = await handler();
    if (options?.request.method === 'GET' && res.ok && Number.isSafeInteger(options.cacheTtlSeconds) && options.cacheTtlSeconds > 0) {
      res.headers.set('Cache-Control', `private, max-age=${options.cacheTtlSeconds}`);
      const vary = new Set((res.headers.get('Vary') ?? '').split(',').map(value => value.trim()).filter(Boolean));
      for (const header of ['Authorization', 'Cookie', 'X-Store-Id', 'X-Outlet-Id']) vary.add(header);
      res.headers.set('Vary', [...vary].join(', '));
      if (res.headers.get('Content-Type')?.includes('application/json')) {
        const bodyText = await res.clone().text();
        const etag = `W/"${createHash('sha1').update(bodyText).digest('hex').slice(0, 12)}"`;
        res.headers.set('ETag', etag);
        const candidates = options.request.headers.get('If-None-Match')?.split(',').map(value => value.trim().replace(/^W\//, '')) ?? [];
        if (candidates.includes('*') || candidates.includes(etag.replace(/^W\//, ''))) {
          return new Response(null, { status: 304, headers: res.headers });
        }
      }
    } else if (!res.headers.has('Cache-Control')) {
      res.headers.set('Cache-Control', 'private, no-store');
    }
    return res;
  } catch (error) {
    return formatApiError(error);
  }
}

// Advisory only: tells the mobile app whether a newer build is wanted. It must
// never change a response's status or body, delay it, or throw — any failure
// means no header. Every /api/v1 route goes through handleApiRoute, so this is the
// single place the header is added (success, error, 304 and 204 alike).
// The level comes from an in-memory snapshot; a stale snapshot is refreshed
// after the response is sent, so no request ever waits on the database.
function refreshUpdateConfigAfterResponse(): void {
  try {
    if (!needsUpdateConfigRefresh()) return;
    try {
      after(() => refreshUpdateConfig());
    } catch {
      // Outside a request scope (scripts, tests): refresh in the background.
      void refreshUpdateConfig();
    }
  } catch {
    // Advisory only: a scheduling failure must never reach the caller.
  }
}

function setUpdateHeaders(res: Response, advice: { level: string; minVersion: string | null }): void {
  res.headers.set('X-Update-Level', advice.level);
  if (advice.minVersion) res.headers.set('X-Update-Min-Version', advice.minVersion);
}

async function withUpdateLevel(res: Response, request?: Request): Promise<Response> {
  let advice: ReturnType<typeof getUpdateAdvice> = null;
  try {
    const h = request?.headers ?? (await nextHeaders());
    advice = getUpdateAdvice(h.get('x-app-platform'), h.get('x-app-version'));
  } catch {
    advice = null;
  }
  refreshUpdateConfigAfterResponse();
  // No snapshot yet (cold instance) or any failure: send nothing. The app reads
  // a missing header as "no information" and keeps what it already knows.
  if (!advice) return res;
  try {
    setUpdateHeaders(res, advice);
    return res;
  } catch {
    try {
      const copy = new Response(res.body, res);
      setUpdateHeaders(copy, advice);
      return copy;
    } catch {
      return res;
    }
  }
}

export async function handleApiRoute(
  handler: () => Promise<Response>,
  options?: { request: Request; cacheTtlSeconds: number },
): Promise<Response> {
  return withUpdateLevel(await runApiRoute(handler, options), options?.request);
}
