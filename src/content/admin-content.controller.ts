import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AdminGuard } from '../auth/admin.guard';
import { ApiErrors, ApiResult } from '../common/api';
import { experiences, projects, techGroups } from '../database/schema';
import {
  CreateExperienceDto,
  CreateProjectDto,
  CreateTechGroupDto,
  DeleteQueryDto,
  DeleteResultDto,
  ExperienceDto,
  PatchExperienceDto,
  PatchProjectDto,
  PatchSiteDto,
  PatchTechGroupDto,
  ProjectDto,
  ReorderDto,
  SiteDto,
  TechGroupDto,
} from './content.dto';
import { ContentService } from './content.service';

@ApiTags('관리자 콘텐츠')
@ApiBearerAuth('adminBearer')
@UseGuards(AdminGuard)
@Controller('api/v1/admin')
export class AdminContentController {
  constructor(private readonly content: ContentService) {}

  @Get('site')
  @ApiOperation({
    summary: '관리자 사이트 콘텐츠 조회',
    description: '수정에 필요한 현재 버전과 전체 사이트 콘텐츠를 조회합니다.',
  })
  @ApiResult(SiteDto)
  @ApiErrors(401, 404, 500)
  site() {
    return this.content.site();
  }

  @Patch('site')
  @ApiOperation({
    summary: '사이트 콘텐츠 교체',
    description:
      'data 전체를 교체하고 버전을 1 증가시킵니다. 현재 버전이 다르면 409를 반환합니다.',
  })
  @ApiResult(SiteDto)
  @ApiErrors(400, 401, 404, 409, 500)
  patchSite(@Body() body: PatchSiteDto) {
    return this.content.patchSite(body);
  }

  @Get('experiences')
  @ApiOperation({
    summary: '관리자 경험 목록 조회',
    description: '공개 여부와 무관하게 전체 목록을 표시 순서로 조회합니다.',
  })
  @ApiResult(ExperienceDto, { array: true })
  @ApiErrors(401, 500)
  listExperiences() {
    return this.content.list(experiences);
  }

  @Post('experiences')
  @ApiOperation({
    summary: '경험 생성',
    description:
      '새 경험 콘텐츠를 생성합니다. 기본값은 비공개이며 중첩 배열의 순서를 보존합니다.',
  })
  @ApiResult(ExperienceDto, { status: 201 })
  @ApiErrors(400, 401, 409, 500)
  createExperience(@Body() body: CreateExperienceDto) {
    return this.content.create(experiences, body);
  }

  @Patch('experiences/order')
  @ApiOperation({
    summary: '경험 표시 순서 변경',
    description:
      '비공개 항목을 포함한 현재 전체 목록의 ID와 버전을 원하는 순서로 전달합니다. 모든 항목의 sortOrder와 버전을 한 트랜잭션에서 변경합니다. ID 중복·누락은 400, 버전 충돌은 409입니다.',
  })
  @ApiResult(ExperienceDto, { array: true })
  @ApiErrors(400, 401, 409, 500)
  reorderExperiences(@Body() body: ReorderDto) {
    return this.content.reorder(experiences, body);
  }

  @Get('experiences/:id')
  @ApiOperation({
    summary: '관리자 경험 상세 조회',
    description: '공개 여부와 무관하게 현재 버전과 전체 콘텐츠를 조회합니다.',
  })
  @ApiParam({ name: 'id', description: '경험 UUID', format: 'uuid' })
  @ApiResult(ExperienceDto)
  @ApiErrors(400, 401, 404, 500)
  getExperience(@Param('id', ParseUUIDPipe) id: string) {
    return this.content.detail(experiences, id);
  }

  @Patch('experiences/:id')
  @ApiOperation({
    summary: '경험 수정',
    description:
      '전달한 필드만 수정합니다. 배열과 중첩 객체는 필드 전체를 교체하며 생략한 필드는 유지합니다. version은 필수이며 성공 시 1 증가합니다. 알 수 없는 필드는 거절합니다.',
  })
  @ApiParam({ name: 'id', description: '경험 UUID', format: 'uuid' })
  @ApiResult(ExperienceDto)
  @ApiErrors(400, 401, 404, 409, 500)
  patchExperience(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PatchExperienceDto,
  ) {
    return this.content.patch(experiences, id, body);
  }

