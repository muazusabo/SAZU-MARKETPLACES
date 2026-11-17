import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, WRITE_THROTTLE } from '../auth/auth.constants';
import { CurrentUser, RequireVerifiedEmail } from '../auth/decorators';
import { MULTER_HARD_LIMIT } from '../common/upload';
import { ConversationsService } from './conversations.service';
import { ListConversationsQuery, MessagesQuery, SendAttachmentDto, SendMessageDto, StartConversationDto } from './dto/conversation.dto';

const uuid = () => new ParseUUIDPipe({ version: '4' });

/** Private by default: only participants can read or write, enforced in SQL for every call. */
@ApiTags('Conversations')
@ApiBearerAuth()
@Controller({ path: 'conversations', version: '1' })
export class ConversationsController {
  constructor(private readonly svc: ConversationsService) {}

  @Get() @ApiOperation({ summary: 'My conversations (newest activity first)' })
  list(@CurrentUser() u: AuthUser, @Query() q: ListConversationsQuery) { return this.svc.list(u.id, q.page ?? 1, q.pageSize ?? 20); }

  @Post() @HttpCode(200) @RequireVerifiedEmail() @Throttle(WRITE_THROTTLE)
  @ApiOperation({ summary: 'Chat with seller / I’m interested: create or reopen the conversation for a listing' })
  start(@CurrentUser() u: AuthUser, @Body() dto: StartConversationDto) { return this.svc.start(u.id, dto.productId, dto.interested ?? false); }

  // Declared before ':id' so "unread-count" is not parsed as an id.
  @Get('unread-count') @ApiOperation({ summary: 'Total unread messages (header badge)' })
  async unread(@CurrentUser() u: AuthUser) { return { count: await this.svc.unreadTotal(u.id) }; }

  @Get(':id') @ApiOperation({ summary: 'One conversation with its listing context' })
  one(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string) { return this.svc.get(u.id, id); }

  @Get(':id/messages') @ApiOperation({ summary: 'Message history, newest page first (use `before` to load older)' })
  messages(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Query() q: MessagesQuery) { return this.svc.messages(u.id, id, q.before, q.limit ?? 30); }

  @Post(':id/messages') @RequireVerifiedEmail() @Throttle(WRITE_THROTTLE) @ApiOperation({ summary: 'Send a text message' })
  send(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body() dto: SendMessageDto) { return this.svc.send(u.id, id, dto.body); }

  @Post(':id/attachments') @RequireVerifiedEmail() @Throttle(WRITE_THROTTLE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MULTER_HARD_LIMIT, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, body: { type: 'string', maxLength: 2000 } }, required: ['file'] } })
  @ApiOperation({ summary: 'Send one private image or PDF attachment in a conversation' })
  sendAttachment(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body() dto: SendAttachmentDto, @UploadedFile() file: Express.Multer.File) {
    return this.svc.sendAttachment(u.id, id, file, dto.body ?? '');
  }

  @Get(':id/attachments/:messageId') @ApiOperation({ summary: 'Download a conversation attachment (participants only)' })
  async attachment(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Param('messageId') messageId: string, @Res() res: Response) {
    const file = await this.svc.getAttachment(u.id, id, messageId);
    res.set({
      'Content-Type': file.attachment_type,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.attachment_name)}`,
      'Content-Length': file.data.length,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(file.data);
  }

  @Post(':id/read') @HttpCode(200) @ApiOperation({ summary: 'Mark the conversation as read (updates read receipts)' })
  read(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string) { return this.svc.markRead(u.id, id); }

  @Post(':id/block') @HttpCode(204) @ApiOperation({ summary: 'Block the other person: neither of you can message in this or new conversations' })
  async block(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string) { await this.svc.block(u.id, id); }

  @Delete(':id/block') @HttpCode(204) @ApiOperation({ summary: 'Unblock the other person' })
  async unblock(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string) { await this.svc.unblock(u.id, id); }
}
