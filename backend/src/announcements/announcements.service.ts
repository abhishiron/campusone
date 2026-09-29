import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthUser } from '../common/types';

@Injectable()
export class AnnouncementsService {
  constructor(private prisma: PrismaService) {}

  /** Admins see everything; others see "all" plus messages aimed at their role. */
  async visibleTo(user: AuthUser, take?: number) {
    const rows = await this.prisma.announcement.findMany({
      where: user.role === 'ADMIN' ? {} : { audience: { in: ['ALL', user.role] } },
      orderBy: { createdAt: 'desc' },
      take,
      include: { author: { select: { name: true, role: true } } },
    });
    return rows.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      audience: a.audience,
      createdAt: a.createdAt,
      author: a.author.name,
      authorRole: a.author.role,
      canDelete: user.role === 'ADMIN' || a.authorId === user.id,
    }));
  }
}
