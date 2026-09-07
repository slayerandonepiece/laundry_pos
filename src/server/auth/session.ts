import 'server-only';
import { cookies } from 'next/headers';
import { prisma } from '@/server/db';
import type { Role } from '@/generated/prisma/client';

const COOKIE_NAME = 'el_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionUser {
  id: string;
  name: string;
  username: string;
  role: Role;
}

export async function createSession(userId: string, credentialVersion: number): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const session = await prisma.session.create({ data: { userId, credentialVersion, expiresAt } });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, session.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

// Returns null for any invalid session (missing cookie, expired, deactivated
// user, or stale credentialVersion after a password change/deactivation).
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(COOKIE_NAME)?.value;
  if (!sessionId) return null;

  const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt < new Date()) return null;
  if (!session.user.active) return null;
  if (session.credentialVersion !== session.user.credentialVersion) return null;

  return { id: session.user.id, name: session.user.name, username: session.user.username, role: session.user.role };
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(COOKIE_NAME)?.value;
  if (sessionId) {
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => undefined);
  }
  cookieStore.delete(COOKIE_NAME);
}

// Call when a user is deactivated or their credentialVersion is bumped
// (e.g. password change) so every existing session for them stops working.
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

export class AuthError extends Error {
  constructor(public readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN') {
    super(code);
  }
}

export async function requireSession(role?: Role): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new AuthError('UNAUTHENTICATED');
  if (role && session.role !== role) throw new AuthError('FORBIDDEN');
  return session;
}
