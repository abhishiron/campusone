import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { IsIn, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { NotifyService } from '../common/notify.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { AnnouncementsService } from './announcements.service';

class CreateAnnouncementDto {
  @IsString() @MinLength(3, { message: 'Give the announcement a title.' }) title: string;
  @IsString() @MinLength(3, { message: 'Write the announcement.' }) body: string;
  @IsIn(['ALL', 'STUDENT', 'PARENT', 'TEACHER'], { message: 'Choose who should see this.' }) audience: 'ALL' | 'STUDENT' | 'PARENT' | 'TEACHER';
}

@Controller('announcements')
export class AnnouncementsController {
  constructor(private prisma: PrismaService, private notify: NotifyService, private service: AnnouncementsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.visibleTo(user);
  }

  @Post()
  @Roles('ADMIN', 'TEACHER')
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateAnnouncementDto) {
    const a = await this.prisma.announcement.create({
      data: { title: dto.title.trim(), body: dto.body.trim(), audience: dto.audience, authorId: user.id },
    });
    const recipients = await this.prisma.user.findMany({
      where: { id: { not: user.id }, ...(dto.audience === 'ALL' ? {} : { role: dto.audience }) },
      select: { id: true },
    });
    await this.notify.send(recipients.map((r) => r.id), { title: a.title, body: `New announcement from ${user.name}.`, link: '/announcements' });
    return a;
  }

  @Delete(':id')
  @Roles('ADMIN', 'TEACHER')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const a = await this.prisma.announcement.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Announcement not found.');
    if (user.role !== 'ADMIN' && a.authorId !== user.id) throw new ForbiddenException('You can only delete your own announcements.');
    await this.prisma.announcement.delete({ where: { id } });
    return { ok: true };
  }
}
