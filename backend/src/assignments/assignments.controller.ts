import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Query, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { AccessService } from '../common/access.service';
import { NotifyService } from '../common/notify.service';
import { ActivityService } from '../common/activity.service';
import { FilesService, MB, UploadedFileLike } from '../common/files.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { DATE_RE, parseISO, today } from '../common/dates';

const ATTACH_EXTS = ['.pdf', '.zip', '.docx', '.pptx', '.png', '.jpg', '.jpeg', '.txt', '.sql'];
const SUBMIT_EXTS = ['.pdf', '.zip', '.docx', '.png', '.jpg', '.jpeg'];

class CreateAssignmentDto {
  @IsString({ message: 'Choose a course.' }) courseId: string;
  @IsString() @MinLength(3, { message: 'Give the assignment a title.' }) @MaxLength(100) title: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @Matches(DATE_RE, { message: 'Choose a due date.' }) due: string;
  @Type(() => Number) @IsInt({ message: 'Maximum marks must be a whole number.' }) @Min(1) @Max(100) maxMarks: number;
}

class SubmitDto {
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

class GradeDto {
  @IsInt({ message: 'Marks must be a whole number.' }) @Min(0, { message: 'Marks cannot be negative.' }) marks: number;
  @IsOptional() @IsString() feedback?: string;
}

type FileRow = { id: string; name: string; size: number };
const fileView = (f: FileRow | null | undefined) => (f ? { id: f.id, name: f.name, size: f.size } : null);
const submissionView = (s: { id: string; content: string; submittedAt: Date; marks: number | null; feedback: string | null; gradedAt: Date | null; file?: FileRow | null } | null | undefined) =>
  s ? { id: s.id, note: s.content, submittedAt: s.submittedAt, marks: s.marks, feedback: s.feedback, gradedAt: s.gradedAt, file: fileView(s.file) } : null;
/** Due dates are whole days: work is accepted until the end of the due date. */
const endOfDay = (d: string) => { const x = parseISO(d); x.setHours(23, 59, 59, 0); return x; };

@Controller()
export class AssignmentsController {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private notify: NotifyService,
    private activity: ActivityService,
    private files: FilesService,
  ) {}

  @Get('assignments')
  async list(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) {
    if (user.role === 'TEACHER' || user.role === 'ADMIN') {
      const rows = await this.prisma.assignment.findMany({
        where: user.role === 'TEACHER' ? { course: { teacherId: user.id } } : {},
        orderBy: { dueDate: 'desc' },
        include: { course: { include: { classroom: { include: { _count: { select: { students: true } } } } } }, files: true, submissions: { select: { marks: true } } },
      });
      return rows.map((a) => ({
        id: a.id, title: a.title, description: a.description, dueDate: a.dueDate, maxMarks: a.maxMarks,
        course: { id: a.course.id, code: a.course.code, name: a.course.name },
        files: a.files.map(fileView),
        classSize: a.course.classroom._count.students,
        submittedCount: a.submissions.length,
        gradedCount: a.submissions.filter((s) => s.marks !== null).length,
      }));
    }

    const sid = await this.access.resolveStudentId(user, studentId);
    const student = await this.prisma.student.findUniqueOrThrow({ where: { id: sid } });
    const rows = await this.prisma.assignment.findMany({
      where: { course: { classroomId: student.classroomId } },
      orderBy: { dueDate: 'asc' },
      include: { course: true, files: true, submissions: { where: { studentId: sid }, include: { file: true } } },
    });
    return rows.map((a) => ({
      id: a.id, title: a.title, description: a.description, dueDate: a.dueDate, maxMarks: a.maxMarks,
      course: { id: a.course.id, code: a.course.code, name: a.course.name },
      files: a.files.map(fileView),
      submission: submissionView(a.submissions[0]),
    }));
  }

