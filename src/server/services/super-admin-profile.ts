import 'server-only';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/server/db';
import { ValidationError } from '@/server/errors';
import { normalizePhone, isValidPhone } from '@/lib/contactValidation';
import { revokeAllSessionsForUser } from '@/server/auth/session';

const selection = { name: true, phone: true, email: true } as const;
const schema = z.object({
  name: z.string().trim().min(2, 'Enter a name with at least 2 characters.'),
  phone: z.string().transform(normalizePhone).refine(isValidPhone, 'Enter a valid phone number (8–15 digits).'),
  email: z.union([z.string().trim().email('Enter a valid email address.'), z.literal('')]),
});

export async function getSuperAdminProfile(userId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, isSuperAdmin: true, active: true }, select: selection });
  if (!user) throw new ValidationError('Super Admin account not found.');
  return user;
}

export async function saveSuperAdminProfile(userId: string, input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  const data = parsed.data;
  const current = await getSuperAdminProfile(userId);
  const phoneChanged = current.phone !== data.phone;
  try {
    const profile = await prisma.user.update({
      where: { id: userId, isSuperAdmin: true, active: true },
      data: { ...data, email: data.email || null, credentialVersion: phoneChanged ? { increment: 1 } : undefined },
      select: selection,
    });
    if (phoneChanged) await revokeAllSessionsForUser(userId);
    return { profile, signInAgain: phoneChanged };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ValidationError('This phone number is already registered.');
    }
    throw error;
  }
}
