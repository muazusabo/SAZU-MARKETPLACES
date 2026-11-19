import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

export const AD_PLACEMENTS = ['home_banner', 'sponsored_product', 'browse_banner', 'category_banner'] as const;
export type AdPlacement = (typeof AD_PLACEMENTS)[number];
export const AD_STATUSES = ['draft', 'published', 'paused'] as const;
export type AdStatus = (typeof AD_STATUSES)[number];

export class CreateAdvertisementDto {
  @ApiProperty({ maxLength: 120 }) @IsString() @Length(3, 120) title!: string;
  @ApiProperty({ maxLength: 120 }) @IsString() @Length(2, 120) advertiserName!: string;
  @ApiProperty({ maxLength: 500 }) @IsString() @Length(3, 500) description!: string;
  @ApiProperty({ maxLength: 2048, example: 'https://example.com/offer' }) @IsString() @MaxLength(2048) destinationUrl!: string;
  @ApiProperty({ enum: AD_PLACEMENTS }) @IsIn(AD_PLACEMENTS) placement!: AdPlacement;
  @ApiPropertyOptional({ format: 'uuid', description: 'Required for category_banner placement' }) @IsOptional() @IsUUID('4') categoryId?: string;
  @ApiProperty({ format: 'date-time' }) @IsDateString() startAt!: string;
  @ApiProperty({ format: 'date-time' }) @IsDateString() endAt!: string;
  @ApiProperty({ enum: ['draft', 'published'] }) @IsIn(['draft', 'published']) status!: 'draft' | 'published';
}

export class UpdateAdvertisementDto extends CreateAdvertisementDto {}

export class PublicAdvertisementsQuery {
  @ApiProperty({ enum: AD_PLACEMENTS }) @IsIn(AD_PLACEMENTS) placement!: AdPlacement;
  @ApiPropertyOptional({ description: 'Category slug for category-specific campaigns' }) @IsOptional() @IsString() @MaxLength(80) category?: string;
}

export class AdvertisementImpressionDto {
  @ApiProperty({ format: 'uuid', description: 'Ephemeral browser-tab identifier, used to deduplicate impressions' })
  @IsUUID('4') visitorId!: string;
}
