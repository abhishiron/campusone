import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { NotifyService } from '../common/notify.service';
import { ActivityService } from '../common/activity.service';
import { AccessService } from '../common/access.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { AnnouncementsService } from './announcements.service';

const ADMIN_AUDIENCES = ['ALL', 'STUDENT', 'TEACHER', 'PARENT'];

class CreateAnnouncementDto {
  @IsString() @MinLength(3, { message: 'Give the announcement a title.' }) @MaxLength(90) title: string;
  @IsString() @MinLength(3, { message: 'Write the announcement.' }) body: string;
  /** ALL | STUDENT | TEACHER | PARENT for admins, or a course id for professors. */
  @IsString() audience: string;
}

@Controller('announcements')
export class AnnouncementsController {
  constructor(
    private prisma: PrismaService,
    private notify: NotifyService,
    private activity: ActivityService,
    private access: AccessService,
    private service: AnnouncementsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.visibleTo(user);
  }

  @Post()
  @Roles('ADMIN', 'TEACHER')
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateAnnouncementDto) {
    const base = { title: dto.title.trim(), body: dto.body.trim(), authorId: user.id };
    let recipients: (string | null)[];
    let a;
    if (user.role === 'ADMIN') {
      if (!ADMIN_AUDIENCES.includes(dto.audience)) throw new BadRequestException('Choose who should see this.');
      a = await this.prisma.announcement.create({ data: { ...base, audience: dto.audience } });
      recipients = (await this.prisma.user.findMany({ where: { id: { not: user.id }, ...(dto.audience === 'ALL' ? {} : { role: dto.audience }) }, select: { id: true } })).map((r) => r.id);
    } else {
      const course = await this.access.assertCanManageCourse(user, dto.audience);
      a = await this.prisma.announcement.create({ data: { ...base, audience: 'COURSE', courseId: course.id } });
      recipients = (await this.prisma.student.findMany({ where: { classroomId: course.classroomId } })).flatMap((s) => [s.userId, s.parentId]);
    }
    await this.notify.send(recipients, { title: a.title, body: `New announcement from ${user.name}.`, link: '/announcements' });
    await this.activity.log(`${user.name} posted "${a.title}"`);
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
