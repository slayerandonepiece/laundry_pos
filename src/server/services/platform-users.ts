import 'server-only';
import { normalizePhone, isValidPhone } from '@/lib/contactValidation';
import crypto from 'node:crypto';
import { z } from 'zod';
import { revalidateTag } from 'next/cache';
import { prisma } from '@/server/db';
import { hashPassword } from '@/server/auth/password';
import { revokeAllSessionsForUser } from '@/server/auth/session';
import { ValidationError } from '@/server/errors';
import type { CreateUserInput, PlatformUserDetail, PlatformUserListItem, ResetPasswordInput, UpdateUserInput } from '@/features/super-admin/types';

type UserRow = Awaited<ReturnType<typeof findAllUsers>>[number];

// Memberships to an archived (soft-deleted) store are excluded — that store
// no longer grants access (see requireStoreSession's deletedAt check), so
// showing it here would misrepresent a user as still having live access.
function findAllUsers() {
  return prisma.user.findMany({
    where: { isSuperAdmin: false },
    include: { memberships: { where: { store: { deletedAt: null } }, include: { store: true }, orderBy: { createdAt: 'asc' } } },
    orderBy: { name: 'asc' },
  });
}

function toDTO(row: UserRow): PlatformUserListItem {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    memberships: row.memberships.map(m => ({ storeId: m.storeId, storeName: m.store.name, role: m.role })),
    email: row.email ?? undefined,
    phone: row.phone,
  };
}

export async function listStoreMembers(storeId: string): Promise<{ userId: string; name: string; phone: string; active: boolean; role: 'OWNER' | 'EMPLOYEE' }[]> {
  const rows = await prisma.storeMembership.findMany({
    where: { storeId },
    select: { userId: true, active: true, role: true, user: { select: { name: true, phone: true } } },
    orderBy: { createdAt: 'asc' },
  });
  // active here is the per-store StoreMembership flag (see Item 1 in
  // .agents/2026-09-brainstorm-plan.md) — not m.user.active, which is the
  // separate platform-level flag Super Admin's own deactivate/reactivate
  // (setUserActive below) still controls.
  return rows.map(m => ({ userId: m.userId, name: m.user.name, phone: m.user.phone, active: m.active, role: m.role }));
}

export async function listUsers(): Promise<PlatformUserListItem[]> {
  const rows = await findAllUsers();
  return rows.map(toDTO);
}

export async function getUser(userId: string): Promise<PlatformUserDetail | null> {
  const row = await prisma.user.findFirst({
    where: { id: userId, isSuperAdmin: false },
    include: { memberships: { where: { store: { deletedAt: null } }, include: { store: true }, orderBy: { createdAt: 'asc' } } },
  });
  if (!row) return null;
  const lastSession = await prisma.session.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
  return { ...toDTO(row), lastSignInAt: lastSession?.createdAt.toISOString() };
}


const roleSchema = z.enum(['OWNER', 'EMPLOYEE']);

const createUserSchema = z
  .object({
    name: z.string().trim().min(1),

    password: z.string().min(8),
    email: z.string().trim().default(''),
    phone: z.string().transform(normalizePhone).refine(isValidPhone, 'Enter a valid phone number (8–15 digits).'),
    storeId: z.string().min(1).optional(),
    role: roleSchema.optional(),
  })
  .refine(data => !data.storeId || data.role, { message: 'Choose a role for the selected store.', path: ['role'] });

export async function createUser(input: CreateUserInput): Promise<PlatformUserListItem> {
  const data = createUserSchema.parse(input);
  const existing = await prisma.user.findUnique({ where: { phone: data.phone } });
  if (existing) throw new ValidationError('This phone number is already registered.');

  if (data.storeId) {
    const store = await prisma.store.findUnique({ where: { id: data.storeId } });
    if (!store || store.deletedAt) throw new ValidationError('Store not found.');
  }

  const passwordHash = await hashPassword(data.password);
  const userId = await prisma.$transaction(async tx => {
    const user = await tx.user.create({
      data: {
        name: data.name,
        passwordHash,
        email: data.email || null,
        phone: data.phone,
      },
    });
    if (data.storeId && data.role) {
      await tx.storeMembership.create({ data: { userId: user.id, storeId: data.storeId, role: data.role } });
    }
    return user.id;
  });

  revalidateTag('stores', { expire: 0 });
  revalidateTag('employees', { expire: 0 });
  const created = await getUser(userId);
  if (!created) throw new Error('User not found after creation.');
  return created;
}

