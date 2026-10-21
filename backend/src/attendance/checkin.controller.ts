import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { AccessService } from '../common/access.service';
import { NotifyService } from '../common/notify.service';
import { ActivityService } from '../common/activity.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { DATE_RE, today } from '../common/dates';
import { AttendanceService } from './attendance.service';

/** Great-circle distance in metres. */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371e3, rad = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const WEAK_GPS_M = 100;
const MAX_PHOTO = 400_000; // characters of base64; a stamped 360px JPEG is ~40k

class CheckInDto {
  @IsNumber() @Min(-90) @Max(90) lat: number;
  @IsNumber() @Min(-180) @Max(180) lng: number;
  @IsNumber() @Min(0) acc: number;
  @IsIn(['LIVE', 'UPLOAD']) method: 'LIVE' | 'UPLOAD';
  @IsOptional() @IsBoolean() simulated?: boolean;
  @IsString() @MaxLength(MAX_PHOTO, { message: 'The photo is too large. Retake it.' }) photo: string;
}

class OpenDto {
  @IsString() courseId: string;
  @IsIn([5, 10, 15], { message: 'Open check-in for 5, 10 or 15 minutes.' }) minutes: number;
}

class DecideDto {
  @IsIn(['APPROVED', 'REJECTED']) status: 'APPROVED' | 'REJECTED';
}

class CampusDto {
  @IsNumber() @Min(-90) @Max(90) lat: number;
  @IsNumber() @Min(-180) @Max(180) lng: number;
  @IsOptional() @IsString() @MaxLength(80) name?: string;
}

