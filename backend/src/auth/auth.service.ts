import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';
import { AuthUser } from '../common/types';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !ok) throw new UnauthorizedException('Email or password is incorrect.');
    const token = await this.jwt.signAsync({ sub: user.id, role: user.role });
    const authUser: AuthUser = { id: user.id, name: user.name, email: user.email, role: user.role as AuthUser['role'] };
    return { token, ...(await this.profile(authUser)) };
  }

  /** The signed-in user plus the students they can view (self for students, children for parents). */
  async profile(user: AuthUser) {
    let where: object | null = null;
    if (user.role === 'STUDENT') where = { userId: user.id };
    if (user.role === 'PARENT') where = { parentId: user.id };
    const rows = where
      ? await this.prisma.student.findMany({
          where,
          include: { user: { select: { name: true } }, classroom: { select: { name: true } } },
          orderBy: { rollNo: 'asc' },
        })
      : [];
    const students = rows.map((s) => ({ id: s.id, name: s.user.name, rollNo: s.rollNo, classroom: s.classroom.name }));
    return { user, students };
  }
}
