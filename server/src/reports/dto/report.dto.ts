import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Trim } from '../../common/transforms';

export const REPORT_REASONS = ['prohibited_item', 'counterfeit', 'scam', 'misleading', 'harassment', 'spam', 'other'] as const;
export const REPORT_TARGETS = ['product', 'seller', 'user', 'conversation'] as const;

export class CreateReportDto {
  @ApiProperty({ enum: REPORT_TARGETS }) @IsIn(REPORT_TARGETS) targetType: (typeof REPORT_TARGETS)[number];
  @ApiProperty({ description: 'Product id, seller profile id, user id, or conversation id' }) @IsUUID('4') targetId: string;
  @ApiProperty({ enum: REPORT_REASONS }) @IsIn(REPORT_REASONS) reason: (typeof REPORT_REASONS)[number];
  @ApiPropertyOptional({ maxLength: 1000 }) @IsOptional() @Trim() @IsString() @MaxLength(1000) details?: string;
}
