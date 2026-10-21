import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { AccessService } from '../common/access.service';
import { NotifyService } from '../common/notify.service';
import { ActivityService } from '../common/activity.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';

export const MEET_RE = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

/** Accepts pasted links with or without https://, query strings or trailing slashes. */
export function normaliseMeet(link: string) {
  let l = link.trim().toLowerCase().split('?')[0].replace(/\/+$/, '');
  if (l && !/^https?:\/\//.test(l)) l = 'https://' + l;
  return l.replace(/^http:/, 'https:');
}

class CreateSessionDto {
  @IsString() @MinLength(3, { message: 'Add a topic so classmates know what the session is about.' }) @MaxLength(80) title: string;
  @IsOptional() @IsString() @MaxLength(240) description?: string;
  /** A course id, or "GEN" for a general session. */
  @IsString() course: string;
  @IsISO8601({}, { message: 'Pick a start date and time.' }) start: string;
  @IsInt() @IsIn([30, 60, 90, 120]) durationMin: number;
  @IsInt() @Min(2) @Max(100) capacity: number;
  @IsString() link: string;
}

@Controller('study')
@Roles('STUDENT')
export class StudyController {
  constructor(private prisma: PrismaService, private access: AccessService, private notify: NotifyService, private activity: ActivityService) {}

  /** Upcoming and live sessions for the student's own batch only. */
  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const me = await this.access.ownStudent(user);
    const classroom = await this.prisma.classroom.findUniqueOrThrow({ where: { id: me.classroomId } });
    const rows = await this.prisma.studySession.findMany({
      where: { classroomId: me.classroomId },
      include: { course: true, host: { include: { user: true } }, rsvps: { include: { student: { include: { user: true } } }, orderBy: { createdAt: 'asc' } } },
      orderBy: { start: 'asc' },
    });
    const now = Date.now();
    return {
      me: me.id,
      batch: `${classroom.name}, batch ${classroom.batch}`,
      sessions: rows
        .filter((s) => s.start.getTime() + s.durationMin * 60_000 > now)
        .map((s) => ({
          id: s.id, title: s.title, description: s.description, start: s.start, durationMin: s.durationMin, link: s.link, capacity: s.capacity,
          course: s.course ? { id: s.course.id, code: s.course.code } : null,
          host: s.host.user.name, isHost: s.hostId === me.id,
          going: s.rsvps.map((r) => r.student.user.name), imGoing: s.rsvps.some((r) => r.studentId === me.id),
        })),
    };
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateSessionDto) {
    const me = await this.access.ownStudent(user);
    const link = normaliseMeet(dto.link);
    if (!MEET_RE.test(link)) throw new BadRequestException('Paste a Google Meet link like https://meet.google.com/abc-defg-hij.');
    const start = new Date(dto.start);
    if (start.getTime() < Date.now() - 5 * 60_000) throw new BadRequestException('Pick a start time that is still ahead.');
    let courseId: string | null = null;
    if (dto.course !== 'GEN') {
      const c = await this.prisma.course.findFirst({ where: { id: dto.course, classroomId: me.classroomId } });
      if (!c) throw new BadRequestException('Choose one of your subjects.');
      courseId = c.id;
    }
    const clash = await this.prisma.studySession.findMany({ where: { link } });
    if (clash.some((s) => s.start.getTime() + s.durationMin * 60_000 > Date.now())) {
      throw new BadRequestException('Another upcoming session already uses this Meet link. Create a new meeting link.');
    }
    const s = await this.prisma.studySession.create({
      data: {
        title: dto.title.trim(), description: dto.description?.trim() ?? '', courseId, classroomId: me.classroomId, hostId: me.id,
        start, durationMin: dto.durationMin, capacity: dto.capacity, link, rsvps: { create: { studentId: me.id } },
      },
    });
    await this.activity.log(`${user.name} scheduled a study session: "${s.title}"`);
    return s;
  }

  @Post(':id/rsvp')
  async rsvp(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const me = await this.access.ownStudent(user);
    const s = await this.prisma.studySession.findUnique({ where: { id }, include: { rsvps: true } });
    if (!s || s.classroomId !== me.classroomId) throw new NotFoundException('Session not found.');
    if (s.hostId === me.id) throw new BadRequestException('You are hosting this session.');
    const going = s.rsvps.some((r) => r.studentId === me.id);
    if (going) {
      await this.prisma.studyRsvp.delete({ where: { sessionId_studentId: { sessionId: id, studentId: me.id } } });
      return { going: false };
    }
    if (s.rsvps.length >= s.capacity) throw new BadRequestException('This session is full.');
    await this.prisma.studyRsvp.create({ data: { sessionId: id, studentId: me.id } });
    return { going: true };
  }

  @Delete(':id')
  async cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const me = await this.access.ownStudent(user);
    const s = await this.prisma.studySession.findUnique({ where: { id }, include: { rsvps: { include: { student: true } } } });
    if (!s) throw new NotFoundException('Session not found.');
    if (s.hostId !== me.id) throw new ForbiddenException('Only the host can cancel a session.');
    await this.prisma.studySession.delete({ where: { id } });
    await this.notify.send(s.rsvps.filter((r) => r.studentId !== me.id).map((r) => r.student.userId), {
      title: 'Study session cancelled', body: `${user.name} cancelled "${s.title}".`, link: '/study',
    });
    await this.activity.log(`${user.name} cancelled the study session "${s.title}"`);
    return { ok: true };
  }
}
