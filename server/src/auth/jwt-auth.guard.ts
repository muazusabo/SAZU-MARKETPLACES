import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { UsersService } from '../users/users.service';
import { IS_PUBLIC, VERIFIED_KEY } from './decorators';

/**
 * Global guard. Verifies the bearer token signature, then re-loads the user so that
 * suspension, deactivation and role changes take effect immediately (not at token expiry).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: unknown }>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Sign in to continue.');

    let sub: string;
    try {
      ({ sub } = await this.jwt.verifyAsync<{ sub: string }>(token, { algorithms: ['HS256'] }));
    } catch {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }
    const user = await this.users.findAuthUser(sub);
    if (!user) throw new UnauthorizedException('Your session is no longer valid. Please sign in again.');
    req.user = user;

    if (this.reflector.getAllAndOverride<boolean>(VERIFIED_KEY, targets) && !user.emailVerified) {
      throw new ForbiddenException('Verify your email address to use this feature.');
    }
    return true;
  }
}
