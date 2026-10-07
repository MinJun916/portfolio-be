import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json } from 'express';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { allowedOrigins } from './auth/origins';

export function configureApp(app: NestExpressApplication) {
  const origins = allowedOrigins();
  app.use(json({ limit: '1mb' }));
  app.set('trust proxy', 'loopback');
  app.enableCors({
    origin: origins,
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  const config = new DocumentBuilder()
    .setTitle('Portfolio API')
    .setVersion('1.0')
    .setDescription(
      '공개 콘텐츠 조회와 관리자 편집 API. 성공: {success:true,data}, 오류: {success:false,error:{code,message,details?}}. 관리자 로그인 후 data.accessToken 값만 Swagger Authorize에 입력하세요. 관리자 API는 Authorization: Bearer <accessToken> 헤더로 인증합니다. PATCH는 제공한 객체/배열 전체를 교체하며 생략한 필드는 유지합니다. DELETE는 영구 삭제입니다. 이미지 업로드 없이 경로/URL만 저장합니다.',
    )
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'adminBearer',
    )
    .build();
  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
  });
  return document;
}
