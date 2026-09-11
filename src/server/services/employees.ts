import 'server-only';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { hashPassword } from '@/server/auth/password';
import { revokeAllSessionsForUser } from '@/server/auth/session';
import { ValidationError } from '@/server/errors';
import type { Employee } from '@/features/admin/admin.types';

type MembershipRow = Awaited<ReturnType<typeof findAll>>[number];

function findAll(storeId: string) {
  return prisma.storeMembership.findMany({
    where: { storeId, role: 'EMPLOYEE' },
    include: { user: true },
    orderBy: { createdAt: 'asc' },
  });
}

// active is the per-store StoreMembership flag, not the global User row —
// an employee can be deactivated here without touching their access at any
// other store they may (per stale-membership policy) still hold. See
// .agents/2026-09-brainstorm-plan.md Item 1.
function toDTO(row: MembershipRow): Employee {
  return { id: row.user.id, name: row.user.name, username: row.user.username, active: row.active, credentialVersion: row.user.credentialVersion };
}

export async function listEmployees(storeId: string): Promise<Employee[]> {
  const rows = await findAll(storeId);
  return rows.map(toDTO);
}

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,40}$/, 'Enter a username with 3–40 letters, numbers, dots, underscores or hyphens.');

const createEmployeeSchema = z.object({
  name: z.string().trim().min(1),
  username: usernameSchema,
  password: z.string().min(8),
  active: z.boolean(),
});

export async function createEmployee(storeId: string, input: unknown): Promise<Employee> {
  const data = createEmployeeSchema.parse(input);
  const existing = await prisma.user.findUnique({ where: { username: data.username } });
  if (existing) throw new ValidationError('This username is already in use. Choose another.');

  const passwordHash = await hashPassword(data.password);
  const row = await prisma.$transaction(async tx => {
    // The User row itself is always created active — "active" as entered on
    // this form is this store's membership flag, not a platform-wide state.
    const user = await tx.user.create({ data: { name: data.name, username: data.username, passwordHash, mustChangePassword: true } });
    return tx.storeMembership.create({ data: { role: 'EMPLOYEE', storeId, userId: user.id, active: data.active }, include: { user: true } });
  });
  return toDTO(row);
}

const updateEmployeeSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  username: usernameSchema,
  password: z.union([z.string().min(8), z.literal('')]).optional(),
  active: z.boolean(),
});

export async function updateEmployee(storeId: string, input: unknown): Promise<Employee> {
  const data = updateEmployeeSchema.parse(input);
  const membership = await prisma.storeMembership.findUnique({
    where: { userId_storeId: { userId: data.id, storeId } },
    include: { user: true },
  });
  if (!membership || membership.role !== 'EMPLOYEE') throw new Error('Employee not found.');
  const current = membership.user;

  const usernameChanged = data.username !== current.username;
  if (usernameChanged) {
    const conflict = await prisma.user.findUnique({ where: { username: data.username } });
    if (conflict) throw new ValidationError('This username is already in use. Choose another.');
  }

  const passwordChanged = Boolean(data.password);
  // Only username/password are real credential changes — bumping
  // credentialVersion for those still force-logs-out any live session
  // everywhere (correct: it's the same login at every store). The active
  // flag below is store-scoped and deliberately does NOT touch credentials
  // or sessions at all — see requireStoreSession's live membership check,
  // which is what actually enforces per-store access now.
  const credentialsChanged = usernameChanged || passwordChanged;
  const passwordHash = passwordChanged ? await hashPassword(data.password!) : undefined;

  const [user, updatedMembership] = await prisma.$transaction([
    prisma.user.update({
      where: { id: data.id },
      data: {
        name: data.name,
        username: data.username,
        passwordHash,
        credentialVersion: credentialsChanged ? { increment: 1 } : undefined,
        mustChangePassword: passwordChanged ? true : undefined,
      },
    }),
    prisma.storeMembership.update({ where: { userId_storeId: { userId: data.id, storeId } }, data: { active: data.active } }),
  ]);

  if (credentialsChanged) await revokeAllSessionsForUser(user.id);
  return { id: user.id, name: user.name, username: user.username, active: updatedMembership.active, credentialVersion: user.credentialVersion };
}

// Deliberately store-scoped: flips this store's StoreMembership.active only.
// Does not touch User.active, credentialVersion, or any session — a
// deactivation here must not affect this person's access at any other store
// they belong to, and access at *this* store is withheld live by
// requireStoreSession() checking the membership, not by killing a session.
export async function toggleEmployeeActive(storeId: string, id: string): Promise<Employee> {
  const membership = await prisma.storeMembership.findUnique({
    where: { userId_storeId: { userId: id, storeId } },
    include: { user: true },
  });
  if (!membership || membership.role !== 'EMPLOYEE') throw new Error('Employee not found.');

  const updated = await prisma.storeMembership.update({
    where: { userId_storeId: { userId: id, storeId } },
    data: { active: !membership.active },
    include: { user: true },
  });
  return toDTO(updated);
}
