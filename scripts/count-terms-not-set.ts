import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';

async function main() {
  let adapter;
  if (process.env.QA_SUBSCRIPTION_PG_SOCKET) {
    const { PrismaPg } = await import('@prisma/adapter-pg');
    adapter = new PrismaPg({
      host: process.env.QA_SUBSCRIPTION_PG_SOCKET,
      user: 'subscription_test',
      database: 'postgres',
      port: 5432,
    });
  } else if (process.env.DATABASE_URL) {
    const { PrismaNeon } = await import('@prisma/adapter-neon');
    adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  } else {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const prisma = new PrismaClient({ adapter });

  try {
    const stores = await prisma.store.findMany({
      where: {
        deletedAt: null,
        OR: [
          { subscription: null },
          {
            subscription: {
              trialEndsAt: null,
              paidThroughDate: null,
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`Found ${stores.length} non-archived organization(s) with neither trialEndsAt nor paidThroughDate:`);
    for (const store of stores) {
      console.log(`- ID: ${store.id} | Name: ${store.name}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
