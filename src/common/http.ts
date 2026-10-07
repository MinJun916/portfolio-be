import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { map } from 'rxjs';
import { DrizzleQueryError } from 'drizzle-orm';
import { ZodError } from 'zod';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next
      .handle()
      .pipe(map((data: unknown) => ({ success: true, data: data ?? null })));
  }
}

const codes: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_SERVER_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    let status = 500;
    let message = '서버 오류가 발생했습니다.';
    let details: { path: string; message: string }[] | undefined;
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      const value =
        typeof body === 'string'
          ? body
          : (body as { message?: unknown }).message;
      message =
        typeof value === 'string'
          ? value
          : Array.isArray(value)
            ? value.join(', ')
            : exception.message;
      if (exception instanceof ZodValidationException) {
        message = '입력값을 확인해주세요.';
        details = (exception.getZodError() as ZodError).issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));
      }
    } else if (
      exception instanceof Error &&
      [400, 413].includes((exception as { status?: number }).status ?? 0)
    ) {
      status = (exception as Error & { status: number }).status;
      message =
        status === 413
          ? '요청 본문은 1MB 이하여야 합니다.'
          : '올바른 JSON 본문이 필요합니다.';
    } else if (exception instanceof Error) {
      const code =
        exception instanceof DrizzleQueryError
          ? (exception.cause as { code?: string } | undefined)?.code
          : (exception as NodeJS.ErrnoException).code;
      if (code === '23505') {
        status = 409;
        message = '이미 사용 중인 값입니다.';
      } else if (
        code?.startsWith('08') ||
        [
          'ECONNREFUSED',
          'ECONNRESET',
          'ENOTFOUND',
          '57P01',
          '57P03',
          '53300',
        ].includes(code ?? '')
      ) {
        status = 503;
        message = '데이터베이스 연결을 사용할 수 없습니다.';
      }
    }
    // SQL, 요청 본문, 쿠키/비밀번호를 로그나 응답에 노출하지 않습니다.
    if (status >= 500)
      this.logger.error(
        `API failure: ${status} (${exception instanceof Error ? exception.name : 'unknown'})`,
      );
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({
        success: false,
        error: {
          code: codes[status] ?? 'HTTP_ERROR',
          message,
          ...(details ? { details } : {}),
        },
      });
  }
}
