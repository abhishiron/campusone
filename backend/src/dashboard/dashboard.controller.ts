import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AccessService } from '../common/access.service';
import { CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/types';
import { AnnouncementsService } from '../announcements/announcements.service';
import { AttendanceService } from '../attendance/attendance.service';

const today = () => new Date().toLocaleDateString('en-CA');

@Controller('dashboard')
export class DashboardController {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private announcements: AnnouncementsService,
    private attendance: AttendanceService,
  ) {}

  @Get()
  async get(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) {
    const latestAnnouncements = await this.announcements.visibleTo(user, 3);

    if (user.role === 'ADMIN') {
      const [students, teachers, classrooms, courses, todays] = await Promise.all([
        this.prisma.student.count(),
        this.prisma.user.count({ where: { role: 'TEACHER' } }),
        this.prisma.classroom.count(),
        this.prisma.course.count(),
        this.prisma.attendance.findMany({ where: { date: today() }, select: { status: true } }),
      ]);
      const attended = todays.filter((t) => t.status !== 'ABSENT').length;
      return {
        role: 'ADMIN',
        counts: { students, teachers, classrooms, courses },
        attendanceToday: todays.length ? Math.round((attended / todays.length) * 100) : null,
        latestAnnouncements,
      };
    }

    if (user.role === 'TEACHER') {
      const courses = await this.prisma.course.findMany({ where: { teacherId: user.id }, include: { classroom: true }, orderBy: { code: 'asc' } });
      const marked = await this.prisma.attendance.groupBy({ by: ['courseId'], where: { date: today(), courseId: { in: courses.map((c) => c.id) } } });
      const markedIds = new Set(marked.map((m) => m.courseId));
      const assignments = await this.prisma.assignment.findMany({
        where: { course: { teacherId: user.id } },
        include: { course: true, submissions: { select: { marks: true } } },
        orderBy: { dueDate: 'desc' },
      });
      const needsGrading = assignments
        .map((a) => ({ id: a.id, title: a.title, course: a.course.code, waiting: a.submissions.filter((s) => s.marks === null).length }))
        .filter((a) => a.waiting > 0)
        .slice(0, 5);
      return {
        role: 'TEACHER',
        courses: courses.map((c) => ({ id: c.id, code: c.code, name: c.name, classroom: c.classroom.name, markedToday: markedIds.has(c.id) })),
        needsGrading,
        latestAnnouncements,
      };
    }

    // Student or parent: everything is about one student.
    const sid = await this.access.resolveStudentId(user, studentId);
    const student = await this.prisma.student.findUniqueOrThrow({ where: { id: sid } });
    const [att, assignments, graded] = await Promise.all([
      this.attendance.summaryForStudent(sid),
      this.prisma.assignment.findMany({
        where: { course: { classroomId: student.classroomId } },
        include: { course: true, submissions: { where: { studentId: sid }, select: { id: true } } },
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.submission.findMany({ where: { studentId: sid, marks: { not: null } }, include: { assignment: true } }),
    ]);
    const now = new Date();
    const pending = assignments.filter((a) => a.submissions.length === 0);
    const earned = graded.reduce((n, g) => n + (g.marks ?? 0), 0);
    const possible = graded.reduce((n, g) => n + g.assignment.maxMarks, 0);
    return {
      role: user.role,
      attendanceOverall: att.overall,
      gradeOverall: possible ? Math.round((earned / possible) * 100) : null,
      overdueCount: pending.filter((a) => a.dueDate < now).length,
      dueSoon: pending
        .filter((a) => a.dueDate >= now)
        .slice(0, 5)
        .map((a) => ({ id: a.id, title: a.title, course: a.course.code, dueDate: a.dueDate })),
      latestAnnouncements,
    };
  }
}
