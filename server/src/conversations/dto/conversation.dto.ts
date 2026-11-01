import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export class StartConversationDto {
  @ApiProperty() @IsUUID('4') productId: string;
  @ApiPropertyOptional({ description: 'Send a short "I’m interested" message (only if the conversation has no messages yet)' })
  @IsOptional() @IsBoolean() interested?: boolean;
}

/** Strips control characters (except newlines/tabs), normalises line endings, trims. */
// eslint-disable-next-line no-control-regex -- the control characters are exactly what we are removing
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const cleanBody = () => Transform(({ value }) =>
  typeof value === 'string' ? value.replace(/\r\n?/g, '\n').replace(CONTROL_CHARS, '').trim() : value);

export class SendMessageDto {
  @ApiProperty({ minLength: 1, maxLength: 2000 }) @cleanBody() @IsString() @Length(1, 2000, { message: 'Write a message between 1 and 2,000 characters.' }) body: string;
}

export class MessagesQuery {
  @ApiPropertyOptional({ description: 'Return messages older than this message id' }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) before?: number;
  @ApiPropertyOptional({ default: 30, maximum: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

export class ListConversationsQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize?: number;
}
