import { Body, Controller, Get, HttpCode, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AUTH_THROTTLE, AVATAR_THROTTLE, AuthUser } from '../auth/auth.constants';
import { CurrentUser, RequireVerifiedEmail } from '../auth/decorators';
import { MULTER_HARD_LIMIT } from '../common/upload';
import { SellerApplicationDto, UpdateSellerDto } from './dto/seller.dto';
import { SellerAccountService } from './seller-account.service';

/** Declared before the public `sellers/:slug` controller so `me` is never read as a slug. */
@ApiTags('Seller account')
@ApiBearerAuth()
@Controller({ version: '1' })
export class SellerAccountController {
  constructor(private readonly sellers: SellerAccountService) {}

  @Get('sellers/me')
  @ApiOperation({ summary: 'My seller profile and application status (null if none)' })
  mine(@CurrentUser() u: AuthUser) { return this.sellers.getMine(u.id); }

  @Post('sellers/apply')
  @RequireVerifiedEmail()
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({ summary: 'Apply to become a seller (or save a draft)' })
  apply(@CurrentUser() u: AuthUser, @Body() dto: SellerApplicationDto) { return this.sellers.apply(u.id, dto); }

  @Post('sellers/me/submit')
  @HttpCode(200)
  @RequireVerifiedEmail()
  @ApiOperation({ summary: 'Submit a draft or previously rejected application' })
  submit(@CurrentUser() u: AuthUser) { return this.sellers.submit(u.id); }

  @Patch('sellers/me')
  @ApiOperation({ summary: 'Update my shop profile' })
  update(@CurrentUser() u: AuthUser, @Body() dto: UpdateSellerDto) { return this.sellers.updateMine(u.id, dto); }

  @Post('sellers/me/avatar')
  @HttpCode(200)
  @Throttle(AVATAR_THROTTLE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MULTER_HARD_LIMIT, files: 1 } }))
  @ApiOperation({ summary: 'Upload the shop profile image (JPEG, PNG or WebP)' })
  avatar(@CurrentUser() u: AuthUser, @UploadedFile() file: Express.Multer.File) { return this.sellers.setAvatar(u.id, file); }
}
