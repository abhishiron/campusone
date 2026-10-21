import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { NotifyService } from '../common/notify.service';
import { addDays, today } from '../common/dates';

export type Level = 'OK' | 'WARN' | 'DANGER';
const RANK: Record<Level, number> = { OK: 0, WARN: 1, DANGER: 2 };
export const MIN_PCT = 75;

export function levelOf(pct: number | null, warnAt: number): Level {
  if (pct === null) return 'OK';
  return pct < MIN_PCT ? 'DANGER' : pct < warnAt ? 'WARN' : 'OK';
}

export function alertText(courseName: string, pct: number, level: string) {
  const p = `${pct.toFixed(1)}%`;
  if (level === 'DANGER') return `${courseName} fell below 75% (${p}). Attend upcoming classes to stay eligible for exams.`;
  if (level === 'WARN') return `${courseName} dropped to ${p}, close to the 75% limit.`;
  return `${courseName} is back to a safe ${p}.`;
}

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService, private notify: NotifyService) {}

  /**
   * Per-subject tracker for one student. Late counts as attended.
   * need: classes in a row to reach 75%; miss: classes that can be skipped and stay at 75%;
   * minRest: classes still needed out of the remaining plan to finish the semester at 75%.
   */
  async summary(studentId: string) {
    const student = await this.prisma.student.findUniqueOrThrow({ where: { id: studentId } });
    const courses = await this.prisma.course.findMany({ where: { classroomId: student.classroomId }, orderBy: { code: 'asc' } });
    const records = await this.prisma.attendance.findMany({ where: { studentId }, orderBy: { date: 'desc' } });
    const now = today();

    const rows = courses.map((c) => {
      const mine = records.filter((r) => r.courseId === c.id);
      const pctAt = (cutoff: string) => {
        const upto = mine.filter((r) => r.date <= cutoff);
        return upto.length ? (upto.filter((r) => r.status !== 'ABSENT').length / upto.length) * 100 : null;
      };
      const a = mine.filter((r) => r.status !== 'ABSENT').length;
      const t = mine.length;
      const pct = t ? (a / t) * 100 : null;
      const plan = Math.max(c.plannedClasses, t);
      const hist = [5, 4, 3, 2, 1].map((k) => pctAt(addDays(now, -7 * k))).filter((x): x is number => x !== null);
      return {
        courseId: c.id, code: c.code, name: c.name, a, t, pct, plan,
        rem: plan - t,
        need: Math.max(0, Math.ceil(3 * t - 4 * a)),
        miss: Math.max(0, Math.floor(a / 0.75 - t)),
        minRest: Math.max(0, Math.ceil(0.75 * plan - a)),
        level: levelOf(pct, student.warnAt),
        hist,
      };
    });

    const attended = records.filter((r) => r.status !== 'ABSENT').length;
    const names = new Map(courses.map((c) => [c.id, c]));
    return {
      warnAt: student.warnAt,
      alertParent: student.alertParent,
      hasParent: !!student.parentId,
      overall: records.length ? (attended / records.length) * 100 : null,
      attended,
      total: records.length,
      courses: rows,
      recent: records.slice(0, 10).map((r) => ({ date: r.date, status: r.status, source: r.source, code: names.get(r.courseId)?.code ?? '' })),
    };
  }

  /**
   * Compare each subject's level with the last one we stored and raise an alert when it gets worse,
   * or when it recovers (unless `noRecover`, used when the student only changed their threshold).
   */
  async evaluate(studentId: string, opts: { noRecover?: boolean } = {}) {
    const student = await this.prisma.student.findUniqueOrThrow({ where: { id: studentId }, include: { user: true } });
    const { courses } = await this.summary(studentId);
    const stored = await this.prisma.attendanceLevel.findMany({ where: { studentId } });
    const prevOf = new Map(stored.map((l) => [l.courseId, l.level as Level]));
    const fired: { code: string; level: Level; pct: number }[] = [];

    for (const c of courses) {
      if (c.pct === null) continue;
      const prev = prevOf.get(c.courseId);
      const worse = prev !== undefined && RANK[c.level] > RANK[prev];
      const recovered = prev !== undefined && prev !== 'OK' && c.level === 'OK' && !opts.noRecover;
      if (worse || recovered) {
        const notifyParent = student.alertParent && !!student.parentId;
        const channels = ['In-app', ...(notifyParent ? ['Parent account'] : [])];
        await this.prisma.attendanceAlert.create({ data: { studentId, courseId: c.courseId, pct: c.pct, level: c.level, channels: channels.join(',') } });
        const text = alertText(c.name, c.pct, c.level);
        const kind = c.level === 'OK' ? 'INFO' : 'WARN';
        await this.notify.send([student.userId], { title: c.level === 'OK' ? 'Attendance recovered' : 'Attendance warning', body: text, link: '/attendance', kind });
        if (notifyParent) {
          await this.notify.send([student.parentId], { title: `Attendance: ${student.user.name}`, body: text, link: '/attendance', kind });
        }
        fired.push({ code: c.code, level: c.level, pct: c.pct });
      }
      if (prev !== c.level) {
        await this.prisma.attendanceLevel.upsert({
          where: { studentId_courseId: { studentId, courseId: c.courseId } },
          create: { studentId, courseId: c.courseId, level: c.level },
          update: { level: c.level },
        });
      }
    }
    return fired;
  }

  /** Students under 75% in the given courses, lowest first. */
  async belowMinimum(courseIds: string[]) {
    const rows = await this.prisma.attendance.groupBy({ by: ['studentId', 'courseId', 'status'], where: { courseId: { in: courseIds } }, _count: true });
    const tally = new Map<string, { a: number; t: number }>();
    for (const r of rows) {
      const key = `${r.studentId}|${r.courseId}`;
      const x = tally.get(key) ?? { a: 0, t: 0 };
      x.t += r._count;
      if (r.status !== 'ABSENT') x.a += r._count;
      tally.set(key, x);
    }
    const low = [...tally.entries()].map(([k, v]) => ({ studentId: k.split('|')[0], courseId: k.split('|')[1], pct: (v.a / v.t) * 100 })).filter((x) => x.pct < MIN_PCT);
    const students = await this.prisma.student.findMany({ where: { id: { in: low.map((l) => l.studentId) } }, include: { user: true } });
    const courses = await this.prisma.course.findMany({ where: { id: { in: courseIds } } });
    return low
      .sort((a, b) => a.pct - b.pct)
      .map((l) => ({ name: students.find((s) => s.id === l.studentId)!.user.name, code: courses.find((c) => c.id === l.courseId)!.code, pct: l.pct }));
  }
}
