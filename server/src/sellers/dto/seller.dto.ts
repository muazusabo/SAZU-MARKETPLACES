import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Length, Matches, MaxLength, ValidateIf } from 'class-validator';
import { Trim, TrimKeepEmpty } from '../../common/transforms';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export class SellerApplicationDto {
  @ApiProperty() @TrimKeepEmpty() @IsString() @Length(2, 60) shopName: string;
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional({ description: 'Main selling categories (slugs), up to 5' })
  @IsOptional() @IsArray() @ArrayMaxSize(5) @Matches(SLUG, { each: true }) categorySlugs?: string[];
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(80) preferredCampusArea?: string;
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(200) contactPreferences?: string;
  @ApiPropertyOptional({ description: 'Save without submitting for review' }) @IsOptional() @IsBoolean() saveAsDraft?: boolean;
}

const nullableText = (max: number) => [IsOptional(), ValidateIf((_, v) => v !== null && v !== undefined), Trim(), IsString(), MaxLength(max)];
const apply = (decs: PropertyDecorator[]) => (t: object, k: string) => decs.forEach((d) => d(t, k));

export class UpdateSellerDto {
  @ApiPropertyOptional() @IsOptional() @TrimKeepEmpty() @IsString() @Length(2, 60) shopName?: string;
  @ApiPropertyOptional({ nullable: true }) @apply(nullableText(500)) description?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(5) @Matches(SLUG, { each: true }) categorySlugs?: string[];
  @ApiPropertyOptional({ nullable: true }) @apply(nullableText(80)) preferredCampusArea?: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Shown publicly on your storefront' }) @apply(nullableText(80)) publicLocation?: string | null;
  @ApiPropertyOptional({ nullable: true }) @apply(nullableText(200)) contactPreferences?: string | null;
}

export class ReviewSellerDto {
  @ApiProperty({ enum: ['approve', 'reject', 'suspend', 'reinstate'] }) @IsIn(['approve', 'reject', 'suspend', 'reinstate']) decision: 'approve' | 'reject' | 'suspend' | 'reinstate';
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(500) note?: string;
}
