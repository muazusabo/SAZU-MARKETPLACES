import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { OptionalNumber, Trim, TrimKeepEmpty } from '../../common/transforms';
import { CONDITIONS } from './list-products.dto';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const MAX_PRICE_KOBO = 100_000_000_000;
const nullable = () => applyDecorators(IsOptional(), ValidateIf((_, v) => v !== null && v !== undefined));

export class CreateProductDto {
  @ApiProperty() @TrimKeepEmpty() @IsString() @Length(3, 120) title: string;
  @ApiProperty() @TrimKeepEmpty() @IsString() @Length(10, 5000) description: string;
  @ApiProperty({ description: 'Category or subcategory slug' }) @Matches(SLUG) categorySlug: string;
  @ApiProperty({ description: 'Price in kobo (₦1 = 100 kobo), at least ₦1' }) @IsInt() @Min(100) @Max(MAX_PRICE_KOBO) priceKobo: number;
  @ApiPropertyOptional({ enum: ['product', 'service'] }) @IsOptional() @IsIn(['product', 'service']) productType?: 'product' | 'service';
  @ApiPropertyOptional({ enum: CONDITIONS }) @IsOptional() @IsIn(CONDITIONS) condition?: (typeof CONDITIONS)[number];
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(80) campusLocation?: string;
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(300) collectionInfo?: string;
  @ApiPropertyOptional({ description: 'Category-specific fields as { key: value }' }) @IsOptional() @IsObject() attributes?: Record<string, unknown>;
}

export class UpdateProductDto {
  @ApiPropertyOptional() @IsOptional() @TrimKeepEmpty() @IsString() @Length(3, 120) title?: string;
  @ApiPropertyOptional() @IsOptional() @TrimKeepEmpty() @IsString() @Length(10, 5000) description?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(SLUG) categorySlug?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(100) @Max(MAX_PRICE_KOBO) priceKobo?: number;
  @ApiPropertyOptional() @IsOptional() @IsIn(['product', 'service']) productType?: 'product' | 'service';
  @ApiPropertyOptional({ nullable: true }) @nullable() @IsIn(CONDITIONS) condition?: (typeof CONDITIONS)[number] | null;
  @ApiPropertyOptional({ nullable: true }) @nullable() @Trim() @IsString() @MaxLength(80) campusLocation?: string | null;
  @ApiPropertyOptional({ nullable: true }) @nullable() @Trim() @IsString() @MaxLength(300) collectionInfo?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsObject() attributes?: Record<string, unknown>;
}

export const OWN_STATUS_FILTERS = ['all', 'draft', 'pending_review', 'active', 'sold', 'unavailable', 'rejected', 'archived'] as const;
export class ListOwnProductsQuery {
  @ApiPropertyOptional({ enum: OWN_STATUS_FILTERS }) @IsOptional() @IsIn(OWN_STATUS_FILTERS) status?: (typeof OWN_STATUS_FILTERS)[number];
  @IsOptional() @OptionalNumber() @IsInt() @Min(1) @Max(1000) page?: number;
  @IsOptional() @OptionalNumber() @IsInt() @Min(1) @Max(50) pageSize?: number;
}

export class UploadImageDto {
  @ApiPropertyOptional({ description: 'Describe the photo for screen readers' }) @IsOptional() @Trim() @IsString() @MaxLength(200) altText?: string;
}
export class UpdateImageDto {
  @ApiPropertyOptional({ nullable: true }) @nullable() @Trim() @IsString() @MaxLength(200) altText?: string | null;
}
export class ReorderImagesDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsUUID('4', { each: true }) imageIds: string[];
}
