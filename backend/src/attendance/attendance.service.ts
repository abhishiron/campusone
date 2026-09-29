import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface CourseAttendance {
  courseId: string;
  code: string;
  name: string;
  present: number;
  late: number;
  absent: number;
  total: number;
  percentage: number | null;
}

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  /** Late counts as attended. Percentage is null until a class has been recorded. */
  async summaryForStudent(studentId: string) {
    const student = await this.prisma.student.findUniqueOrThrow({ where: { id: studentId } });
    const courses = await this.prisma.course.findMany({ where: { classroomId: student.classroomId }, orderBy: { code: 'asc' } });
    const records = await this.prisma.attendance.findMany({ where: { studentId }, orderBy: { date: 'desc' } });

    const perCourse: CourseAttendance[] = courses.map((c) => {
      const rows = records.filter((r) => r.courseId === c.id);
      const present = rows.filter((r) => r.status === 'PRESENT').length;
      const late = rows.filter((r) => r.status === 'LATE').length;
      const absent = rows.filter((r) => r.status === 'ABSENT').length;
      const total = rows.length;
      return { courseId: c.id, code: c.code, name: c.name, present, late, absent, total, percentage: total ? Math.round(((present + late) / total) * 100) : null };
    });

    const total = records.length;
    const attended = records.filter((r) => r.status !== 'ABSENT').length;
    const courseName = new Map(courses.map((c) => [c.id, `${c.code} · ${c.name}`]));
    const recent = records.slice(0, 12).map((r) => ({ id: r.id, date: r.date, status: r.status, course: courseName.get(r.courseId) ?? '' }));

    return { overall: total ? Math.round((attended / total) * 100) : null, total, courses: perCourse, recent };
  }
}
