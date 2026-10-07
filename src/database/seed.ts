import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDatabase, type Database } from './database';
import { experiences, projects, siteContent, techGroups } from './schema';

type SeedData = {
  site: Record<string, unknown>;
  experiences: (typeof experiences.$inferInsert)[];
  techGroups: (typeof techGroups.$inferInsert)[];
  projects: (typeof projects.$inferInsert)[];
};

export async function seed(db: Database): Promise<void> {
  const data = JSON.parse(
    readFileSync(join(__dirname, 'seed-data.json'), 'utf8'),
  ) as SeedData;
  await db.transaction(async (tx) => {
    await tx
      .insert(siteContent)
      .values({ id: 1, data: data.site })
      .onConflictDoNothing();
    await tx.insert(experiences).values(data.experiences).onConflictDoNothing();
    await tx.insert(techGroups).values(data.techGroups).onConflictDoNothing();
    await tx.insert(projects).values(data.projects).onConflictDoNothing();
  });
}

async function main(): Promise<void> {
  const db = createDatabase();
  try {
    await seed(db);
    console.log('Portfolio seed completed. Existing content was preserved.');
  } finally {
    await db.$client.end();
  }
}

if (require.main === module) {
  void main().catch(() => {
    console.error(
      'Portfolio seed failed. Check database configuration and migrations.',
    );
    process.exitCode = 1;
  });
}
