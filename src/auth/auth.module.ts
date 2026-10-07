import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminGuard } from './admin.guard';
import { AuthController } from './auth.controller';
import {
  AuthService,
  JWT_AUDIENCE,
  JWT_ISSUER,
  SESSION_SECONDS,
} from './auth.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret || Buffer.byteLength(secret, 'utf8') < 32)
          throw new Error('JWT_SECRET must contain at least 32 UTF-8 bytes');
        return {
          secret,
          signOptions: {
            algorithm: 'HS256',
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
            expiresIn: SESSION_SECONDS,
          },
          verifyOptions: {
            algorithms: ['HS256'],
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
          },
        };
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 5 }]),
  ],
  controllers: [AuthController],
  providers: [AuthService, AdminGuard],
  exports: [AdminGuard, AuthService],
})
export class AuthModule {}
