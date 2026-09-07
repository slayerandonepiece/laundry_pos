import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const username = process.env.SEED_OWNER_USERNAME;
  const password = process.env.SEED_OWNER_PASSWORD;
  const name = process.env.SEED_OWNER_NAME ?? "Owner";

  if (!username || !password) {
    throw new Error(
      "Set SEED_OWNER_USERNAME and SEED_OWNER_PASSWORD before seeding, e.g.\n" +
        "SEED_OWNER_USERNAME=owner SEED_OWNER_PASSWORD=change-me npx prisma db seed",
    );
  }

  const normalizedUsername = username.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);

  const owner = await prisma.user.upsert({
    where: { username: normalizedUsername },
    update: {},
    create: { name, username: normalizedUsername, passwordHash, role: "OWNER" },
  });

  console.log(`Owner user ready: ${owner.username} (id: ${owner.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