@Controller('checkin')
export class CheckinController {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private notify: NotifyService,
    private activity: ActivityService,
    private attendance: AttendanceService,
  ) {}

  private campus() {
    return this.prisma.campus.findUniqueOrThrow({ where: { id: 'main' } });
  }

  private view(c: { id: string; studentId: string; courseId: string; date: string; dist: number; acc: number; method: string; simulated: boolean; flags: string; status: string; photo: string; createdAt: Date }, name?: string, code?: string) {
    return { ...c, flags: c.flags ? c.flags.split('\n') : [], name, code };
  }

  @Get('campus')
  campusInfo() {
    return this.campus();
  }

  /** Testing helper: move the geofence to wherever the professor is standing. */
  @Put('campus')
  @Roles('TEACHER', 'ADMIN')
  async moveCampus(@CurrentUser() user: AuthUser, @Body() dto: CampusDto) {
    const c = await this.prisma.campus.update({ where: { id: 'main' }, data: { lat: dto.lat, lng: dto.lng, name: dto.name?.trim() || 'your test location' } });
    await this.activity.log(`${user.name} moved the check-in boundary to ${c.name}`);
    return c;
  }

  /** Student: the open window for their class today, their check-in for it, and recent history. */
  @Get('current')
  @Roles('STUDENT')
  async current(@CurrentUser() user: AuthUser) {
    const s = await this.access.ownStudent(user);
    const window = await this.prisma.checkWindow.findFirst({
      where: { date: today(), until: { gt: new Date() }, course: { classroomId: s.classroomId } },
      include: { course: true },
      orderBy: { openedAt: 'desc' },
    });
    const mine = window ? await this.prisma.checkIn.findFirst({ where: { studentId: s.id, courseId: window.courseId, date: window.date } }) : null;
    const history = await this.prisma.checkIn.findMany({ where: { studentId: s.id }, include: { course: true }, orderBy: { createdAt: 'desc' }, take: 6 });
    return {
      campus: await this.campus(),
      window: window && { id: window.id, courseId: window.courseId, code: window.course.code, name: window.course.name, until: window.until },
      mine: mine && this.view(mine),
      history: history.map((h) => ({ ...this.view(h), code: h.course.code, courseName: h.course.name })),
    };
  }

  @Post()
  @Roles('STUDENT')
  async checkIn(@CurrentUser() user: AuthUser, @Body() dto: CheckInDto) {
    const s = await this.access.ownStudent(user);
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(dto.photo)) throw new BadRequestException('Take a photo before checking in.');
    const window = await this.prisma.checkWindow.findFirst({
      where: { date: today(), until: { gt: new Date() }, course: { classroomId: s.classroomId } },
      include: { course: true },
      orderBy: { openedAt: 'desc' },
    });
    if (!window) throw new BadRequestException('Check-in has closed. Ask your professor to mark you manually.');
    if (await this.prisma.checkIn.findFirst({ where: { studentId: s.id, courseId: window.courseId, date: window.date } })) {
      throw new BadRequestException('You have already checked in to this class.');
    }
    const campus = await this.campus();
    const dist = distanceM(campus.lat, campus.lng, dto.lat, dto.lng);
    if (dist > campus.radius) throw new BadRequestException(`You are ${Math.round(dist)} m from ${campus.name}. Check-in only works within ${campus.radius} m.`);

    const flags: string[] = [];
    if (dto.acc > WEAK_GPS_M) flags.push(`Weak GPS, ±${Math.round(dto.acc)} m`);
    if (dto.method === 'UPLOAD') flags.push('Photo from camera app, not live');
    if (dto.simulated) flags.push('Simulated location (demo)');
    const status = flags.length ? 'NEEDS_REVIEW' : 'VERIFIED';

    const rec = await this.prisma.checkIn.create({
      data: {
        windowId: window.id, studentId: s.id, courseId: window.courseId, date: window.date,
        dist: Math.round(dist), acc: dto.acc, method: dto.method, simulated: !!dto.simulated, flags: flags.join('\n'), status, photo: dto.photo,
      },
    });
    if (status === 'VERIFIED') await this.setPresence(s.id, window.courseId, window.date, true);
    await this.activity.log(`${user.name} checked in to ${window.course.code} (${status === 'VERIFIED' ? 'verified' : 'needs review'})`);
    return this.view(rec);
  }

  /** Professor: window state and check-ins for one course on one date. */
  @Get('window')
  @Roles('TEACHER')
  async windowState(@CurrentUser() user: AuthUser, @Query('courseId') courseId: string, @Query('date') date: string) {
    if (!DATE_RE.test(date || '')) throw new BadRequestException('Choose a valid date.');
    await this.access.assertCanManageCourse(user, courseId);
    const open = await this.prisma.checkWindow.findFirst({ where: { openedById: user.id, until: { gt: new Date() } }, include: { course: true }, orderBy: { openedAt: 'desc' } });
    const checks = await this.prisma.checkIn.findMany({ where: { courseId, date }, include: { student: { include: { user: true } } }, orderBy: { createdAt: 'desc' } });
    const total = await this.prisma.student.count({ where: { classroom: { courses: { some: { id: courseId } } } } });
    return {
      campus: await this.campus(),
      open: open && { id: open.id, courseId: open.courseId, code: open.course.code, until: open.until },
      total,
      checkIns: checks.map((c) => this.view(c, c.student.user.name)),
    };
  }

  @Post('window')
  @Roles('TEACHER')
  async open(@CurrentUser() user: AuthUser, @Body() dto: OpenDto) {
    const course = await this.access.assertCanManageCourse(user, dto.courseId);
    const other = await this.prisma.checkWindow.findFirst({ where: { openedById: user.id, until: { gt: new Date() } }, include: { course: true } });
    if (other) throw new BadRequestException(`Check-in is already open for ${other.course.code}. Close it first.`);
    const w = await this.prisma.checkWindow.create({
      data: { courseId: course.id, date: today(), openedById: user.id, until: new Date(Date.now() + dto.minutes * 60_000) },
    });
    const students = await this.prisma.student.findMany({ where: { classroomId: course.classroomId } });
    await this.notify.send(students.map((s) => s.userId), { title: `Check-in open for ${course.code}`, body: `Mark yourself present in the next ${dto.minutes} minutes.`, link: '/checkin' });
    await this.activity.log(`${user.name} opened self check-in for ${course.code}`);
    return w;
  }

  @Post('window/:id/close')
  @Roles('TEACHER')
  async close(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const w = await this.prisma.checkWindow.findUnique({ where: { id } });
    if (!w) throw new NotFoundException('Check-in window not found.');
    if (w.openedById !== user.id) throw new ForbiddenException('Only the professor who opened it can close it.');
    await this.prisma.checkWindow.update({ where: { id }, data: { until: new Date() } });
    return { ok: true };
  }

  @Post(':id/decide')
  @Roles('TEACHER')
  async decide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideDto) {
    const c = await this.prisma.checkIn.findUnique({ where: { id }, include: { course: true, student: { include: { user: true } } } });
    if (!c) throw new NotFoundException('Check-in not found.');
    await this.access.assertCanManageCourse(user, c.courseId);
    await this.prisma.checkIn.update({ where: { id }, data: { status: dto.status } });
    await this.setPresence(c.studentId, c.courseId, c.date, dto.status === 'APPROVED');
    const verb = dto.status === 'APPROVED' ? 'approved' : 'rejected';
    await this.notify.send([c.student.userId], {
      title: `Check-in ${verb}`,
      body: `Your check-in for ${c.course.code} on ${c.date} was ${verb}${dto.status === 'APPROVED' ? '. You are marked present.' : '. You are marked absent.'}`,
      link: '/checkin',
    });
    await this.activity.log(`${user.name} ${verb} ${c.student.user.name}'s check-in for ${c.course.code}`);
    return { ok: true };
  }

  private async setPresence(studentId: string, courseId: string, date: string, present: boolean) {
    const status = present ? 'PRESENT' : 'ABSENT';
    await this.prisma.attendance.upsert({
      where: { studentId_courseId_date: { studentId, courseId, date } },
      create: { studentId, courseId, date, status, source: 'CHECKIN' },
      update: { status, source: 'CHECKIN' },
    });
    await this.attendance.evaluate(studentId);
  }
}