  @Post('assignments')
  @Roles('TEACHER')
  @UseInterceptors(FilesInterceptor('files', 5, { limits: { fileSize: 20 * MB } }))
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateAssignmentDto, @UploadedFiles() uploads: UploadedFileLike[] = []) {
    const course = await this.access.assertCanManageCourse(user, dto.courseId);
    if (dto.due < today()) throw new BadRequestException('The due date has already passed. Pick today or a later date.');
    const a = await this.prisma.assignment.create({
      data: { courseId: course.id, title: dto.title.trim(), description: dto.description?.trim() ?? '', dueDate: endOfDay(dto.due), maxMarks: dto.maxMarks },
    });
    for (const f of uploads) await this.files.save(user, f, { maxMB: 20, exts: ATTACH_EXTS, assignmentId: a.id });
    const students = await this.prisma.student.findMany({ where: { classroomId: course.classroomId } });
    await this.notify.send(students.flatMap((s) => [s.userId, s.parentId]), {
      title: `New assignment in ${course.code}`,
      body: `"${a.title}" is due ${a.dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.`,
      link: '/assignments',
    });
    await this.activity.log(`${user.name} created "${a.title}" for ${course.code}`);
    return { id: a.id, files: uploads.length };
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
      include: { user: { select: { name: true } }, submissions: { where: { assignmentId: id }, include: { file: true } } },
      orderBy: { rollNo: 'asc' },
    });
    return {
      assignment: { id: a.id, title: a.title, dueDate: a.dueDate, maxMarks: a.maxMarks, course: { code: a.course.code, name: a.course.name } },
      rows: students.map((s) => ({ studentId: s.id, name: s.user.name, rollNo: s.rollNo, submission: submissionView(s.submissions[0]) })),
    };
  }

  @Post('assignments/:id/submit')
  @Roles('STUDENT')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * MB } }))
  async submit(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SubmitDto, @UploadedFile() upload?: UploadedFileLike) {
    const student = await this.access.ownStudent(user);
    const a = await this.prisma.assignment.findUnique({ where: { id }, include: { course: true } });
    if (!a || a.course.classroomId !== student.classroomId) throw new NotFoundException('Assignment not found.');
    if (a.dueDate < new Date()) throw new BadRequestException('The due date has passed, so this assignment no longer accepts work.');
    const existing = await this.prisma.submission.findUnique({ where: { assignmentId_studentId: { assignmentId: id, studentId: student.id } } });
    if (existing?.gradedAt) throw new ForbiddenException('This submission is already graded and can no longer be changed.');
    if (!upload) throw new BadRequestException('Choose a file to submit.');

    const file = await this.files.save(user, upload, { maxMB: 20, exts: SUBMIT_EXTS });
    const saved = await this.prisma.submission.upsert({
      where: { assignmentId_studentId: { assignmentId: id, studentId: student.id } },
      create: { assignmentId: id, studentId: student.id, content: dto.note?.trim() ?? '', fileId: file.id },
      update: { content: dto.note?.trim() ?? '', fileId: file.id, submittedAt: new Date() },
      include: { file: true },
    });
    await this.notify.send([a.course.teacherId], { title: `${user.name} submitted ${a.title}`, body: `${a.course.code}, ready for grading.`, link: '/assignments' });
    await this.activity.log(`${user.name} submitted "${a.title}"`);
    return submissionView(saved);
  }

  @Post('submissions/:id/grade')
  @Roles('TEACHER')
  async grade(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: GradeDto) {
    const sub = await this.prisma.submission.findUnique({ where: { id }, include: { assignment: { include: { course: true } }, student: true } });
    if (!sub) throw new NotFoundException('Submission not found.');
    await this.access.assertCanManageCourse(user, sub.assignment.courseId);
    if (dto.marks > sub.assignment.maxMarks) throw new BadRequestException(`Marks cannot be more than ${sub.assignment.maxMarks}.`);
    const saved = await this.prisma.submission.update({ where: { id }, data: { marks: dto.marks, feedback: dto.feedback?.trim() || null, gradedAt: new Date() } });
    await this.notify.send([sub.student.userId, sub.student.parentId], {
      title: `${sub.assignment.title} was graded`,
      body: `${dto.marks}/${sub.assignment.maxMarks} in ${sub.assignment.course.code}.`,
      link: '/grades',
    });
    return submissionView(saved);
  }
}
