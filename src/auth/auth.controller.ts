import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { ApiErrors, ApiResult } from '../common/api';
import { AdminGuard, bearerToken } from './admin.guard';
import type { AdminRequest } from './admin.guard';
import {
  AdminDto,
  AuthResultDto,
  LoginDto,
  LoginResultDto,
  PasswordDto,
} from './auth.dto';
import { AuthService } from './auth.service';

@ApiTags('관리자 인증')
@Controller('api/v1/admin/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: '관리자 로그인',
    description:
      '8시간 유효한 accessToken을 반환합니다. Swagger Authorize에 data.accessToken 값만 입력하거나 Authorization: Bearer <accessToken> 헤더로 전달합니다. IP당 1분에 5회까지 시도할 수 있습니다.',
  })
  @ApiResult(LoginResultDto)
  @ApiErrors(400, 401, 429, 503)
  login(@Body() body: LoginDto) {
    return this.auth.login(body.email, body.password);
  }

  @Get('me')
  @UseGuards(AdminGuard)
  @ApiBearerAuth('adminBearer')
  @ApiOperation({ summary: '로그인한 관리자 조회' })
  @ApiResult(AdminDto)
  @ApiErrors(401, 503)
  me(@Req() request: AdminRequest) {
    return request.admin;
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @ApiBearerAuth('adminBearer')
  @ApiOperation({
    summary: '로그아웃',
    description: '현재 accessToken을 폐기합니다.',
  })
  @ApiResult(AuthResultDto)
  @ApiErrors(401, 503)
  async logout(@Req() request: Request) {
    await this.auth.logout(bearerToken(request)!);
    return { message: '로그아웃되었습니다.' };
  }

  @Patch('password')
  @UseGuards(AdminGuard)
  @ApiBearerAuth('adminBearer')
  @ApiOperation({
    summary: '관리자 비밀번호 변경',
    description:
      '현재 비밀번호를 확인한 뒤 변경하고 이 관리자의 모든 토큰을 폐기합니다. 다시 로그인해야 합니다.',
  })
  @ApiResult(AuthResultDto)
  @ApiErrors(400, 401, 503)
  async password(@Body() body: PasswordDto, @Req() request: AdminRequest) {
    await this.auth.changePassword(
      request.admin.id,
      body.currentPassword,
      body.newPassword,
    );
    return { message: '비밀번호가 변경되었습니다. 다시 로그인해주세요.' };
  }
}
