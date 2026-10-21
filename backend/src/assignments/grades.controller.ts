import { BadRequestException, Body, Controller, Get, Put, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsString, Max, Min, ValidateNested } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { AccessService } from '../common/access.service';
import { NotifyService } from '../common/notify.service';
import { ActivityService } from '../common/activity.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';

export const INTERNAL_MAX = 25;
export const DEGREE_CREDITS = 160;

class MarkDto {
  @IsString() studentId: string;
  @IsInt({ message: 'Marks must be whole numbers.' }) @Min(0, { message: 'Marks cannot be negative.' }) @Max(INTERNAL_MAX, { message: `Marks are out of ${INTERNAL_MAX}.` }) marks: number;
}
class SaveMarksDto {
  @IsString() courseId: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => MarkDto) marks: MarkDto[];
}

/** CGPA is the credit-weighted mean of semester SGPAs. */
export function cgpaOf(results: { sgpa: number; credits: number }[]) {
  const credits = results.reduce((n, r) => n + r.credits, 0);
  return credits ? results.reduce((n, r) => n + r.sgpa * r.credits, 0) / credits : null;
}

@Controller('grades')
export class GradesController {
  constructor(private prisma: PrismaService, private access: AccessService, private notify: NotifyService, private activity: ActivityService) {}

  @Get()
  async grades(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) {
    const sid = await this.access.resolveStudentId(user, studentId);
    const student = await this.prisma.student.findUniqueOrThrow({ where: { id: sid }, include: { results: { orderBy: { semester: 'asc' } } } });
    const courses = await this.prisma.course.findMany({ where: { classroomId: student.classroomId }, orderBy: { code: 'asc' } });
    const marks = await this.prisma.internalMark.findMany({ where: { studentId: sid } });
    const graded = await this.prisma.submission.findMany({
      where: { studentId: sid, marks: { not: null } },
      include: { assignment: { include: { course: true } } },
      orderBy: { gradedAt: 'desc' },
    });
    const cgpa = cgpaOf(student.results);
    return {
      max: INTERNAL_MAX,
      cgpa,
      creditsEarned: student.results.reduce((n, r) => n + r.credits, 0),
      degreeCredits: DEGREE_CREDITS,
      semesters: student.results.map((r) => ({ semester: r.semester, sgpa: r.sgpa })),
      internals: courses.map((c) => ({ code: c.code, name: c.name, marks: marks.find((m) => m.courseId === c.id)?.marks ?? null })),
      assignments: graded.map((g) => ({
        id: g.id, title: g.assignment.title, code: g.assignment.course.code,
        marks: g.marks!, maxMarks: g.assignment.maxMarks, feedback: g.feedback, gradedAt: g.gradedAt,
      })),
    };
  }

  /** Professor: internal marks for every student in one of their courses. */
  @Get('class')
  @Roles('TEACHER')
  async classMarks(@CurrentUser() user: AuthUser, @Query('courseId') courseId: string) {
    const course = await this.access.assertCanManageCourse(user, courseId);
    const students = await this.prisma.student.findMany({
      where: { classroomId: course.classroomId },
      include: { user: { select: { name: true } }, marks: { where: { courseId } } },
      orderBy: { rollNo: 'asc' },
    });
    return {
      max: INTERNAL_MAX,
      rows: students.map((s) => ({ studentId: s.id, name: s.user.name, rollNo: s.rollNo, marks: s.marks[0]?.marks ?? null })),
    };
  }

  @Put('class')
  @Roles('TEACHER')
  async saveMarks(@CurrentUser() user: AuthUser, @Body() dto: SaveMarksDto) {
    const course = await this.access.assertCanManageCourse(user, dto.courseId);
    const students = await this.prisma.student.findMany({ where: { classroomId: course.classroomId } });
    const ids = new Set(students.map((s) => s.id));
    if (dto.marks.some((m) => !ids.has(m.studentId))) throw new BadRequestException('One of the students is not in this course\'s class.');
    const before = await this.prisma.internalMark.findMany({ where: { courseId: dto.courseId } });
    const changed = dto.marks.filter((m) => before.find((b) => b.studentId === m.studentId)?.marks !== m.marks);
    await this.prisma.$transaction(
      changed.map((m) =>
        this.prisma.internalMark.upsert({
          where: { studentId_courseId: { studentId: m.studentId, courseId: dto.courseId } },
          create: { studentId: m.studentId, courseId: dto.courseId, marks: m.marks },
          update: { marks: m.marks },
        }),
      ),
    );
    const notifyIds = students.filter((s) => changed.some((c) => c.studentId === s.id)).flatMap((s) => [s.userId, s.parentId]);
    await this.notify.send(notifyIds, { title: `Internal marks updated for ${course.name}`, body: `${course.code} internal assessment, out of ${INTERNAL_MAX}.`, link: '/grades' });
    await this.activity.log(`${user.name} updated internal marks for ${course.code}`);
    return { saved: changed.length };
  }
}
