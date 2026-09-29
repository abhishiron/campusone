import { Module } from '@nestjs/common';
import { AssignmentsController } from './assignments.controller';
import { GradesController } from './grades.controller';

@Module({ controllers: [AssignmentsController, GradesController] })
export class AssignmentsModule {}
