import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CookieOptions, Request, Response } from 'express';
import { Env } from '../config/env';
import { AUTH_THROTTLE, REFRESH_COOKIE, REFRESH_COOKIE_PATH, REFRESH_THROTTLE, VERIFY_THROTTLE } from './auth.constants';
import { AuthService } from './auth.service';
import { Public } from './decorators';
import { EmailDto, LoginDto, RegisterDto, ResetPasswordDto, VerifyEmailDto } from './dto/auth.dto';
import { IssuedSession, SessionService } from './session.service';

@ApiTags('Auth')
@Public()
@Throttle(AUTH_THROTTLE)
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  private readonly cookieBase: CookieOptions;

  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    config: ConfigService<Env, true>,
  ) {
    const sameSite = config.get('COOKIE_SAMESITE', { infer: true });
    this.cookieBase = {
      httpOnly: true,
      secure: config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite,
      path: REFRESH_COOKIE_PATH,
      domain: config.get('COOKIE_DOMAIN', { infer: true }) || undefined,
    };
  }

  private setCookie(res: Response, s: IssuedSession) {
    res.cookie(REFRESH_COOKIE, s.refreshToken, { ...this.cookieBase, maxAge: s.refreshMaxAgeMs });
  }

  @Post('register')
  @HttpCode(202)
  @ApiOperation({ summary: 'Create an account. Same response whether or not the email already exists.' })
  async register(@Body() dto: RegisterDto) {
    await this.auth.register(dto);
    return { message: 'If this email can be used, a verification message is on its way.' };
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign in. Returns an access token; sets the refresh cookie.' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { session, user } = await this.auth.login(dto, req.headers['user-agent']);
    this.setCookie(res, session);
    return { accessToken: session.accessToken, expiresIn: session.expiresIn, user };
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle(REFRESH_THROTTLE)
  @ApiOperation({ summary: 'Rotate the refresh cookie and get a new access token' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    // No cookie simply means "not signed in": answer normally (not 401) so anonymous visitors don't trigger browser error logs.
    // An invalid, expired or reused cookie is still a 401.
    if (!raw) return { accessToken: null, expiresIn: 0 };
    try {
      const s = await this.sessions.rotate(raw, req.headers['user-agent']);
      this.setCookie(res, s);
      return { accessToken: s.accessToken, expiresIn: s.expiresIn };
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, this.cookieBase);
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(204)
  @Throttle(REFRESH_THROTTLE)
  @ApiOperation({ summary: 'Revoke this device session' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (raw) await this.sessions.revokeByToken(raw);
    res.clearCookie(REFRESH_COOKIE, this.cookieBase);
  }

  @Post('verify-email')
  @HttpCode(204)
  @Throttle(VERIFY_THROTTLE)
  async verify(@Body() dto: VerifyEmailDto) {
    await this.auth.verifyEmail(dto.email, dto.code);
  }

  @Post('resend-verification')
  @HttpCode(202)
  @Throttle(VERIFY_THROTTLE)
  async resend(@Body() dto: EmailDto) {
    await this.auth.resendVerification(dto.email);
    return { message: 'If that account needs verification, a new email is on its way.' };
  }

  @Post('forgot-password')
  @HttpCode(202)
  async forgot(@Body() dto: EmailDto) {
    await this.auth.forgotPassword(dto.email);
    return { message: 'If an account exists for that email, a reset link is on its way.' };
  }

  @Post('reset-password')
  @HttpCode(204)
  async reset(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.password);
  }
}