const updateUserSchema = z
  .object({
    name: z.string().trim().min(1),

    storeId: z.string().min(1).optional(),
    role: roleSchema.optional(),
    // Global to the person, distinct from a Store's own email/phone.
    email: z.string().trim().default(''),
    phone: z.string().transform(normalizePhone).refine(isValidPhone, 'Enter a valid phone number (8–15 digits).'),
  })
  .refine(data => !data.storeId || data.role, { message: 'Choose a role for the selected store.', path: ['role'] });

// This screen models "at most one store" per user (see USERS-IMPLEMENTATION.md's
// open decision — a second store is assigned from that store's own onboarding
// flow, not here). Changing the store/role here replaces every membership this
// user has, rather than merging — deliberate, not an oversight.
export async function updateUser(userId: string, input: UpdateUserInput): Promise<PlatformUserDetail> {
  const data = updateUserSchema.parse(input);
  const existing = await prisma.user.findFirst({ where: { id: userId, isSuperAdmin: false } });
  if (!existing) throw new ValidationError('User not found.');

  const phoneChanged = data.phone !== existing.phone;
  if (phoneChanged) {
    const conflict = await prisma.user.findUnique({ where: { phone: data.phone } });
    if (conflict) throw new ValidationError('This phone number is already registered.');
  }

  if (data.storeId) {
    const store = await prisma.store.findUnique({ where: { id: data.storeId } });
    if (!store || store.deletedAt) throw new ValidationError('Store not found.');
  }

  await prisma.$transaction(async tx => {
    await tx.user.update({ where: { id: userId }, data: { name: data.name, email: data.email || null, phone: data.phone, credentialVersion: phoneChanged ? { increment: 1 } : undefined } });
    await tx.storeMembership.deleteMany({ where: { userId } });
    if (data.storeId && data.role) {
      await tx.storeMembership.create({ data: { userId, storeId: data.storeId, role: data.role } });
    }
  });

  if (phoneChanged) await revokeAllSessionsForUser(userId);
  revalidateTag('stores', { expire: 0 });
  revalidateTag('employees', { expire: 0 });
  const updated = await getUser(userId);
  if (!updated) throw new Error('User not found after update.');
  return updated;
}

function generatePassword(): string {
  return crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 12);
}

const resetPasswordSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('auto') }),
  z.object({ mode: z.literal('manual'), password: z.string().min(8) }),
]);

export async function resetUserPassword(userId: string, input: ResetPasswordInput): Promise<{ password?: string }> {
  const data = resetPasswordSchema.parse(input);
  const existing = await prisma.user.findFirst({ where: { id: userId, isSuperAdmin: false } });
  if (!existing) throw new ValidationError('User not found.');

  const password = data.mode === 'auto' ? generatePassword() : data.password;
  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash, credentialVersion: { increment: 1 }, mustChangePassword: true } });
  await revokeAllSessionsForUser(userId);

  return data.mode === 'auto' ? { password } : {};
}

export async function setUserActive(userId: string, active: boolean): Promise<PlatformUserDetail> {
  const existing = await prisma.user.findFirst({ where: { id: userId, isSuperAdmin: false } });
  if (!existing) throw new ValidationError('User not found.');
  await prisma.user.update({ where: { id: userId }, data: { active, credentialVersion: { increment: 1 } } });
  await revokeAllSessionsForUser(userId);
  revalidateTag('stores', { expire: 0 });
  revalidateTag('employees', { expire: 0 });
  const updated = await getUser(userId);
  if (!updated) throw new Error('User not found after update.');
  return updated;
}
