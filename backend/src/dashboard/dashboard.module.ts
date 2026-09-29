import { Module } from '@nestjs/common';
import { AnnouncementsModule } from '../announcements/announcements.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { DashboardController } from './dashboard.controller';

@Module({ imports: [AnnouncementsModule, AttendanceModule], controllers: [DashboardController] })
export class DashboardModule {}