  @Delete('experiences/:id')
  @ApiOperation({
    summary: '경험 삭제',
    description:
      '현재 버전과 일치하는 콘텐츠를 데이터베이스에서 영구 삭제합니다. 성공 시 삭제한 ID를 반환합니다.',
  })
  @ApiParam({ name: 'id', description: '경험 UUID', format: 'uuid' })
  @ApiQuery({
    name: 'version',
    required: true,
    type: String,
    description: '현재 버전(양의 정수)',
    example: '1',
  })
  @ApiResult(DeleteResultDto)
  @ApiErrors(400, 401, 404, 409, 500)
  deleteExperience(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: DeleteQueryDto,
  ) {
    return this.content.remove(experiences, id, query.version);
  }

  @Get('tech-groups')
  @ApiOperation({
    summary: '관리자 기술 그룹 목록 조회',
    description: '공개 여부와 무관하게 전체 목록을 표시 순서로 조회합니다.',
  })
  @ApiResult(TechGroupDto, { array: true })
  @ApiErrors(401, 500)
  listTechGroups() {
    return this.content.list(techGroups);
  }

  @Post('tech-groups')
  @ApiOperation({
    summary: '기술 그룹 생성',
    description:
      '새 기술 그룹 콘텐츠를 생성합니다. 기본값은 비공개이며 중첩 배열의 순서를 보존합니다.',
  })
  @ApiResult(TechGroupDto, { status: 201 })
  @ApiErrors(400, 401, 409, 500)
  createTechGroup(@Body() body: CreateTechGroupDto) {
    return this.content.create(techGroups, body);
  }

  @Patch('tech-groups/order')
  @ApiOperation({
    summary: '기술 그룹 표시 순서 변경',
    description:
      '비공개 항목을 포함한 현재 전체 목록의 ID와 버전을 원하는 순서로 전달합니다. 모든 항목의 sortOrder와 버전을 한 트랜잭션에서 변경합니다. ID 중복·누락은 400, 버전 충돌은 409입니다.',
  })
  @ApiResult(TechGroupDto, { array: true })
  @ApiErrors(400, 401, 409, 500)
  reorderTechGroups(@Body() body: ReorderDto) {
    return this.content.reorder(techGroups, body);
  }

  @Get('tech-groups/:id')
  @ApiOperation({
    summary: '관리자 기술 그룹 상세 조회',
    description: '공개 여부와 무관하게 현재 버전과 전체 콘텐츠를 조회합니다.',
  })
  @ApiParam({ name: 'id', description: '기술 그룹 UUID', format: 'uuid' })
  @ApiResult(TechGroupDto)
  @ApiErrors(400, 401, 404, 500)
  getTechGroup(@Param('id', ParseUUIDPipe) id: string) {
    return this.content.detail(techGroups, id);
  }

