import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

/** Writes the audit trail the admin sees on the overview. Never blocks the request on failure. */
@Injectable()
export class ActivityService {
  constructor(private prisma: PrismaService) {}

  async log(text: string) {
    await this.prisma.activity.create({ data: { text } }).catch(() => undefined);
  }
}
