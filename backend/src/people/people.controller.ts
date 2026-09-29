import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';

class CreatePersonDto {
  @IsIn(['TEACHER', 'STUDENT', 'PARENT'], { message: 'Choose a role: teacher, student or parent.' })
  role: 'TEACHER' | 'STUDENT' | 'PARENT';

  @IsString() @MinLength(2, { message: 'Enter the full name.' })
  name: string;

  @IsEmail({}, { message: 'Enter a valid email address.' })
  email: string;

  @IsString() @MinLength(6, { message: 'Password must be at least 6 characters.' })
  password: string;

  // Student only
  @IsOptional() @IsString() classroomId?: string;
  @IsOptional() @IsString() rollNo?: string;
  @IsOptional() @IsString() parentId?: string;
}

@Controller('people')
@Roles('ADMIN')
export class PeopleController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@Query('role') role?: string) {
    const users = await this.prisma.user.findMany({
      where: role ? { role } : { role: { not: 'ADMIN' } },
      orderBy: { name: 'asc' },
      include: {
        student: { include: { classroom: true, parent: { select: { name: true } } } },
        children: { select: { id: true } },
        courses: { select: { id: true } },
      },
    });
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      rollNo: u.student?.rollNo ?? null,
      classroom: u.student?.classroom.name ?? null,
      parentName: u.student?.parent?.name ?? null,
      childCount: u.children.length,
      courseCount: u.courses.length,
    }));
  }

  @Post()
  async create(@Body() dto: CreatePersonDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new BadRequestException('Someone already uses this email address.');
    }
    if (dto.role === 'STUDENT') {
      if (!dto.classroomId || !dto.rollNo?.trim()) throw new BadRequestException('Students need a class and a roll number.');
      if (!(await this.prisma.classroom.findUnique({ where: { id: dto.classroomId } }))) throw new BadRequestException('That class does not exist.');
      if (await this.prisma.student.findUnique({ where: { rollNo: dto.rollNo.trim() } })) throw new BadRequestException('This roll number is already taken.');
      if (dto.parentId && !(await this.prisma.user.findFirst({ where: { id: dto.parentId, role: 'PARENT' } }))) {
        throw new BadRequestException('The selected parent does not exist.');
      }
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        passwordHash,
        role: dto.role,
        ...(dto.role === 'STUDENT'
          ? { student: { create: { rollNo: dto.rollNo!.trim(), classroomId: dto.classroomId!, parentId: dto.parentId || null } } }
          : {}),
      },
    });
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() me: AuthUser) {
    if (id === me.id) throw new ForbiddenException('You cannot delete your own account.');
    const user = await this.prisma.user.findUnique({ where: { id }, include: { courses: { select: { id: true } } } });
    if (!user) throw new NotFoundException('Person not found.');
    if (user.role === 'ADMIN') throw new ForbiddenException('Admin accounts cannot be deleted here.');
    if (user.courses.length) throw new BadRequestException('Reassign this teacher\'s courses before deleting them.');
    await this.prisma.user.delete({ where: { id } });
    return { ok: true };
  }
}
