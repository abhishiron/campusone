/* Promote an existing user to SUPERADMIN. This is the only way to get the role: there is no signup path.
   Usage: npm run make-superadmin -- someone@example.com */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email) {
    console.error('Usage: npm run make-superadmin -- <email>');
    process.exitCode = 1;
    return;
  }
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, role: true } });
  if (!user) {
    console.error(`No user with the email ${email}. Create the account first, then run this again.`);
    process.exitCode = 1;
    return;
  }
  if (user.role === 'SUPERADMIN') {
    console.log(`${email} is already a SUPERADMIN. Nothing to change.`);
    return;
  }
  await prisma.user.update({ where: { id: user.id }, data: { role: 'SUPERADMIN' } });
  console.log(`${user.name} (${email}) is now a SUPERADMIN (was ${user.role}). Sign in again to use the new role.`);
}

main().finally(() => prisma.$disconnect());
