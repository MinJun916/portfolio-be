import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import type {
  OperationObject,
  ResponseObject,
  SchemaObject,
} from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { count, eq } from 'drizzle-orm';
import { AppModule } from './app.module';
import { hashPassword } from './auth/password';
import { configureApp } from './setup';
import { createDatabase } from './database/database';
import { runMigrations } from './database/migrate';
import {
  adminAccounts,
  adminSessions,
  projects,
  siteContent,
} from './database/schema';
import { AuthService } from './auth/auth.service';
import * as passwords from './auth/password';
import { seed } from './database/seed';
import {
  ExperienceDto,
  ExperienceSchema,
  HomeDto,
  HomeDto as HomeResponse,
  ProjectDto,
  ProjectSchema,
  SiteDataSchema,
  SiteDto,
  TechGroupDto,
  TechGroupSchema,
} from './content/content.dto';

type Envelope<T> = {
  success: boolean;
  data: T;
  error: { code: string; message: string; details?: unknown[] };
};

type LoginResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  admin: { id: string; email: string };
};

describe('실제 PostgreSQL API 계약', () => {
  let app: NestExpressApplication;
  let db: ReturnType<typeof createDatabase>;
  let base: string;
  let token = '';
  const origin = 'http://localhost:3000';
  const password = 'integration-password-only';

  async function request<T = Record<string, unknown>>(
    path: string,
    method = 'GET',
    body?: unknown,
    options: {
      token?: string;
      authorization?: string;
      cookie?: string;
      origin?: string;
      raw?: boolean;
    } = {},
  ) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (options.origin !== '') headers.Origin = options.origin ?? origin;
    if (options.token ?? token)
      headers.Authorization = `Bearer ${options.token ?? token}`;
    if (options.authorization !== undefined)
      headers.Authorization = options.authorization;
    if (options.cookie) headers.Cookie = options.cookie;
    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : options.raw && typeof body === 'string'
            ? body
            : JSON.stringify(body),
    });
    return {
      status: response.status,
      cookie: response.headers.get('set-cookie'),
      body: (await response.json()) as Envelope<T>,
    };
  }

  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !new URL(url).pathname.endsWith('_test')) {
      throw new Error(
        'TEST_DATABASE_URL must point to a dedicated database whose name ends with _test',
      );
    }
    process.env.DATABASE_URL = url;
    process.env.CORS_ORIGINS = origin;
    process.env.JWT_SECRET = '0123456789abcdef'.repeat(4);
    db = createDatabase();
    await runMigrations(db);
    await db.$client.query(
      'TRUNCATE admin_sessions, admin_accounts, experiences, tech_groups, projects, site_content CASCADE',
    );
    await seed(db);
    await db.insert(adminAccounts).values({
      email: 'admin@example.com',
      passwordHash: await hashPassword(password),
      isActive: true,
    });
    app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: false,
      bodyParser: false,
    });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
    if (db) await db.$client.end();
  });

  it('초기 데이터와 응답을 검증하고 재시드가 편집 내용을 덮어쓰지 않는다', async () => {
    const history = await db.$client.query<{
      hash: string;
      created_at: string;
    }>('SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id');
    expect(history.rows).toHaveLength(1);
    expect(history.rows[0].hash).toMatch(/^[a-f0-9]{64}$/);
    await runMigrations(db);
    expect(
      (
        await db.$client.query(
          'SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id',
        )
      ).rows,
    ).toEqual(history.rows);
    const health = await request('/health');
    expect(health.body).toEqual({ success: true, data: { status: 'ok' } });
    const home = await request<HomeResponse>('/api/v1/home');
    expect(home.status).toBe(200);
    expect(HomeDto.schema.safeParse(home.body.data).success).toBe(true);
    expect(home.body.data.experiences).toHaveLength(5);
    expect(home.body.data.techGroups).toHaveLength(6);
    expect(home.body.data.projects).toHaveLength(3);
    const projectList = await request<ProjectDto[]>('/api/v1/projects');
    expect(projectList.body.data).toHaveLength(6);
    expect(
      projectList.body.data.every((project) => !('content' in project)),
    ).toBe(true);
    for (const project of await db.select().from(projects)) {
      const detail = await request<ProjectDto>(
        `/api/v1/projects/${project.slug}`,
      );
      expect(ProjectSchema.safeParse(detail.body.data).success).toBe(true);
      expect(detail.body.data.content).toEqual(project.content);
    }
    const [original] = await db
      .select()
      .from(siteContent)
      .where(eq(siteContent.id, 1));
    expect(SiteDataSchema.safeParse(original.data).success).toBe(true);
    await db
      .update(siteContent)
      .set({ version: 9 })
      .where(eq(siteContent.id, 1));
    await seed(db);
    expect(
      (await db.select().from(siteContent).where(eq(siteContent.id, 1)))[0]
        .version,
    ).toBe(9);
    expect((await db.select({ count: count() }).from(projects))[0].count).toBe(
      6,
    );
  });

  it('Bearer JWT 인증과 Origin 없는 요청·로그인 실패 응답을 검증한다', async () => {
    expect((await request('/api/v1/admin/projects')).status).toBe(401);
    const wrongOrigin = await request(
      '/api/v1/admin/auth/login',
      'POST',
      { email: 'admin@example.com', password: 'wrong' },
      { origin: 'https://evil.example' },
    );
    expect(wrongOrigin.status).toBe(401);
    expect(wrongOrigin.body.error.code).toBe('UNAUTHORIZED');
    const wrong = await request('/api/v1/admin/auth/login', 'POST', {
      email: 'admin@example.com',
      password: 'wrong',
    });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('UNAUTHORIZED');
    const login = await request<LoginResponse>(
      '/api/v1/admin/auth/login',
      'POST',
      { email: 'admin@example.com', password },
      { origin: '' },
    );
    expect(login.status).toBe(200);
    expect(login.cookie).toBeNull();
    expect(login.body.data.tokenType).toBe('Bearer');
    expect(login.body.data.expiresIn).toBe(28800);
    expect(login.body.data.admin.email).toBe('admin@example.com');
    token = login.body.data.accessToken;
    const claims = app
      .get(JwtService)
      .verify<{ sub: string; jti: string; exp: number; iat: number }>(token);
    expect(claims.sub).toBe(login.body.data.admin.id);
    expect(claims.exp - claims.iat).toBe(28800);
    expect(claims.jti).toBeTruthy();
    expect((await request('/api/v1/admin/auth/me')).body.data.email).toBe(
      'admin@example.com',
    );
    const stored = await db.select().from(adminSessions);
    expect(stored[0].tokenHash).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    expect(
      (
        await request('/api/v1/admin/auth/me', 'GET', undefined, {
          token: '',
          cookie: `portfolio_admin=${token}`,
        })
      ).status,
    ).toBe(401);
    for (const authorization of [
      'Basic ' + token,
      'Bearer',
      'Bearer ' + token + ' extra',
      'Bearer ' + 'x'.repeat(4097),
    ]) {
      expect(
        (
          await request('/api/v1/admin/auth/me', 'GET', undefined, {
            authorization,
          })
        ).status,
      ).toBe(401);
    }
    expect(
      (
        await request('/api/v1/admin/auth/me', 'GET', undefined, {
          authorization: `bearer ${token}`,
          origin: '',
        })
      ).status,
    ).toBe(200);
  });

  it('DB에 등록돼도 서명·만료·발급자·대상·claims가 잘못된 JWT를 거절한다', async () => {
    const jwt = app.get(JwtService);
    const [account] = await db
      .select()
      .from(adminAccounts)
      .where(eq(adminAccounts.email, 'admin@example.com'));
    const payload = {
      sub: account.id,
      jti: randomBytes(32).toString('base64url'),
    };
    const invalidTokens = [
      jwt.sign(payload, { secret: 'another-test-secret-0123456789abcdef' }),
      jwt.sign(payload, { expiresIn: -1 }),
      jwt.sign(payload, { issuer: 'another-issuer' }),
      jwt.sign(payload, { audience: 'another-audience' }),
      jwt.sign(payload, { algorithm: 'HS384' }),
      jwt.sign({ ...payload, sub: 'not-a-uuid' }),
      jwt.sign({ sub: account.id }),
      new JwtService({ secret: process.env.JWT_SECRET }).sign(payload, {
        algorithm: 'HS256',
        issuer: 'portfolio-api',
        audience: 'portfolio-admin',
      }),
      randomBytes(32).toString('base64url'),
    ];
    for (const invalid of invalidTokens) {
      const hash = createHash('sha256').update(invalid).digest('hex');
      await db.insert(adminSessions).values({
        tokenHash: hash,
        adminId: account.id,
        expiresAt: new Date(Date.now() + 3600000),
      });
      try {
        expect(
          (
            await request('/api/v1/admin/auth/me', 'GET', undefined, {
              token: invalid,
            })
          ).status,
        ).toBe(401);
      } finally {
        await db.delete(adminSessions).where(eq(adminSessions.tokenHash, hash));
      }
    }
    const [foreign] = await db
      .insert(adminAccounts)
      .values({
        email: 'foreign@example.com',
        passwordHash: account.passwordHash,
        isActive: true,
      })
      .returning();
    const validHash = createHash('sha256').update(token).digest('hex');
    await db
      .update(adminSessions)
      .set({ adminId: foreign.id })
      .where(eq(adminSessions.tokenHash, validHash));
    expect((await request('/api/v1/admin/auth/me')).status).toBe(401);
    await db
      .update(adminSessions)
      .set({ adminId: account.id })
      .where(eq(adminSessions.tokenHash, validHash));
    await db.delete(adminAccounts).where(eq(adminAccounts.id, foreign.id));
    await db
      .update(adminAccounts)
      .set({ isActive: false })
      .where(eq(adminAccounts.id, account.id));
    expect((await request('/api/v1/admin/auth/me')).status).toBe(401);
    await db
      .update(adminAccounts)
      .set({ isActive: true })
      .where(eq(adminAccounts.id, account.id));
  });

  it('프로젝트 공개·버전 충돌·입력 거절·삭제 동작을 검증한다', async () => {
    const created = await request<ProjectDto>(
      '/api/v1/admin/projects',
      'POST',
      {
        slug: 'integration-project',
        title: '비공개',
        category: 'side',
        template: 'none',
        content: {},
      },
    );
    expect(created.status).toBe(201);
    const project = created.body.data;
    expect(ProjectSchema.safeParse(project).success).toBe(true);
    const duplicate = await request('/api/v1/admin/projects', 'POST', {
      slug: 'integration-project',
      title: '중복 프로젝트',
      category: 'side',
      template: 'none',
      content: {},
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toEqual({
      success: false,
      error: {
        code: 'CONFLICT',
        message: '이미 사용 중인 프로젝트 슬러그입니다.',
      },
    });
    expect((await request('/api/v1/projects/integration-project')).status).toBe(
      404,
    );
    const updated = await request<ProjectDto>(
      `/api/v1/admin/projects/${project.id}`,
      'PATCH',
      { version: 1, title: '공개 프로젝트', isPublished: true },
      { origin: '' },
    );
    expect(updated.status).toBe(200);
    expect(updated.body.data.version).toBe(2);
    expect(updated.body.data.category).toBe('side');
    expect((await request('/api/v1/projects/integration-project')).status).toBe(
      200,
    );
    expect(
      (
        await request(`/api/v1/admin/projects/${project.id}`, 'PATCH', {
          version: 1,
          title: '오래된 수정',
        })
      ).status,
    ).toBe(409);
    const invalid = await request(
      `/api/v1/admin/projects/${project.id}`,
      'PATCH',
      { version: 2, slug: 'changed' },
    );
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.details).toBeDefined();
    expect(
      (
        await request(`/api/v1/admin/projects/${project.id}`, 'PATCH', {
          version: 2,
          repository: 'javascript:alert(1)',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(`/api/v1/admin/projects/${project.id}`, 'PATCH', {
          version: 2,
          template: 'changelog',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          `/api/v1/admin/projects/${project.id}?version=1`,
          'DELETE',
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          `/api/v1/admin/projects/${project.id}?version=2`,
          'DELETE',
        )
      ).status,
    ).toBe(200);
    expect((await request(`/api/v1/admin/projects/${project.id}`)).status).toBe(
      404,
    );
  });

  it('활동 이력·기술 그룹 CRUD와 JSON 배열의 전체 교체를 검증한다', async () => {
    const experience = await request<ExperienceDto>(
      '/api/v1/admin/experiences',
      'POST',
      {
        title: '경험',
        organization: '기관',
        period: '2026',
        iconKey: 'Code',
        responsibilities: ['하나'],
        skills: [],
      },
    );
    expect(experience.status).toBe(201);
    const group = await request<TechGroupDto>(
      '/api/v1/admin/tech-groups',
      'POST',
      { title: '그룹', items: [{ name: 'Node.js', iconName: 'nodejs' }] },
    );
    expect(group.status).toBe(201);
    const a = await request<ExperienceDto>(
      `/api/v1/admin/experiences/${experience.body.data.id}`,
      'PATCH',
      { version: 1, responsibilities: [], isPublished: true },
    );
    const b = await request<TechGroupDto>(
      `/api/v1/admin/tech-groups/${group.body.data.id}`,
      'PATCH',
      { version: 1, items: [], isPublished: true },
    );
    expect(ExperienceSchema.safeParse(a.body.data).success).toBe(true);
    expect(TechGroupSchema.safeParse(b.body.data).success).toBe(true);
    expect(a.body.data.responsibilities).toEqual([]);
    expect(b.body.data.items).toEqual([]);
    expect(
      (await request<HomeResponse>('/api/v1/home')).body.data.experiences.some(
        (item) => item.id === a.body.data.id,
      ),
    ).toBe(true);
    expect(
      (
        await request(
          `/api/v1/admin/experiences/${a.body.data.id}?version=2`,
          'DELETE',
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/api/v1/admin/tech-groups/${b.body.data.id}?version=2`,
          'DELETE',
        )
      ).status,
    ).toBe(200);
  });

  it('전체 순서 변경의 원자성과 사이트 수정 충돌을 검증한다', async () => {
    const list = await request<ProjectDto[]>('/api/v1/admin/projects');
    const items = list.body.data
      .map(({ id, version }) => ({ id, version }))
      .reverse();
    expect(
      (
        await request('/api/v1/admin/projects/order', 'PATCH', {
          items: items.slice(1),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request('/api/v1/admin/projects/order', 'PATCH', {
          items: items.map((item, index) =>
            index === items.length - 1 ? { ...item, version: 99 } : item,
          ),
        })
      ).status,
    ).toBe(409);
    expect(
      (await request<ProjectDto[]>('/api/v1/admin/projects')).body.data.map(
        ({ id, version }) => ({ id, version }),
      ),
    ).toEqual(list.body.data.map(({ id, version }) => ({ id, version })));
    const reordered = await request<ProjectDto[]>(
      '/api/v1/admin/projects/order',
      'PATCH',
      { items },
    );
    expect(reordered.status).toBe(200);
    expect(reordered.body.data.map((item) => item.id)).toEqual(
      items.map((item) => item.id),
    );
    const site = await request<SiteDto>('/api/v1/admin/site');
    const saved = await request<SiteDto>('/api/v1/admin/site', 'PATCH', {
      version: site.body.data.version,
      data: {
        ...site.body.data.data,
        hero: { ...site.body.data.data.hero, title: '수정된 제목' },
      },
    });
    expect(saved.status).toBe(200);
    expect(
      (await request<SiteDto>('/api/v1/site')).body.data.data.hero.title,
    ).toBe('수정된 제목');
    expect(
      (
        await request('/api/v1/admin/site', 'PATCH', {
          version: site.body.data.version,
          data: site.body.data.data,
        })
      ).status,
    ).toBe(409);
  });

  it('Swagger가 실제 성공/오류·Bearer 인증·중첩 입력 스키마를 문서화한다', async () => {
    const response = await fetch(`${base}/docs-json`);
    const doc = (await response.json()) as ReturnType<typeof configureApp>;
    const schemas = doc.components!.schemas!;
    const checkRefs = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      for (const [key, nested] of Object.entries(value)) {
        if (
          key === '$ref' &&
          typeof nested === 'string' &&
          nested.startsWith('#/components/schemas/')
        )
          expect(schemas[nested.split('/').at(-1)!]).toBeDefined();
        else checkRefs(nested);
      }
    };
    checkRefs(doc);
    expect(doc.components!.securitySchemes!.adminBearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
    expect(doc.components!.securitySchemes!.adminSession).toBeUndefined();
    expect(doc.paths['/api/v1/admin/projects'].post!.security).toEqual([
      { adminBearer: [] },
    ]);
    expect(
      doc.paths['/api/v1/admin/projects'].post!.responses['201'],
    ).toBeDefined();
    expect(
      doc.paths['/api/v1/admin/projects/{id}'].delete!.responses['200'],
    ).toBeDefined();
    expect(
      doc.paths['/api/v1/admin/projects/{id}'].patch!.responses['409'],
    ).toBeDefined();
    for (const methods of Object.values(doc.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        if (!['get', 'post', 'patch', 'delete'].includes(method)) continue;
        const spec = operation as OperationObject;
        expect(spec.summary).toBeTruthy();
        expect(
          spec.parameters?.some(
            (parameter) => 'name' in parameter && parameter.name === 'Origin',
          ),
        ).not.toBe(true);
        if (spec.responses['200'] || spec.responses['201']) {
          const success = (spec.responses['200'] ??
            spec.responses['201']) as ResponseObject;
          expect(
            (success.content!['application/json'].schema as SchemaObject)
              .required,
          ).toEqual(['success', 'data']);
        }
      }
    }
    expect((await fetch(`${base}/docs`)).status).toBe(200);
  });

  it('잘못된 JSON·본문 제한·만료 세션·로그아웃과 비밀번호 변경을 검증한다', async () => {
    expect(
      (
        await request('/api/v1/admin/projects', 'POST', '{bad-json', {
          raw: true,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request('/api/v1/admin/projects', 'POST', {
          description: 'a'.repeat(1048576),
        })
      ).status,
    ).toBe(413);
    const [account] = await db
      .select()
      .from(adminAccounts)
      .where(eq(adminAccounts.email, 'admin@example.com'));
    const [expires] = await db
      .select()
      .from(adminSessions)
      .where(eq(adminSessions.adminId, account.id));
    await db
      .update(adminSessions)
      .set({ expiresAt: new Date(0) })
      .where(eq(adminSessions.tokenHash, expires.tokenHash));
    expect((await request('/api/v1/admin/auth/me')).status).toBe(401);
    const login = await request<LoginResponse>(
      '/api/v1/admin/auth/login',
      'POST',
      {
        email: 'admin@example.com',
        password,
      },
    );
    token = login.body.data.accessToken;
    const changed = await request('/api/v1/admin/auth/password', 'PATCH', {
      currentPassword: password,
      newPassword: 'replacement-test-password',
    });
    expect(changed.status).toBe(200);
    expect((await request('/api/v1/admin/auth/me')).status).toBe(401);
    expect(
      (await db.select({ count: count() }).from(adminSessions))[0].count,
    ).toBe(0);
    const relogin = await request<LoginResponse>(
      '/api/v1/admin/auth/login',
      'POST',
      {
        email: 'admin@example.com',
        password: 'replacement-test-password',
      },
    );
    token = relogin.body.data.accessToken;
    expect((await request('/api/v1/admin/auth/logout', 'POST')).status).toBe(
      200,
    );
    expect((await request('/api/v1/admin/auth/me')).status).toBe(401);
    expect(
      (
        await request('/api/v1/admin/auth/login', 'POST', {
          email: 'admin@example.com',
          password: 'replacement-test-password',
        })
      ).status,
    ).toBe(429);
  });

  it('비밀번호가 검증 도중 변경되면 구 비밀번호 로그인은 세션을 만들지 않는다', async () => {
    const [account] = await db
      .select()
      .from(adminAccounts)
      .where(eq(adminAccounts.email, 'admin@example.com'));
    const replacement = await hashPassword('concurrent-reset-password');
    const verify = passwords.verifyPassword;
    const spy = jest
      .spyOn(passwords, 'verifyPassword')
      .mockImplementation(async (value, hash) => {
        await db
          .update(adminAccounts)
          .set({ passwordHash: replacement })
          .where(eq(adminAccounts.id, account.id));
        return verify(value, hash);
      });
    try {
      await expect(
        app.get(AuthService).login(account.email, 'replacement-test-password'),
      ).rejects.toThrow('로그인 정보가 변경');
      expect(
        (await db.select({ count: count() }).from(adminSessions))[0].count,
      ).toBe(0);
    } finally {
      spy.mockRestore();
      await db
        .update(adminAccounts)
        .set({ passwordHash: account.passwordHash })
        .where(eq(adminAccounts.id, account.id));
    }
  });
});
