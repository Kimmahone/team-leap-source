#!/bin/bash
#
# 학교·타 기관에 나가는 묶음을 만듭니다.
#
#   Finder 에서 이 파일을 두 번 누르거나, 터미널에서 그냥 실행하세요.
#   결과: 배포/TEAM-LEAP-앱-YYYYMMDD.zip
#
# 왜 이 스크립트가 있나
#   나가는 것은 apps/ 와 brand/ 뿐입니다. 그런데 같은 트리에 open api/인증키.txt 가
#   있어서, 폴더를 통째로 압축해 보내면 인증키가 따라 나갑니다.
#   그래서 「보낼 것만 담고, 담은 것에 키가 없는지 확인」하는 일을 사람 손에 맡기지 않습니다.
#
#   사본을 폴더로 만들어 두지 않는 것도 일부러입니다. 사본은 조용히 낡습니다
#   (마스터 문서 7장 함정 13번). 필요할 때 원본에서 새로 굽습니다.
#

set -euo pipefail
cd "$(dirname "$0")"

SRC="08. 실행계획(3)"
DASH="06. 실행계획(1)/prototype"
OUT="배포"
STAMP=$(date +%Y%m%d)
ZIP="$OUT/TEAM-LEAP-$STAMP.zip"

if [ ! -d "$SRC/apps" ] || [ ! -f "index.html" ]; then
  echo "✗ 'index.html' 이나 '$SRC/apps' 를 찾을 수 없습니다. 이 스크립트는 프로젝트 루트에 있어야 합니다."
  exit 1
fi

mkdir -p "$OUT"
rm -f "$ZIP"

# 메인 페이지가 06 과 08 을 모두 가리키므로 셋을 함께 담습니다.
# 폴더 이름을 그대로 두는 것은 일부러입니다 — 메인의 링크가 그 경로를 씁니다.
echo "묶는 중: index.html · $DASH · $SRC/apps · $SRC/brand"
zip -r -q "$ZIP" "index.html" "$DASH" "$SRC/apps" "$SRC/brand" \
  -x '*/.DS_Store' -x '*/node_modules/*' -x '*/.git/*'

# ── 확인 1. 인증키가 묶음에 들어갔는가 ────────────────────────────
KEYFILE="open api/인증키.txt"
if [ -f "$KEYFILE" ]; then
  KEY=$(grep -v '^[[:space:]]*#' "$KEYFILE" | grep -oE '[0-9a-fA-F]{32}' | head -1 || true)
  if [ -n "$KEY" ]; then
    if unzip -p "$ZIP" 2>/dev/null | grep -qiF "$KEY"; then
      echo "✗ 묶음 안에서 인증키가 발견되었습니다. 파일을 지웠습니다."
      rm -f "$ZIP"
      exit 1
    fi
    echo "✓ 인증키 없음"
  fi
fi

# ── 확인 2. 앱이 인터넷을 부르지 않는가 ───────────────────────────
if unzip -p "$ZIP" '*/apps/*/index.html' '*/apps/index.html' 2>/dev/null \
   | grep -qiE 'src="https?://|href="https?://[^"]*\.(js|css)|fetch\(|XMLHttpRequest'; then
  echo "⚠ 외부 요청으로 보이는 코드가 있습니다. 원칙 1번(외부 CDN 0)을 확인하세요."
fi

# ── 확인 3. 검사가 통과하는가 ─────────────────────────────────────
#     앱 목록도 검사 개수도 **손으로 적지 않습니다** (마스터 함정 35번).
#     예전에는 목록에 a~g 만 있어서 앱 H·I 가 검사되지 않은 채 묶여 나갔고,
#     「검사 1,078개 전부 통과」는 실제 개수가 두 배로 늘어난 뒤에도 그대로였습니다.
#     검사가 검사할 대상을 베껴 적으면, 둘 다 낡아도 아무 말을 하지 않습니다.
if command -v node >/dev/null 2>&1; then
  echo
  echo "검사 실행 중…"
  FAIL=0
  TOTAL=0
  TARGETS=("." "$SRC/apps" "$DASH")
  for d in "$SRC/apps"/*/; do [ -f "$d/test.js" ] && TARGETS+=("${d%/}"); done

  count_of() { printf '%s' "$1" | grep -oE '([0-9]+)개 통과|통과 ([0-9]+)' | grep -oE '[0-9]+' | tail -1; }

  for d in "${TARGETS[@]}"; do
    [ -f "$d/test.js" ] || continue
    if OUT_T=$( cd "$d" && node test.js 2>&1 ); then
      N=$(count_of "$OUT_T"); TOTAL=$(( TOTAL + ${N:-0} ))
    else
      echo "  ✗ $d"; FAIL=1
    fi
  done

  if [ -f "$SRC/apps/c-storybook/test-epub.js" ]; then
    if OUT_T=$( cd "$SRC/apps/c-storybook" && node test-epub.js 2>&1 ); then
      N=$(count_of "$OUT_T"); TOTAL=$(( TOTAL + ${N:-0} ))
    else
      echo "  ✗ c-storybook EPUB"; FAIL=1
    fi
  fi

  if [ "$FAIL" = 0 ]; then
    echo "✓ 검사 $TOTAL 개 전부 통과"
  else
    echo "✗ 실패한 검사가 있습니다. 묶음을 지웠습니다 — 위 목록을 고친 뒤 다시 실행하세요."
    rm -f "$ZIP"
    exit 1
  fi
else
  echo "⚠ node 가 없어 검사를 건너뛰었습니다."
fi

echo
echo "완료: $ZIP  ($(du -h "$ZIP" | cut -f1))"
echo "이 파일 하나만 보내면 됩니다."
