import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { OptionalNumber, Trim } from '../../common/transforms';

export const SORTS = ['newest', 'price_asc', 'price_desc', 'relevance', 'popular'] as const;
export const CONDITIONS = ['new', 'like_new', 'used_good', 'used_fair'] as const;
export const AVAILABILITIES = ['available', 'reserved', 'sold', 'unavailable'] as const;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export class ListProductsQuery {
  @ApiPropertyOptional({ description: 'Search text (title and description)' }) @IsOptional() @Trim() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional({ description: 'Category or subcategory slug (a category includes its subcategories)' }) @IsOptional() @Trim() @Matches(SLUG) category?: string;
  @ApiPropertyOptional({ description: 'Seller storefront slug' }) @IsOptional() @Trim() @Matches(SLUG) seller?: string;
  @ApiPropertyOptional({ description: 'Exclude listings from this seller storefront' }) @IsOptional() @Trim() @Matches(SLUG) excludeSeller?: string;
  @ApiPropertyOptional({ description: 'Exclude one product by slug' }) @IsOptional() @Trim() @Matches(SLUG) exclude?: string;
  @ApiPropertyOptional({ description: 'Minimum price in kobo' }) @IsOptional() @OptionalNumber() @IsInt() @Min(0) minPriceKobo?: number;
  @ApiPropertyOptional({ description: 'Maximum price in kobo' }) @IsOptional() @OptionalNumber() @IsInt() @Min(0) @Max(100_000_000_000) maxPriceKobo?: number;
  @ApiPropertyOptional({ enum: CONDITIONS }) @IsOptional() @Trim() @IsIn(CONDITIONS) condition?: (typeof CONDITIONS)[number];
  @ApiPropertyOptional({ enum: AVAILABILITIES, description: 'Defaults to available and reserved listings' }) @IsOptional() @Trim() @IsIn(AVAILABILITIES) availability?: (typeof AVAILABILITIES)[number];
  @ApiPropertyOptional({ enum: ['product', 'service'] }) @IsOptional() @Trim() @IsIn(['product', 'service']) type?: 'product' | 'service';
  @ApiPropertyOptional({ description: 'Campus location contains this text' }) @IsOptional() @Trim() @IsString() @MaxLength(80) location?: string;
  @ApiPropertyOptional({ enum: SORTS, description: '"popular" returns only listings viewed in the last 30 days' }) @IsOptional() @Trim() @IsIn(SORTS) sort?: (typeof SORTS)[number];
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @OptionalNumber() @IsInt() @Min(1) @Max(1000) page?: number;
  @ApiPropertyOptional({ default: 12, maximum: 48 }) @IsOptional() @OptionalNumber() @IsInt() @Min(1) @Max(48) pageSize?: number;
}
