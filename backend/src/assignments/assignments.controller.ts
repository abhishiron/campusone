import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { IsDateString, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { AccessService } from '../common/access.service';
import { NotifyService } from '../common/notify.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';

class CreateAssignmentDto {
  @IsString({ message: 'Choose a course.' }) courseId: string;
  @IsString() @MinLength(3, { message: 'Give the assignment a title.' }) title: string;
  @IsString() @MinLength(3, { message: 'Add a short description.' }) description: string;
  @IsDateString({}, { message: 'Choose a due date.' }) dueDate: string;
  @IsInt({ message: 'Max marks must be a whole number.' }) @Min(1) @Max(1000) maxMarks: number;
}

class SubmitDto {
  @IsString() @MinLength(1, { message: 'Write your answer before submitting.' }) content: string;
}

class GradeDto {
  @IsInt({ message: 'Marks must be a whole number.' }) @Min(0, { message: 'Marks cannot be negative.' }) marks: number;
  @IsOptional() @IsString() feedback?: string;
}

const submissionView = (s: { id: string; content: string; submittedAt: Date; marks: number | null; feedback: string | null; gradedAt: Date | null } | null | undefined) =>
  s ? { id: s.id, content: s.content, submittedAt: s.submittedAt, marks: s.marks, feedback: s.feedback, gradedAt: s.gradedAt } : null;

@Controller()
export class AssignmentsController {
  constructor(private prisma: PrismaService, private access: AccessService, private notify: NotifyService) {}

  @Get('assignments')
  async list(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) {
    if (user.role === 'TEACHER' || user.role === 'ADMIN') {
      const rows = await this.prisma.assignment.findMany({
        where: user.role === 'TEACHER' ? { course: { teacherId: user.id } } : {},
        orderBy: { dueDate: 'desc' },
        include: { course: true, submissions: { select: { marks: true } } },
      });
      const classSizes = new Map<string, number>();
      for (const a of rows) {
        if (!classSizes.has(a.course.classroomId)) classSizes.set(a.course.classroomId, await this.prisma.student.count({ where: { classroomId: a.course.classroomId } }));
      }
      return rows.map((a) => ({
        id: a.id, title: a.title, description: a.description, dueDate: a.dueDate, maxMarks: a.maxMarks, createdAt: a.createdAt,
        course: { id: a.course.id, code: a.course.code, name: a.course.name },
        classSize: classSizes.get(a.course.classroomId) ?? 0,
        submittedCount: a.submissions.length,
        gradedCount: a.submissions.filter((s) => s.marks !== null).length,
      }));
    }

    const sid = await this.access.resolveStudentId(user, studentId);
    const student = await this.prisma.student.findUniqueOrThrow({ where: { id: sid } });
    const rows = await this.prisma.assignment.findMany({
      where: { course: { classroomId: student.classroomId } },
      orderBy: { dueDate: 'asc' },
      include: { course: true, submissions: { where: { studentId: sid } } },
    });
    return rows.map((a) => ({
      id: a.id, title: a.title, description: a.description, dueDate: a.dueDate, maxMarks: a.maxMarks, createdAt: a.createdAt,
      course: { id: a.course.id, code: a.course.code, name: a.course.name },
      submission: submissionView(a.submissions[0]),
    }));
  }

  @Post('assignments')
  @Roles('TEACHER')
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateAssignmentDto) {
    const course = await this.access.assertCanManageCourse(user, dto.courseId);
    const a = await this.prisma.assignment.create({
      data: { courseId: course.id, title: dto.title.trim(), description: dto.description.trim(), dueDate: new Date(dto.dueDate), maxMarks: dto.maxMarks },
    });
    const students = await this.prisma.student.findMany({ where: { classroomId: course.classroomId } });
    await this.notify.send(students.flatMap((s) => [s.userId, s.parentId]), {
      title: `New assignment in ${course.code}`,
      body: `${a.title} is due ${a.dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.`,
      link: '/assignments',
    });
    return a;
  }

  /** Everyone in the class, with their submission if they made one. */
  @Get('assignments/:id/submissions')
  @Roles('TEACHER', 'ADMIN')
  async submissions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const a = await this.prisma.assignment.findUnique({ where: { id }, include: { course: true } });
    if (!a) throw new NotFoundException('Assignment not found.');
    await this.access.assertCanManageCourse(user, a.courseId);
    const students = await this.prisma.student.findMany({
      where: { classroomId: a.course.classroomId },
      include: { user: { select: { name: true } }, submissions: { where: { assignmentId: id } } },
      orderBy: { rollNo: 'asc' },
    });
    return {
      assignment: { id: a.id, title: a.title, description: a.description, dueDate: a.dueDate, maxMarks: a.maxMarks, course: { code: a.course.code, name: a.course.name } },
      rows: students.map((s) => ({ studentId: s.id, name: s.user.name, rollNo: s.rollNo, submission: submissionView(s.submissions[0]) })),
    };
  }

  @Post('assignments/:id/submit')
  @Roles('STUDENT')
  async submit(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SubmitDto) {
    const student = await this.prisma.student.findUnique({ where: { userId: user.id } });
    if (!student) throw new NotFoundException('Student profile not found.');
    const a = await this.prisma.assignment.findUnique({ where: { id }, include: { course: true } });
    if (!a || a.course.classroomId !== student.classroomId) throw new NotFoundException('Assignment not found.');
    const existing = await this.prisma.submission.findUnique({ where: { assignmentId_studentId: { assignmentId: id, studentId: student.id } } });
    if (existing?.gradedAt) throw new ForbiddenException('This submission is already graded and can no longer be changed.');

    const saved = await this.prisma.submission.upsert({
      where: { assignmentId_studentId: { assignmentId: id, studentId: student.id } },
      create: { assignmentId: id, studentId: student.id, content: dto.content.trim() },
      update: { content: dto.content.trim(), submittedAt: new Date() },
    });
    await this.notify.send([a.course.teacherId], {
      title: `${user.name} submitted ${a.title}`,
      body: `${a.course.code} · ready for grading.`,
      link: '/assignments',
    });
    return submissionView(saved);
  }

  @Post('submissions/:id/grade')
  @Roles('TEACHER')
  async grade(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: GradeDto) {
    const sub = await this.prisma.submission.findUnique({
      where: { id },
      include: { assignment: { include: { course: true } }, student: true },
    });
    if (!sub) throw new NotFoundException('Submission not found.');
    await this.access.assertCanManageCourse(user, sub.assignment.courseId);
    if (dto.marks > sub.assignment.maxMarks) throw new BadRequestException(`Marks cannot be more than ${sub.assignment.maxMarks}.`);

    const saved = await this.prisma.submission.update({
      where: { id },
      data: { marks: dto.marks, feedback: dto.feedback?.trim() || null, gradedAt: new Date() },
    });
    await this.notify.send([sub.student.userId, sub.student.parentId], {
      title: `${sub.assignment.title} was graded`,
      body: `${dto.marks}/${sub.assignment.maxMarks} in ${sub.assignment.course.code}.`,
      link: '/grades',
    });
    return submissionView(saved);
  }
}
