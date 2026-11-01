import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDefined, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateIf,
} from 'class-validator';
import { OptionalNumber, Trim, TrimKeepEmpty } from '../../common/transforms';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const reason = () => [IsOptional(), Trim(), IsString(), MaxLength(1000)];
const apply = (decs: PropertyDecorator[]) => (t: object, k: string) => decs.forEach((d) => d(t, k));

export class PageQuery {
  @IsOptional() @OptionalNumber() @IsInt() @Min(1) @Max(1000) page?: number;
  @IsOptional() @OptionalNumber() @IsInt() @Min(1) @Max(50) pageSize?: number;
}

export class AdminProductsQuery extends PageQuery {
  @ApiPropertyOptional({ enum: ['all', 'pending_review', 'published', 'rejected', 'removed', 'archived', 'draft'] })
  @IsOptional() @IsIn(['all', 'pending_review', 'published', 'rejected', 'removed', 'archived', 'draft']) status?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(100) q?: string;
}
export class ReviewListingDto {
  @ApiProperty({ enum: ['approve', 'reject', 'remove', 'restore'] }) @IsIn(['approve', 'reject', 'remove', 'restore']) decision: 'approve' | 'reject' | 'remove' | 'restore';
  @ApiPropertyOptional({ description: 'Required for reject and remove; shown to the seller' }) @apply(reason()) reason?: string;
}
export class VerifiedDto {
  @ApiProperty() @IsBoolean() verified: boolean;
  @ApiPropertyOptional() @apply(reason()) note?: string;
}
export class AdminSellersQuery extends PageQuery {
  @IsOptional() @IsIn(['pending', 'approved', 'rejected', 'suspended', 'draft', 'all']) status?: string;
}

export class AdminReportsQuery extends PageQuery {
  @IsOptional() @IsIn(['active', 'open', 'reviewing', 'resolved', 'dismissed', 'all']) status?: string;
  @IsOptional() @IsIn(['product', 'seller', 'user', 'conversation']) targetType?: string;
}
export class UpdateReportDto {
  @ApiProperty({ enum: ['reviewing', 'resolved', 'dismissed'] }) @IsIn(['reviewing', 'resolved', 'dismissed']) status: 'reviewing' | 'resolved' | 'dismissed';
  @ApiPropertyOptional({ description: 'Required (3+ characters) when resolving or dismissing' }) @apply(reason()) note?: string;
}

export class AdminUsersQuery extends PageQuery {
  @IsOptional() @Trim() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsIn(['all', 'active', 'suspended', 'deactivated', 'deleted']) status?: string;
  @IsOptional() @IsIn(['user', 'seller', 'moderator', 'admin']) role?: string;
}
export class SetUserStatusDto {
  @ApiProperty({ enum: ['active', 'suspended'] }) @IsIn(['active', 'suspended']) status: 'active' | 'suspended';
  @ApiPropertyOptional({ description: 'Required when suspending' }) @apply(reason()) reason?: string;
}
export class GrantRoleDto {
  @ApiProperty({ enum: ['moderator'], description: 'Only the moderator role can be granted over the API. Administrators are created with the server-side CLI.' })
  @IsIn(['moderator']) role: 'moderator';
}
export class StudentVerificationDto {
  @ApiProperty({ enum: ['unverified', 'pending', 'verified', 'rejected'] }) @IsIn(['unverified', 'pending', 'verified', 'rejected']) status: 'unverified' | 'pending' | 'verified' | 'rejected';
  @ApiPropertyOptional() @apply(reason()) note?: string;
}

export class AuditQuery extends PageQuery {
  @IsOptional() @Trim() @IsString() @MaxLength(80) action?: string;
  @IsOptional() @IsString() @Matches(/^[0-9a-f-]{36}$/i) actorId?: string;
}

export class CreateCategoryDto {
  @ApiProperty() @TrimKeepEmpty() @IsString() @Length(2, 80) name: string;
  @ApiPropertyOptional({ description: 'Generated from the name when omitted' }) @IsOptional() @Matches(SLUG) @MaxLength(60) slug?: string;
  @ApiPropertyOptional({ description: 'Slug of a TOP-LEVEL category (only two levels are supported)' }) @IsOptional() @Matches(SLUG) parentSlug?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(40) icon?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10000) sortOrder?: number;
  @IsOptional() @Trim() @IsString() @MaxLength(1000) guidelines?: string;
  @IsOptional() @IsInt() @Min(1) @Max(12) maxImages?: number;
}
export class UpdateCategoryDto {
  @IsOptional() @TrimKeepEmpty() @IsString() @Length(2, 80) name?: string;
  @apply([IsOptional(), ValidateIf((_, v) => v !== null && v !== undefined), Trim(), IsString(), MaxLength(300)]) description?: string | null;
  @apply([IsOptional(), ValidateIf((_, v) => v !== null && v !== undefined), Trim(), IsString(), MaxLength(40)]) icon?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(10000) sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @apply([IsOptional(), ValidateIf((_, v) => v !== null && v !== undefined), Trim(), IsString(), MaxLength(1000)]) guidelines?: string | null;
  @apply([IsOptional(), ValidateIf((_, v) => v !== null && v !== undefined), IsInt(), Min(1), Max(12)]) maxImages?: number | null;
}
export class AttributeDto {
  @ApiProperty() @Matches(/^[a-z][a-z0-9_]*$/, { message: 'Use lowercase letters, numbers and underscores, starting with a letter.' }) @MaxLength(40) key: string;
  @ApiProperty() @TrimKeepEmpty() @IsString() @Length(2, 80) label: string;
  @ApiProperty({ enum: ['text', 'number', 'select', 'boolean', 'url'] }) @IsIn(['text', 'number', 'select', 'boolean', 'url']) inputType: 'text' | 'number' | 'select' | 'boolean' | 'url';
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @Length(1, 60, { each: true }) options?: string[];
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
}
export class UpdateAttributeDto {
  @IsOptional() @TrimKeepEmpty() @IsString() @Length(2, 80) label?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @Length(1, 60, { each: true }) options?: string[];
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
}
export class UpdateSettingDto {
  @ApiProperty({ description: 'Boolean, number, text or list depending on the setting' }) @IsDefined() value: unknown;
}
void Type;
