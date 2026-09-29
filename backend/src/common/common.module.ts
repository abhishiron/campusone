import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { AccessService } from './access.service';
import { NotifyService } from './notify.service';

@Global()
@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'campusone-dev-secret-change-me',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [PrismaService, AccessService, NotifyService],
  exports: [PrismaService, AccessService, NotifyService, JwtModule],
})
export class CommonModule {}
