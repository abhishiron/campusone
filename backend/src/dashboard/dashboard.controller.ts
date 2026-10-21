import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { AttendanceService } from '../attendance/attendance.service';
import { PERIODS, addDays, parseISO, plusHour, today } from '../common/dates';

const pctOf = (rows: { status: string; _count: number }[]) => {
  const total = rows.reduce((n, r) => n + r._count, 0);
  return total ? (rows.filter((r) => r.status !== 'ABSENT').reduce((n, r) => n + r._count, 0) / total) * 100 : null;
};

/** Overviews for staff. Students and parents compose theirs from the feature endpoints. */
@Controller('dashboard')
@Roles('ADMIN', 'TEACHER')
export class DashboardController {
  constructor(private prisma: PrismaService, private attendance: AttendanceService) {}

  @Get()
  async get(@CurrentUser() user: AuthUser) {
    return user.role === 'ADMIN' ? this.admin() : this.teacher(user);
  }

  private async admin() {
    const now = today();
    const [students, active, faculty, onLeave, courses, classrooms, last30, activity] = await Promise.all([
      this.prisma.user.count({ where: { role: 'STUDENT' } }),
      this.prisma.user.count({ where: { role: 'STUDENT', status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { role: 'TEACHER' } }),
      this.prisma.user.count({ where: { role: 'TEACHER', status: 'ON_LEAVE' } }),
      this.prisma.course.findMany({ include: { classroom: true } }),
      this.prisma.classroom.findMany({ include: { _count: { select: { students: true } } } }),
      this.prisma.attendance.groupBy({ by: ['status'], where: { date: { gte: addDays(now, -30) } }, _count: true }),
      this.prisma.activity.findMany({ orderBy: { createdAt: 'desc' }, take: 6 }),
    ]);
    const byDept = new Map<string, number>();
    for (const c of classrooms) byDept.set(c.dept, (byDept.get(c.dept) ?? 0) + c._count.students);

    const weeks: { label: string; pct: number | null }[] = [];
    for (let i = 7; i >= 0; i--) {
      const from = addDays(now, -7 * (i + 1)), to = addDays(now, -7 * i);
      const rows = await this.prisma.attendance.groupBy({ by: ['status'], where: { date: { gte: from, lt: to } }, _count: true });
      weeks.push({ label: parseISO(from).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), pct: pctOf(rows) });
    }
    return {
      counts: { students, active, faculty, onLeave, courses: courses.length, depts: new Set(courses.map((c) => c.classroom.dept)).size },
      attendance30: pctOf(last30),
      enrollment: [...byDept.entries()].map(([dept, n]) => ({ dept, n })).sort((a, b) => b.n - a.n),
      weeks,
      activity,
    };
  }

  private async teacher(user: AuthUser) {
    const now = today();
    const weekday = parseISO(now).getDay();
    const courses = await this.prisma.course.findMany({
      where: { teacherId: user.id },
      include: { slots: true, classroom: { include: { _count: { select: { students: true } } } } },
      orderBy: { code: 'asc' },
    });
    const ids = courses.map((c) => c.id);
    const [marked, assignments, attRows, pendingLeaves, below] = await Promise.all([
      this.prisma.attendance.groupBy({ by: ['courseId'], where: { date: now, courseId: { in: ids }, source: 'MANUAL' } }),
      this.prisma.assignment.findMany({ where: { courseId: { in: ids } }, include: { course: true, submissions: { select: { marks: true } } }, orderBy: { dueDate: 'asc' } }),
      this.prisma.attendance.groupBy({ by: ['status'], where: { courseId: { in: ids } }, _count: true }),
      this.prisma.leaveRequest.count({ where: { status: 'PENDING', student: { classroom: { coordinatorId: user.id } } } }),
      this.attendance.belowMinimum(ids),
    ]);

    // Merge back-to-back periods of the same course and room into one block (labs run two hours).
    const blocks: { courseId: string; code: string; name: string; room: string; start: number; end: number }[] = [];
    const todays = courses.flatMap((c) => c.slots.filter((s) => s.day === weekday).map((s) => ({ ...s, code: c.code, name: c.name }))).sort((a, b) => a.slot - b.slot);
    for (const s of todays) {
      const last = blocks[blocks.length - 1];
      if (last && last.courseId === s.courseId && last.room === s.room && last.end === s.slot - 1) last.end = s.slot;
      else blocks.push({ courseId: s.courseId, code: s.code, name: s.name, room: s.room, start: s.slot, end: s.slot });
    }
    const markedIds = new Set(marked.map((m) => m.courseId));
    const classSize = new Map(courses.map((c) => [c.id, c.classroom._count.students]));
    const studentsTaught = [...new Map(courses.map((c) => [c.classroomId, c.classroom._count.students])).values()].reduce((a, b) => a + b, 0);
    const nowTs = new Date();

    return {
      today: blocks.map((b) => ({ ...b, time: `${PERIODS[b.start]}–${plusHour(PERIODS[b.end])}`, marked: markedIds.has(b.courseId) })),
      toReview: assignments.reduce((n, a) => n + a.submissions.filter((s) => s.marks === null).length, 0),
      assignmentCount: assignments.length,
      courses: courses.map((c) => ({ id: c.id, code: c.code, name: c.name })),
      studentsTaught,
      avgAttendance: pctOf(attRows),
      below: below.slice(0, 5),
      pendingLeaves,
      open: assignments
        .filter((a) => a.dueDate >= nowTs)
        .map((a) => ({ id: a.id, title: a.title, code: a.course.code, dueDate: a.dueDate, submitted: a.submissions.length, classSize: classSize.get(a.courseId) ?? 0 })),
    };
  }
}
