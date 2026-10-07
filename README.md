# Portfolio API

NestJS 최소 API입니다. `GET /health`는 `{"status":"ok"}`를 반환합니다.

## 로컬 실행

Node.js 24를 사용합니다.

```bash
npm ci
npm run start:dev
curl http://localhost:3000/health
```

검증은 `npm test -- --runInBand`, `npm run build`로 실행합니다.

## 자동 배포

`main`에 push하거나 GitHub Actions의 **Build and deploy**를 `main`에서 수동 실행하면 테스트 → `linux/amd64` 이미지 GHCR 발행 → Vultr SSH 배포 → 헬스 체크 순서로 실행합니다.
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
배포 후 서버에서 `curl http://127.0.0.1:3000/health`가 `{"status":"ok"}`를 반환해야 합니다.
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
# .env의 API_IMAGE를 실제 GHCR 이미지로 설정
sudo docker compose pull
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

업데이트는 `sudo docker compose pull` 후 `sudo docker compose up -d --remove-orphans --wait`로 적용합니다.
버전을 고정하려면 `.env`의 `API_IMAGE`를 `ghcr.io/<owner>/<repository>:sha-<전체 커밋 SHA>`로 지정하세요.

1 vCPU / 512MB RAM / 10GB 디스크를 고려해 API 메모리는 256MB, Node.js 힙은 128MB로 제한하고 로그는 파일당 10MB, 최대 2개로 회전합니다.
성능은 실제 부하로 확인해야 하며, OS와 Docker도 메모리와 디스크를 사용합니다. `sudo docker stats`와 `sudo docker system df`로 사용량을 확인하세요.
