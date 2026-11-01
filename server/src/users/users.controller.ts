import { Body, Controller, Delete, Get, HttpCode, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MULTER_HARD_LIMIT } from '../common/upload';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AUTH_THROTTLE, AVATAR_THROTTLE, AuthUser } from '../auth/auth.constants';
import { CurrentUser } from '../auth/decorators';
import { ConfirmPasswordDto, UpdateProfileDto } from './dto/users.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Current user and profile' })
  me(@CurrentUser() user: AuthUser) {
    return this.users.getMe(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update own profile (name, display name, phone, campus area)' })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateMe(user.id, dto);
  }

  @Post('me/avatar')
  @HttpCode(200)
  @Throttle(AVATAR_THROTTLE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MULTER_HARD_LIMIT, files: 1 } }))
  @ApiOperation({ summary: 'Upload my profile image (JPEG, PNG or WebP)' })
  avatar(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    return this.users.setAvatar(user.id, file);
  }

  @Post('me/deactivate')
  @HttpCode(204)
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({ summary: 'Deactivate the account (reversible by signing in again)' })
  async deactivate(@CurrentUser() user: AuthUser, @Body() dto: ConfirmPasswordDto) {
    await this.users.deactivate(user.id, dto.password);
  }

  @Delete('me')
  @HttpCode(204)
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({ summary: 'Permanently delete the account and personal data' })
  async remove(@CurrentUser() user: AuthUser, @Body() dto: ConfirmPasswordDto) {
    await this.users.deleteAccount(user.id, dto.password);
  }
}
