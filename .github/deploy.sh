#!/usr/bin/env bash
# 구운 사이트를 배포 저장소(team-leap)로 올립니다.
#
# ★ 〔2026. 9. 1.〕 이 절차가 update-news.yml 안에만 있었습니다.
#   그래서 «공공데이터 정기 갱신»이 새 자료를 커밋해도 라이브에 안 나갔습니다.
#   GitHub 는 기본 토큰(GITHUB_TOKEN)으로 밀어 넣은 커밋으로는 다른 워크플로를
#   켜 주지 않습니다 — 되풀이 실행을 막으려는 규칙입니다. 그 규칙 때문에
#   「커밋은 됐는데 사이트는 그대로」인 상태가 조용히 생깁니다.
#
#   두 워크플로에 복사해 두면 갈라집니다. 여기 한 곳에 두고 둘 다 부릅니다.
#
# 앞선 단계에서 `사이트 굽기.command` 가 이미 돌아 배포/site 가 있어야 합니다.
set -euo pipefail

# ★ 〔새 판 · 2026. 9. 26.〕 기존 사이트(team-leap)에는 «main» 만 올립니다.
#   새 판은 v2 가지에서 자라고 team-leap-v2 로 따로 나갑니다(v2-deploy.yml).
#   누가 v2 가지를 골라 뉴스·공공데이터 워크플로를 손으로 돌려도, 여기서 멈춰
#   기존 사이트가 새 판으로 덮이지 않습니다. main 에 합친 뒤에는 그대로 지나갑니다.
if [ -n "${GITHUB_REF:-}" ] && [ "${GITHUB_REF}" != "refs/heads/main" ]; then
  echo "::warning::main 이 아닌 가지(${GITHUB_REF})에서는 기존 사이트(team-leap)로 배포하지 않습니다."
  exit 0
fi

if [ -z "${DEPLOY_PAT:-}" ]; then
  echo "::warning::DEPLOY_PAT 시크릿이 없어 team-leap 배포 푸시를 건너뜁니다."
  exit 0
fi
if [ ! -d "배포/site" ]; then
  echo "::error::배포/site 가 없습니다. 사이트 굽기가 먼저 돌아야 합니다."
  exit 1
fi

WHY="${1:-사이트 자동 배포}"
DEPLOY_DIR=$(mktemp -d)
git clone --depth 1 "https://x-access-token:${DEPLOY_PAT}@github.com/Kimmahone/team-leap.git" "$DEPLOY_DIR"

# 기존 배포 파일 제거 (.git 보존)
find "$DEPLOY_DIR" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +

# 새로 구운 파일 복사 (숨김 파일 포함)
cp -R 배포/site/* "$DEPLOY_DIR"/
cp -R 배포/site/.[!.]* "$DEPLOY_DIR"/ 2>/dev/null || true

# Cloudflare Pages Functions 는 정적 출력 폴더가 아니라 배포 저장소 뿌리에 둡니다.
cp -R functions "$DEPLOY_DIR/functions"

cd "$DEPLOY_DIR"
git config user.name  "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
git add -A

if git diff --cached --quiet; then
  echo "배포 저장소에 변경 사항이 없습니다."
else
  git commit -m "🚀 ${WHY}"
  git push origin main
  echo "::notice::team-leap 저장소로 배포했습니다 — ${WHY}"
fi
