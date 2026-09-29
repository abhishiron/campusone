import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CommonModule } from './common/common.module';
import { AuthGuard } from './common/auth.guard';
import { AuthModule } from './auth/auth.module';
import { PeopleModule } from './people/people.module';
import { AcademicsModule } from './academics/academics.module';
import { AttendanceModule } from './attendance/attendance.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    CommonModule,
    AuthModule,
    PeopleModule,
    AcademicsModule,
    AttendanceModule,
    AssignmentsModule,
    AnnouncementsModule,
    NotificationsModule,
    DashboardModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
