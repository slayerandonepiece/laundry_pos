import { normalizePhone, isValidPhone } from "../src/lib/contactValidation";
import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Bootstraps the platform's root actor: a Super Admin, not a store owner.
// Stores (and their owners) are created afterwards through the Super Admin
// onboarding flow, not by this script. Set SEED_OWNER_PHONE to the verified
// personal login phone; SEED_OWNER_PASSWORD and SEED_OWNER_NAME are unchanged.
async function main() {
  const phone = process.env.SEED_OWNER_PHONE;
  const password = process.env.SEED_OWNER_PASSWORD;
  const name = process.env.SEED_OWNER_NAME ?? "Super Admin";

  if (!phone || !password) {
    throw new Error(
      "Set SEED_OWNER_PHONE and SEED_OWNER_PASSWORD before seeding, e.g.\n" +
        "SEED_OWNER_PHONE=919876543210 SEED_OWNER_PASSWORD=change-me npx prisma db seed",
    );
  }

  const normalizedPhone = normalizePhone(phone);
  if (!isValidPhone(normalizedPhone)) throw new Error('SEED_OWNER_PHONE must contain 8–15 digits.');
  const passwordHash = await bcrypt.hash(password, 12);

  const superAdmin = await prisma.user.upsert({
    where: { phone: normalizedPhone },
    update: {},
    create: { name, phone: normalizedPhone, passwordHash, isSuperAdmin: true },
  });

  console.log(`Super Admin user ready: ${superAdmin.phone} (id: ${superAdmin.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
