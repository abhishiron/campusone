import { Controller, Get } from '@nestjs/common';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma.service';
import { Public, Roles } from '../common/decorators';
import { UPLOAD_DIR } from '../common/files.service';

/** Real service health, measured on each request. */
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  private async dbLatency() {
    const t = process.hrtime.bigint();
    await this.prisma.$queryRawUnsafe('SELECT 1');
    return Number(process.hrtime.bigint() - t) / 1e6;
  }

  @Public()
  @Get()
  async health() {
    return { ok: true, dbMs: await this.dbLatency(), uptimeSec: Math.round(process.uptime()) };
  }

  @Get('details')
  @Roles('ADMIN')
  async details() {
    let files = 0, bytes = 0;
    try {
      for (const f of readdirSync(UPLOAD_DIR)) {
        files++;
        bytes += statSync(join(UPLOAD_DIR, f)).size;
      }
    } catch { /* folder not created yet */ }
    const [unread, users] = await Promise.all([this.prisma.notification.count({ where: { read: false } }), this.prisma.user.count()]);
    return {
      dbMs: await this.dbLatency(),
      provider: 'SQLite (Prisma)',
      uptimeSec: Math.round(process.uptime()),
      memoryMB: Math.round(process.memoryUsage().rss / 1048576),
      node: process.version,
      uploads: { files, bytes },
      unreadNotifications: unread,
      users,
    };
  }
}
