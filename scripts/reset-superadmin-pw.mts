import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import bcrypt from 'bcryptjs';

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const passwordHash = await bcrypt.hash('VerifyPass123!', 12);
await prisma.user.update({ where: { username: 'superadmin' }, data: { passwordHash, credentialVersion: { increment: 1 } } });
console.log('done');
process.exit(0);
