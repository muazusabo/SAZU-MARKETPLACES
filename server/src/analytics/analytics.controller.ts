import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators';
import { AnalyticsService } from './analytics.service';
import { VisitorHeartbeatDto } from './analytics.dto';

@ApiTags('Analytics')
@Public()
@Controller({ path: 'analytics', version: '1' })
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post('visitors/heartbeat')
  @HttpCode(204)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Update anonymous aggregate visitor presence' })
  async heartbeat(@Body() dto: VisitorHeartbeatDto): Promise<void> {
    await this.analytics.heartbeat(dto.visitorId);
  }
}
