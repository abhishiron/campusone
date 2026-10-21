import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { AccessService } from '../common/access.service';
import { NotifyService } from '../common/notify.service';
import { ActivityService } from '../common/activity.service';
import { FilesService, MB, UploadedFileLike } from '../common/files.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { DATE_RE, parseISO } from '../common/dates';

export const LEAVE_TYPES = ['Medical leave', 'Duty leave (event, sports, hackathon)', 'Personal leave'];
export const CERT_TYPES = ['Bonafide certificate', 'Character certificate', 'NOC for internship', 'Fee structure letter'];
const dayCount = (a: string, b: string) => Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 864e5) + 1;

class LeaveDto {
  @IsIn(LEAVE_TYPES) type: string;
  @Matches(DATE_RE, { message: 'Choose the start date.' }) from: string;
  @Matches(DATE_RE, { message: 'Choose the end date.' }) to: string;
  @IsString() @MinLength(3, { message: 'Give a reason.' }) @MaxLength(300) reason: string;
}
class DecideDto {
  @IsIn(['APPROVED', 'REJECTED']) status: 'APPROVED' | 'REJECTED';
}
class CertDto {
  @IsIn(CERT_TYPES) type: string;
  @IsString() @MinLength(3, { message: 'Say what the certificate is for.' }) @MaxLength(80) purpose: string;
}

/** Leave requests and certificates go to the class coordinator. */
@Controller()
export class LeavesController {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private notify: NotifyService,
    private activity: ActivityService,
    private files: FilesService,
  ) {}

  /** Students see their own, parents their child's, coordinators everyone in the classes they coordinate. */
  private async scope(user: AuthUser, studentId?: string) {
    if (user.role === 'TEACHER') return { student: { classroom: { coordinatorId: user.id } } };
    return { studentId: await this.access.resolveStudentId(user, studentId) };
  }

  @Get('leaves')
  @Roles('STUDENT', 'PARENT', 'TEACHER')
  async list(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) {
    const where = await this.scope(user, studentId);
    const rows = await this.prisma.leaveRequest.findMany({ where, include: { student: { include: { user: true } }, file: true }, orderBy: { createdAt: 'desc' } });
    let coordinator: string | null = null;
    if ('studentId' in where) {
      const s = await this.prisma.student.findUniqueOrThrow({ where: { id: where.studentId }, include: { classroom: { include: { coordinator: true } } } });
      coordinator = s.classroom.coordinator?.name ?? null;
    }
    return {
      types: LEAVE_TYPES, certTypes: CERT_TYPES, coordinator,
      leaves: rows.map((l) => ({
        id: l.id, name: l.student.user.name, type: l.type, from: l.from, to: l.to, days: dayCount(l.from, l.to), reason: l.reason,
        status: l.status, createdAt: l.createdAt, file: l.file && { id: l.file.id, name: l.file.name },
      })),
    };
  }

  @Post('leaves')
  @Roles('STUDENT')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * MB } }))
  async apply(@CurrentUser() user: AuthUser, @Body() dto: LeaveDto, @UploadedFile() upload?: UploadedFileLike) {
    const me = await this.access.ownStudent(user);
    if (dto.to < dto.from) throw new BadRequestException('The end date is before the start date. Check the dates.');
    if (dto.type === 'Medical leave' && !upload && dayCount(dto.from, dto.to) > 2) {
      throw new BadRequestException('Medical leave longer than 2 days needs a medical certificate. Attach it.');
    }
    const file = upload ? await this.files.save(user, upload, { maxMB: 10, exts: ['.pdf', '.jpg', '.jpeg', '.png'] }) : null;
    const l = await this.prisma.leaveRequest.create({ data: { studentId: me.id, type: dto.type, from: dto.from, to: dto.to, reason: dto.reason.trim(), fileId: file?.id ?? null } });
    const classroom = await this.prisma.classroom.findUniqueOrThrow({ where: { id: me.classroomId } });
    await this.notify.send([classroom.coordinatorId], { title: `Leave request from ${user.name}`, body: `${dto.type.split(' (')[0]}, ${dto.from} to ${dto.to}.`, link: '/leaves' });
    await this.activity.log(`${user.name} applied for ${dto.type.split(' (')[0].toLowerCase()}`);
    return l;
  }

  @Post('leaves/:id/decide')
  @Roles('TEACHER')
  async decide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideDto) {
    const l = await this.prisma.leaveRequest.findUnique({ where: { id }, include: { student: { include: { user: true, classroom: true } } } });
    if (!l) throw new NotFoundException('Leave request not found.');
    if (l.student.classroom.coordinatorId !== user.id) throw new ForbiddenException('Only the class coordinator can decide this request.');
    if (l.status !== 'PENDING') throw new BadRequestException('This request has already been decided.');
    await this.prisma.leaveRequest.update({ where: { id }, data: { status: dto.status, decidedBy: user.name } });
    const verb = dto.status === 'APPROVED' ? 'approved' : 'rejected';
    await this.notify.send([l.student.userId, l.student.parentId], { title: `Leave ${verb}`, body: `${l.type.split(' (')[0]}, ${l.from} to ${l.to}, was ${verb} by ${user.name}.`, link: '/leaves' });
    await this.activity.log(`${user.name} ${verb} ${l.student.user.name}'s ${l.type.split(' (')[0].toLowerCase()}`);
    return { ok: true };
  }

  @Get('certificates')
  @Roles('STUDENT', 'PARENT', 'TEACHER')
  async certificates(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) {
    const rows = await this.prisma.certificateRequest.findMany({ where: await this.scope(user, studentId), include: { student: { include: { user: true } } }, orderBy: { createdAt: 'desc' } });
    return rows.map((c) => ({ id: c.id, name: c.student.user.name, type: c.type, purpose: c.purpose, status: c.status, createdAt: c.createdAt }));
  }

  @Post('certificates')
  @Roles('STUDENT')
  async requestCert(@CurrentUser() user: AuthUser, @Body() dto: CertDto) {
    const me = await this.access.ownStudent(user);
    const c = await this.prisma.certificateRequest.create({ data: { studentId: me.id, type: dto.type, purpose: dto.purpose.trim() } });
    const classroom = await this.prisma.classroom.findUniqueOrThrow({ where: { id: me.classroomId } });
    await this.notify.send([classroom.coordinatorId], { title: `${dto.type} requested`, body: `${user.name}, for ${c.purpose}.`, link: '/leaves' });
    return c;
  }

  @Post('certificates/:id/ready')
  @Roles('TEACHER')
  async ready(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const c = await this.prisma.certificateRequest.findUnique({ where: { id }, include: { student: { include: { classroom: true } } } });
    if (!c) throw new NotFoundException('Request not found.');
    if (c.student.classroom.coordinatorId !== user.id) throw new ForbiddenException('Only the class coordinator can update this request.');
    await this.prisma.certificateRequest.update({ where: { id }, data: { status: 'READY' } });
    await this.notify.send([c.student.userId], { title: `${c.type} is ready`, body: 'Collect it from the department office with your ID card.', link: '/leaves' });
    return { ok: true };
  }
}
