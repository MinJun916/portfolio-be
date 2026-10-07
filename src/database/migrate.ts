import { join } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase, type Database } from './database';

export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: join(__dirname, 'migrations') });
}

async function main(): Promise<void> {
  const db = createDatabase();
  try {
    await runMigrations(db);
    console.log('Database migrations completed.');
  } finally {
    await db.$client.end();
  }
}

if (require.main === module) {
  void main().catch(() => {
    console.error(
      'Database migration failed. API deployment must not proceed.',
    );
    process.exitCode = 1;
  });
}
