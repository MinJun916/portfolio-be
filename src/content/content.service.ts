import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  DrizzleQueryError,
  eq,
  getTableColumns,
  sql,
} from 'drizzle-orm';
import type { InferInsertModel } from 'drizzle-orm';
import { ZodValidationException } from 'nestjs-zod';
import { DatabaseService } from '../database/database.module';
import type { Transaction } from '../database/database';
import {
  experiences,
  projects,
  siteContent,
  techGroups,
} from '../database/schema';
import type { Project } from '../database/schema';
import {
  CaseStudySchema,
  ChangelogSchema,
  EmptyContentSchema,
  PatchSiteDto,
  ReorderDto,
} from './content.dto';

type ContentTable = typeof experiences | typeof techGroups | typeof projects;

@Injectable()
export class ContentService {
  constructor(private readonly database: DatabaseService) {}

  async site() {
    const [site] = await this.database.db
      .select()
      .from(siteContent)
      .where(eq(siteContent.id, 1));
    if (!site) throw new NotFoundException('사이트 콘텐츠가 없습니다.');
    return site;
  }

  async patchSite(body: PatchSiteDto) {
    return this.database.db.transaction(async (tx) => {
      const [site] = await tx
        .update(siteContent)
        .set({
          data: body.data,
          version: sql`${siteContent.version} + 1`,
          updatedAt: sql`now()`,
        })
        .where(
          and(eq(siteContent.id, 1), eq(siteContent.version, body.version)),
        )
        .returning();
      if (!site) await this.missingOrConflict(tx, siteContent, 1);
      return site;
    });
  }

  list(table: ContentTable, published = false) {
    return this.database.db
      .select()
      .from(table)
      .where(published ? eq(table.isPublished, true) : undefined)
      .orderBy(asc(table.sortOrder), asc(table.id));
  }

  projects(category?: Project['category'], home = false) {
    const { content: _content, ...columns } = getTableColumns(projects);
    void _content;
    return this.database.db
      .select(columns)
      .from(projects)
      .where(
        and(
          eq(projects.isPublished, true),
          category ? eq(projects.category, category) : undefined,
          home ? eq(projects.showOnHome, true) : undefined,
        ),
      )
      .orderBy(asc(projects.sortOrder), asc(projects.id));
  }

  async publicProject(slug: string) {
    const [project] = await this.database.db
      .select()
      .from(projects)
      .where(and(eq(projects.slug, slug), eq(projects.isPublished, true)));
    if (!project) throw new NotFoundException('공개된 프로젝트가 없습니다.');
    return project;
  }

  async home() {
    const [site, experienceList, techGroupList, projectList] =
      await Promise.all([
        this.site(),
        this.list(experiences, true),
        this.list(techGroups, true),
        this.projects(undefined, true),
      ]);
    return {
      site,
      experiences: experienceList,
      techGroups: techGroupList,
      projects: projectList,
    };
  }

  async detail(table: ContentTable, id: string) {
    const [item] = await this.database.db
      .select()
      .from(table)
      .where(eq(table.id, id));
    if (!item) throw new NotFoundException('콘텐츠가 없습니다.');
    return item;
  }

  async create<T extends ContentTable>(table: T, body: InferInsertModel<T>) {
    if (table === projects) this.validateProject(body);
    try {
      const [item] = await this.database.db
        .insert(table)
        .values(body)
        .returning();
      return item;
    } catch (error) {
      this.rethrowConstraint(error);
    }
  }

  async patch<T extends ContentTable>(
    table: T,
    id: string,
    body: Partial<InferInsertModel<T>> & { version: number },
  ) {
    try {
      const contentTable: ContentTable = table;
      return await this.database.db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(contentTable)
          .where(eq(contentTable.id, id));
        if (!current) throw new NotFoundException('콘텐츠가 없습니다.');
        if (current.version !== body.version)
          throw new ConflictException(
            '콘텐츠가 변경되었습니다. 다시 조회해 주세요.',
          );
        const { version, ...changes } = body;
        if (table === projects)
          this.validateProject({ ...current, ...changes });
        const [item] = await tx
          .update(contentTable)
          .set({
            ...changes,
            version: sql`${table.version} + 1`,
            updatedAt: sql`now()`,
          })
          .where(and(eq(table.id, id), eq(table.version, version)))
          .returning();
        if (!item) await this.missingOrConflict(tx, table, id);
        return item;
      });
    } catch (error) {
      this.rethrowConstraint(error);
    }
  }

  async remove(table: ContentTable, id: string, version: number) {
    return this.database.db.transaction(async (tx) => {
      const [item] = await tx
        .delete(table)
        .where(and(eq(table.id, id), eq(table.version, version)))
        .returning({ id: table.id });
      if (!item) await this.missingOrConflict(tx, table, id);
      return { id };
    });
  }

  async reorder(table: ContentTable, body: ReorderDto) {
    return this.database.db.transaction(async (tx) => {
      // ponytail: whole-table reorder lock; use list-scoped locking if concurrent editing throughput requires it.
      await tx.execute(sql`LOCK TABLE ${table} IN SHARE ROW EXCLUSIVE MODE`);
      const existing = await tx.select({ id: table.id }).from(table);
      const ids = new Set(body.items.map((item) => item.id));
      if (
        ids.size !== body.items.length ||
        existing.length !== ids.size ||
        existing.some((item) => !ids.has(item.id))
      ) {
        throw new BadRequestException(
          '현재 전체 목록의 ID를 중복 없이 전달해 주세요.',
        );
      }
      for (const [sortOrder, item] of body.items.entries()) {
        const [updated] = await tx
          .update(table)
          .set({
            sortOrder,
            version: sql`${table.version} + 1`,
            updatedAt: sql`now()`,
          })
          .where(and(eq(table.id, item.id), eq(table.version, item.version)))
          .returning({ id: table.id });
        if (!updated)
          throw new ConflictException(
            '목록이 변경되었습니다. 다시 조회해 주세요.',
          );
      }
      return tx
        .select()
        .from(table)
        .orderBy(asc(table.sortOrder), asc(table.id));
    });
  }

  private validateProject(project: object) {
    if (!('template' in project) || !('content' in project))
      throw new BadRequestException('프로젝트 템플릿과 콘텐츠가 필요합니다.');
    const schema =
      project.template === 'case-study'
        ? CaseStudySchema
        : project.template === 'changelog'
          ? ChangelogSchema
          : EmptyContentSchema;
    const result = schema.safeParse(project.content);
    if (!result.success) throw new ZodValidationException(result.error);
  }

  private async missingOrConflict(
    tx: Transaction,
    table: ContentTable | typeof siteContent,
    id: string | number,
  ): Promise<never> {
    const [item] = await tx
      .select({ id: table.id })
      .from(table)
      .where(eq(table.id, id));
    if (!item) throw new NotFoundException('콘텐츠가 없습니다.');
    throw new ConflictException('콘텐츠가 변경되었습니다. 다시 조회해 주세요.');
  }

  private rethrowConstraint(error: unknown): never {
    if (
      error instanceof DrizzleQueryError &&
      error.cause &&
      'code' in error.cause &&
      error.cause.code === '23505'
    )
      throw new ConflictException('이미 사용 중인 프로젝트 슬러그입니다.');
    throw error;
  }
}
