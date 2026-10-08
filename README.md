# Portfolio API

NestJS 11 + PostgreSQL 기반 포트폴리오 콘텐츠 API입니다. 프론트 저장소와 화면 연결은 포함하지 않습니다.
Swagger UI는 `/docs`, OpenAPI JSON은 `/docs-json`입니다. DTO 검증과 Swagger가 같은 Zod 스키마를 사용합니다.

## 로컬 실행

Node.js 24, PostgreSQL 18을 사용합니다. `.env.example`을 `.env`로 복사하고 DB 비밀번호를 임의 값으로 교체합니다.
`POSTGRES_PASSWORD`와 `DATABASE_URL`의 비밀번호를 맞추세요. 비밀번호에 특수 문자가 있으면 URL 부분을 인코딩합니다.
로컬 Node 실행에서는 `DATABASE_URL` 호스트를 `127.0.0.1`, Compose API에서는 `db`로 설정합니다.
`JWT_SECRET`은 `openssl rand -hex 32`로 생성한 값으로 교체하세요. 최소 32바이트이며 기본 키는 없습니다.

```bash
cp .env.example .env
chmod 600 .env
# .env의 DB 설정과 JWT_SECRET을 먼저 편집
npm ci
docker compose up -d --wait db
npm run build
npm run db:migrate
npm run db:seed
npm run start:dev
```

초기 데이터는 프로젝트 6개, 활동 이력 5개, 기술 그룹 6개와 사이트 공통 콘텐츠입니다.
시드는 명시적으로 실행하며 기존 ID/슬러그가 있으면 편집 내용을 덮어쓰지 않습니다. 삭제한 초기 항목은 재시드 시 복원될 수 있습니다.
이미지는 URL/기존 프론트 상대 경로만 저장합니다. 업로드·이미지 프록시는 제공하지 않습니다.

## 관리자 생성과 인증

공개 회원가입과 기본 관리자 비밀번호는 없습니다. 비밀번호는 6~128자입니다.

```bash
# 비밀번호를 숨겨 입력한 뒤 환경 변수로 전달
read -r -s ADMIN_PASSWORD
export ADMIN_PASSWORD ADMIN_EMAIL=admin@example.com
npm run admin:create
unset ADMIN_PASSWORD
# 기존 계정의 비밀번호를 의도적으로 초기화할 때는 같은 환경 변수와 --reset 사용
# npm run admin:create -- --reset
```

로그인 `POST /api/v1/admin/auth/login`에 `{ "email": "admin@example.com", "password": "입력한 비밀번호" }`를 전송하면 다음 응답을 받습니다.

```json
{
  "success": true,
  "data": {
    "accessToken": "JWT",
    "tokenType": "Bearer",
    "expiresIn": 28800,
    "admin": { "id": "UUID", "email": "admin@example.com" }
  }
}
```

관리자 API에는 `Authorization: Bearer <accessToken>`을 전달합니다. 쿠키와 필수 Origin 검사는 사용하지 않습니다.
JWT는 HS256 서명·발급자·대상·만료를 검증하고 8시간 후 만료됩니다. DB에는 토큰 해시만 저장해 로그아웃 시 현재 토큰, 비밀번호 변경/초기화 시 모든 토큰을 즉시 폐기합니다. 별도 refresh API는 없습니다.
IP당 로그인 시도는 1분에 5회로 제한합니다. 단일 API 프로세스의 메모리 제한이므로 인스턴스를 늘리면 공유 저장소로 변경해야 합니다.

`CORS_ORIGINS`에는 브라우저에서 API를 호출할 프론트 Origin을 쉼표로 구분해 정확히 지정합니다.
예: `https://www.example.com,https://admin.example.com`. CORS 설정은 관리자 인증과 별개이며 Origin이 없는 CLI 요청도 JWT로 인증합니다. API와 같은 Origin에서 여는 Swagger는 추가 등록이 필요 없습니다.
Swagger에서는 로그인 API를 실행한 뒤 응답의 `accessToken`을 **Authorize**에 입력하세요(`Bearer` 접두어 제외). 현재 프론트는 API를 호출하지 않습니다.

## DB 마이그레이션

