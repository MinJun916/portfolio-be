import {
  CaseStudySchema,
  ChangelogSchema,
  CreateProjectDto,
  DeleteQueryDto,
  PatchExperienceDto,
  PatchProjectDto,
} from './content.dto';

describe('콘텐츠 입력 계약', () => {
  const project = {
    slug: 'test',
    title: '테스트',
    category: 'side',
    template: 'none',
    content: {},
  };

  it('생성 기본값은 비공개이며 PATCH 생략 필드는 기본값으로 덮어쓰지 않는다', () => {
    expect(CreateProjectDto.schema.parse(project).isPublished).toBe(false);
    expect(PatchProjectDto.schema.parse({ version: 2, title: '수정' })).toEqual(
      { version: 2, title: '수정' },
    );
    expect(
      PatchProjectDto.schema.safeParse({ version: 2, slug: 'changed' }).success,
    ).toBe(false);
    expect(PatchExperienceDto.schema.parse({ version: 2 })).toEqual({
      version: 2,
    });
  });

  it('알 수 없는 필드와 위험한 URL을 거절한다', () => {
    expect(
      CreateProjectDto.schema.safeParse({ ...project, unknown: true }).success,
    ).toBe(false);
    for (const imageSrc of [
      '//evil.example/x',
      'javascript:alert(1)',
      '/\\evil.example/x',
      '/a/../b',
    ]) {
      expect(
        CreateProjectDto.schema.safeParse({ ...project, imageSrc }).success,
      ).toBe(false);
    }
    expect(
      CreateProjectDto.schema.safeParse({
        ...project,
        repository: 'ftp://example.com',
      }).success,
    ).toBe(false);
    expect(
      CreateProjectDto.schema.safeParse({
        ...project,
        imageSrc: '/images/test.webp',
      }).success,
    ).toBe(true);
    expect(
      CreateProjectDto.schema.safeParse({
        ...project,
        links: [
          { type: 'demo', href: 'https://example.com' },
          { type: 'demo', href: 'https://example.org' },
        ],
      }).success,
    ).toBe(false);
  });

  it('삭제 버전은 양의 정수이며 알 수 없는 쿼리를 거절한다', () => {
    expect(DeleteQueryDto.schema.parse({ version: '2' })).toEqual({
      version: 2,
    });
    for (const version of ['0', '-1', '1.1', '1e3', ''])
      expect(DeleteQueryDto.schema.safeParse({ version }).success).toBe(false);
    expect(
      DeleteQueryDto.schema.safeParse({ version: '2', force: 'true' }).success,
    ).toBe(false);
  });

  it('변경 이력의 빈 결과와 문단 강조를 보존하고 케이스 스터디 구조를 검사한다', () => {
    const content = {
      entries: [{ reason: '**이유**', action: '실행', result: '' }],
    };
    expect(ChangelogSchema.parse(content)).toEqual(content);
    expect(CaseStudySchema.safeParse(content).success).toBe(false);
  });
});
