import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ApiResult } from './common/api';

class HealthDto extends createZodDto(z.object({ status: z.literal('ok') })) {}

@ApiTags('상태')
@Controller()
export class AppController {
  @Get('health')
  @ApiOperation({
    summary: 'API 프로세스 상태 확인',
    description:
      '프로세스 생존 확인용입니다. DB 조회 가능 여부는 콘텐츠 조회 API로 확인합니다.',
  })
  @ApiResult(HealthDto)
  health() {
    return { status: 'ok' };
  }
}
