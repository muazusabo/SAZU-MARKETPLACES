import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { static as serveStatic } from 'express';
import { Env } from './config/env';
import { SocketAdapter } from './realtime/socket.adapter';
import { StorageService } from './storage/storage.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

/** Shared by main.ts and e2e tests so both run the same pipeline. */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const origins = config.get('CORS_ORIGINS', { infer: true });

  app.getHttpAdapter().getInstance().set('trust proxy', config.get('TRUST_PROXY', { infer: true }));
  app.useWebSocketAdapter(new SocketAdapter(app, origins));
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });
  // Locally stored public files (development / single-server). With the S3 driver, files are served by the bucket or CDN.
  const localDir = app.get(StorageService).localPublicDir;
  if (localDir) {
    app.use('/files', serveStatic(localDir, {
      index: false, dotfiles: 'ignore', maxAge: '365d', immutable: true,
      setHeaders: (res) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); // the web app is a different origin and must be able to show images
        res.setHeader('Content-Security-Policy', "default-src 'none'");
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }));
  }
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
}

export function setupSwagger(app: INestApplication): void {
  const doc = new DocumentBuilder()
    .setTitle('SAZU Marketplace API')
    .setDescription(
      'REST API for SAZU Marketplace. Discovery and seller-buyer messaging only: this API has no payment functionality.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));
}
