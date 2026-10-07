import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiErrors, ApiResult } from '../common/api';
import {
  HomeDto,
  ProjectCardDto,
  ProjectDto,
  ProjectQueryDto,
  SiteDto,
} from './content.dto';
import { ContentService } from './content.service';

@ApiTags('공개 콘텐츠')
@Controller('api/v1')
export class PublicContentController {
  constructor(private readonly content: ContentService) {}

  @Get('site')
  @ApiOperation({
    summary: '사이트 공통 콘텐츠 조회',
    description: '프로필, 히어로, 소개, 연락처, SEO와 섹션 문구를 조회합니다.',
  })
  @ApiResult(SiteDto)
  @ApiErrors(404, 500)
  site() {
    return this.content.site();
  }

  @Get('home')
  @ApiOperation({
    summary: '홈 콘텐츠 조회',
    description:
      '사이트 공통 정보, 공개된 경험과 기술 그룹, 공개되었으며 showOnHome이 true인 프로젝트 카드를 표시 순서로 조회합니다. 프로젝트 상세 content는 제외합니다.',
  })
  @ApiResult(HomeDto)
  @ApiErrors(404, 500)
  home() {
    return this.content.home();
  }

  @Get('projects')
  @ApiOperation({
    summary: '공개 프로젝트 목록 조회',
    description:
      '공개된 프로젝트를 표시 순서로 조회합니다. 상세 content는 제외하며 category를 생략하면 모든 분류를 반환합니다.',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: ['major', 'side', 'etc'],
    description: '프로젝트 분류',
  })
  @ApiResult(ProjectCardDto, { array: true })
  @ApiErrors(400, 500)
  projects(@Query() query: ProjectQueryDto) {
    return this.content.projects(query.category);
  }

  @Get('projects/:slug')
  @ApiOperation({
    summary: '공개 프로젝트 상세 조회',
    description:
      '슬러그로 공개 프로젝트와 템플릿별 상세 콘텐츠를 조회합니다. 비공개 또는 존재하지 않는 프로젝트는 404입니다.',
  })
  @ApiParam({
    name: 'slug',
    description: '프로젝트 고유 슬러그',
    example: 'docthrough',
  })
  @ApiResult(ProjectDto)
  @ApiErrors(404, 500)
  project(@Param('slug') slug: string) {
    return this.content.publicProject(slug);
  }
}
