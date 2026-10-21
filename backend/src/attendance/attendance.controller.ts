import { BadRequestException, Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { AccessService } from '../common/access.service';
import { NotifyService } from '../common/notify.service';
import { ActivityService } from '../common/activity.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { DATE_RE, today } from '../common/dates';
import { AttendanceService, alertText } from './attendance.service';

class RecordDto {
  @IsString() studentId: string;
  @IsIn(['PRESENT', 'ABSENT', 'LATE'], { message: 'Status must be present, late or absent.' }) status: 'PRESENT' | 'ABSENT' | 'LATE';
}

class MarkDto {
  @IsString() courseId: string;
  @Matches(DATE_RE, { message: 'Date must look like 2026-09-29.' }) date: string;
  @IsArray() @ArrayMinSize(1, { message: 'Mark at least one student.' }) @ValidateNested({ each: true }) @Type(() => RecordDto)
  records: RecordDto[];
}

export const WARN_OPTIONS = [76, 78, 80, 82, 85];
class SettingsDto {
  @IsOptional() @IsInt() @IsIn(WARN_OPTIONS, { message: 'Pick one of the listed thresholds.' }) warnAt?: number;
  @IsOptional() @IsBoolean() alertParent?: boolean;
}

@Controller('attendance')
export class AttendanceController {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private notify: NotifyService,
    private activity: ActivityService,
    private service: AttendanceService,
  ) {}

  /** Class list for one course on one date, with any status already saved and any self check-in. */
  @Get('roster')
  @Roles('TEACHER', 'ADMIN')
  async roster(@CurrentUser() user: AuthUser, @Query('courseId') courseId: string, @Query('date') date: string) {
    if (!DATE_RE.test(date || '')) throw new BadRequestException('Choose a valid date.');
    const course = await this.access.assertCanManageCourse(user, courseId);
    const students = await this.prisma.student.findMany({
      where: { classroomId: course.classroomId, user: { status: { not: 'SUSPENDED' } } },
      include: { user: { select: { name: true } } },
      orderBy: { rollNo: 'asc' },
    });
    const saved = await this.prisma.attendance.findMany({ where: { courseId, date } });
    const checks = await this.prisma.checkIn.findMany({ where: { courseId, date } });
    const byStudent = new Map(saved.map((r) => [r.studentId, r.status]));
    return {
      existing: saved.some((r) => r.source === 'MANUAL'),
      rows: students.map((s) => ({
        studentId: s.id, name: s.user.name, rollNo: s.rollNo,
        status: byStudent.get(s.id) ?? null,
        checkIn: checks.find((c) => c.studentId === s.id)?.status ?? null,
      })),
    };
  }

  @Post('mark')
  @Roles('TEACHER')
  async mark(@CurrentUser() user: AuthUser, @Body() dto: MarkDto) {
    if (dto.date > today()) throw new BadRequestException('You cannot record attendance for a future date.');
    const course = await this.access.assertCanManageCourse(user, dto.courseId);
    const students = await this.prisma.student.findMany({ where: { classroomId: course.classroomId }, include: { user: true } });
    const valid = new Map(students.map((s) => [s.id, s]));
    for (const r of dto.records) if (!valid.has(r.studentId)) throw new BadRequestException('One of the students is not in this course\'s class.');

    const existing = await this.prisma.attendance.findMany({ where: { courseId: dto.courseId, date: dto.date } });
    const before = new Map(existing.map((e) => [e.studentId, e.status]));

    await this.prisma.$transaction(
      dto.records.map((r) =>
        this.prisma.attendance.upsert({
          where: { studentId_courseId_date: { studentId: r.studentId, courseId: dto.courseId, date: dto.date } },
          create: { studentId: r.studentId, courseId: dto.courseId, date: dto.date, status: r.status },
          update: { status: r.status },
        }),
      ),
    );

    const warned: string[] = [];
    for (const r of dto.records) {
      const s = valid.get(r.studentId)!;
      // Tell the student and parent about new absences only (not on every re-save).
      if (r.status === 'ABSENT' && before.get(r.studentId) !== 'ABSENT') {
        await this.notify.send([s.userId, s.parentId], {
          title: `Marked absent in ${course.code}`,
          body: `${s.user.name} was marked absent for ${course.name} on ${dto.date}.`,
          link: '/attendance',
        });
      }
      const fired = await this.service.evaluate(s.id);
      if (fired.some((f) => f.code === course.code && f.level !== 'OK')) warned.push(s.user.name);
    }
    const present = dto.records.filter((r) => r.status !== 'ABSENT').length;
    await this.activity.log(`${user.name} saved attendance for ${course.code} (${present} of ${dto.records.length} present)`);
    return { saved: dto.records.length, present, warned };
  }

  /** The professor's recently saved classes. */
  @Get('recent')
  @Roles('TEACHER')
  async recent(@CurrentUser() user: AuthUser) {
    const courses = await this.prisma.course.findMany({ where: { teacherId: user.id } });
    const rows = await this.prisma.attendance.groupBy({
      by: ['courseId', 'date', 'status'],
      where: { courseId: { in: courses.map((c) => c.id) } },
      _count: true,
    });
    const sessions = new Map<string, { courseId: string; date: string; present: number; total: number }>();
    for (const r of rows) {
      const key = `${r.courseId}|${r.date}`;
      const s = sessions.get(key) ?? { courseId: r.courseId, date: r.date, present: 0, total: 0 };
      s.total += r._count;
      if (r.status !== 'ABSENT') s.present += r._count;
      sessions.set(key, s);
    }
    return [...sessions.values()]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 6)
      .map((s) => {
        const c = courses.find((x) => x.id === s.courseId)!;
        return { ...s, code: c.code, name: c.name };
      });
  }

  /** The attendance tracker: per-subject numbers, settings and alert history. */
  @Get('summary')
  async summary(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) {
    const sid = await this.access.resolveStudentId(user, studentId);
    const [summary, alerts] = await Promise.all([
      this.service.summary(sid),
      this.prisma.attendanceAlert.findMany({ where: { studentId: sid }, include: { course: true }, orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);
    return {
      ...summary,
      warnOptions: WARN_OPTIONS,
      alerts: alerts.map((a) => ({
        id: a.id, code: a.course.code, level: a.level, pct: a.pct, read: a.read, createdAt: a.createdAt,
        channels: a.channels.split(',').filter(Boolean), text: alertText(a.course.name, a.pct, a.level),
      })),
    };
  }

  @Patch('settings')
  @Roles('STUDENT')
  async settings(@CurrentUser() user: AuthUser, @Body() dto: SettingsDto) {
    const s = await this.access.ownStudent(user);
    await this.prisma.student.update({
      where: { id: s.id },
      data: { ...(dto.warnAt !== undefined ? { warnAt: dto.warnAt } : {}), ...(dto.alertParent !== undefined ? { alertParent: dto.alertParent } : {}) },
    });
    const fired = await this.service.evaluate(s.id, { noRecover: true });
    return { ok: true, fired };
  }

  @Post('alerts/read')
  @Roles('STUDENT', 'PARENT')
  async readAlerts(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) {
    const sid = await this.access.resolveStudentId(user, studentId);
    await this.prisma.attendanceAlert.updateMany({ where: { studentId: sid, read: false }, data: { read: true } });
    return { ok: true };
  }
}
