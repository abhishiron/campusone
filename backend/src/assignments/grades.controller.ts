import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AccessService } from '../common/access.service';
import { CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/types';

@Controller('grades')
export class GradesController {
  constructor(private prisma: PrismaService, private access: AccessService) {}

  @Get()
  async grades(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) {
    const sid = await this.access.resolveStudentId(user, studentId);
    const student = await this.prisma.student.findUniqueOrThrow({ where: { id: sid } });
    const courses = await this.prisma.course.findMany({ where: { classroomId: student.classroomId }, orderBy: { code: 'asc' } });
    const graded = await this.prisma.submission.findMany({
      where: { studentId: sid, marks: { not: null } },
      include: { assignment: true },
      orderBy: { gradedAt: 'desc' },
    });

    const perCourse = courses.map((c) => {
      const items = graded.filter((g) => g.assignment.courseId === c.id);
      const earned = items.reduce((n, g) => n + (g.marks ?? 0), 0);
      const possible = items.reduce((n, g) => n + g.assignment.maxMarks, 0);
      return {
        courseId: c.id, code: c.code, name: c.name,
        gradedCount: items.length, earned, possible,
        percentage: possible ? Math.round((earned / possible) * 100) : null,
        items: items.map((g) => ({ id: g.id, title: g.assignment.title, marks: g.marks!, maxMarks: g.assignment.maxMarks, feedback: g.feedback, gradedAt: g.gradedAt })),
      };
    });

    const earned = perCourse.reduce((n, c) => n + c.earned, 0);
    const possible = perCourse.reduce((n, c) => n + c.possible, 0);
    return { overall: possible ? Math.round((earned / possible) * 100) : null, courses: perCourse };
  }
}