Drizzle ORM과 Drizzle Kit의 버전별 SQL migration으로 스키마 변경을 관리합니다.
스키마는 `src/database/schema.ts`, SQL·snapshot·journal은 `src/database/migrations/`에 있습니다.
`drizzle.__drizzle_migrations`에 적용된 SQL hash와 생성 timestamp를 기록하고 미적용 migration만 실행합니다. API 시작 시 자동으로 스키마를 변경하지 않습니다.

```bash
# 스키마 수정 후 개발 환경에서 SQL 생성·검토·커밋
npm run db:generate -- --name=변경명
# 배포 이미지에는 Drizzle Kit 없이 런타임 migrator와 SQL만 사용
npm run build
npm run db:migrate
```

같은 명령을 다시 실행해도 적용된 migration은 반복하지 않습니다. 실패한 migration의 DDL과 이력 기록은 트랜잭션으로 롤백합니다.
배포 워크플로우도 DB 준비 → 새 이미지로 migration → API 교체 순서이며 migration이 실패하면 API 교체를 중단합니다.
이미 실행한 SQL·snapshot·journal은 수정하지 않고 새 migration을 추가합니다. 기본 migrator는 기록된 hash의 변경을 Flyway처럼 자동 검증하지 않으므로 적용 파일을 불변으로 유지해야 합니다. 운영에서는 `drizzle-kit push`를 사용하지 않습니다.

기존 `InitialSchema1780857600000` migration이 적용된 DB는 초기 Drizzle SQL이 기존 6개 테이블을 확인한 뒤 데이터·기존 migration 이력을 보존하고 Drizzle 이력을 기록합니다. 부분 적용 또는 알려지지 않은 기존 스키마는 실패하므로 백업 후 상태를 확인해야 합니다. 신규 DB는 같은 SQL로 전체 스키마를 생성합니다.
초기 데이터와 관리자 생성은 별도 명령이며 `DATABASE_URL`, `JWT_SECRET` 등 배포 env는 동일합니다.

## API 계약

모든 API 성공 응답은 `{ "success": true, "data": ... }`, 오류는 `{ "success": false, "error": { "code": "BAD_REQUEST", "message": "...", "details": [] } }`입니다.
`details`는 입력 검증 오류에만 포함합니다. `GET /health`도 `{ "success": true, "data": { "status": "ok" } }`를 반환하며 프로세스 확인용입니다.

| 공개 GET 경로                     | 내용                                                    |
| --------------------------------- | ------------------------------------------------------- |
| `/api/v1/site`                    | 프로필·소개·연락처·SEO·섹션 문구                        |
| `/api/v1/home`                    | 사이트, 공개 활동 이력/기술 그룹, 홈 노출 프로젝트 카드 |
| `/api/v1/projects?category=major` | 공개 프로젝트 목록. 분류 생략 가능, 상세 본문 제외      |
| `/api/v1/projects/:slug`          | 공개 프로젝트 상세. 숨김/없는 항목은 404                |

관리자 경로는 `/api/v1/admin` 아래에 있습니다.

- `auth`: POST 로그인/로그아웃, GET `me`, PATCH `password`.
- `site`: GET 조회, PATCH 전체 `data` 교체.
- `projects`, `experiences`, `tech-groups`: GET 목록/`:id`, POST 생성, PATCH `:id`, DELETE `:id?version=현재버전`.
- 각 목록의 PATCH `order`: `{ "items": [{ "id": "UUID", "version": 1 }] }`로 비공개 항목을 포함한 전체 목록의 순서를 변경합니다.

생성 기본값은 비공개입니다. PATCH에는 조회한 `version`이 필수이며, 수정/순서 변경 성공 시 1 증가합니다. 버전 충돌은 409입니다.
제공한 객체/배열은 필드 전체를 교체하고 생략한 필드는 유지합니다. 공개 중인 항목을 수정하면 즉시 반영됩니다. DELETE는 영구 삭제입니다.
프로젝트 슬러그는 생성 이후 변경할 수 없습니다. 상세 템플릿은 `case-study`, `changelog`, `none`이며 본문이 해당 스키마와 일치해야 합니다.
본문은 순서 있는 문단/목록과 `**강조**` 문자열을 유지합니다. 임의 HTML·새 화면 템플릿은 실행하지 않습니다. 요청 본문 한도는 1MB입니다.
400 입력 오류, 401 인증 오류, 404 없음, 409 충돌, 413 본문 초과, 429 요청 제한, 503 DB 연결 오류를 구분합니다.
전체 필드·필수 여부·성공/오류 응답은 Swagger를 확인하세요.

