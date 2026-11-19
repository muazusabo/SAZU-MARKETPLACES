import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthUser, WRITE_THROTTLE } from '../auth/auth.constants';
import { CurrentUser, Public, Roles } from '../auth/decorators';
import { MULTER_HARD_LIMIT } from '../common/upload';
import { AdvertisementsService } from './advertisements.service';
import { AdvertisementImpressionDto, CreateAdvertisementDto, PublicAdvertisementsQuery, UpdateAdvertisementDto } from './dto/advertisement.dto';

const uuid = () => new ParseUUIDPipe({ version: '4' });

@ApiTags('Admin: advertisements')
@ApiBearerAuth()
@Roles('admin')
@Controller({ path: 'admin/advertisements', version: '1' })
export class AdminAdvertisementsController {
  constructor(private readonly ads: AdvertisementsService) {}

  @Get() @ApiOperation({ summary: 'Campaigns, statuses and aggregate ad analytics' })
  list() { return this.ads.adminList(); }

  @Post()
  @Throttle(WRITE_THROTTLE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MULTER_HARD_LIMIT, files: 1 } }))
  @ApiOperation({ summary: 'Create an advertisement and upload its banner' })
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateAdvertisementDto, @UploadedFile() file: Express.Multer.File) {
    return this.ads.create(u.id, dto, file);
  }

  @Patch(':id')
  @Throttle(WRITE_THROTTLE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MULTER_HARD_LIMIT, files: 1 } }))
  @ApiOperation({ summary: 'Edit an advertisement; omit the banner file to keep the existing image' })
  update(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body() dto: UpdateAdvertisementDto, @UploadedFile() file?: Express.Multer.File) {
    return this.ads.update(u.id, id, dto, file);
  }

  @Patch(':id/status')
  @Throttle(WRITE_THROTTLE)
  @ApiOperation({ summary: 'Pause or reactivate a published campaign' })
  setStatus(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body('status') status: 'published' | 'paused') {
    return this.ads.setStatus(u.id, id, status);
  }

  @Delete(':id')
  @Throttle(WRITE_THROTTLE)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete an advertisement and its stored banner' })
  async remove(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string): Promise<void> {
    await this.ads.remove(u.id, id);
  }
}

@ApiTags('Advertisements')
@Public()
@Controller({ path: 'advertisements', version: '1' })
export class PublicAdvertisementsController {
  constructor(private readonly ads: AdvertisementsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Currently eligible advertisements for an available public placement' })
  list(@Query() query: PublicAdvertisementsQuery) { return this.ads.forPlacement(query.placement, query.category); }

  @Post(':id/impressions')
  @HttpCode(204)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Record one visible campaign impression per browser tab session' })
  async impression(@Param('id', uuid()) id: string, @Body() dto: AdvertisementImpressionDto): Promise<void> {
    await this.ads.recordImpression(id, dto.visitorId);
  }

  @Get(':id/click')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Record a campaign click and redirect to its configured destination' })
  async click(@Param('id', uuid()) id: string, @Res() response: Response): Promise<void> {
    const destination = await this.ads.recordClick(id);
    response.redirect(302, destination);
  }
}
