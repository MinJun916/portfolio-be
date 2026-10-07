import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getDataSourceOptions } from './options';

@Module({
  imports: [TypeOrmModule.forRootAsync({ useFactory: getDataSourceOptions })],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
