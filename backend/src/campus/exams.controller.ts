import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AccessService } from '../common/access.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { addDays } from '../common/dates';
import { AttendanceService, MIN_PCT } from '../attendance/attendance.service';

@Controller('exams')
@Roles('STUDENT', 'PARENT')
export class ExamsController {
  constructor(private prisma: PrismaService, private access: AccessService, private attendance: AttendanceService) {}

  /** Date sheet with the student's seat and whether attendance clears them for each paper. */
  @Get()
  async list(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) {
    const sid = await this.access.resolveStudentId(user, studentId);
    const student = await this.prisma.student.findUniqueOrThrow({ where: { id: sid }, include: { user: true, classroom: true } });
    const exams = await this.prisma.exam.findMany({
      where: { course: { classroomId: student.classroomId } },
      include: { course: true, seats: { where: { studentId: sid } } },
      orderBy: { date: 'asc' },
    });
    const att = await this.attendance.summary(sid);
    const pct = new Map(att.courses.map((c) => [c.courseId, c.pct]));
    return {
      student: {
        name: student.user.name, rollNo: student.rollNo, program: student.classroom.program,
        semester: student.classroom.semester, classroom: student.classroom.name, batch: student.classroom.batch,
      },
      clearBy: exams.length ? addDays(exams[0].date, -2) : null,
      exams: exams.map((e) => {
        const p = pct.get(e.courseId) ?? null;
        return {
          id: e.id, date: e.date, time: e.time, code: e.course.code, name: e.course.name, syllabus: e.syllabus,
          room: e.room, seat: e.seats[0]?.seat ?? '—', maxMarks: e.maxMarks, attendance: p, eligible: p === null || p >= MIN_PCT,
        };
      }),
    };
  }
}
