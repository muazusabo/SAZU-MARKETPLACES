import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, WRITE_THROTTLE } from '../auth/auth.constants';
import { CurrentUser } from '../auth/decorators';
import { MULTER_HARD_LIMIT } from '../common/upload';
import {
  CreateProductDto, ListOwnProductsQuery, ReorderImagesDto, UpdateImageDto, UpdateProductDto, UploadImageDto,
} from './dto/seller-products.dto';
import { SellerProductsService } from './seller-products.service';

const uuid = () => new ParseUUIDPipe({ version: '4' });

/** Everything here requires sign-in and a submitted, non-suspended seller profile; ownership is enforced in the service. */
@ApiTags('Seller listings')
@ApiBearerAuth()
@Controller({ version: '1' })
export class SellerProductsController {
  constructor(private readonly svc: SellerProductsService) {}

  @Get('seller/dashboard')
  @ApiOperation({ summary: 'Real counts and 30-day views for my listings' })
  dashboard(@CurrentUser() u: AuthUser) { return this.svc.dashboard(u.id); }

  @Get('seller/products')
  @ApiOperation({ summary: 'My listings in any status' })
  list(@CurrentUser() u: AuthUser, @Query() q: ListOwnProductsQuery) { return this.svc.list(u.id, q); }

  @Get('seller/products/:id')
  @ApiOperation({ summary: 'One of my listings (any status), for editing or previewing' })
  one(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string) { return this.svc.get(u.id, id); }

  @Post('products')
  @Throttle(WRITE_THROTTLE)
  @ApiOperation({ summary: 'Create a draft listing' })
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateProductDto) { return this.svc.create(u.id, dto); }

  @Patch('products/:id')
  @ApiOperation({ summary: 'Edit my listing' })
  update(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body() dto: UpdateProductDto) { return this.svc.update(u.id, id, dto); }

  @Delete('products/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a never-published listing' })
  async remove(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string) { await this.svc.remove(u.id, id); }

  @Post('products/:id/submit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Publish a completed listing' })
  submit(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string) { return this.svc.submit(u.id, id); }

  @Post('products/:id/mark-sold') @HttpCode(200)
  sold(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string) { return this.svc.setAvailability(u.id, id, 'sold'); }
  @Post('products/:id/mark-unavailable') @HttpCode(200)
  unavailable(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string) { return this.svc.setAvailability(u.id, id, 'unavailable'); }
  @Post('products/:id/mark-reserved') @HttpCode(200)
  reserved(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string) { return this.svc.setAvailability(u.id, id, 'reserved'); }
  @Post('products/:id/mark-available') @HttpCode(200)
  available(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string) { return this.svc.setAvailability(u.id, id, 'available'); }

  @Post('products/:id/archive') @HttpCode(200)
  archive(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string) { return this.svc.archive(u.id, id); }
  @Post('products/:id/restore') @HttpCode(200)
  restore(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string) { return this.svc.restore(u.id, id); }

  @Post('products/:id/images')
  @Throttle(WRITE_THROTTLE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MULTER_HARD_LIMIT, files: 1 } }))
  @ApiOperation({ summary: 'Upload a photo (JPEG, PNG or WebP; verified and re-encoded server-side)' })
  upload(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @UploadedFile() file: Express.Multer.File, @Body() dto: UploadImageDto) {
    return this.svc.uploadImage(u.id, id, file, dto.altText);
  }

  @Put('products/:id/images/order')
  @ApiOperation({ summary: 'Reorder photos (the first is the cover)' })
  reorder(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body() dto: ReorderImagesDto) { return this.svc.reorderImages(u.id, id, dto.imageIds); }

  @Patch('products/:id/images/:imageId')
  @ApiOperation({ summary: 'Edit a photo’s description' })
  patchImage(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Param('imageId', uuid()) imageId: string, @Body() dto: UpdateImageDto) {
    return this.svc.updateImage(u.id, id, imageId, dto.altText);
  }

  @Delete('products/:id/images/:imageId')
  @HttpCode(204)
  async deleteImage(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Param('imageId', uuid()) imageId: string) {
    await this.svc.deleteImage(u.id, id, imageId);
  }
}