  @Patch('tech-groups/:id')
  @ApiOperation({
    summary: '기술 그룹 수정',
    description:
      '전달한 필드만 수정합니다. 배열과 중첩 객체는 필드 전체를 교체하며 생략한 필드는 유지합니다. version은 필수이며 성공 시 1 증가합니다. 알 수 없는 필드는 거절합니다.',
  })
  @ApiParam({ name: 'id', description: '기술 그룹 UUID', format: 'uuid' })
  @ApiResult(TechGroupDto)
  @ApiErrors(400, 401, 404, 409, 500)
  patchTechGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PatchTechGroupDto,
  ) {
    return this.content.patch(techGroups, id, body);
  }

  @Delete('tech-groups/:id')
  @ApiOperation({
    summary: '기술 그룹 삭제',
    description:
      '현재 버전과 일치하는 콘텐츠를 데이터베이스에서 영구 삭제합니다. 성공 시 삭제한 ID를 반환합니다.',
  })
  @ApiParam({ name: 'id', description: '기술 그룹 UUID', format: 'uuid' })
  @ApiQuery({
    name: 'version',
    required: true,
    type: String,
    description: '현재 버전(양의 정수)',
    example: '1',
  })
  @ApiResult(DeleteResultDto)
  @ApiErrors(400, 401, 404, 409, 500)
  deleteTechGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: DeleteQueryDto,
  ) {
    return this.content.remove(techGroups, id, query.version);
  }

  @Get('projects')
  @ApiOperation({
    summary: '관리자 프로젝트 목록 조회',
    description: '공개 여부와 무관하게 전체 목록을 표시 순서로 조회합니다.',
  })
  @ApiResult(ProjectDto, { array: true })
  @ApiErrors(401, 500)
  listProjects() {
    return this.content.list(projects);
  }

  @Post('projects')
  @ApiOperation({
    summary: '프로젝트 생성',
    description:
      '새 프로젝트 콘텐츠를 생성합니다. 기본값은 비공개이며 중첩 배열의 순서를 보존합니다.',
  })
  @ApiResult(ProjectDto, { status: 201 })
  @ApiErrors(400, 401, 409, 500)
  createProject(@Body() body: CreateProjectDto) {
    return this.content.create(projects, body);
  }

  @Patch('projects/order')
  @ApiOperation({
    summary: '프로젝트 표시 순서 변경',
    description:
      '비공개 항목을 포함한 현재 전체 목록의 ID와 버전을 원하는 순서로 전달합니다. 모든 항목의 sortOrder와 버전을 한 트랜잭션에서 변경합니다. ID 중복·누락은 400, 버전 충돌은 409입니다.',
  })
  @ApiResult(ProjectDto, { array: true })
  @ApiErrors(400, 401, 409, 500)
  reorderProjects(@Body() body: ReorderDto) {
    return this.content.reorder(projects, body);
  }

  @Get('projects/:id')
  @ApiOperation({
    summary: '관리자 프로젝트 상세 조회',
    description: '공개 여부와 무관하게 현재 버전과 전체 콘텐츠를 조회합니다.',
  })
  @ApiParam({ name: 'id', description: '프로젝트 UUID', format: 'uuid' })
  @ApiResult(ProjectDto)
  @ApiErrors(400, 401, 404, 500)
  getProject(@Param('id', ParseUUIDPipe) id: string) {
    return this.content.detail(projects, id);
  }

  @Patch('projects/:id')
  @ApiOperation({
    summary: '프로젝트 수정',
    description:
      '전달한 필드만 수정합니다. 배열과 중첩 객체는 필드 전체를 교체하며 생략한 필드는 유지합니다. version은 필수이며 성공 시 1 증가합니다. 알 수 없는 필드는 거절합니다. 프로젝트 슬러그는 생성 후 변경할 수 없습니다.',
  })
  @ApiParam({ name: 'id', description: '프로젝트 UUID', format: 'uuid' })
  @ApiResult(ProjectDto)
  @ApiErrors(400, 401, 404, 409, 500)
  patchProject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PatchProjectDto,
  ) {
    return this.content.patch(projects, id, body);
  }

  @Delete('projects/:id')
  @ApiOperation({
    summary: '프로젝트 삭제',
    description:
      '현재 버전과 일치하는 콘텐츠를 데이터베이스에서 영구 삭제합니다. 성공 시 삭제한 ID를 반환합니다.',
  })
  @ApiParam({ name: 'id', description: '프로젝트 UUID', format: 'uuid' })
  @ApiQuery({
    name: 'version',
    required: true,
    type: String,
    description: '현재 버전(양의 정수)',
    example: '1',
  })
  @ApiResult(DeleteResultDto)
  @ApiErrors(400, 401, 404, 409, 500)
  deleteProject(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: DeleteQueryDto,
  ) {
    return this.content.remove(projects, id, query.version);
  }
}
