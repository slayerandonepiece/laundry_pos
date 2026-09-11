import 'server-only';
import { ZodError } from 'zod';
import { AuthError, getSessionFromRequest, requireStoreSession, type StoreSession, type SessionUser } from '@/server/auth/session';
import { ValidationError } from '@/server/errors';
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
    const knownSafeMessages = [
      'Order not found.',
      'A selected service is no longer available.',
      'Enter a whole number of pieces.',
      'Combine repeated services into one line.',
      'Payment must be between zero and the order total.',
      'That payment method is no longer available.',
      'Payment must be a positive amount.',
      'Payment must be no more than the outstanding balance.',
      'Invalid status.',
      'Product not found.',
      'Expense not found.',
      'Employee not found.',
      'User not found.',
    ];
    if (knownSafeMessages.includes(error.message) || error.message.startsWith('Payment must') || error.message.endsWith('not found.')) {
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

export async function requireApiAuth(req: Request): Promise<SessionUser> {
  const session = await getSessionFromRequest(req);
  if (!session) throw new AuthError('UNAUTHENTICATED');
  return session;
}

export async function requireApiStoreSession(req: Request, role?: Role): Promise<StoreSession> {
  const session = await requireApiAuth(req);
  const storeId = resolveStoreIdFromRequest(req);
  return requireStoreSession(storeId, role, session);
}

export async function handleApiRoute(handler: () => Promise<Response>): Promise<Response> {
  try {
    const res = await handler();
    if (!res.headers.has('Cache-Control')) {
      res.headers.set('Cache-Control', 'private, no-store');
    }
    return res;
  } catch (error) {
    return formatApiError(error);
  }
}
