import 'server-only';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@/generated/prisma/client';

// DATABASE_URL is the pooled Neon connection string; migrations use the
// direct connection configured separately in prisma.config.ts.
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Next dev preserves globals across hot reloads, including after Prisma generation.
// Recreate a cached client that predates the announcement model.
export const prisma = globalForPrisma.prisma?.workspaceAnnouncement
  ? globalForPrisma.prisma
  : new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
