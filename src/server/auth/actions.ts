'use server';

import type { Role } from '@/generated/prisma/client';
import { prisma } from '@/server/db';
import { verifyPassword } from './password';
import { createSession, destroySession } from './session';

export interface LoginResult {
  ok: boolean;
  error?: string;
  user?: { id: string; name: string; role: Role };
}

export async function loginAction(username: string, password: string): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { username: username.trim().toLowerCase() } });
  if (!user || !user.active) return { ok: false, error: 'Invalid username or password' };

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return { ok: false, error: 'Invalid username or password' };

  await createSession(user.id, user.credentialVersion);
  return { ok: true, user: { id: user.id, name: user.name, role: user.role } };
}

export async function logoutAction(): Promise<void> {
  await destroySession();
}
