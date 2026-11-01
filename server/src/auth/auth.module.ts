import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Env } from '../config/env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailTokenService } from './email-token.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { SessionService } from './session.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({ secret: config.get('JWT_ACCESS_SECRET', { infer: true }) }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SessionService, EmailTokenService, JwtAuthGuard, RolesGuard],
  exports: [JwtAuthGuard, RolesGuard, SessionService],
})
export class AuthModule {}
