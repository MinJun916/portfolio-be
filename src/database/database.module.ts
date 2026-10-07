import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { createDatabase } from './database';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly db = createDatabase();

  async onModuleDestroy() {
    await this.db.$client.end();
  }
}

@Global()
@Module({ providers: [DatabaseService], exports: [DatabaseService] })
export class DatabaseModule {}
