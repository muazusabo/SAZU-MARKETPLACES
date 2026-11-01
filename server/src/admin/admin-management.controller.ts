import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, WRITE_THROTTLE } from '../auth/auth.constants';
import { CurrentUser, Roles } from '../auth/decorators';
import { MULTER_HARD_LIMIT } from '../common/upload';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminUsersService } from './admin-users.service';
import {
  AdminUsersQuery, AttributeDto, AuditQuery, CreateCategoryDto, GrantRoleDto, SetUserStatusDto, StudentVerificationDto, UpdateAttributeDto, UpdateCategoryDto, UpdateSettingDto,
} from './dto/admin.dto';

const uuid = () => new ParseUUIDPipe({ version: '4' });

/** Administrators only. Moderators get 403 on every route here. */
@ApiTags('Admin: management')
@ApiBearerAuth()
@Roles('admin')
@Controller({ path: 'admin', version: '1' })
export class AdminManagementController {
  constructor(private readonly users: AdminUsersService, private readonly catalog: AdminCatalogService) {}

  @Get('users') @ApiOperation({ summary: 'Search users' })
  listUsers(@Query() q: AdminUsersQuery) { return this.users.list(q.q, q.status, q.role, q.page, q.pageSize); }

  @Get('users/:id') @ApiOperation({ summary: 'One user (never includes password hashes or tokens)' })
  user(@Param('id', uuid()) id: string) { return this.users.detail(id); }

  @Patch('users/:id/status') @ApiOperation({ summary: 'Suspend (signs them out everywhere) or reactivate an account' })
  setStatus(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body() dto: SetUserStatusDto) { return this.users.setStatus(u.id, id, dto.status, dto.reason); }

  @Post('users/:id/roles') @HttpCode(200) @ApiOperation({ summary: 'Grant the moderator role (administrators can only be created server-side)' })
  grant(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body() _dto: GrantRoleDto) { return this.users.grantModerator(u.id, id); }

  @Delete('users/:id/roles/moderator') @ApiOperation({ summary: 'Revoke the moderator role' })
  revoke(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string) { return this.users.revokeModerator(u.id, id); }

  @Patch('users/:id/student-verification') @ApiOperation({ summary: 'Record an administrator’s student-verification decision' })
  verification(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body() dto: StudentVerificationDto) { return this.users.setStudentVerification(u.id, id, dto.status, dto.note); }

  @Get('categories') categories() { return this.catalog.categories(); }
  @Get('categories/:id') category(@Param('id', uuid()) id: string) { return this.catalog.category(id); }
  @Post('categories') create(@CurrentUser() u: AuthUser, @Body() dto: CreateCategoryDto) { return this.catalog.createCategory(u.id, dto); }
  @Patch('categories/:id') updateCategory(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body() dto: UpdateCategoryDto) { return this.catalog.updateCategory(u.id, id, dto); }
  @Post('categories/:id/attributes') addAttribute(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body() dto: AttributeDto) { return this.catalog.addAttribute(u.id, id, dto); }
  @Patch('categories/attributes/:attributeId') updateAttribute(@CurrentUser() u: AuthUser, @Param('attributeId', uuid()) id: string, @Body() dto: UpdateAttributeDto) { return this.catalog.updateAttribute(u.id, id, dto); }
  @Delete('categories/attributes/:attributeId') deleteAttribute(@CurrentUser() u: AuthUser, @Param('attributeId', uuid()) id: string) { return this.catalog.deleteAttribute(u.id, id); }

  @Get('settings') @ApiOperation({ summary: 'Every platform setting with its description and allowed values' })
  settings() { return this.catalog.settingsList(); }

  @Patch('settings/:key') @ApiOperation({ summary: 'Change a setting (validated and audit-logged)' })
  updateSetting(@CurrentUser() u: AuthUser, @Param('key') key: string, @Body() dto: UpdateSettingDto) { return this.catalog.updateSetting(u.id, key.slice(0, 60), dto.value); }

  @Post('settings/site-logo')
  @Throttle(WRITE_THROTTLE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MULTER_HARD_LIMIT, files: 1 } }))
  @ApiOperation({ summary: 'Upload the public marketplace logo' })
  uploadSiteLogo(@CurrentUser() u: AuthUser, @UploadedFile() file: Express.Multer.File) {
    return this.catalog.uploadSiteLogo(u.id, file);
  }

  @Get('audit-logs') @ApiOperation({ summary: 'Audit trail of sensitive administrative actions' })
  audit(@Query() q: AuditQuery) { return this.users.auditLog(q.action, q.actorId, q.page, q.pageSize); }
}
