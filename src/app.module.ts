import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { DatabaseModule } from './database/database.module';
import { ContentModule } from './content/content.module';
import { AuthModule } from './auth/auth.module';
import { ApiExceptionFilter, ResponseInterceptor } from './common/http';

@Module({
  imports: [DatabaseModule, AuthModule, ContentModule],
  controllers: [AppController],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
