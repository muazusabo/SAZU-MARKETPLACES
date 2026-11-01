import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators';
import { DatabaseService } from '../database/database.service';

@ApiTags('Health')
@Public()
@SkipThrottle()
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness: the API process is running' })
  live() {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness: the API can reach PostgreSQL' })
  async ready() {
    const database = (await this.db.ping()) ? 'up' : 'down';
    if (database === 'down') {
      throw new ServiceUnavailableException({ status: 'unavailable', checks: { database } });
    }
    return { status: 'ok', checks: { database } };
  }
}
