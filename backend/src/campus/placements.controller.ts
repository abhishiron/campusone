import { BadRequestException, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AccessService } from '../common/access.service';
import { ActivityService } from '../common/activity.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { daysUntil } from '../common/dates';
import { cgpaOf } from '../assignments/grades.controller';

@Controller('placements')
@Roles('STUDENT')
export class PlacementsController {
  constructor(private prisma: PrismaService, private access: AccessService, private activity: ActivityService) {}

  private async profile(user: AuthUser) {
    const me = await this.access.ownStudent(user);
    const results = await this.prisma.semesterResult.findMany({ where: { studentId: me.id } });
    return { me, cgpa: Math.round((cgpaOf(results) ?? 0) * 100) / 100 };
  }

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const { me, cgpa } = await this.profile(user);
    const drives = await this.prisma.drive.findMany({ include: { registrations: { where: { studentId: me.id } } }, orderBy: { deadline: 'asc' } });
    return {
      cgpa, backlogs: me.backlogs,
      drives: drives.map((d) => ({
        id: d.id, company: d.company, role: d.role, pkg: d.pkg, type: d.type, minCgpa: d.minCgpa, maxBacklogs: d.maxBacklogs, deadline: d.deadline,
        daysLeft: daysUntil(d.deadline), closed: daysUntil(d.deadline) < 0,
        cgpaOk: cgpa >= d.minCgpa, backlogsOk: me.backlogs <= d.maxBacklogs, registered: d.registrations.length > 0,
      })),
    };
  }

  /** Toggles registration. Eligibility and the deadline are enforced here, not just in the UI. */
  @Post(':id/register')
  async register(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const { me, cgpa } = await this.profile(user);
    const d = await this.prisma.drive.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Drive not found.');
    const key = { driveId_studentId: { driveId: id, studentId: me.id } };
    if (await this.prisma.driveRegistration.findUnique({ where: key })) {
      await this.prisma.driveRegistration.delete({ where: key });
      return { registered: false };
    }
    if (daysUntil(d.deadline) < 0) throw new BadRequestException('Registration for this drive has closed.');
    if (cgpa < d.minCgpa) throw new BadRequestException(`${d.company} needs a CGPA of ${d.minCgpa.toFixed(1)}. Yours is ${cgpa.toFixed(2)}.`);
    if (me.backlogs > d.maxBacklogs) throw new BadRequestException(`${d.company} allows at most ${d.maxBacklogs} backlogs.`);
    await this.prisma.driveRegistration.create({ data: { driveId: id, studentId: me.id } });
    await this.activity.log(`${user.name} registered for the ${d.company} drive`);
    return { registered: true };
  }
}
