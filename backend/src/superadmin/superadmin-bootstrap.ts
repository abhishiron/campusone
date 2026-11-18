import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

/**
 * Makes sure the platform super admin account exists on every start, so it is available on a
 * freshly deployed (or reset) database. Only the bcrypt hash of its password is stored here;
 * the password itself is not in the repository.
 *  - Missing account: created with role SUPERADMIN.
 *  - Existing account with another role: promoted to SUPERADMIN. Its password is left unchanged.
 */
export const SUPERADMIN_EMAIL = 'superadmin@email.com';
const SUPERADMIN_PASSWORD_HASH = '$2a$12$Vg2tUdXHqo1eE5k/I9SiPemLjknfC8vLZIIteFRhdHjHPBLlSJ0yq';

@Injectable()
export class SuperAdminBootstrap implements OnApplicationBootstrap {
  private readonly log = new Logger('SuperAdminBootstrap');
  constructor(private prisma: PrismaService) {}

  async onApplicationBootstrap() {
    try {
      const user = await this.prisma.user.findUnique({ where: { email: SUPERADMIN_EMAIL }, select: { id: true, role: true } });
      if (!user) {
        await this.prisma.user.create({ data: { name: 'Super Admin', email: SUPERADMIN_EMAIL, passwordHash: SUPERADMIN_PASSWORD_HASH, role: 'SUPERADMIN' } });
        this.log.log(`Created ${SUPERADMIN_EMAIL} with role SUPERADMIN`);
      } else if (user.role !== 'SUPERADMIN') {
        await this.prisma.user.update({ where: { id: user.id }, data: { role: 'SUPERADMIN' } });
        this.log.log(`Promoted ${SUPERADMIN_EMAIL} to SUPERADMIN`);
      }
    } catch (e) {
      // Never block start-up (for example before the tables exist); the next start tries again.
      this.log.warn(`Could not ensure ${SUPERADMIN_EMAIL}: ${(e as Error).message}`);
    }
  }
}
