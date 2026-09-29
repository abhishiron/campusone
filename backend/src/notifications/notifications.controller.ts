import { Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/types';

@Controller('notifications')
export class NotificationsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.notification.count({ where: { userId: user.id, read: false } }),
    ]);
    return { items, unread };
  }

  @Post('read-all')
  async readAll(@CurrentUser() user: AuthUser) {
    await this.prisma.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
    return { ok: true };
  }

  @Post(':id/read')
  async read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const n = await this.prisma.notification.findFirst({ where: { id, userId: user.id } });
    if (!n) throw new NotFoundException('Notification not found.');
    await this.prisma.notification.update({ where: { id }, data: { read: true } });
    return { ok: true };
  }
}
