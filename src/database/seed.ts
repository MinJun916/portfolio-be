import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Experience, Project, SiteContent, TechGroup } from './entities';
import { getDataSourceOptions } from './options';

type SeedData = {
  site: Record<string, unknown>;
  experiences: Partial<Experience>[];
  techGroups: Partial<TechGroup>[];
  projects: Partial<Project>[];
};

export async function seed(dataSource: DataSource): Promise<void> {
  const data = JSON.parse(
    readFileSync(join(__dirname, 'seed-data.json'), 'utf8'),
  ) as SeedData;
  await dataSource.transaction(async (manager) => {
    await manager
      .createQueryBuilder()
      .insert()
      .into(SiteContent)
      .values({ id: 1, data: data.site } as QueryDeepPartialEntity<SiteContent>)
      .orIgnore()
      .execute();
    await manager
      .createQueryBuilder()
      .insert()
      .into(Experience)
      .values(data.experiences)
      .orIgnore()
      .execute();
    await manager
      .createQueryBuilder()
      .insert()
      .into(TechGroup)
      .values(data.techGroups)
      .orIgnore()
      .execute();
    await manager
      .createQueryBuilder()
      .insert()
      .into(Project)
      .values(data.projects as QueryDeepPartialEntity<Project>[])
      .orIgnore()
      .execute();
  });
}

async function main(): Promise<void> {
  const dataSource = new DataSource(getDataSourceOptions());
  await dataSource.initialize();
  try {
    await seed(dataSource);
    console.log('Portfolio seed completed. Existing content was preserved.');
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
