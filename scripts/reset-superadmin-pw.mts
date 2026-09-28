import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import bcrypt from 'bcryptjs';

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const passwordHash = await bcrypt.hash('VerifyPass123!', 12);
await prisma.user.update({ where: { phone: process.env.SEED_OWNER_PHONE?.replace(/[^0-9]/g, '') ?? '' }, data: { passwordHash, credentialVersion: { increment: 1 } } });
console.log('done');
process.exit(0);
