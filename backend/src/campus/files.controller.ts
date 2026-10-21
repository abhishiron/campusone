import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { existsSync } from 'fs';
import { FilesService } from '../common/files.service';
import { CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/types';

@Controller('files')
export class FilesController {
  constructor(private files: FilesService) {}

  @Get(':id')
  async download(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const f = await this.files.readable(user, id);
    const path = this.files.absolutePath(f.path);
    if (!existsSync(path)) return res.status(404).json({ message: 'This file is missing from storage.' });
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(f.name)}"`);
    res.sendFile(path);
  }
}
