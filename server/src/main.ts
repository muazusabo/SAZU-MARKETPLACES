import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp, setupSwagger } from './app.setup';
import { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  configureApp(app);
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  // Swagger UI is disabled in production unless explicitly needed.
  if (config.get('NODE_ENV', { infer: true }) !== 'production') setupSwagger(app);
  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on :${port} (docs at /api/docs in non-production)`);
}
bootstrap();
