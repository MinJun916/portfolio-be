import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';

export type AdminRequest = Request & { admin: { id: string; email: string } };
export function bearerToken(request: Request): string | undefined {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || header.length > 4096) return undefined;
  return /^Bearer ([\w.-]+)$/i.exec(header)?.[1];
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    request.admin = await this.auth.authenticate(bearerToken(request));
    return true;
  }
}
