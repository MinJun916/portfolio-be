import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const text = (description: string, max = 500) =>
  z.string().min(1).max(max).describe(description);
const paragraph = z
  .string()
  .max(10000)
  .describe('본문 문단. **강조** 표기를 그대로 보존합니다.');
const paragraphs = z.array(paragraph).max(100);
const labels = z.array(text('항목', 200)).max(100);
const icon = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{1,80}$/)
  .describe('프론트엔드 아이콘 키');
const url = z
  .url()
  .max(2048)
  .refine((v) => /^https?:\/\//i.test(v), 'http/https URL만 허용합니다.')
  .describe('외부 http/https URL');
const image = z
  .string()
  .max(2048)
  .refine((v) => {
    if (v.startsWith('/'))
      return (
        !v.startsWith('//') &&
        !/[\\\s?#]/.test(v) &&
        !v.split('/').includes('..')
      );
    return url.safeParse(v).success;
  }, 'http/https URL 또는 안전한 사이트 상대 경로만 허용합니다.')
  .describe('이미지 URL 또는 /로 시작하는 경로');
const version = z
  .number()
  .int()
  .positive()
  .describe('조회한 현재 버전. 일치하지 않으면 409를 반환합니다.');
const id = z.uuid().describe('리소스 UUID');
const flags = {
  isPublished: z
    .boolean()
    .default(false)
    .describe('공개 여부. 기본값은 비공개입니다.'),
  sortOrder: z
    .number()
    .int()
    .min(0)
    .max(100000)
    .default(0)
    .describe('목록 표시 순서'),
};
const timestamps = {
  id,
  version,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
};

export const SiteDataSchema = z.strictObject({
  profile: z.strictObject({
    displayName: text('표시 이름'),
    brandName: text('브랜드 이름'),
    email: z.email().max(254).describe('연락 이메일'),
    githubUrl: url,
    copyright: text('저작권 문구'),
  }),
  hero: z.strictObject({
    eyebrow: text('히어로 상단 문구'),
    title: text('히어로 제목'),
    description: paragraph,
    ctaLabel: text('행동 버튼 문구'),
  }),
  about: z.strictObject({ title: text('소개 제목'), paragraphs }),
  contact: z.strictObject({
    title: text('연락 제목'),
    description: paragraph,
    message: paragraph,
  }),
  seo: z.strictObject({
    title: text('사이트 SEO 제목'),
    description: text('사이트 SEO 설명', 1000),
  }),
  sections: z.strictObject({
    experience: text('경험 섹션 제목'),
    techStack: text('기술 섹션 제목'),
    projects: text('프로젝트 섹션 제목'),
    sideProjects: text('사이드 프로젝트 섹션 제목'),
    projectsPageTitle: text('프로젝트 목록 제목'),
    projectsPageDescription: paragraph,
    majorProjectsDescription: paragraph,
    sideProjectsDescription: paragraph,
    etcProjects: text('기타 프로젝트 섹션 제목'),
    etcProjectsDescription: paragraph,
  }),
});
export const SiteSchema = z.strictObject({
  id: z.literal(1),
  data: SiteDataSchema,
  version,
  updatedAt: z.iso.datetime(),
});
export class SiteDto extends createZodDto(SiteSchema) {}
export class PatchSiteDto extends createZodDto(
  z.strictObject({
    version,
    data: SiteDataSchema.describe('전체 사이트 콘텐츠를 교체합니다.'),
  }),
) {}

export const ExperienceInputSchema = z.strictObject({
  title: text('경험 제목'),
  organization: text('기관 또는 회사'),
  period: text('활동 기간'),
  iconKey: icon,
  responsibilities: paragraphs,
  skills: labels,
  ...flags,
});
export const ExperienceSchema = ExperienceInputSchema.extend(timestamps);
export class ExperienceDto extends createZodDto(ExperienceSchema) {}
export class CreateExperienceDto extends createZodDto(ExperienceInputSchema) {}
export class PatchExperienceDto extends createZodDto(
  ExperienceInputSchema.extend({
    isPublished: flags.isPublished.removeDefault(),
    sortOrder: flags.sortOrder.removeDefault(),
  })
    .partial()
    .extend({ version }),
) {}
export const TechGroupInputSchema = z.strictObject({
  title: text('기술 그룹 제목'),
  items: z
    .array(
      z.strictObject({ name: text('기술 이름'), iconName: icon.optional() }),
    )
    .max(100),
  ...flags,
});
export const TechGroupSchema = TechGroupInputSchema.extend(timestamps);
export class TechGroupDto extends createZodDto(TechGroupSchema) {}
export class CreateTechGroupDto extends createZodDto(TechGroupInputSchema) {}
export class PatchTechGroupDto extends createZodDto(
  TechGroupInputSchema.extend({
    isPublished: flags.isPublished.removeDefault(),
    sortOrder: flags.sortOrder.removeDefault(),
  })
    .partial()
    .extend({ version }),
) {}

const section = z.strictObject({
  title: text('섹션 제목'),
  paragraphs: paragraphs.optional(),
  list: paragraphs.optional(),
  paragraphsAfterList: paragraphs.optional(),
  steps: z
    .array(z.strictObject({ title: text('단계 제목'), list: paragraphs }))
    .max(50)
    .optional(),
});
export const CaseStudySchema = z.strictObject({
  overview: z.strictObject({ title: text('개요 제목'), detail: paragraphs }),
  contribution: z.strictObject({
    title: text('기여 제목'),
    items: z
      .array(z.strictObject({ title: text('기여 항목 제목'), paragraphs }))
      .max(50),
  }),
  troubleShooting: z.strictObject({
    title: text('트러블 슈팅 제목'),
    cases: z
      .array(
        z.strictObject({
          caseTitle: text('사례 제목'),
          layout: z
            .enum(['grid', 'zigzag'])
            .optional()
            .describe('사례 배치 방식'),
          sections: z.array(section).max(50),
        }),
      )
      .max(50),
  }),
  review: z.strictObject({ title: text('회고 제목'), detail: paragraphs }),
  techStack: z.strictObject({
    title: text('기술 스택 제목'),
    groups: z
      .array(
        z.strictObject({
          groupTitle: text('기술 그룹 제목'),
          items: z
            .array(
              z.strictObject({
                name: text('기술 이름'),
                description: paragraph,
                icon: icon.optional(),
                iconVariant: z
                  .enum(['light', 'dark', 'grayscale'])
                  .optional()
                  .describe('기술 아이콘 색상 변형'),
              }),
            )
            .max(100),
        }),
      )
      .max(50),
  }),
  peerReview: z
    .strictObject({ strengths: paragraphs, improvements: paragraphs })
    .optional(),
});
export const ChangelogSchema = z.strictObject({
  entries: z
    .array(
      z.strictObject({
        date: text('날짜 표기').optional(),
        title: text('변경 제목').optional(),
        reason: paragraph,
        action: paragraph,
        result: paragraph,
      }),
    )
    .max(200),
});
export const EmptyContentSchema = z.strictObject({});
export const ProjectInputSchema = z.strictObject({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(120)
    .describe('공개 상세 주소의 고유 슬러그'),
  title: text('프로젝트 제목'),
  category: z.enum(['major', 'side', 'etc']).describe('프로젝트 분류'),
  template: z
    .enum(['case-study', 'changelog', 'none'])
    .describe('상세 콘텐츠 템플릿. content는 템플릿과 일치해야 합니다.'),
  subtitle: text('부제').nullable().default(null),
  description: paragraph.nullable().default(null),
  imageSrc: image.nullable().default(null),
  logoSrc: image.nullable().default(null),
  role: text('담당 역할').nullable().default(null),
  period: text('진행 기간').nullable().default(null),
  repository: url.nullable().default(null),
  links: z
    .array(
      z.strictObject({ type: z.enum(['fe', 'be', 'demo', 'api']), href: url }),
    )
    .max(4)
    .refine(
      (links) => new Set(links.map((link) => link.type)).size === links.length,
      '링크 유형은 중복할 수 없습니다.',
    )
    .default([]),
  keywords: labels.default([]),
  techStack: labels.default([]),
  content: z
    .union([CaseStudySchema, ChangelogSchema, EmptyContentSchema])
    .describe('템플릿별 상세 콘텐츠. 중첩 객체와 배열은 통째로 교체합니다.'),
  seo: z
    .strictObject({
      title: text('SEO 제목').optional(),
      description: text('SEO 설명', 1000).optional(),
    })
    .default({}),
  showOnHome: z.boolean().default(false).describe('홈 프로젝트 목록 표시 여부'),
  ...flags,
});
export const ProjectSchema = ProjectInputSchema.extend(timestamps);
export const ProjectCardSchema = ProjectSchema.omit({ content: true });
export class ProjectDto extends createZodDto(ProjectSchema) {}
export class ProjectCardDto extends createZodDto(ProjectCardSchema) {}
export class CreateProjectDto extends createZodDto(ProjectInputSchema) {}
export class PatchProjectDto extends createZodDto(
  ProjectInputSchema.omit({ slug: true })
    .extend({
      subtitle: ProjectInputSchema.shape.subtitle.removeDefault(),
      description: ProjectInputSchema.shape.description.removeDefault(),
      imageSrc: ProjectInputSchema.shape.imageSrc.removeDefault(),
      logoSrc: ProjectInputSchema.shape.logoSrc.removeDefault(),
      role: ProjectInputSchema.shape.role.removeDefault(),
      period: ProjectInputSchema.shape.period.removeDefault(),
      repository: ProjectInputSchema.shape.repository.removeDefault(),
      links: ProjectInputSchema.shape.links.removeDefault(),
      keywords: ProjectInputSchema.shape.keywords.removeDefault(),
      techStack: ProjectInputSchema.shape.techStack.removeDefault(),
      seo: ProjectInputSchema.shape.seo.removeDefault(),
      showOnHome: ProjectInputSchema.shape.showOnHome.removeDefault(),
      isPublished: flags.isPublished.removeDefault(),
      sortOrder: flags.sortOrder.removeDefault(),
    })
    .partial()
    .extend({ version }),
) {}
export class ProjectQueryDto extends createZodDto(
  z.strictObject({
    category: z
      .enum(['major', 'side', 'etc'])
      .optional()
      .describe('선택한 분류만 조회합니다.'),
  }),
) {}
export class DeleteQueryDto extends createZodDto(
  z.strictObject({
    version: z
      .string()
      .regex(/^[1-9]\d*$/)
      .transform(Number)
      .pipe(version)
      .describe('조회한 현재 버전'),
  }),
) {}
export class DeleteResultDto extends createZodDto(z.strictObject({ id })) {}
export class ReorderDto extends createZodDto(
  z.strictObject({
    items: z
      .array(z.strictObject({ id, version }))
      .max(1000)
      .describe('현재 전체 목록의 UUID와 버전을 원하는 순서로 전달합니다.'),
  }),
) {}
export class HomeDto extends createZodDto(
  z.strictObject({
    site: SiteSchema,
    experiences: z.array(ExperienceSchema),
    techGroups: z.array(TechGroupSchema),
    projects: z.array(ProjectCardSchema),
  }),
) {}
