import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsEmail, IsIn, IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';
import { ActivityService } from '../common/activity.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';

export const PLANS = ['FREE', 'PRO', 'INSTITUTION'];
const DAY_MS = 86_400_000;

class CreateSchoolDto {
  @IsString() @MinLength(2, { message: 'Enter the school name.' }) @MaxLength(120) name: string;
  @IsEmail({}, { message: 'Enter a valid email address.' }) email: string;
  @IsIn(PLANS, { message: 'Choose a plan: FREE, PRO or INSTITUTION.' }) plan: string;
  @IsInt({ message: 'Duration must be a whole number of days.' }) @Min(1, { message: 'Duration must be at least 1 day.' }) @Max(3650, { message: 'Duration cannot exceed 3650 days.' }) durationDays: number;
}

/** Whole days left, rounded up, never negative. */
const daysLeft = (expiresAt: Date) => Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / DAY_MS));

/** Platform owner panel. There is no signup path to this role: promote a user with scripts/make-superadmin.ts. */
@Controller('superadmin')
@Roles('SUPERADMIN')
export class SuperAdminController {
  constructor(private prisma: PrismaService, private activity: ActivityService) {}

  /** Live = ACTIVE and not yet expired. `liveTotal` and `byPlan` ignore the filters; `total` honours them. */
  @Get('subscribers')
  async subscribers(
    @Query('plan') plan = '',
    @Query('role') role = '',
    @Query('q') q = '',
    @Query('page') pageRaw = '1',
    @Query('pageSize') pageSizeRaw = '25',
  ) {
    if (plan && !PLANS.includes(plan)) throw new BadRequestException('Choose a plan: FREE, PRO or INSTITUTION.');
    const page = Math.max(1, parseInt(pageRaw, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeRaw, 10) || 25));
    const term = q.trim();
    const now = new Date();
    const live = { status: 'ACTIVE', expiresAt: { gt: now } };

    const where = {
      ...live,
      ...(plan ? { plan } : {}),
      user: {
        ...(role ? { role } : {}),
        ...(term ? { OR: [{ name: { contains: term } }, { email: { contains: term.toLowerCase() } }] } : {}),
      },
    };

    const [liveTotal, total, plans, rows] = await Promise.all([
      this.prisma.subscription.count({ where: live }),
      this.prisma.subscription.count({ where }),
      this.prisma.subscription.groupBy({ by: ['plan'], where: live, _count: { _all: true } }),
      this.prisma.subscription.findMany({
        where,
        orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        // Explicit select: the password hash can never leave this endpoint.
        select: {
          id: true, plan: true, status: true, startedAt: true, expiresAt: true,
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      }),
    ]);

    const byPlan: Record<string, number> = Object.fromEntries(PLANS.map((p) => [p, 0]));
    for (const g of plans) byPlan[g.plan] = g._count._all;

    return {
      liveTotal, total, page, pageSize, byPlan,
      subscribers: rows.map((r) => ({ ...r, daysLeft: daysLeft(r.expiresAt) })),
    };
  }

  /** There is no email service yet, so the temporary password is returned once for the super admin to hand over. */
  @Post('schools')
  async createSchool(@CurrentUser() me: AuthUser, @Body() dto: CreateSchoolDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new BadRequestException('A user with this email already exists. Use a different email.');
    const tempPassword = randomBytes(5).toString('hex');
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const expiresAt = new Date(Date.now() + dto.durationDays * DAY_MS);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(), email, passwordHash, role: 'SCHOOL',
        subscriptions: { create: { plan: dto.plan, status: 'ACTIVE', expiresAt } },
      },
      select: { id: true, name: true, email: true, role: true, subscriptions: { select: { id: true, plan: true, status: true, startedAt: true, expiresAt: true } } },
    });
    await this.activity.log(`${me.name} added school ${user.name} on the ${dto.plan} plan`);
    const { subscriptions, ...account } = user;
    return { user: account, subscription: { ...subscriptions[0], daysLeft: daysLeft(expiresAt) }, tempPassword };
  }
}
