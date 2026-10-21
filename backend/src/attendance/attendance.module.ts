import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { CheckinController } from './checkin.controller';

@Module({ controllers: [AttendanceController, CheckinController], providers: [AttendanceService], exports: [AttendanceService] })
export class AttendanceModule {}
