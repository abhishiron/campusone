import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { PrismaService } from '../prisma.service';
import { AuthUser } from './types';

/** The parts of a multer upload we use (kept local so we don't need @types/multer). */
export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export const UPLOAD_DIR = join(process.cwd(), 'uploads');
export const MB = 1024 * 1024;

/** Stores uploads on local disk and decides who may download them. Swap for S3 later without touching callers. */
@Injectable()
export class FilesService {
  constructor(private prisma: PrismaService) {
    if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  async save(user: AuthUser, file: UploadedFileLike | undefined, opts: { maxMB: number; exts: string[]; assignmentId?: string }) {
    if (!file) throw new BadRequestException('Choose a file to upload.');
    const ext = extname(file.originalname).toLowerCase();
    if (!opts.exts.includes(ext)) throw new BadRequestException(`${file.originalname} is not an allowed file type. Use ${opts.exts.join(', ')}.`);
    if (file.size > opts.maxMB * MB) throw new BadRequestException(`${file.originalname} is over ${opts.maxMB} MB.`);
    const stored = randomBytes(12).toString('hex') + ext;
    writeFileSync(join(UPLOAD_DIR, stored), file.buffer);
    return this.prisma.fileAsset.create({
      data: { name: file.originalname.slice(0, 160), size: file.size, mime: file.mimetype || 'application/octet-stream', path: stored, uploaderId: user.id, assignmentId: opts.assignmentId ?? null },
    });
  }

  /** Returns the file if the caller may read it, based on what the file is attached to. */
  async readable(user: AuthUser, id: string) {
    const f = await this.prisma.fileAsset.findUnique({
      where: { id },
      include: {
        assignment: { include: { course: true } },
        submissions: { include: { student: true, assignment: { include: { course: true } } } },
        resources: { include: { course: true } },
        leaves: { include: { student: { include: { classroom: true } } } },
      },
    });
    if (!f) throw new NotFoundException('File not found.');
    if (user.role === 'ADMIN' || f.uploaderId === user.id) return f;

    const me = user.role === 'STUDENT' ? await this.prisma.student.findUnique({ where: { userId: user.id } }) : null;
    const kids = user.role === 'PARENT' ? await this.prisma.student.findMany({ where: { parentId: user.id } }) : [];
    const inClass = (classroomId: string) => (me && me.classroomId === classroomId) || kids.some((k) => k.classroomId === classroomId);
    const isStudent = (studentId: string) => me?.id === studentId || kids.some((k) => k.id === studentId);

    if (f.assignment && (f.assignment.course.teacherId === user.id || inClass(f.assignment.course.classroomId))) return f;
    if (f.submissions.some((s) => isStudent(s.studentId) || s.assignment.course.teacherId === user.id)) return f;
    if (f.resources.some((r) => user.role === 'TEACHER' || inClass(r.course.classroomId))) return f;
    if (f.leaves.some((l) => isStudent(l.studentId) || l.student.classroom.coordinatorId === user.id)) return f;
    throw new ForbiddenException('You do not have access to this file.');
  }

  absolutePath(stored: string) {
    return join(UPLOAD_DIR, stored);
  }
}
