import { BadRequestException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';
import { AuthUser } from '../common/types';
import { CacheService } from '../common/cache.service';

/** After this many failed sign-ins for one ID, further attempts are refused until the window ends. */
export const MAX_FAILED_LOGINS = 5;
const LOCK_WINDOW_SEC = 15 * 60;

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private cache: CacheService) {}

  /** Students may sign in with their enrollment number; everyone can use their email. */
  async login(identifier: string, password: string) {
    const id = identifier.trim();
    const failKey = `login:fail:${id.toLowerCase()}`;
    if (((await this.cache.get<number>(failKey)) ?? 0) >= MAX_FAILED_LOGINS) {
      throw new HttpException('Too many failed sign-in attempts for this ID. Try again in 15 minutes.', HttpStatus.TOO_MANY_REQUESTS);
    }
    let user = await this.prisma.user.findUnique({ where: { email: id.toLowerCase() } });
    if (!user && /^\d{6,}$/.test(id)) {
      const s = await this.prisma.student.findUnique({ where: { rollNo: id }, include: { user: true } });
      user = s?.user ?? null;
    }
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !ok) {
      await this.cache.incr(failKey, LOCK_WINDOW_SEC);
      throw new UnauthorizedException('That ID and password don\'t match an account. Check them and try again.');
    }
    await this.cache.del(failKey);
    if (user.status === 'SUSPENDED') throw new UnauthorizedException('This account is suspended. Contact the administrator.');
    const token = await this.jwt.signAsync({ sub: user.id, role: user.role });
    const authUser: AuthUser = { id: user.id, name: user.name, email: user.email, role: user.role as AuthUser['role'] };
    return { token, ...(await this.profile(authUser)) };
  }

  /** Replace the password. Required before anything else when the account still has a temporary one. */
  async changePassword(user: AuthUser, currentPassword: string, newPassword: string) {
    const row = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
    if (!(await bcrypt.compare(currentPassword, row.passwordHash))) throw new BadRequestException('Your current password is not correct.');
    if (currentPassword === newPassword) throw new BadRequestException('Choose a password different from the current one.');
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10), mustChangePassword: false } });
    return this.profile(user);
  }

  /** The signed-in user plus the students they can view (self for students, children for parents). */
  async profile(user: AuthUser) {
    const full = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { dept: true, designation: true, mustChangePassword: true } });
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
      user.role === 'SUPERADMIN' ? 'Platform owner'
      : user.role === 'SCHOOL' ? 'School account'
      : user.role === 'ADMIN' ? 'System administrator'
      : user.role === 'TEACHER' ? `${full.designation ?? 'Professor'}, ${full.dept ?? ''}`.replace(/, $/, '')
      : user.role === 'STUDENT' && students[0] ? `${students[0].program}, semester ${students[0].semester}`
      : user.role === 'PARENT' ? `Parent of ${students.map((s) => s.name.split(' ')[0]).join(' and ') || 'a student'}`
      : '';
    return { user: { ...user, title, mustChangePassword: full.mustChangePassword }, students };
  }
}
