import { eq } from 'drizzle-orm';
import { createDatabase } from './database';
import { runMigrations } from './migrate';
import { adminAccounts, projects, siteContent } from './schema';
import { seed } from './seed';

// This suite shares only the explicitly dedicated test database with the API suite.
describe('Drizzle 스키마 생성과 기존 DB 전환', () => {
  let db: ReturnType<typeof createDatabase>;

  async function reset() {
    await db.$client.query(`
      DROP TABLE IF EXISTS admin_sessions, admin_accounts, experiences,
        tech_groups, projects, site_content, migrations CASCADE;
      DROP SCHEMA IF EXISTS drizzle CASCADE;
    `);
  }

  beforeAll(() => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !new URL(url).pathname.endsWith('_test'))
      throw new Error(
        'TEST_DATABASE_URL must point to a dedicated _test database',
      );
    process.env.DATABASE_URL = url;
    db = createDatabase();
  });
  beforeEach(reset);
  afterAll(async () => {
    if (db) {
      await reset();
      await db.$client.end();
    }
  });

  it('새 DB를 생성하고 중복 실행과 시드 재실행 시 편집 내용을 보존한다', async () => {
    await runMigrations(db);
    await seed(db);
    await db
      .update(siteContent)
      .set({ version: 9 })
      .where(eq(siteContent.id, 1));
    const before = (
      await db.$client.query('SELECT * FROM drizzle.__drizzle_migrations')
    ).rows;
    await runMigrations(db);
    await seed(db);
    expect(
      (await db.$client.query('SELECT * FROM drizzle.__drizzle_migrations'))
        .rows,
    ).toEqual(before);
    expect(before).toHaveLength(1);
    expect((await db.select().from(siteContent))[0].version).toBe(9);
  });

  it('완료된 기존 migration을 채택하고 콘텐츠·관리자·원래 이력을 보존한다', async () => {
    await runMigrations(db);
    await seed(db);
    await db.insert(adminAccounts).values({
      email: 'preserved@example.com',
      passwordHash: 'preserved-hash',
    });
    await db
      .update(siteContent)
      .set({ version: 17 })
      .where(eq(siteContent.id, 1));
    const before = {
      site: await db.select().from(siteContent),
      projects: await db.select().from(projects).orderBy(projects.id),
      admins: await db.select().from(adminAccounts),
    };
    await db.$client.query(`
      CREATE TABLE migrations (id serial PRIMARY KEY, timestamp bigint NOT NULL, name varchar NOT NULL);
      INSERT INTO migrations (timestamp, name) VALUES (1780857600000, 'InitialSchema1780857600000');
      DROP SCHEMA drizzle CASCADE;
    `);
    await runMigrations(db);
    await runMigrations(db);
    expect({
      site: await db.select().from(siteContent),
      projects: await db.select().from(projects).orderBy(projects.id),
      admins: await db.select().from(adminAccounts),
    }).toEqual(before);
    expect(
      (await db.$client.query('SELECT name FROM migrations')).rows,
    ).toEqual([{ name: 'InitialSchema1780857600000' }]);
    expect(
      (await db.$client.query('SELECT * FROM drizzle.__drizzle_migrations'))
        .rows,
    ).toHaveLength(1);
  });

  it('부분 스키마나 테이블이 누락된 기존 이력은 거절하고 DDL·이력을 롤백한다', async () => {
    await db.$client.query('CREATE TABLE projects (id uuid PRIMARY KEY)');
    await expect(runMigrations(db)).rejects.toThrow();
    expect(
      (
        await db.$client.query(
          "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
        )
      ).rows,
    ).toEqual([{ tablename: 'projects' }]);
    expect(
      (await db.$client.query('SELECT * FROM drizzle.__drizzle_migrations'))
        .rows,
    ).toEqual([]);
    await db.$client.query(`
      CREATE TABLE migrations (id serial PRIMARY KEY, timestamp bigint NOT NULL, name varchar NOT NULL);
      INSERT INTO migrations (timestamp, name) VALUES (1780857600000, 'InitialSchema1780857600000');
    `);
    await expect(runMigrations(db)).rejects.toThrow();
    expect(
      (await db.$client.query('SELECT * FROM drizzle.__drizzle_migrations'))
        .rows,
    ).toEqual([]);
    expect(
      (
        await db.$client.query<{ table_name: string | null }>(
          "SELECT to_regclass('public.admin_accounts') AS table_name",
        )
      ).rows[0].table_name,
    ).toBeNull();
  });
});
