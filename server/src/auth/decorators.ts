import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AuthUser, Role } from './auth.constants';

export const IS_PUBLIC = 'isPublic';
export const ROLES_KEY = 'roles';
export const VERIFIED_KEY = 'requireVerifiedEmail';

/** Routes are private by default. Mark the few public ones explicitly. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
export const RequireVerifiedEmail = () => SetMetadata(VERIFIED_KEY, true);
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
