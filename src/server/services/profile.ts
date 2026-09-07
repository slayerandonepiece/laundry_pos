import 'server-only';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { verifyPassword, hashPassword } from '@/server/auth/password';
import { revokeAllSessionsForUser } from '@/server/auth/session';
import { ValidationError } from '@/server/errors';
import type { Profile } from '@/features/admin/admin.types';

// Single-row table: fixed id so get/save always target the same row.
const STORE_PROFILE_ID = 'main';

type StoreProfileRow = Awaited<ReturnType<typeof prisma.storeProfile.findFirstOrThrow>>;

function toDTO(row: StoreProfileRow): Profile {
  return { name: row.name, phone: row.phone, email: row.email, store: row.store, address: row.address };
}

export async function getStoreProfile(): Promise<Profile> {
  const existing = await prisma.storeProfile.findUnique({ where: { id: STORE_PROFILE_ID } });
  if (existing) return toDTO(existing);

  const owner = await prisma.user.findFirst({ where: { role: 'OWNER' } });
  const created = await prisma.storeProfile.upsert({
    where: { id: STORE_PROFILE_ID },
    update: {},
    create: { id: STORE_PROFILE_ID, name: owner?.name ?? 'Store owner', phone: '', email: '', store: 'Express Laundry', address: '' },
  });
  return toDTO(created);
}

const profileSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().regex(/^\+?[0-9]{10,15}$/, 'Enter a valid phone number with 10 to 15 digits.'),
  email: z.union([z.string().trim().email(), z.literal('')]),
  store: z.string().trim().min(1),
  address: z.string().trim().min(1),
});

export async function saveStoreProfile(input: unknown, ownerId: string): Promise<Profile> {
  const data = profileSchema.parse(input);
  const [row] = await prisma.$transaction([
    prisma.storeProfile.upsert({ where: { id: STORE_PROFILE_ID }, update: data, create: { id: STORE_PROFILE_ID, ...data } }),
    // Keep the owner's login display name in sync with the profile name shown in the UI.
    prisma.user.update({ where: { id: ownerId }, data: { name: data.name } }),
  ]);
  return toDTO(row);
}

export async function changeOwnerPassword(ownerId: string, oldPassword: string, newPassword: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: ownerId } });
  if (!user) throw new Error('User not found.');

  const valid = await verifyPassword(oldPassword, user.passwordHash);
  if (!valid) throw new ValidationError('Current password is incorrect.');

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: ownerId }, data: { passwordHash, credentialVersion: { increment: 1 } } });
  // Invalidates the current session too — the caller should sign the owner
  // out and send them back to /login after this succeeds.
  await revokeAllSessionsForUser(ownerId);
}
