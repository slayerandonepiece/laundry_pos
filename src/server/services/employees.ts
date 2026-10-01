import 'server-only';
import { revalidateTag } from 'next/cache';
import { normalizePhone, isValidPhone } from '@/lib/contactValidation';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { hashPassword } from '@/server/auth/password';
import { revokeAllSessionsForUser, assertStoreWritable } from '@/server/auth/session';
import { ValidationError } from '@/server/errors';
import type { Employee } from '@/features/admin/admin.types';

type MembershipRow = Awaited<ReturnType<typeof findAll>>[number];

function findAll(storeId: string) {
  return prisma.storeMembership.findMany({
    where: { storeId, role: 'EMPLOYEE' },
    include: {
      user: {
        include: {
          outletMemberships: {
            include: { outlet: true }
          }
        }
      }
    },
    orderBy: { createdAt: 'asc' },
  });
}

// active is the per-store StoreMembership flag, not the global User row —
// an employee can be deactivated here without touching their access at any
// other store they may (per stale-membership policy) still hold. See
// .agents/2026-09-brainstorm-plan.md Item 1.
function toDTO(row: MembershipRow): Employee {
  return {
    id: row.user.id,
    name: row.user.name,
    phone: row.user.phone,
    active: row.active,
    credentialVersion: row.user.credentialVersion,
    outlets: row.user.outletMemberships?.map(om => ({ id: om.outlet.id, name: om.outlet.displayName })) || [],
    defaultOutletId: row.user.outletMemberships?.find(om => om.isDefault)?.outletId
  };
}

// Deliberately uncached: revalidateTag only marks a cache entry stale, so the
// first reads after a create/edit would still return the old list — the mobile
// app re-fetches right after saving and showed the pre-save staff. The list is
// small and owner-only.
export async function listEmployees(storeId: string): Promise<Employee[]> {
  const rows = await findAll(storeId);
  return rows.map(toDTO);
}


const createEmployeeSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1),
  phone: z.string().transform(normalizePhone).refine(isValidPhone, 'Enter a valid phone number (8–15 digits).'),
  password: z.string().min(8).max(128),
  active: z.boolean(),
  outlets: z.array(z.string()).optional(),
  defaultOutletId: z.string().optional(),
});

/**
 * The outlets an owner may hand to an employee are their own organization's
 * active ones. Checked before anything is written, so a bad id can neither
 * grant access to another organization's outlet nor leave a half-created
 * employee behind. Returns the ids de-duplicated.
 */
async function assertAssignableOutlets(
  storeId: string,
  outlets: string[],
  defaultOutletId?: string,
): Promise<string[]> {
  const unique = [...new Set(outlets)];
  if (unique.length > 0) {
    const valid = await prisma.outlet.count({
      where: { id: { in: unique }, storeId, status: 'ACTIVE' },
    });
    if (valid !== unique.length) {
      throw new ValidationError('Invalid or inactive outlet for this organization.');
    }
  }
  if (defaultOutletId && !unique.includes(defaultOutletId)) {
    throw new ValidationError('The default outlet must be one of the selected outlets.');
  }
  return unique;
}

async function findExistingEmployee(
  storeId: string,
  idempotencyKey?: string,
): Promise<Employee | null> {
  if (!idempotencyKey) return null;
  const byKey = await prisma.storeMembership.findUnique({
    where: { idempotencyKey },
    include: {
      user: {
        include: {
          outletMemberships: {
            include: { outlet: true },
          },
        },
      },
    },
  });
  if (!byKey) return null;
  if (byKey.storeId !== storeId || byKey.role !== 'EMPLOYEE') {
    throw new ValidationError('Duplicate request key.');
  }
  return toDTO(byKey);
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

export async function createEmployee(storeId: string, input: unknown): Promise<Employee> {
  await assertStoreWritable(storeId);
  const data = createEmployeeSchema.parse(input);

  const existingByKey = await findExistingEmployee(storeId, data.idempotencyKey);
  if (existingByKey) return existingByKey;

  const outletIds = data.outlets
    ? await assertAssignableOutlets(storeId, data.outlets, data.defaultOutletId)
    : undefined;

  const existing = await prisma.user.findUnique({ where: { phone: data.phone } });
  if (existing) throw new ValidationError('This phone number is already registered.');

  const passwordHash = await hashPassword(data.password);
  let row: MembershipRow;
  try {
    row = await prisma.$transaction(async tx => {
      // The User row itself is always created active — "active" as entered on
      // this form is this store's membership flag, not a platform-wide state.
      const user = await tx.user.create({ data: { name: data.name, phone: data.phone, passwordHash, mustChangePassword: true } });
      await tx.storeMembership.create({
        data: {
          role: 'EMPLOYEE',
          storeId,
          userId: user.id,
          active: data.active,
          idempotencyKey: data.idempotencyKey ?? null,
        },
      });

      if (outletIds && outletIds.length > 0) {
        await tx.outletMembership.createMany({
          data: outletIds.map(outletId => ({
            userId: user.id,
            outletId,
            active: true,
            isDefault: outletId === data.defaultOutletId
          }))
        });
      }

      return tx.storeMembership.findUniqueOrThrow({
        where: { userId_storeId: { userId: user.id, storeId } },
        include: {
          user: {
            include: {
              outletMemberships: {
                include: { outlet: true }
              }
            }
          }
        }
      });
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const winner = await findExistingEmployee(storeId, data.idempotencyKey);
      if (winner) return winner;
    }
    throw err;
  }
  revalidateTag(storeId, { expire: 0 });
  return toDTO(row);
}

const updateEmployeeSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  phone: z.string().transform(normalizePhone).refine(isValidPhone, 'Enter a valid phone number (8–15 digits).'),
  password: z.union([z.string().min(8).max(128), z.literal('')]).optional(),
  active: z.boolean(),
  outlets: z.array(z.string()).optional(),
  defaultOutletId: z.string().optional(),
});

