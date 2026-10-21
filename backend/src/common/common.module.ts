import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { AccessService } from './access.service';
import { NotifyService } from './notify.service';
import { ActivityService } from './activity.service';
import { FilesService } from './files.service';

@Global()
@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'campusone-dev-secret-change-me',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [PrismaService, AccessService, NotifyService, ActivityService, FilesService],
  exports: [PrismaService, AccessService, NotifyService, ActivityService, FilesService, JwtModule],
})
export class CommonModule {}
