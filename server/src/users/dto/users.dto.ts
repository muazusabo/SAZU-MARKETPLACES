import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches, MaxLength, ValidateIf } from 'class-validator';
import { NormalizePhone, Trim, TrimKeepEmpty } from '../../common/transforms';
import { PHONE_REGEX } from '../../auth/dto/auth.dto';

/** Only these fields can be changed by the user. Roles, status and verification are not accepted. */
export class UpdateProfileDto {
  @ApiPropertyOptional() @IsOptional() @TrimKeepEmpty() @IsString() @Length(2, 100) fullName?: string;
  @ApiPropertyOptional() @IsOptional() @TrimKeepEmpty() @IsString() @Length(2, 40) displayName?: string;
  @ApiPropertyOptional({ nullable: true, description: 'Send null or empty to remove' })
  @IsOptional() @ValidateIf((_, v) => v !== null && v !== undefined) @NormalizePhone()
  @Matches(PHONE_REGEX, { message: 'Enter a valid Nigerian mobile number.' }) phone?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null && v !== undefined) @Trim() @IsString() @MaxLength(80) campusArea?: string | null;
}

export class ConfirmPasswordDto {
  @ApiProperty() @IsString() @Length(1, 128) password: string;
}
