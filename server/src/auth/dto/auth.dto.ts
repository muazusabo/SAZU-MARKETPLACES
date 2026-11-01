import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsBoolean, IsEmail, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
import { LowerEmail, NormalizePhone, Trim, TrimKeepEmpty } from '../../common/transforms';

export const PASSWORD_RULES = { min: 10, max: 128 };
export const PHONE_REGEX = /^\+234[789][01]\d{8}$/;

export class RegisterDto {
  @ApiProperty() @TrimKeepEmpty() @IsString() @Length(2, 100) fullName: string;
  @ApiProperty() @TrimKeepEmpty() @IsString() @Length(2, 40) displayName: string;
  @ApiProperty() @LowerEmail() @IsEmail() @MaxLength(254) email: string;
  @ApiProperty({ minLength: PASSWORD_RULES.min }) @IsString() @MinLength(PASSWORD_RULES.min) @MaxLength(PASSWORD_RULES.max) password: string;
  @ApiPropertyOptional({ example: '08031234567' })
  @IsOptional() @NormalizePhone() @Matches(PHONE_REGEX, { message: 'Enter a valid Nigerian mobile number.' }) phone?: string;
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(80) campusArea?: string;
  @ApiProperty() @IsBoolean() @Equals(true, { message: 'You must accept the terms and community guidelines.' }) acceptTerms: boolean;
}

export class LoginDto {
  @ApiProperty() @LowerEmail() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(128) password: string;
}

export class EmailDto {
  @ApiProperty() @LowerEmail() @IsEmail() email: string;
}

export class TokenDto {
  @ApiProperty() @IsString() @Length(20, 200) token: string;
}

export class VerifyEmailDto {
  @ApiProperty() @LowerEmail() @IsEmail() email: string;
  @ApiProperty({ example: '01234567' }) @IsString() @Matches(/^\d{8}$/) code: string;
}

export class ResetPasswordDto extends TokenDto {
  @ApiProperty() @IsString() @MinLength(PASSWORD_RULES.min) @MaxLength(PASSWORD_RULES.max) password: string;
}
