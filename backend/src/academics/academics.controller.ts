import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsInt, IsString, Max, Min, MinLength } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { AccessService } from '../common/access.service';
import { ActivityService } from '../common/activity.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { PERIODS } from '../common/dates';

class CreateCourseDto {
  @IsString() @MinLength(2, { message: 'Enter a course code.' }) code: string;
  @IsString() @MinLength(2, { message: 'Enter a course name.' }) name: string;
  @IsString({ message: 'Choose a class.' }) classroomId: string;
  @IsString({ message: 'Choose an instructor.' }) teacherId: string;
  @IsInt() @Min(1) @Max(6) credits: number;
}

@Controller()
export class AcademicsController {
  constructor(private prisma: PrismaService, private access: AccessService, private activity: ActivityService) {}

  @Get('classrooms')
  @Roles('ADMIN', 'TEACHER')
  async classrooms() {
    const rows = await this.prisma.classroom.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { students: true, courses: true } } } });
    return rows.map((c) => ({ id: c.id, name: c.name, dept: c.dept, studentCount: c._count.students, courseCount: c._count.courses }));
  }

  /** Admin: all courses. Professor: own courses. Student/parent: the student's class courses. */
  @Get('courses')
  async courses(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) {
    let where: object = {};
    if (user.role === 'TEACHER') where = { teacherId: user.id };
    if (user.role === 'STUDENT' || user.role === 'PARENT') {
      const s = await this.prisma.student.findUniqueOrThrow({ where: { id: await this.access.resolveStudentId(user, studentId) } });
      where = { classroomId: s.classroomId };
    }
    const rows = await this.prisma.course.findMany({
      where,
      orderBy: { code: 'asc' },
      include: { classroom: { include: { _count: { select: { students: true } } } }, teacher: { select: { id: true, name: true } } },
    });
    return rows.map((c) => ({
      id: c.id, code: c.code, name: c.name, credits: c.credits, capacity: c.capacity, hue: c.hue,
      classroomId: c.classroomId, classroom: c.classroom.name, enrolled: c.classroom._count.students,
      teacherId: c.teacher.id, teacher: c.teacher.name,
    }));
  }

  @Post('courses')
  @Roles('ADMIN')
  async createCourse(@CurrentUser() user: AuthUser, @Body() dto: CreateCourseDto) {
    const code = dto.code.trim().toUpperCase();
    if (await this.prisma.course.findUnique({ where: { code } })) throw new BadRequestException('This course code is already in use.');
    if (!(await this.prisma.classroom.findUnique({ where: { id: dto.classroomId } }))) throw new BadRequestException('That class does not exist.');
    if (!(await this.prisma.user.findFirst({ where: { id: dto.teacherId, role: 'TEACHER' } }))) throw new BadRequestException('That instructor does not exist.');
    const hue = [...code].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 360, 7);
    const c = await this.prisma.course.create({ data: { code, name: dto.name.trim(), credits: dto.credits, classroomId: dto.classroomId, teacherId: dto.teacherId, hue } });
    await this.activity.log(`${user.name} added the course ${code}, ${c.name}`);
    return c;
  }

  /** Weekly grid. Students and parents get the class timetable; professors get their own teaching slots. */
  @Get('timetable')
  @Roles('STUDENT', 'PARENT', 'TEACHER')
  async timetable(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) {
    let where: object;
    let label: string;
    if (user.role === 'TEACHER') {
      where = { course: { teacherId: user.id } };
      label = 'Your teaching slots';
    } else {
      const s = await this.prisma.student.findUniqueOrThrow({ where: { id: await this.access.resolveStudentId(user, studentId) }, include: { classroom: true } });
      where = { course: { classroomId: s.classroomId } };
      label = `Section ${s.classroom.name}`;
    }
    const slots = await this.prisma.timetableSlot.findMany({ where, include: { course: true } });
    const courses = new Map(slots.map((s) => [s.course.id, { code: s.course.code, name: s.course.name, hue: s.course.hue }]));
    return {
      label,
      periods: PERIODS,
      slots: slots.map((s) => ({ day: s.day, slot: s.slot, room: s.room, code: s.course.code, courseId: s.courseId })),
      courses: [...courses.values()].sort((a, b) => a.code.localeCompare(b.code)),
    };
  }
}
