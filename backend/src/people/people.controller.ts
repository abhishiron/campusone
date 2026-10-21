import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';
import { ActivityService } from '../common/activity.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';

export const DEPTS = ['IT', 'CSE', 'ECE', 'EEE', 'ME', 'Civil'];

class CreatePersonDto {
  @IsIn(['STUDENT', 'TEACHER'], { message: 'Choose student or faculty.' }) role: 'STUDENT' | 'TEACHER';
  @IsString() @MinLength(2, { message: 'Enter the full name.' }) name: string;
  @IsEmail({}, { message: 'Enter a valid email address.' }) email: string;
  @IsIn(DEPTS, { message: 'Choose a department.' }) dept: string;
}

class StatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED']) status: 'ACTIVE' | 'SUSPENDED';
}

@Controller('people')
@Roles('ADMIN')
export class PeopleController {
  constructor(private prisma: PrismaService, private activity: ActivityService) {}

  @Get()
  async list(@Query('role') role = 'STUDENT', @Query('q') q = '') {
    const term = q.trim();
    const users = await this.prisma.user.findMany({
      where: {
        role,
        ...(term ? { OR: [{ name: { contains: term } }, { email: { contains: term.toLowerCase() } }, { student: { rollNo: { contains: term } } }] } : {}),
      },
      orderBy: { name: 'asc' },
      include: { student: { include: { classroom: true } } },
    });
    return users.map((u) => ({
      id: u.id, name: u.name, email: u.email, role: u.role, status: u.status,
      dept: u.student?.classroom.dept ?? u.dept ?? '', designation: u.designation,
      rollNo: u.student?.rollNo ?? null, classroom: u.student?.classroom.name ?? null,
    }));
  }

  @Get('counts')
  async counts() {
    const [students, faculty] = await Promise.all([this.prisma.user.count({ where: { role: 'STUDENT' } }), this.prisma.user.count({ where: { role: 'TEACHER' } })]);
    return { students, faculty };
  }

  /** There is no email service yet, so the new account gets a one-time password the admin hands over. */
  @Post()
  async create(@CurrentUser() me: AuthUser, @Body() dto: CreatePersonDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new BadRequestException('A user with this email already exists. Use a different email.');
    const tempPassword = randomBytes(5).toString('hex');
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    let studentData = {};
    if (dto.role === 'STUDENT') {
      const classroom = await this.prisma.classroom.findFirst({ where: { dept: dto.dept }, orderBy: { name: 'asc' } });
      if (!classroom) throw new BadRequestException(`There is no ${dto.dept} class yet. Create one first.`);
      let rollNo = '';
      do rollNo = String(100 + Math.floor(Math.random() * 899)) + '15003123';
      while (await this.prisma.student.findUnique({ where: { rollNo } }));
      studentData = { student: { create: { rollNo, classroomId: classroom.id } } };
    }
    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(), email, passwordHash, role: dto.role, dept: dto.dept,
        designation: dto.role === 'TEACHER' ? 'Assistant Professor' : null,
        ...studentData,
      },
      include: { student: true },
    });
    await this.activity.log(`${me.name} added ${user.name} as ${dto.role === 'STUDENT' ? 'a student' : 'faculty'}`);
    return { id: user.id, name: user.name, email: user.email, rollNo: user.student?.rollNo ?? null, tempPassword };
  }

  @Patch(':id/status')
  async setStatus(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: StatusDto) {
    if (id === me.id) throw new ForbiddenException('You cannot suspend your own account.');
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found.');
    if (user.role === 'ADMIN') throw new ForbiddenException('Admin accounts cannot be suspended here.');
    await this.prisma.user.update({ where: { id }, data: { status: dto.status } });
    await this.activity.log(`${user.name}'s account was ${dto.status === 'ACTIVE' ? 'activated' : 'suspended'}`);
    return { ok: true };
  }
}