## 검증

```bash
npm test -- --runInBand
npm run build
npx eslint src --no-fix
# 통합 테스트는 전용 DB의 애플리케이션 테이블과 migration 이력을 생성·삭제합니다. DB 이름이 _test로 끝나야 합니다.
TEST_DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/portfolio_test npm run test:integration
```

통합 테스트는 CI에서 자동 실행하지 않고, DB 스키마·쿼리를 수정할 때 위 명령으로 수동 실행합니다. 실제 PostgreSQL에서 JWT 서명/만료/claims, 토큰 폐기, CRUD, 공개 필터, 버전 충돌, 순서 변경의 롤백, 재시드 보존, migration 중복 실행 방지·기존 DB 채택·부분 스키마 거절과 DDL 롤백, 동시 비밀번호 변경, Swagger 참조와 응답 계약을 확인합니다.
운영 의존성은 NestJS 11을 유지하며 Swagger의 js-yaml을 5.4.3으로 고정해 알려진 YAML 처리 취약점을 해결합니다.

## 자동 배포

`main`에 push하거나 GitHub Actions의 **Build and deploy**를 `main`에서 수동 실행하면 빌드·린트·단위 테스트 → `linux/amd64` 이미지 GHCR 발행 → DB 준비·마이그레이션 → API 교체 → 헬스 체크 순서로 실행합니다.
서버의 `~/portfolio-be`에 Compose 파일을 전송하고 Actions에 작성된 SSH 명령으로 해당 커밋의 `sha-<전체 커밋 SHA>` 이미지를 실행합니다. 빌드는 서버에서 하지 않습니다.
배포는 순차 실행되며, 헬스 체크에 실패하면 Actions도 실패합니다. 자동 롤백은 없습니다.

저장소 **Settings → Secrets and variables → Actions → New repository secret**에서 다음 값을 등록하세요.

| Secret               | 값                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `DEPLOY_HOST`        | 서버 공인 IPv4. `http://` 없이 주소만 입력                                                                     |
| `DEPLOY_USER`        | SSH 사용자. Limited User Login을 켰다면 `linuxuser`                                                            |
| `DEPLOY_SSH_KEY`     | 서버 사용자에게 등록한 공개키에 대응하는 **개인키 전체 내용**. `.pub` 파일이 아님. 암호 없는 배포 전용 키 사용 |
| `DEPLOY_KNOWN_HOSTS` | 아래에서 확인한 서버의 known_hosts 한 줄                                                                       |

GHCR 인증은 자동 제공되는 `GITHUB_TOKEN`으로 처리합니다. 별도의 GHCR PAT Secret은 필요하지 않습니다.
기존 GHCR 패키지를 사용한다면 패키지의 Actions 접근 권한에 이 저장소를 허용하세요.

### 서버 최초 준비

Debian 서버에 Docker Engine과 Compose 플러그인을 설치하고 TCP 22를 허용하세요.
API는 호스트 `127.0.0.1:3000`에만 공개합니다. 외부 HTTPS는 Nginx에서 처리하며 TCP 80, 443을 허용하세요.
배포에 사용하는 SSH 사용자는 비밀번호 없이 `sudo docker`를 실행할 수 있어야 합니다.
서버에서 다음 명령으로 확인합니다.

```bash
sudo -k -n docker info > /dev/null
```

비밀번호가 필요하다는 오류가 나면 `sudo visudo -f /etc/sudoers.d/portfolio-deploy`로 다음 한 줄을 등록하세요.
사용자 이름이 다르면 `linuxuser`를 바꾸세요. Docker 제어 권한은 관리자 권한에 해당합니다.

```text
linuxuser ALL=(root) NOPASSWD: /usr/bin/docker
```

이미 접속이 확인된 SSH 세션 또는 Vultr Console에서 다음 명령으로 호스트키를 확인하세요.
`서버_IP`는 `DEPLOY_HOST`에 넣을 주소로 바꿉니다. 출력 전체 한 줄을 `DEPLOY_KNOWN_HOSTS`에 넣으세요.

```bash
printf '%s ' '서버_IP'
cat /etc/ssh/ssh_host_ed25519_key.pub
```

### 배포 전용 키가 필요한 경우

