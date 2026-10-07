import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, SESSION_COOKIE } from './auth.service';
import { checkOrigin } from './origins';

export type AdminRequest = Request & { admin: { id: string; email: string } };
export function sessionToken(request: Request): string | undefined {
  const token = (request.cookies as Record<string, unknown> | undefined)?.[
    SESSION_COOKIE
  ];
  return typeof token === 'string' ? token : undefined;
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    request.admin = await this.auth.authenticate(sessionToken(request));
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method))
      checkOrigin(request);
    return true;
  }
}
