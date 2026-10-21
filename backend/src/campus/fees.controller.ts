import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma.service';
import { AccessService } from '../common/access.service';
import { ActivityService } from '../common/activity.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';

class PayDto {
  @IsIn(['UPI', 'Debit card', 'Net banking']) method: string;
  @IsOptional() @IsString() studentId?: string;
}

@Controller('fees')
@Roles('STUDENT', 'PARENT')
export class FeesController {
  constructor(private prisma: PrismaService, private access: AccessService, private activity: ActivityService) {}

  private async statement(studentId: string) {
    const s = await this.prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      include: { user: true, classroom: { include: { feeItems: true } }, payments: { orderBy: { createdAt: 'desc' } } },
    });
    const total = s.classroom.feeItems.reduce((n, i) => n + i.amount, 0);
    const paid = s.payments.reduce((n, p) => n + p.amount, 0);
    return {
      student: { name: s.user.name, rollNo: s.rollNo, semester: s.classroom.semester },
      items: s.classroom.feeItems.map((i) => ({ label: i.label, amount: i.amount })),
      total, paid, balance: Math.max(0, total - paid), due: s.classroom.feeDue,
      payments: s.payments.map((p) => ({ txn: p.txn, amount: p.amount, method: p.method, paidBy: p.paidBy, createdAt: p.createdAt })),
    };
  }

  @Get()
  async get(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) {
    return this.statement(await this.access.resolveStudentId(user, studentId));
  }

  /** Demo payment: records the full balance as paid. A real build hands off to the bank's gateway here. */
  @Post('pay')
  async pay(@CurrentUser() user: AuthUser, @Body() dto: PayDto) {
    const sid = await this.access.resolveStudentId(user, dto.studentId);
    const st = await this.statement(sid);
    if (st.balance <= 0) throw new BadRequestException('Nothing is due. The fee is fully paid.');
    const txn = 'TXN' + randomBytes(4).toString('hex').toUpperCase().slice(0, 7);
    await this.prisma.payment.create({ data: { studentId: sid, txn, amount: st.balance, method: dto.method, paidBy: user.name } });
    await this.activity.log(`${user.name} paid ₹${st.balance.toLocaleString('en-IN')} semester fee for ${st.student.name}`);
    return { txn, amount: st.balance };
  }
}