Mac에서 새 키를 생성합니다. 같은 이름의 키가 있다면 덮어쓰지 마세요.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/vultr_deploy -N '' -C github-actions
cat ~/.ssh/vultr_deploy.pub
```

출력한 공개키를 서버의 배포 사용자 계정 `~/.ssh/authorized_keys`에 **새 줄로 추가**하세요.
Mac에서 아래 명령으로 개인키를 복사해 `DEPLOY_SSH_KEY`에 등록합니다. 개인키를 채팅이나 저장소에 올리지 마세요.

```bash
pbcopy < ~/.ssh/vultr_deploy
```

그 후 Secrets를 등록하고 `main`에 push하거나 워크플로를 수동 실행하세요.
배포 후 서버에서 `curl http://127.0.0.1:3000/health`가 `{"success":true,"data":{"status":"ok"}}`를 반환해야 합니다.
배포 시 GHCR 인증 파일은 임시 폴더에만 저장하고 종료 시 삭제합니다.
성공한 배포 후에는 이 저장소의 사용하지 않는 이미지만 정리하며, 실행 중인 이미지와 데이터 볼륨은 삭제하지 않습니다.

## 로컬 이미지 빌드

로컬에서 이미지 빌드만 확인하려면:

```bash
docker build --platform linux/amd64 -t portfolio-be:local .
```

## Vultr 수동 실행

x86 서버에 Docker Engine과 Compose 플러그인을 설치하고, 같은 디렉터리에 `compose.yaml`과 `.env.example`을 복사합니다.
이미지는 GitHub Actions에서 빌드하므로 서버에서 Node.js 설치나 소스 빌드를 할 필요가 없습니다.

```bash
[ -f .env ] || cp .env.example .env
# .env에 API_IMAGE, DB 비밀번호/DATABASE_URL, JWT_SECRET, CORS_ORIGINS 설정
chmod 600 .env
sudo docker compose pull
sudo docker compose up -d --wait db
sudo docker compose run --rm --no-deps api npm run db:migrate
sudo docker compose up -d --remove-orphans --wait
curl http://127.0.0.1:3000/health
```

이 구성은 내부 HTTP만 제공합니다. 외부 접근에는 Nginx와 TLS를 설정하세요.

비공개 GHCR 이미지는 해당 패키지 접근 권한과 `read:packages` 범위가 있는 GitHub PAT (classic)로 서버에서 먼저 로그인합니다.

```bash
read -rsp 'GHCR token: ' GHCR_TOKEN; echo
printf '%s' "$GHCR_TOKEN" | sudo docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
unset GHCR_TOKEN
```

업데이트는 위의 pull → DB 준비 → migration → API 실행 순서로 적용합니다. 초기 콘텐츠 주입과 관리자 생성은 아래 명령으로 한 번 실행합니다.

```bash
sudo docker compose exec api npm run db:seed
# 관리자 비밀번호는 명령줄에 쓰지 않고 입력한 환경 변수로 전달
read -r -s ADMIN_PASSWORD
export ADMIN_PASSWORD
printf '%s\n' "$ADMIN_PASSWORD" | sudo docker compose exec -T api sh -c 'read -r ADMIN_PASSWORD; export ADMIN_PASSWORD ADMIN_EMAIL=admin@example.com; npm run admin:create'
unset ADMIN_PASSWORD
```

Actions는 서버 `.env`를 만들거나 덮어쓰지 않습니다. 이미지 선택은 임시 `--env-file`로, 컨테이너의 DB 설정은 Compose `env_file: .env`로 각각 읽습니다. 기존 DB 볼륨에서 비밀번호를 변경할 때는 `.env` 편집만으로 DB 비밀번호가 바뀌지 않습니다.
버전을 고정하려면 `.env`의 `API_IMAGE`를 `ghcr.io/<owner>/<repository>:sha-<전체 커밋 SHA>`로 지정하세요.

1 vCPU / 512MB RAM / 10GB 디스크를 고려해 API 메모리는 256MB, Node.js 힙은 128MB, DB는 128MB로 제한하고 로그는 파일당 10MB, 최대 2개로 회전합니다.
성능은 실제 부하로 확인해야 하며, OS와 Docker도 메모리와 디스크를 사용합니다. `sudo docker stats`와 `sudo docker system df`로 사용량을 확인하세요.

DB 변경 전에는 백업을 보관하세요. `docker compose down -v`는 DB 데이터를 삭제하므로 일반 업데이트에서 사용하지 않습니다.

```bash
sudo docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > portfolio-backup.sql
```
