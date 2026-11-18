import { Module } from '@nestjs/common';
import { SuperAdminController } from './superadmin.controller';
import { SuperAdminBootstrap } from './superadmin-bootstrap';

@Module({ controllers: [SuperAdminController], providers: [SuperAdminBootstrap] })
export class SuperAdminModule {}
