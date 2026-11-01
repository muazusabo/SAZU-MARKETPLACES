import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { Role } from './auth.constants';

const ctxFor = (user: unknown): ExecutionContext =>
  ({
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

const guardRequiring = (roles?: Role[]) => {
  const reflector = { getAllAndOverride: () => roles } as unknown as Reflector;
  return new RolesGuard(reflector);
};

describe('RolesGuard', () => {
  it('allows routes with no role requirement', () => {
    expect(guardRequiring(undefined).canActivate(ctxFor({ roles: ['user'] }))).toBe(true);
  });
  it('allows a user holding a required role', () => {
    expect(guardRequiring(['admin']).canActivate(ctxFor({ roles: ['user', 'admin'] }))).toBe(true);
  });
  it('blocks a user without the role', () => {
    expect(() => guardRequiring(['admin']).canActivate(ctxFor({ roles: ['user', 'seller'] }))).toThrow(
      ForbiddenException,
    );
  });
  it('blocks when no user is attached', () => {
    expect(() => guardRequiring(['admin']).canActivate(ctxFor(undefined))).toThrow(ForbiddenException);
  });
});
