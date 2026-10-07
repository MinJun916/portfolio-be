import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const updatedAt = () =>
  timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow();
const orderedColumns = () => ({
  id: uuid('id').primaryKey().defaultRandom(),
  isPublished: boolean('isPublished').notNull().default(false),
  sortOrder: integer('sortOrder').notNull().default(0),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('createdAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: updatedAt(),
});

export const siteContent = pgTable(
  'site_content',
  {
    id: integer('id').primaryKey(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    version: integer('version').notNull().default(1),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('CHK_site_singleton', sql`${t.id} = 1`),
    check('CHK_site_version', sql`${t.version} > 0`),
  ],
);

export const adminAccounts = pgTable('admin_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique('admin_accounts_email_key'),
  passwordHash: text('passwordHash').notNull(),
  isActive: boolean('isActive').notNull().default(true),
  createdAt: timestamp('createdAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const adminSessions = pgTable(
  'admin_sessions',
  {
    tokenHash: text('tokenHash').primaryKey(),
    adminId: uuid('adminId').notNull(),
    expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  },
  (t) => [
    foreignKey({
      name: 'FK_admin_sessions_admin',
      columns: [t.adminId],
      foreignColumns: [adminAccounts.id],
    }).onDelete('cascade'),
    index('IDX_admin_sessions_expires').on(t.expiresAt),
  ],
);

export const experiences = pgTable(
  'experiences',
  {
    ...orderedColumns(),
    title: text('title').notNull(),
    organization: text('organization').notNull(),
    period: text('period').notNull(),
    iconKey: text('iconKey').notNull(),
    responsibilities: text('responsibilities')
      .array()
      .notNull()
      .default(sql`'{}'`),
    skills: text('skills')
      .array()
      .notNull()
      .default(sql`'{}'`),
  },
  (t) => [
    check('CHK_experiences_order', sql`${t.sortOrder} BETWEEN 0 AND 100000`),
    check('CHK_experiences_version', sql`${t.version} > 0`),
    index('IDX_experiences_public_order').on(t.isPublished, t.sortOrder, t.id),
  ],
);

export const techGroups = pgTable(
  'tech_groups',
  {
    ...orderedColumns(),
    title: text('title').notNull(),
    items: jsonb('items')
      .$type<{ name: string; iconName?: string }[]>()
      .notNull()
      .default(sql`'[]'`),
  },
  (t) => [
    check('CHK_tech_groups_order', sql`${t.sortOrder} BETWEEN 0 AND 100000`),
    check('CHK_tech_groups_version', sql`${t.version} > 0`),
    index('IDX_tech_groups_public_order').on(t.isPublished, t.sortOrder, t.id),
  ],
);

export const projects = pgTable(
  'projects',
  {
    ...orderedColumns(),
    slug: text('slug').notNull().unique('projects_slug_key'),
    title: text('title').notNull(),
    category: text('category').$type<'major' | 'side' | 'etc'>().notNull(),
    template: text('template')
      .$type<'case-study' | 'changelog' | 'none'>()
      .notNull(),
    subtitle: text('subtitle'),
    description: text('description'),
    imageSrc: text('imageSrc'),
    logoSrc: text('logoSrc'),
    role: text('role'),
    period: text('period'),
    repository: text('repository'),
    links: jsonb('links')
      .$type<{ type: 'fe' | 'be' | 'demo' | 'api'; href: string }[]>()
      .notNull()
      .default(sql`'[]'`),
    keywords: text('keywords')
      .array()
      .notNull()
      .default(sql`'{}'`),
    techStack: text('techStack')
      .array()
      .notNull()
      .default(sql`'{}'`),
    content: jsonb('content')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    seo: jsonb('seo')
      .$type<{ title?: string; description?: string }>()
      .notNull()
      .default(sql`'{}'`),
    showOnHome: boolean('showOnHome').notNull().default(false),
  },
  (t) => [
    check(
      'CHK_projects_category',
      sql`${t.category} IN ('major', 'side', 'etc')`,
    ),
    check(
      'CHK_projects_template',
      sql`${t.template} IN ('case-study', 'changelog', 'none')`,
    ),
    check('CHK_projects_order', sql`${t.sortOrder} BETWEEN 0 AND 100000`),
    check('CHK_projects_version', sql`${t.version} > 0`),
    index('IDX_projects_public_order').on(t.isPublished, t.sortOrder, t.id),
  ],
);

export type Project = typeof projects.$inferSelect;
