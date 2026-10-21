import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthUser } from '../common/types';

@Injectable()
export class AnnouncementsService {
  constructor(private prisma: PrismaService) {}

  /** Admins see everything; others see "all", their role's messages and their courses' messages. */
  async visibleTo(user: AuthUser, take?: number) {
    let where: object = {};
    if (user.role === 'TEACHER') {
      where = { OR: [{ audience: { in: ['ALL', 'TEACHER'] } }, { course: { teacherId: user.id } }] };
    } else if (user.role === 'STUDENT' || user.role === 'PARENT') {
      const classIds = (await this.prisma.student.findMany({ where: user.role === 'STUDENT' ? { userId: user.id } : { parentId: user.id } })).map((s) => s.classroomId);
      where = { OR: [{ audience: { in: ['ALL', user.role] } }, { course: { classroomId: { in: classIds } } }] };
    }
    const rows = await this.prisma.announcement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: { author: { select: { name: true } }, course: { select: { code: true } } },
    });
    return rows.map((a) => ({
      id: a.id, title: a.title, body: a.body, createdAt: a.createdAt,
      audience: a.audience === 'COURSE' ? a.course?.code ?? 'Course' : a.audience,
      by: a.byLabel ?? a.author.name,
      canDelete: user.role === 'ADMIN' || a.authorId === user.id,
    }));
  }
}
