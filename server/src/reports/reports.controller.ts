import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, WRITE_THROTTLE } from '../auth/auth.constants';
import { CurrentUser, RequireVerifiedEmail } from '../auth/decorators';
import { CreateReportDto } from './dto/report.dto';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post() @RequireVerifiedEmail() @Throttle(WRITE_THROTTLE)
  @ApiOperation({ summary: 'Report a listing, seller, person or conversation to the moderators' })
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateReportDto) { return this.reports.create(u.id, dto); }
}
