import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsString, Matches, ValidateNested } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { AccessService } from '../common/access.service';
import { NotifyService } from '../common/notify.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { AttendanceService } from './attendance.service';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in the server's local time

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

@Controller('attendance')
export class AttendanceController {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private notify: NotifyService,
    private service: AttendanceService,
  ) {}

  /** Class list for one course on one date, with any status already saved. */
  @Get('roster')
  @Roles('TEACHER', 'ADMIN')
  async roster(@CurrentUser() user: AuthUser, @Query('courseId') courseId: string, @Query('date') date: string) {
    if (!DATE_RE.test(date || '')) throw new BadRequestException('Choose a valid date.');
    const course = await this.access.assertCanManageCourse(user, courseId);
    const students = await this.prisma.student.findMany({
      where: { classroomId: course.classroomId },
      include: { user: { select: { name: true } } },
      orderBy: { rollNo: 'asc' },
    });
    const saved = await this.prisma.attendance.findMany({ where: { courseId, date } });
    const byStudent = new Map(saved.map((r) => [r.studentId, r.status]));
    return students.map((s) => ({ studentId: s.id, name: s.user.name, rollNo: s.rollNo, status: byStudent.get(s.id) ?? null }));
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

    // Tell the student and parent about new absences only (not on every re-save).
    for (const r of dto.records) {
      if (r.status === 'ABSENT' && before.get(r.studentId) !== 'ABSENT') {
        const s = valid.get(r.studentId)!;
        await this.notify.send([s.userId, s.parentId], {
          title: `Marked absent in ${course.code}`,
          body: `${s.user.name} was marked absent for ${course.name} on ${dto.date}.`,
          link: '/attendance',
        });
      }
    }
    return { saved: dto.records.length };
  }

  @Get('summary')
  async summary(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) {
    const sid = await this.access.resolveStudentId(user, studentId);
    return this.service.summaryForStudent(sid);
  }
}
