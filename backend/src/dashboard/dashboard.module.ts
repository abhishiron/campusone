import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { AttendanceModule } from '../attendance/attendance.module';

@Module({ imports: [AttendanceModule], controllers: [DashboardController] })
export class DashboardModule {}
