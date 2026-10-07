import type { DataSourceOptions } from 'typeorm';
import {
  AdminAccount,
  AdminSession,
  Experience,
  Project,
  SiteContent,
  TechGroup,
} from './entities';
import { InitialSchema1780857600000 } from './1780857600000-InitialSchema';

export function getDataSourceOptions(): DataSourceOptions {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  return {
    type: 'postgres',
    uuidExtension: 'pgcrypto',
    installExtensions: false,
    url: process.env.DATABASE_URL,
    entities: [
      SiteContent,
      AdminAccount,
      AdminSession,
      Experience,
      TechGroup,
      Project,
    ],
    migrations: [InitialSchema1780857600000],
    synchronize: false,
    migrationsRun: false,
    extra: { max: 3 },
  };
}