export async function updateEmployee(storeId: string, input: unknown): Promise<Employee> {
  const data = updateEmployeeSchema.parse(input);
  const membership = await prisma.storeMembership.findUnique({
    where: { userId_storeId: { userId: data.id, storeId } },
    include: { user: { include: { outletMemberships: { include: { outlet: true } } } } },
  });
  if (!membership || membership.role !== 'EMPLOYEE') throw new Error('Employee not found.');
  const current = membership.user;

  const outletIds = data.outlets
    ? await assertAssignableOutlets(storeId, data.outlets, data.defaultOutletId)
    : undefined;

  const phoneChanged = data.phone !== current.phone;
  if (phoneChanged) {
    const conflict = await prisma.user.findUnique({ where: { phone: data.phone } });
    if (conflict) throw new ValidationError('This phone number is already registered.');
  }

  const passwordChanged = Boolean(data.password);
  // Only phone/password are real credential changes — bumping
  // credentialVersion for those still force-logs-out any live session
  // everywhere (correct: it's the same login at every store). The active
  // flag below is store-scoped and deliberately does NOT touch credentials
  // or sessions at all — see requireStoreSession's live membership check,
  // which is what actually enforces per-store access now.
  const credentialsChanged = phoneChanged || passwordChanged;
  const passwordHash = passwordChanged ? await hashPassword(data.password!) : undefined;

  if (data.active) {
    const otherActive = await prisma.storeMembership.findFirst({
      where: {
        userId: data.id,
        role: 'EMPLOYEE',
        active: true,
        storeId: { not: storeId },
      },
    });
    if (otherActive) {
      throw new ValidationError('An employee cannot be active in more than one organization.');
    }
  }

  const row = await prisma.$transaction(async tx => {
    await tx.user.update({
      where: { id: data.id },
      data: {
        name: data.name,
        phone: data.phone,
        passwordHash,
        credentialVersion: credentialsChanged ? { increment: 1 } : undefined,
        mustChangePassword: passwordChanged ? true : undefined,
      },
    });
    await tx.storeMembership.update({ where: { userId_storeId: { userId: data.id, storeId } }, data: { active: data.active } });

    if (outletIds) {
      await tx.outletMembership.deleteMany({ where: { userId: data.id, outlet: { storeId } } });
      if (outletIds.length > 0) {
        await tx.outletMembership.createMany({
          data: outletIds.map(outletId => ({
            userId: data.id,
            outletId,
            active: true,
            isDefault: outletId === data.defaultOutletId
          }))
        });
      }
    }

    return tx.storeMembership.findUniqueOrThrow({
      where: { userId_storeId: { userId: data.id, storeId } },
      include: {
        user: {
          include: {
            outletMemberships: {
              include: { outlet: true }
            }
          }
        }
      }
    });
  });

  revalidateTag('stores', { expire: 0 });
  revalidateTag('employees', { expire: 0 });
  if (credentialsChanged) await revokeAllSessionsForUser(data.id);
  revalidateTag(storeId, { expire: 0 });
  return toDTO(row);
}

// Deliberately store-scoped: flips this store's StoreMembership.active only.
// Does not touch User.active, credentialVersion, or any session — a
// deactivation here must not affect this person's access at any other store
// they belong to, and access at *this* store is withheld live by
// requireStoreSession() checking the membership, not by killing a session.
export async function toggleEmployeeActive(storeId: string, id: string): Promise<Employee> {
  const membership = await prisma.storeMembership.findUnique({
    where: { userId_storeId: { userId: id, storeId } },
    include: { user: { include: { outletMemberships: { include: { outlet: true } } } } },
  });
  if (!membership || membership.role !== 'EMPLOYEE') throw new Error('Employee not found.');

  if (!membership.active) {
    const otherActive = await prisma.storeMembership.findFirst({
      where: {
        userId: id,
        role: 'EMPLOYEE',
        active: true,
        storeId: { not: storeId },
      },
    });
    if (otherActive) {
      throw new ValidationError('An employee cannot be active in more than one organization.');
    }
  }

  const updated = await prisma.storeMembership.update({
    where: { userId_storeId: { userId: id, storeId } },
    data: { active: !membership.active },
    include: {
      user: {
        include: {
          outletMemberships: {
            include: { outlet: true }
          }
        }
      }
    },
  });
  revalidateTag(storeId, { expire: 0 });
  return toDTO(updated);
}

export async function resetEmployeePassword(storeId: string, employeeId: string, password: string): Promise<void> {
  await assertStoreWritable(storeId);
  const parsed = z.string().min(8).max(128).safeParse(password);
  if (!parsed.success) throw new ValidationError('Use a password with 8–128 characters.');
  const passwordHash = await hashPassword(parsed.data);
  await prisma.$transaction(async tx => {
    const membership = await tx.storeMembership.findUnique({ where: { userId_storeId: { userId: employeeId, storeId } } });
    if (!membership || membership.role !== 'EMPLOYEE') throw new ValidationError('Employee not found.');
    await tx.user.update({ where: { id: employeeId }, data: { passwordHash, mustChangePassword: true, credentialVersion: { increment: 1 } } });
    await tx.session.deleteMany({ where: { userId: employeeId } });
  });
  revalidateTag('employees', { expire: 0 });
  revalidateTag(storeId, { expire: 0 });
}
