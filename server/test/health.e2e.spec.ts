import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

process.env.DATABASE_URL = 'postgres://u:p@localhost:5432/unused';
process.env.JWT_ACCESS_SECRET = 'test-secret-test-secret-test-secret-123456';

import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { configureApp } from '../src/app.setup';

describe('HTTP pipeline (real AppModule, database stubbed)', () => {
  let app: INestApplication;
  let dbUp = true;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({ ping: async () => dbUp })
      .compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterAll(() => app.close());

  it('GET /api/v1/health returns the wrapped response and a request id header', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('GET /api/v1/health/ready is 503 with a safe error body when the DB is down', async () => {
    dbUp = false;
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);
    expect(res.body.statusCode).toBe(503);
    expect(res.body.requestId).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/\.ts:\d+|node_modules/);
    dbUp = true;
  });

  it('unknown routes return the consistent error shape', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);
    expect(res.body).toMatchObject({ statusCode: 404, path: '/api/v1/nope' });
  });

  it('sets security headers (helmet) and rejects a disallowed CORS origin', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'http://evil.example');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
