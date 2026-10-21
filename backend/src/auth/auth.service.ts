import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';
import { AuthUser } from '../common/types';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  /** Students may sign in with their enrollment number; everyone can use their email. */
  async login(identifier: string, password: string) {
    const id = identifier.trim();
    let user = await this.prisma.user.findUnique({ where: { email: id.toLowerCase() } });
    if (!user && /^\d{6,}$/.test(id)) {
      const s = await this.prisma.student.findUnique({ where: { rollNo: id }, include: { user: true } });
      user = s?.user ?? null;
    }
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !ok) throw new UnauthorizedException('That ID and password don\'t match an account. Check them and try again.');
    if (user.status === 'SUSPENDED') throw new UnauthorizedException('This account is suspended. Contact the administrator.');
    const token = await this.jwt.signAsync({ sub: user.id, role: user.role });
    const authUser: AuthUser = { id: user.id, name: user.name, email: user.email, role: user.role as AuthUser['role'] };
    return { token, ...(await this.profile(authUser)) };
  }

  /** The signed-in user plus the students they can view (self for students, children for parents). */
  async profile(user: AuthUser) {
    const full = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { dept: true, designation: true } });
    let where: object | null = null;
    if (user.role === 'STUDENT') where = { userId: user.id };
    if (user.role === 'PARENT') where = { parentId: user.id };
    const rows = where
      ? await this.prisma.student.findMany({ where, include: { user: { select: { name: true, email: true } }, classroom: true }, orderBy: { rollNo: 'asc' } })
      : [];
    const students = rows.map((s) => ({
      id: s.id, name: s.user.name, email: s.user.email, rollNo: s.rollNo,
      classroom: s.classroom.name, program: s.classroom.program, batch: s.classroom.batch, semester: s.classroom.semester,
    }));
    const title =
      user.role === 'ADMIN' ? 'System administrator'
      : user.role === 'TEACHER' ? `${full.designation ?? 'Professor'}, ${full.dept ?? ''}`.replace(/, $/, '')
      : user.role === 'STUDENT' && students[0] ? `${students[0].program}, semester ${students[0].semester}`
      : user.role === 'PARENT' ? `Parent of ${students.map((s) => s.name.split(' ')[0]).join(' and ') || 'a student'}`
      : '';
    return { user: { ...user, title }, students };
  }
}
