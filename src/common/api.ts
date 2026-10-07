import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class ErrorResponseDto extends createZodDto(
  z.object({
    success: z.literal(false),
    error: z.object({
      code: z.string().describe('HTTP 상태에 대응하는 오류 코드'),
      message: z.string(),
      details: z
        .array(z.object({ path: z.string(), message: z.string() }))
        .optional(),
    }),
  }),
) {}

export function ApiResult(
  type: Type<unknown>,
  options: { status?: number; array?: boolean; description?: string } = {},
) {
  const model =
    (type as Type<unknown> & { Output?: Type<unknown> }).Output ?? type;
  const item = { $ref: getSchemaPath(model) };
  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status: options.status ?? 200,
      description: options.description ?? '성공. data에 결과를 반환합니다.',
      schema: {
        type: 'object',
        required: ['success', 'data'],
        properties: {
          success: { type: 'boolean', enum: [true] },
          data: options.array ? { type: 'array', items: item } : item,
        },
      },
    }),
  );
}

const errors: Record<number, string> = {
  400: 'BAD_REQUEST: 입력 형식 또는 값이 올바르지 않습니다.',
  401: 'UNAUTHORIZED: 로그인 정보가 없거나 만료되었습니다.',
  404: 'NOT_FOUND: 요청한 콘텐츠가 없습니다.',
  409: 'CONFLICT: 중복 값 또는 다른 수정과의 버전 충돌입니다.',
  413: 'PAYLOAD_TOO_LARGE: 요청 본문이 1MB를 초과했습니다.',
  429: 'TOO_MANY_REQUESTS: 요청 횟수 제한을 초과했습니다.',
  500: 'INTERNAL_SERVER_ERROR: 서버 오류가 발생했습니다.',
  503: 'SERVICE_UNAVAILABLE: DB 연결을 사용할 수 없습니다.',
};

export function ApiErrors(...statuses: number[]) {
  return applyDecorators(
    ...[...new Set([...statuses, 413, 500, 503])].map((status) =>
      ApiResponse({
        status,
        type: ErrorResponseDto,
        description: errors[status],
      }),
    ),
  );
}
