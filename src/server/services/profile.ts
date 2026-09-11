import 'server-only';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { verifyPassword, hashPassword } from '@/server/auth/password';
import { revokeAllSessionsForUser } from '@/server/auth/session';
import { ValidationError } from '@/server/errors';
import type { Profile } from '@/features/admin/admin.types';

type StoreRow = Awaited<ReturnType<typeof prisma.store.findFirstOrThrow>>;

function toDTO(store: StoreRow, ownerName: string): Profile {
  return { name: ownerName, phone: store.phone, email: store.email, store: store.name, address: store.address };
}

export async function getStoreProfile(storeId: string, ownerName: string): Promise<Profile> {
  const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
  return toDTO(store, ownerName);
}

const profileSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().regex(/^\+?[0-9]{10,15}$/, 'Enter a valid phone number with 10 to 15 digits.'),
  email: z.union([z.string().trim().email(), z.literal('')]),
  store: z.string().trim().min(1),
  address: z.string().trim().min(1),
});

export async function saveStoreProfile(storeId: string, input: unknown, ownerId: string): Promise<Profile> {
  const data = profileSchema.parse(input);
  const [store] = await prisma.$transaction([
    prisma.store.update({
      where: { id: storeId },
      data: { name: data.store, phone: data.phone, email: data.email, address: data.address },
    }),
    // Keep the owner's login display name in sync with the profile name shown in the UI.
    prisma.user.update({ where: { id: ownerId }, data: { name: data.name } }),
  ]);
  return toDTO(store, data.name);
}

const newPasswordSchema = z.string().min(8, 'New password must be at least 8 characters.');

export async function changeUserPassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found.');

  const valid = await verifyPassword(oldPassword, user.passwordHash);
  if (!valid) throw new ValidationError('Current password is incorrect.');

  const result = newPasswordSchema.safeParse(newPassword);
  if (!result.success) throw new ValidationError(result.error.issues[0].message);

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash, credentialVersion: { increment: 1 }, mustChangePassword: false } });
  await revokeAllSessionsForUser(userId);
}

export async function changeOwnerPassword(ownerId: string, oldPassword: string, newPassword: string): Promise<void> {
  return changeUserPassword(ownerId, oldPassword, newPassword);
}

export async function setUserPassword(userId: string, newPassword: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found.');
  if (!user.mustChangePassword) throw new ValidationError('Password change not required.');

  const result = newPasswordSchema.safeParse(newPassword);
  if (!result.success) throw new ValidationError(result.error.issues[0].message);

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash, credentialVersion: { increment: 1 }, mustChangePassword: false } });
  await revokeAllSessionsForUser(userId);
}
