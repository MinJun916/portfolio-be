import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1780857600000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE site_content (
        id integer PRIMARY KEY CONSTRAINT "CHK_site_singleton" CHECK (id = 1),
        data jsonb NOT NULL, version integer NOT NULL DEFAULT 1 CONSTRAINT "CHK_site_version" CHECK (version > 0),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE admin_accounts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
        "passwordHash" text NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE admin_sessions (
        "tokenHash" text PRIMARY KEY, "adminId" uuid NOT NULL CONSTRAINT "FK_admin_sessions_admin" REFERENCES admin_accounts(id) ON DELETE CASCADE,
        "expiresAt" timestamptz NOT NULL
      );
      CREATE INDEX "IDX_admin_sessions_expires" ON admin_sessions ("expiresAt");
      CREATE TABLE experiences (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, organization text NOT NULL,
        period text NOT NULL, "iconKey" text NOT NULL, responsibilities text[] NOT NULL DEFAULT '{}', skills text[] NOT NULL DEFAULT '{}',
        "isPublished" boolean NOT NULL DEFAULT false, "sortOrder" integer NOT NULL DEFAULT 0 CONSTRAINT "CHK_experiences_order" CHECK ("sortOrder" BETWEEN 0 AND 100000),
        version integer NOT NULL DEFAULT 1 CONSTRAINT "CHK_experiences_version" CHECK (version > 0),
        "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "IDX_experiences_public_order" ON experiences ("isPublished", "sortOrder", id);
      CREATE TABLE tech_groups (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, items jsonb NOT NULL DEFAULT '[]',
        "isPublished" boolean NOT NULL DEFAULT false, "sortOrder" integer NOT NULL DEFAULT 0 CONSTRAINT "CHK_tech_groups_order" CHECK ("sortOrder" BETWEEN 0 AND 100000),
        version integer NOT NULL DEFAULT 1 CONSTRAINT "CHK_tech_groups_version" CHECK (version > 0),
        "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "IDX_tech_groups_public_order" ON tech_groups ("isPublished", "sortOrder", id);
      CREATE TABLE projects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE, title text NOT NULL,
        category text NOT NULL CONSTRAINT "CHK_projects_category" CHECK (category IN ('major','side','etc')),
        template text NOT NULL CONSTRAINT "CHK_projects_template" CHECK (template IN ('case-study','changelog','none')),
        subtitle text, description text, "imageSrc" text, "logoSrc" text, role text, period text, repository text,
        links jsonb NOT NULL DEFAULT '[]', keywords text[] NOT NULL DEFAULT '{}', "techStack" text[] NOT NULL DEFAULT '{}',
        content jsonb NOT NULL DEFAULT '{}', seo jsonb NOT NULL DEFAULT '{}', "showOnHome" boolean NOT NULL DEFAULT false,
        "isPublished" boolean NOT NULL DEFAULT false, "sortOrder" integer NOT NULL DEFAULT 0 CONSTRAINT "CHK_projects_order" CHECK ("sortOrder" BETWEEN 0 AND 100000),
        version integer NOT NULL DEFAULT 1 CONSTRAINT "CHK_projects_version" CHECK (version > 0),
        "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "IDX_projects_public_order" ON projects ("isPublished", "sortOrder", id);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE projects, tech_groups, experiences, admin_sessions, admin_accounts, site_content',
    );
  }
}
