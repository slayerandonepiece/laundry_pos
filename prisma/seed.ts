import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Bootstraps the platform's root actor: a Super Admin, not a store owner.
// Stores (and their owners) are created afterwards through the Super Admin
// onboarding flow, not by this script. Env var names kept as SEED_OWNER_* for
// compatibility with existing deployment configuration.
async function main() {
  const username = process.env.SEED_OWNER_USERNAME;
  const password = process.env.SEED_OWNER_PASSWORD;
  const name = process.env.SEED_OWNER_NAME ?? "Super Admin";

  if (!username || !password) {
    throw new Error(
      "Set SEED_OWNER_USERNAME and SEED_OWNER_PASSWORD before seeding, e.g.\n" +
        "SEED_OWNER_USERNAME=admin SEED_OWNER_PASSWORD=change-me npx prisma db seed",
    );
  }

  const normalizedUsername = username.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);

  const superAdmin = await prisma.user.upsert({
    where: { username: normalizedUsername },
    update: {},
    create: { name, username: normalizedUsername, passwordHash, isSuperAdmin: true },
  });

  console.log(`Super Admin user ready: ${superAdmin.username} (id: ${superAdmin.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
