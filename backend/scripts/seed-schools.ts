/* Creates two school accounts, each with a live INSTITUTION subscription for 365 days.
   Safe to run twice: existing schools are kept (their password is not reset) and a subscription is only added if the school has
   no live subscription on any plan, so a school never appears twice in the super admin's subscriber list.
   Usage: npm run seed-schools */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();
const DAY_MS = 86_400_000;

const SCHOOLS = [
  { name: 'Prakash Public School', email: 'prakash.public.school@campusone.test' },
  { name: 'Greenfield International School', email: 'greenfield.international@campusone.test' },
];

async function main() {
  const printed: { name: string; email: string; password: string }[] = [];

  for (const s of SCHOOLS) {
    let user = await prisma.user.findUnique({ where: { email: s.email } });
    if (!user) {
      const password = randomBytes(5).toString('hex');
      user = await prisma.user.create({ data: { name: s.name, email: s.email, role: 'SCHOOL', mustChangePassword: true, passwordHash: await bcrypt.hash(password, 10) } });
      printed.push({ name: s.name, email: s.email, password });
      console.log(`Created ${s.name}`);
    } else {
      console.log(`${s.name} already exists, keeping its password`);
    }

    const live = await prisma.subscription.findFirst({ where: { userId: user.id, status: 'ACTIVE', expiresAt: { gt: new Date() } } });
    if (!live) {
      await prisma.subscription.create({ data: { userId: user.id, plan: 'INSTITUTION', status: 'ACTIVE', expiresAt: new Date(Date.now() + 365 * DAY_MS) } });
      console.log(`  added an INSTITUTION subscription valid for 365 days`);
    }
  }

  if (printed.length) {
    console.log('\nTemporary passwords (shown once, not stored anywhere in plain text):');
    for (const p of printed) console.log(`  ${p.email}  ${p.password}`);
  }
}

main().finally(() => prisma.$disconnect());
