import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { ExamsController } from './exams.controller';
import { StudyController } from './study.controller';
import { ResourcesController } from './resources.controller';
import { LibraryController } from './library.controller';
import { FeesController } from './fees.controller';
import { LeavesController } from './leaves.controller';
import { PlacementsController } from './placements.controller';
import { FilesController } from './files.controller';
import { HealthController } from './health.controller';

/** Student-life modules: exams, study rooms, shared notes, library, fees, leave, placements. */
@Module({
  imports: [AttendanceModule],
  controllers: [
    ExamsController, StudyController, ResourcesController, LibraryController, FeesController,
    LeavesController, PlacementsController, FilesController, HealthController,
  ],
})
export class CampusModule {}
