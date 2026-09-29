import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthUser } from './types';

/** Shared row-level access checks so every controller applies the same rules. */
@Injectable()
export class AccessService {
  constructor(private prisma: PrismaService) {}

  /** Students see themselves, parents see their children, staff see everyone. */
  async assertCanViewStudent(user: AuthUser, studentId: string) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException('Student not found.');
    if (user.role === 'STUDENT' && student.userId !== user.id) throw new ForbiddenException('You can only view your own records.');
    if (user.role === 'PARENT' && student.parentId !== user.id) throw new ForbiddenException('You can only view your own child\'s records.');
    return student;
  }

  /** Resolve which student a request is about: explicit id (validated) or the caller's own profile. */
  async resolveStudentId(user: AuthUser, studentId?: string): Promise<string> {
    if (studentId) {
      await this.assertCanViewStudent(user, studentId);
      return studentId;
    }
    if (user.role === 'STUDENT') {
      const s = await this.prisma.student.findUnique({ where: { userId: user.id } });
      if (!s) throw new NotFoundException('Student profile not found.');
      return s.id;
    }
    if (user.role === 'PARENT') {
      const s = await this.prisma.student.findFirst({ where: { parentId: user.id }, orderBy: { rollNo: 'asc' } });
      if (!s) throw new NotFoundException('No child is linked to this account yet.');
      return s.id;
    }
    throw new ForbiddenException('Choose a student first.');
  }

  /** Teachers may only touch their own courses; admins may touch all. */
  async assertCanManageCourse(user: AuthUser, courseId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found.');
    if (user.role === 'TEACHER' && course.teacherId !== user.id) throw new ForbiddenException('This course is assigned to another teacher.');
    if (user.role !== 'TEACHER' && user.role !== 'ADMIN') throw new ForbiddenException('Only teachers can do this.');
    return course;
  }
}
