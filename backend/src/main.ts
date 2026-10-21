import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(','), credentials: true });
  // Check-in selfies arrive as JPEG data URLs, which are larger than the 100 kB default.
  app.useBodyParser('json', { limit: '1mb' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = Number(process.env.PORT) || 4000;
  await app.listen(port);
  console.log(`CampusOne API running on http://localhost:${port}/api`);
}
bootstrap();
