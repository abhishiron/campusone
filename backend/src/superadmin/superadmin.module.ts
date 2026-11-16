import { Module } from '@nestjs/common';
import { SuperAdminController } from './superadmin.controller';

@Module({ controllers: [SuperAdminController] })
export class SuperAdminModule {}
