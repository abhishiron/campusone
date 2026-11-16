import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { AccessService } from './access.service';
import { NotifyService } from './notify.service';
import { ActivityService } from './activity.service';
import { FilesService } from './files.service';
import { CacheService } from './cache.service';

const DEV_SECRET = 'campusone-dev-secret-change-me';
const secret = process.env.JWT_SECRET || DEV_SECRET;
// A compiled build (dist/*.js) or NODE_ENV=production is treated as a real deployment.
const deployed = process.env.NODE_ENV === 'production' || __filename.endsWith('.js');
if (secret === DEV_SECRET || secret.length < 32) {
  const msg = 'JWT_SECRET is missing, too short or the public example value. Anyone could forge sign-in tokens. Set a random value of 32+ characters, for example: openssl rand -hex 32';
  if (deployed) throw new Error(msg);
  console.warn(`\n  WARNING: ${msg}\n  (Allowed for local development only.)\n`);
}

@Global()
@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret,
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [PrismaService, AccessService, NotifyService, ActivityService, FilesService, CacheService],
  exports: [PrismaService, AccessService, NotifyService, ActivityService, FilesService, CacheService, JwtModule],
})
export class CommonModule {}
