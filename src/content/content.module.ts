import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminContentController } from './admin-content.controller';
import { ContentService } from './content.service';
import { PublicContentController } from './public-content.controller';

@Module({
  imports: [AuthModule],
  controllers: [PublicContentController, AdminContentController],
  providers: [ContentService],
})
export class ContentModule {}
