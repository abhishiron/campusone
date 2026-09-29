import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

/**
 * In-app notification fan-out. Today this writes straight to the database;
 * the same method is the single place to publish to Kafka later.
 */
@Injectable()
export class NotifyService {
  constructor(private prisma: PrismaService) {}

  async send(userIds: (string | null | undefined)[], n: { title: string; body: string; link?: string }) {
    const ids = [...new Set(userIds.filter((x): x is string => !!x))];
    if (!ids.length) return;
    await this.prisma.notification.createMany({
      data: ids.map((userId) => ({ userId, title: n.title, body: n.body, link: n.link ?? null })),
    });
  }
}
