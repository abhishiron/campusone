import { BadRequestException, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AccessService } from '../common/access.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { addDays, daysUntil, today } from '../common/dates';

export const BOOK_LIMIT = 4;
export const FINE_PER_DAY = 2;
export const MAX_RENEWALS = 2;
export const RENEW_DAYS = 14;

@Controller('library')
export class LibraryController {
  constructor(private prisma: PrismaService, private access: AccessService) {}

  @Get()
  @Roles('STUDENT', 'PARENT')
  async list(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) {
    const sid = await this.access.resolveStudentId(user, studentId);
    const books = await this.prisma.bookIssue.findMany({ where: { studentId: sid }, orderBy: { dueOn: 'asc' } });
    const rows = books.map((b) => {
      const d = daysUntil(b.dueOn);
      return { ...b, daysLeft: d, fine: Math.max(0, -d) * FINE_PER_DAY };
    });
    return { limit: BOOK_LIMIT, finePerDay: FINE_PER_DAY, maxRenewals: MAX_RENEWALS, renewDays: RENEW_DAYS, fine: rows.reduce((n, b) => n + b.fine, 0), books: rows };
  }

  @Post(':id/renew')
  @Roles('STUDENT')
  async renew(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const me = await this.access.ownStudent(user);
    const b = await this.prisma.bookIssue.findUnique({ where: { id } });
    if (!b || b.studentId !== me.id) throw new NotFoundException('Book not found.');
    const d = daysUntil(b.dueOn);
    if (d < 0) throw new BadRequestException(`Overdue books can't be renewed online. Return it at the counter and pay the ₹${-d * FINE_PER_DAY} fine.`);
    if (b.renewals >= MAX_RENEWALS) throw new BadRequestException('Renewal limit reached. Return the book, then issue it again if nobody has reserved it.');
    return this.prisma.bookIssue.update({ where: { id }, data: { dueOn: addDays(today(), RENEW_DAYS), renewals: b.renewals + 1 } });
  }
}
