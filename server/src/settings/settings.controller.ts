import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators';
import { SettingsService } from './settings.service';

@ApiTags('Settings')
@Public()
@Controller({ path: 'settings', version: '1' })
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('public')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=120')
  @ApiOperation({ summary: 'Public site content: support contacts, guidelines, terms, privacy, about (empty = not published yet)' })
  publicContent() { return this.settings.publicContent(); }
}
