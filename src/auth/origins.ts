import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';

export function allowedOrigins() {
  const origins = (process.env.ADMIN_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((value) => value.trim());
  if (
    origins.some((value) => {
      try {
        const url = new URL(value);
        return (
          !['http:', 'https:'].includes(url.protocol) || url.origin !== value
        );
      } catch {
        return true;
      }
    })
  )
    throw new Error('ADMIN_ORIGINS must contain exact http(s) origins');
  return origins;
}

export function checkOrigin(request: Request) {
  if (
    !request.headers.origin ||
    !allowedOrigins().includes(request.headers.origin)
  ) {
    throw new ForbiddenException('허용된 관리자 Origin 헤더가 필요합니다.');
  }
}
