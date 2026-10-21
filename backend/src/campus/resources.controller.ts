import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { AccessService } from '../common/access.service';
import { ActivityService } from '../common/activity.service';
import { FilesService, MB, UploadedFileLike } from '../common/files.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';

class ShareDto {
  @IsString() @MinLength(3, { message: 'Add a title.' }) @MaxLength(90) title: string;
  @IsString() courseId: string;
  @IsIn(['NOTES', 'PYQ']) type: 'NOTES' | 'PYQ';
}

/** Notes and past papers shared within a batch. */
@Controller('resources')
@Roles('STUDENT')
export class ResourcesController {
  constructor(private prisma: PrismaService, private access: AccessService, private activity: ActivityService, private files: FilesService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const me = await this.access.ownStudent(user);
    const rows = await this.prisma.resource.findMany({
      where: { course: { classroomId: me.classroomId } },
      include: { course: true, uploader: true, file: true, votes: true },
    });
    return rows
      .map((r) => ({
        id: r.id, title: r.title, type: r.type, code: r.course.code, courseId: r.courseId, createdAt: r.createdAt,
        by: r.uploaderId === user.id ? 'you' : r.byLabel ?? r.uploader.name,
        file: { id: r.file.id, name: r.file.name, size: r.file.size },
        votes: r.votes.length, voted: r.votes.some((v) => v.userId === user.id),
      }))
      .sort((a, b) => b.votes - a.votes);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * MB } }))
  async share(@CurrentUser() user: AuthUser, @Body() dto: ShareDto, @UploadedFile() upload?: UploadedFileLike) {
    const me = await this.access.ownStudent(user);
    const course = await this.prisma.course.findFirst({ where: { id: dto.courseId, classroomId: me.classroomId } });
    if (!course) throw new BadRequestException('Choose one of your subjects.');
    const file = await this.files.save(user, upload, { maxMB: 25, exts: ['.pdf', '.docx', '.pptx', '.zip', '.png', '.jpg', '.jpeg'] });
    const r = await this.prisma.resource.create({ data: { title: dto.title.trim(), type: dto.type, courseId: course.id, uploaderId: user.id, fileId: file.id } });
    await this.activity.log(`${user.name} shared "${r.title}" with ${course.code}`);
    return r;
  }

  @Post(':id/vote')
  async vote(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const me = await this.access.ownStudent(user);
    const r = await this.prisma.resource.findUnique({ where: { id }, include: { course: true } });
    if (!r || r.course.classroomId !== me.classroomId) throw new NotFoundException('Resource not found.');
    const key = { resourceId_userId: { resourceId: id, userId: user.id } };
    if (await this.prisma.resourceVote.findUnique({ where: key })) {
      await this.prisma.resourceVote.delete({ where: key });
      return { voted: false };
    }
    await this.prisma.resourceVote.create({ data: { resourceId: id, userId: user.id } });
    return { voted: true };
  }
}
