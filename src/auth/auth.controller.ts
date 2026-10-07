import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ApiErrors, ApiResult } from '../common/api';
import { AdminGuard, sessionToken } from './admin.guard';
import type { AdminRequest } from './admin.guard';
import { AdminDto, AuthResultDto, LoginDto, PasswordDto } from './auth.dto';
import { AuthService, SESSION_COOKIE, SESSION_MS } from './auth.service';
import { checkOrigin } from './origins';

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/api/v1/admin',
});

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
      '허용된 Origin이 필요합니다. 성공하면 8시간 유효한 HttpOnly 세션 쿠키를 설정합니다. IP당 1분에 5회까지 시도할 수 있습니다.',
  })
  @ApiHeader({
    name: 'Origin',
    required: true,
    description: 'ADMIN_ORIGINS에 설정된 관리자 Origin',
  })
  @ApiResult(AdminDto)
  @ApiErrors(400, 401, 403, 429, 503)
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    checkOrigin(request);
    const result = await this.auth.login(
      body.email,
      body.password,
      sessionToken(request),
    );
    response.cookie(SESSION_COOKIE, result.token, {
      ...cookieOptions(),
      maxAge: SESSION_MS,
    });
    return result.admin;
  }

  @Get('me')
  @UseGuards(AdminGuard)
  @ApiCookieAuth('adminSession')
  @ApiOperation({ summary: '로그인한 관리자 조회' })
  @ApiResult(AdminDto)
  @ApiErrors(401, 503)
  me(@Req() request: AdminRequest) {
    return request.admin;
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @ApiCookieAuth('adminSession')
  @ApiHeader({
    name: 'Origin',
    required: true,
    description: '허용된 관리자 Origin',
  })
  @ApiOperation({
    summary: '로그아웃',
    description: '현재 세션을 폐기하고 쿠키를 삭제합니다.',
  })
  @ApiResult(AuthResultDto)
  @ApiErrors(401, 403, 503)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(sessionToken(request)!);
    response.clearCookie(SESSION_COOKIE, cookieOptions());
    return { message: '로그아웃되었습니다.' };
  }

  @Patch('password')
  @UseGuards(AdminGuard)
  @ApiCookieAuth('adminSession')
  @ApiHeader({
    name: 'Origin',
    required: true,
    description: '허용된 관리자 Origin',
  })
  @ApiOperation({
    summary: '관리자 비밀번호 변경',
    description:
      '현재 비밀번호를 확인한 뒤 변경하고 이 관리자의 모든 세션을 폐기합니다. 다시 로그인해야 합니다.',
  })
  @ApiResult(AuthResultDto)
  @ApiErrors(400, 401, 403, 503)
  async password(
    @Body() body: PasswordDto,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.changePassword(
      request.admin.id,
      body.currentPassword,
      body.newPassword,
    );
    response.clearCookie(SESSION_COOKIE, cookieOptions());
    return { message: '비밀번호가 변경되었습니다. 다시 로그인해주세요.' };
  }
}
