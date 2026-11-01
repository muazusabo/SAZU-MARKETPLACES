import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { AuthUser } from '../auth/auth.constants';
import { CurrentUser } from '../auth/decorators';
import { NotificationsService } from './notifications.service';

class NotificationsQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize?: number;
}

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get() @ApiOperation({ summary: 'My notifications (meta.unreadCount included)' })
  list(@CurrentUser() u: AuthUser, @Query() q: NotificationsQuery) { return this.svc.list(u.id, q.page ?? 1, q.pageSize ?? 20); }

  @Get('unread-count') async unread(@CurrentUser() u: AuthUser) { return { count: await this.svc.unreadCount(u.id) }; }

  @Post('read-all') @HttpCode(204) @ApiOperation({ summary: 'Mark every notification as read' })
  async readAll(@CurrentUser() u: AuthUser) { await this.svc.markAllRead(u.id); }

  @Patch(':id/read') @HttpCode(204) @ApiOperation({ summary: 'Mark one notification as read' })
  async read(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { await this.svc.markRead(u.id, id); }
}
