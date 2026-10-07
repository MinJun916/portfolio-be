import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { allowedOrigins } from './auth/origins';
import { SESSION_COOKIE } from './auth/auth.service';

export function configureApp(app: NestExpressApplication) {
  const origins = allowedOrigins();
  app.use(json({ limit: '1mb' }));
  app.use(cookieParser());
  app.set('trust proxy', 'loopback');
  app.enableCors({ origin: origins, credentials: true });
  const config = new DocumentBuilder()
    .setTitle('Portfolio API')
    .setVersion('1.0')
    .setDescription(
      '공개 콘텐츠 조회와 관리자 편집 API. 성공: {success:true,data}, 오류: {success:false,error:{code,message,details?}}. 관리자 로그인·쓰기 요청은 허용된 Origin이 필요합니다. PATCH는 제공한 객체/배열 전체를 교체하며 생략한 필드는 유지합니다. DELETE는 영구 삭제입니다. 이미지 업로드 없이 경로/URL만 저장합니다.',
    )
    .addCookieAuth(
      SESSION_COOKIE,
      { type: 'apiKey', in: 'cookie' },
      'adminSession',
    )
    .build();
  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: { withCredentials: true },
  });
  return document;
}
