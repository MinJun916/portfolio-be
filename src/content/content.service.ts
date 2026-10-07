import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';
import {
  DataSource,
  DeepPartial,
  EntityManager,
  EntityTarget,
  ObjectLiteral,
} from 'typeorm';
import {
  Experience,
  Project,
  SiteContent,
  TechGroup,
} from '../database/entities';
import {
  CaseStudySchema,
  ChangelogSchema,
  EmptyContentSchema,
  PatchSiteDto,
  ReorderDto,
} from './content.dto';

type ContentEntity = Experience | TechGroup | Project;
type Patch = { version: number };

@Injectable()
export class ContentService {
  constructor(private readonly db: DataSource) {}

  async site() {
    const site = await this.db.getRepository(SiteContent).findOneBy({ id: 1 });
    if (!site) throw new NotFoundException('사이트 콘텐츠가 없습니다.');
    return site;
  }

  async patchSite(body: PatchSiteDto) {
    return this.db.transaction(async (manager) => {
      const result = await manager
        .getRepository(SiteContent)
        .createQueryBuilder()
        .update()
        .set({ data: body.data, version: () => '"version" + 1' })
        .where('id = :id AND version = :version', {
          id: 1,
          version: body.version,
        })
        .returning('*')
        .execute();
      if (!result.affected)
        await this.missingOrConflict(manager, SiteContent, 1);
      return manager.getRepository(SiteContent).findOneByOrFail({ id: 1 });
    });
  }

  list<T extends ContentEntity>(entity: EntityTarget<T>, published = false) {
    const query = this.db
      .getRepository(entity)
      .createQueryBuilder('item')
      .orderBy('item.sortOrder', 'ASC')
      .addOrderBy('item.id', 'ASC');
    if (published) query.where('item.isPublished = true');
    return query.getMany();
  }

  async projects(category?: string, home = false) {
    const query = this.db
      .getRepository(Project)
      .createQueryBuilder('project')
      .where('project.isPublished = true')
      .orderBy('project.sortOrder', 'ASC')
      .addOrderBy('project.id', 'ASC');
    query.select(
      this.db
        .getMetadata(Project)
        .columns.filter((column) => column.propertyName !== 'content')
        .map((column) => `project.${column.propertyPath}`),
    );
    if (category) query.andWhere('project.category = :category', { category });
    if (home) query.andWhere('project.showOnHome = true');
    return query.getMany();
  }

  async publicProject(slug: string) {
    const project = await this.db
      .getRepository(Project)
      .findOneBy({ slug, isPublished: true });
    if (!project) throw new NotFoundException('공개된 프로젝트가 없습니다.');
    return project;
  }

  async home() {
    const [site, experiences, techGroups, projects] = await Promise.all([
      this.site(),
      this.list(Experience, true),
      this.list(TechGroup, true),
      this.projects(undefined, true),
    ]);
    return { site, experiences, techGroups, projects };
  }

  async detail<T extends ContentEntity>(entity: EntityTarget<T>, id: string) {
    const item = await this.db.getRepository(entity).findOneBy({ id } as never);
    if (!item) throw new NotFoundException('콘텐츠가 없습니다.');
    return item;
  }

  async create<T extends ContentEntity>(entity: EntityTarget<T>, body: object) {
    if (entity === Project) this.validateProject(body as Project);
    try {
      return await this.db
        .getRepository(entity)
        .save(this.db.getRepository(entity).create(body as DeepPartial<T>));
    } catch (error) {
      this.rethrowConstraint(error);
    }
  }

  async patch<T extends ContentEntity>(
    entity: EntityTarget<T>,
    id: string,
    body: Patch,
  ) {
    try {
      return await this.db.transaction(async (manager) => {
        const repo = manager.getRepository(entity);
        const current = await repo.findOneBy({ id } as never);
        if (!current) throw new NotFoundException('콘텐츠가 없습니다.');
        if (current.version !== body.version)
          throw new ConflictException(
            '콘텐츠가 변경되었습니다. 다시 조회해 주세요.',
          );
        const { version, ...changes } = body;
        if (entity === Project)
          this.validateProject({ ...current, ...changes } as Project);
        const result = await repo
          .createQueryBuilder()
          .update()
          .set({ ...changes, version: () => '"version" + 1' } as never)
          .where('id = :id AND version = :version', { id, version })
          .execute();
        if (!result.affected) await this.missingOrConflict(manager, entity, id);
        return repo.findOneByOrFail({ id } as never);
      });
    } catch (error) {
      this.rethrowConstraint(error);
    }
  }

  async remove<T extends ContentEntity>(
    entity: EntityTarget<T>,
    id: string,
    version: number,
  ) {
    return this.db.transaction(async (manager) => {
      const result = await manager
        .getRepository(entity)
        .delete({ id, version } as never);
      if (!result.affected) await this.missingOrConflict(manager, entity, id);
      return { id };
    });
  }

  async reorder<T extends ContentEntity>(
    entity: EntityTarget<T>,
    body: ReorderDto,
  ) {
    return this.db.transaction(async (manager) => {
      const repo = manager.getRepository(entity);
      // ponytail: whole-table reorder lock; use list-scoped locking if concurrent editing throughput requires it.
      await manager.query(
        `LOCK TABLE ${repo.metadata.tablePath} IN SHARE ROW EXCLUSIVE MODE`,
      );
      const existing = await repo.find({ order: { id: 'ASC' } as never });
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
        const result = await repo
          .createQueryBuilder()
          .update()
          .set({ sortOrder, version: () => '"version" + 1' } as never)
          .where('id = :id AND version = :version', item)
          .execute();
        if (!result.affected)
          throw new ConflictException(
            '목록이 변경되었습니다. 다시 조회해 주세요.',
          );
      }
      return repo.find({ order: { sortOrder: 'ASC', id: 'ASC' } as never });
    });
  }

  private validateProject(project: Project) {
    const schema = {
      'case-study': CaseStudySchema,
      changelog: ChangelogSchema,
      none: EmptyContentSchema,
    }[project.template];
    const result = schema.safeParse(project.content);
    if (!result.success) throw new ZodValidationException(result.error);
  }

  private async missingOrConflict<T extends ObjectLiteral>(
    manager: EntityManager,
    entity: EntityTarget<T>,
    id: string | number,
  ): Promise<never> {
    if (!(await manager.getRepository(entity).existsBy({ id } as never)))
      throw new NotFoundException('콘텐츠가 없습니다.');
    throw new ConflictException('콘텐츠가 변경되었습니다. 다시 조회해 주세요.');
  }

  private rethrowConstraint(error: unknown): never {
    if (
      (error as { driverError?: { code?: string } })?.driverError?.code ===
      '23505'
    )
      throw new ConflictException('이미 사용 중인 프로젝트 슬러그입니다.');
    throw error;
  }
}
