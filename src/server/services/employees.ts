import 'server-only';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { hashPassword } from '@/server/auth/password';
import { revokeAllSessionsForUser } from '@/server/auth/session';
import { ValidationError } from '@/server/errors';
import type { Employee } from '@/features/admin/admin.types';

type UserRow = Awaited<ReturnType<typeof prisma.user.findFirstOrThrow>>;

function toDTO(row: UserRow): Employee {
  return { id: row.id, name: row.name, username: row.username, active: row.active, credentialVersion: row.credentialVersion };
}

export async function listEmployees(): Promise<Employee[]> {
  const rows = await prisma.user.findMany({ where: { role: 'EMPLOYEE' }, orderBy: { createdAt: 'asc' } });
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

export async function createEmployee(input: unknown): Promise<Employee> {
  const data = createEmployeeSchema.parse(input);
  const existing = await prisma.user.findUnique({ where: { username: data.username } });
  if (existing) throw new ValidationError('This username is already in use. Choose another.');

  const passwordHash = await hashPassword(data.password);
  const row = await prisma.user.create({ data: { name: data.name, username: data.username, passwordHash, role: 'EMPLOYEE', active: data.active } });
  return toDTO(row);
}

const updateEmployeeSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  username: usernameSchema,
  password: z.union([z.string().min(8), z.literal('')]).optional(),
  active: z.boolean(),
});

export async function updateEmployee(input: unknown): Promise<Employee> {
  const data = updateEmployeeSchema.parse(input);
  const current = await prisma.user.findUnique({ where: { id: data.id } });
  if (!current || current.role !== 'EMPLOYEE') throw new Error('Employee not found.');

  const usernameChanged = data.username !== current.username;
  if (usernameChanged) {
    const conflict = await prisma.user.findUnique({ where: { username: data.username } });
    if (conflict) throw new ValidationError('This username is already in use. Choose another.');
  }

  const passwordChanged = Boolean(data.password);
  const activeChanged = data.active !== current.active;
  const credentialsChanged = usernameChanged || passwordChanged || activeChanged;
  const passwordHash = passwordChanged ? await hashPassword(data.password!) : undefined;

  const row = await prisma.user.update({
    where: { id: data.id },
    data: {
      name: data.name,
      username: data.username,
      active: data.active,
      passwordHash,
      credentialVersion: credentialsChanged ? { increment: 1 } : undefined,
    },
  });

  if (credentialsChanged) await revokeAllSessionsForUser(row.id);
  return toDTO(row);
}

export async function toggleEmployeeActive(id: string): Promise<Employee> {
  const current = await prisma.user.findUnique({ where: { id } });
  if (!current || current.role !== 'EMPLOYEE') throw new Error('Employee not found.');

  const row = await prisma.user.update({ where: { id }, data: { active: !current.active, credentialVersion: { increment: 1 } } });
  await revokeAllSessionsForUser(row.id);
  return toDTO(row);
}
