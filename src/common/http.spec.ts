import type { ArgumentsHost } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm';
import { ApiExceptionFilter } from './http';

it.each(['ECONNREFUSED', 'ENOTFOUND', '53300', '57P01', '57P03', '08006'])(
  '쿼리·트랜잭션 연결 오류 %s는 내부 정보 없이 동일한 503 응답을 반환한다',
  (code) => {
    const cause = Object.assign(new Error('sensitive database detail'), {
      code,
    });
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      for (const error of [
        cause,
        new DrizzleQueryError('sensitive SQL', [], cause),
      ]) {
        const response = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn(),
        };
        const host = {
          switchToHttp: () => ({ getResponse: () => response }),
        } as ArgumentsHost;
        new ApiExceptionFilter().catch(error, host);
        expect(response.status).toHaveBeenCalledWith(503);
        expect(response.json).toHaveBeenCalledWith({
          success: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: '데이터베이스 연결을 사용할 수 없습니다.',
          },
        });
      }
    } finally {
      log.mockRestore();
    }
  },
);
