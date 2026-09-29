import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { AccessService } from '../common/access.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';

class CreateClassDto {
  @IsString() @MinLength(1, { message: 'Enter a class name.' })
  name: string;
}

class CreateCourseDto {
  @IsString() @MinLength(2, { message: 'Enter a course code.' }) code: string;
  @IsString() @MinLength(2, { message: 'Enter a course name.' }) name: string;
  @IsString({ message: 'Choose a class.' }) classroomId: string;
  @IsString({ message: 'Choose a teacher.' }) teacherId: string;
}

@Controller()
export class AcademicsController {
  constructor(private prisma: PrismaService, private access: AccessService) {}

  @Get('classrooms')
  @Roles('ADMIN', 'TEACHER')
  async classrooms() {
    const rows = await this.prisma.classroom.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { students: true, courses: true } } },
    });
    return rows.map((c) => ({ id: c.id, name: c.name, studentCount: c._count.students, courseCount: c._count.courses }));
  }

  @Post('classrooms')
  @Roles('ADMIN')
  async createClassroom(@Body() dto: CreateClassDto) {
    const name = dto.name.trim();
    if (await this.prisma.classroom.findUnique({ where: { name } })) throw new BadRequestException('A class with this name already exists.');
    return this.prisma.classroom.create({ data: { name } });
  }

  /** Admin: all courses. Teacher: own courses. Student/parent: the child's class courses. */
  @Get('courses')
  async courses(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) {
    let where: object = {};
    if (user.role === 'TEACHER') where = { teacherId: user.id };
    if (user.role === 'STUDENT' || user.role === 'PARENT') {
      const sid = await this.access.resolveStudentId(user, studentId);
      const s = await this.prisma.student.findUnique({ where: { id: sid } });
      where = { classroomId: s!.classroomId };
    }
    const rows = await this.prisma.course.findMany({
      where,
      orderBy: { code: 'asc' },
      include: { classroom: true, teacher: { select: { id: true, name: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      classroomId: c.classroomId,
      classroom: c.classroom.name,
      teacherId: c.teacher.id,
      teacher: c.teacher.name,
    }));
  }

  @Post('courses')
  @Roles('ADMIN')
  async createCourse(@Body() dto: CreateCourseDto) {
    const code = dto.code.trim().toUpperCase();
    if (await this.prisma.course.findUnique({ where: { code } })) throw new BadRequestException('This course code is already in use.');
    if (!(await this.prisma.classroom.findUnique({ where: { id: dto.classroomId } }))) throw new BadRequestException('That class does not exist.');
    if (!(await this.prisma.user.findFirst({ where: { id: dto.teacherId, role: 'TEACHER' } }))) throw new BadRequestException('That teacher does not exist.');
    return this.prisma.course.create({ data: { code, name: dto.name.trim(), classroomId: dto.classroomId, teacherId: dto.teacherId } });
  }
}
