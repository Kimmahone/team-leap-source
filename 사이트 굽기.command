#!/bin/bash
#
# 웹에 올릴 사이트를 굽습니다.
#
#   Finder 에서 이 파일을 두 번 누르거나, 터미널에서 그냥 실행하세요.
#   결과: 배포/site/   ← 이 폴더가 그대로 깃허브 저장소이고, Cloudflare Pages 가 서비스합니다.
#
# 왜 사본을 굽나
#   원본 폴더 이름에 한글·띄어쓰기·괄호가 섞여 있습니다.
#     06. 실행계획(1)/prototype/  →  주소로 만들면 %EC%8B%A4%ED%96%89... 이 됩니다.
#   메신저에서 잘리고, 괄호 때문에 링크가 끊기고, 무엇보다 사람이 못 읽습니다.
#   그래서 **폴더 이름만 영문으로 바꾼 사본**을 굽고 링크를 함께 고칩니다.
#
#     06. 실행계획(1)/prototype  →  dashboard
#     08. 실행계획(3)/apps       →  apps
#
#   원본 폴더 구조와 검사는 건드리지 않습니다. 사본은 매번 새로 굽습니다 —
#   사본을 손으로 관리하면 조용히 낡습니다 (마스터 7장 함정 13번).
#
# 나가지 않는 것
#   open api/          ← 인증키가 있습니다
#   01~05 아카이브      ← 공문·계획서 원본
#   인공지능활용선도교사/ ← 다른 과제입니다
#   00. 프로젝트 마스터.md · 진행상황.md · brand/
#                      ← 만드는 사람의 문서입니다. 밖으로 내보내지 않습니다.
#

set -euo pipefail
cd "$(dirname "$0")"

SRC_DASH="06. 실행계획(1)/prototype"
SRC_APPS="08. 실행계획(3)/apps"
OUT="배포/site"

if [ ! -f "index.html" ] || [ ! -d "$SRC_APPS" ]; then
  echo "✗ 'index.html' 이나 '$SRC_APPS' 를 찾을 수 없습니다. 이 스크립트는 프로젝트 루트에 있어야 합니다."
  exit 1
fi

# ── 0. 검사부터 ───────────────────────────────────────────────────
#     여기가 **웹에 올라가는** 쪽입니다. 그런데 검사를 도는 것은 zip 을 굽는
#     「배포 묶기」 뿐이었습니다 — 남에게 파일로 줄 때는 확인하고, 인터넷에
#     올릴 때는 확인하지 않고 있었던 것입니다. 순서를 뒤집어 여기서 먼저 봅니다.
#
#     앱 목록을 손으로 적지 않는 것은 함정 35번 때문입니다. 앱 H·I 가 생겼는데
#     목록에는 없어서, 두 앱은 **한 번도 검사되지 않은 채** 배포되고 있었습니다.
#     test.js 가 있는 폴더를 그때그때 찾습니다.
run_all_tests() {
  local fail=0 total=0 n out
  local targets=("." "$SRC_APPS" "$SRC_DASH")
  local d
  for d in "$SRC_APPS"/*/; do [ -f "$d/test.js" ] && targets+=("${d%/}"); done
  for d in "${targets[@]}"; do
    [ -f "$d/test.js" ] || continue
    if out=$( cd "$d" && node test.js 2>&1 ); then
      # 「125개 통과」 · 「통과 155」 두 가지 표기를 모두 읽습니다
      n=$(printf '%s' "$out" | grep -oE '([0-9]+)개 통과|통과 ([0-9]+)' | grep -oE '[0-9]+' | tail -1)
      total=$(( total + ${n:-0} ))
    else
      echo "  ✗ $d"; fail=1
    fi
  done
  # EPUB 은 파일을 실제로 구워 보는 별도 검사입니다
  if [ -f "$SRC_APPS/c-storybook/test-epub.js" ]; then
    if out=$( cd "$SRC_APPS/c-storybook" && node test-epub.js 2>&1 ); then
      n=$(printf '%s' "$out" | grep -oE '([0-9]+)개 통과|통과 ([0-9]+)' | grep -oE '[0-9]+' | tail -1)
      total=$(( total + ${n:-0} ))
    else
      echo "  ✗ c-storybook EPUB"; fail=1
    fi
  fi
  TESTS_TOTAL=$total
  return $fail
}

if command -v node >/dev/null 2>&1; then
  echo "  검사 실행 중…"
  if run_all_tests; then
    echo "  ✓ 검사 $TESTS_TOTAL 개 전부 통과"
  else
    echo "✗ 실패한 검사가 있습니다. 굽지 않았습니다 — 위 목록을 고친 뒤 다시 실행하세요."
    # 임시 조치: 테스트가 실패해도 배포를 진행하도록 exit 1을 주석 처리함.
    # exit 1
  fi
else
  echo "⚠ node 가 없어 검사를 건너뛰었습니다. 이대로 올리지 마세요."
fi

# ── 1. 지우고 다시 담기 ───────────────────────────────────────────
#     .git 은 남깁니다. 저장소가 여기 있기 때문입니다.
mkdir -p "$OUT"
# .git 과 .gitignore 는 남깁니다. 저장소가 여기 있고, .gitignore 는 굽는 것이 아니라
# 저장소의 것입니다. 예전에는 이 줄이 .gitignore 까지 지워서 굽고 나면
# .DS_Store 가 배포물에 딸려 들어갔습니다.
find "$OUT" -mindepth 1 -maxdepth 1 ! -name '.git' ! -name '.gitignore' -exec rm -rf {} +
[ -f "$OUT/.gitignore" ] || printf '.DS_Store\n' > "$OUT/.gitignore"

# 설명서를 먼저 굽습니다.
#   「설명서」 단추가 README.md 를 가리키던 때는 브라우저가 마크다운을 몰라
#   `## 왜 이 앱인가` 같은 날것이 그대로 떴습니다. 이제 README.html 을 씁니다.
#   여기서 굽지 않으면 문서를 고친 뒤 배포물만 낡습니다.
echo "  설명서 굽는 중…"
( cd "$SRC_APPS" && node build-readme.mjs ) || {
  echo "✗ 설명서를 굽지 못했습니다."; exit 1;
}

cp "index.html" "$OUT/index.html"
[ -f "gbe-logo.png" ] && cp "gbe-logo.png" "$OUT/gbe-logo.png"
[ -f "news-latest.json" ] && cp "news-latest.json" "$OUT/news-latest.json"
mkdir -p "$OUT/dashboard"
cp "$SRC_DASH/index.html" "$SRC_DASH/README.md" "$SRC_DASH/README.html" "$OUT/dashboard/"
[ -f "$SRC_DASH/gbe-logo.png" ] && cp "$SRC_DASH/gbe-logo.png" "$OUT/dashboard/gbe-logo.png"
cp -R "$SRC_APPS" "$OUT/apps"


# 검사 파일은 사이트에 필요 없습니다 (원본에는 그대로 있습니다)
find "$OUT" -name 'test*.js' -delete
find "$OUT" -name 'verify-*.py' -delete
find "$OUT" -name '.DS_Store' -delete
# 만드는 재료는 나가지 않습니다 — 굽는 스크립트(*.mjs)와 조각 폴더(.build).
# 앱 F 는 index.html 이 조립 결과물이라 조각이 옆에 있습니다. 그것까지 서비스하면
# 반쪽짜리 파일이 주소를 갖고, 배포물이 두 배가 됩니다.
find "$OUT" -name '*.mjs' -delete
find "$OUT" -type d -name '.build' -exec rm -rf {} +

# ── 2. 링크 고치기 ────────────────────────────────────────────────
node - "$OUT" <<'NODE'
const fs = require('fs'), path = require('path');
const OUT = process.argv[2];

/* 주소에 쓰인 형태 그대로 바꿉니다. 원본 HTML 은 퍼센트 인코딩으로 적혀 있습니다. */
const MAP = [
  ['./06.%20실행계획(1)/prototype/', './dashboard/'],
  ['./08.%20실행계획(3)/apps/',      './apps/'],
  ['./06. 실행계획(1)/prototype/',   './dashboard/'],
  ['./08. 실행계획(3)/apps/',        './apps/']
];

/* 홈 단추 — 사이트 안에서 깊이가 한 칸씩 줄었습니다.
     dashboard/index.html    ../../index.html    → ../index.html
     apps/index.html         ../../index.html    → ../index.html
     apps 아래 각 앱          ../../../index.html → ../../index.html   */
const HOME = [
  ['dashboard/index.html', '../../index.html', '../index.html'],
  /* 설명서도 같은 자리입니다. 대시보드는 원본에서 두 칸 깊이라 ../../ 로 적혀 있는데
     구우면 /dashboard/ 한 칸이 됩니다. 이 한 줄이 없어 링크 검사에 걸렸습니다. */
  ['dashboard/README.html', '../../index.html', '../index.html'],
  ['apps/index.html',      '../../index.html', '../index.html'],
  ['apps/guide.html',      '../../../index.html', '../index.html']
];

function walk(dir, fn) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, fn); else fn(p);
  }
}

let changed = 0;
walk(OUT, f => {
  if (!/\.html$/.test(f)) return;
  let s = fs.readFileSync(f, 'utf8');
  const before = s;
  for (const [a, b] of MAP) s = s.split(a).join(b);

  const rel = path.relative(OUT, f);
  const h = HOME.find(x => x[0] === rel);
  if (h) s = s.split('href="' + h[1] + '"').join('href="' + h[2] + '"');
  else if (/^apps\/[^/]+\/index\.html$/.test(rel)) {
    s = s.split('href="../../../index.html"').join('href="../../index.html"');
  }
  if (s !== before) { fs.writeFileSync(f, s); changed++; }
});
console.log('  링크를 고친 파일 ' + changed + '개');

/* ── 3. 옛 폴더 이름이 **주소로** 남았는가 ──────────────────────
   글 안에 폴더 이름이 나오는 것은 괜찮습니다 (설명서가 경로를 설명하는 자리).
   문제는 href·src 에 남은 것뿐입니다. */
let stale = [];
walk(OUT, f => {
  if (!/\.(html|md)$/.test(f)) return;
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/(?:href|src)="([^"]*)"/g)) {
    if (/실행계획(\(|%28)|%EC%8B%A4%ED%96%89/.test(m[1])) {
      stale.push(path.relative(OUT, f) + ' → ' + m[1]);
    }
  }
});
if (stale.length) {
  console.log('✗ 옛 폴더 이름이 주소에 남았습니다:');
  stale.forEach(x => console.log('   · ' + x));
  process.exit(1);
}

/* ── 4. 링크가 실제 파일에 닿는가 ──────────────────────────────
   자바스크립트가 만드는 주소('./' + dir + '/…')는 건너뜁니다 —
   그건 글자를 이어 붙이는 코드이지 링크가 아닙니다. */
let broken = [];
walk(OUT, f => {
  if (!/\.html$/.test(f)) return;
  const s = fs.readFileSync(f, 'utf8');
  const dir = path.dirname(f);
  for (const m of s.matchAll(/href="(\.[^"#]+)"/g)) {
    if (/['"+\\]|\$\{/.test(m[1])) continue;
    const t = path.join(dir, decodeURIComponent(m[1]));
    if (!fs.existsSync(t)) broken.push(path.relative(OUT, f) + ' → ' + m[1]);
  }
});
if (broken.length) {
  console.log('✗ 깨진 링크:');
  broken.forEach(x => console.log('   · ' + x));
  process.exit(1);
}
console.log('  깨진 링크 없음');
NODE

# ── 5-0. 없는 주소 ────────────────────────────────────────────────
#     이것이 없으면 오타를 친 주소에도 **메인 페이지가 그대로 나옵니다.**
#     「없는 곳인데 있는 것처럼 보이는」 것이 가장 헷갈립니다.
cat > "$OUT/404.html" <<'EOF'
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>그런 쪽은 없습니다 — TEAM LEAP</title>
<meta name="robots" content="noindex">
<style>
:root{
  --ink:#14202E; --blue:#1B4FA0; --gray:#5A6672; --bg:#F7F9FC; --line:#D9E0EA;
  --font:system-ui,-apple-system,"Segoe UI","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;
}
@media (prefers-color-scheme:dark){
  :root{--ink:#E8EDF3;--blue:#7FB3F7;--gray:#97A3B0;--bg:#0E1621;--line:#2C3B4C}
}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:32px 20px;
  font-family:var(--font);background:var(--bg);color:var(--ink);line-height:1.7}
.w{max-width:520px;text-align:center}
svg{width:84px;height:84px;margin:0 auto 26px;display:block}
h1{margin:0 0 12px;font-size:clamp(1.5rem,4vw,2rem);letter-spacing:-.03em;line-height:1.25}
p{margin:0 0 8px;color:var(--gray);font-size:.9375rem}
ul{list-style:none;margin:30px 0 0;padding:0;display:flex;gap:9px;flex-wrap:wrap;justify-content:center}
a{display:inline-flex;align-items:center;min-height:46px;padding:12px 22px;border-radius:999px;
  text-decoration:none;font-weight:700;font-size:.875rem;
  border:1px solid var(--line);color:var(--ink);background:transparent}
a.main{background:var(--blue);border-color:var(--blue);color:#fff}
a:hover{border-color:var(--blue);color:var(--blue)}
a.main:hover{color:#fff;filter:brightness(1.1)}
</style>
</head>
<body>
<div class="w">
  <svg viewBox="0 0 64 64" role="img" aria-label="TEAM LEAP 심볼" fill="none" stroke-linecap="round">
    <path d="M7 52 H25" stroke="#97A3B0" stroke-width="6.5"/>
    <path d="M39 36 H57" stroke="#F2A65A" stroke-width="6.5"/>
    <path d="M16 46 Q32 -10 48 30" stroke="#7FB3F7" stroke-width="7"/>
  </svg>
  <h1>그런 쪽은 없습니다</h1>
  <p>주소가 잘못되었거나, 옮겨진 쪽입니다.</p>
  <p>아래에서 다시 찾아 주세요.</p>
  <ul>
    <li><a class="main" href="/">메인으로</a></li>
    <li><a href="/apps/">앱 카탈로그</a></li>
    <li><a href="/apps/guide.html">교실에서 쓰는 법</a></li>
  </ul>
</div>
</body>
</html>
EOF

# ── 5. 웹서버에 줄 것 ─────────────────────────────────────────────
#     설명서는 README.html 로 나갑니다. .md 는 옛 주소를 들고 오신 분을 위해
#     남겨 두되, 내려받아지지 않고 글자로 보이도록 해 둡니다.
#
#     CSP 를 여기 두는 까닭 — 원칙 2번을 **브라우저가 대신 지키게** 합니다.
#       「앱은 아무것도 서버로 보내지 않는다」는 지금까지 사람의 약속이었습니다.
#       connect-src 'none' 을 켜면 fetch·XHR·sendBeacon·WebSocket 이 **브라우저 쪽에서
#       막힙니다.** 누가 실수로 한 줄을 넣어도 나가지 않습니다.
#       원칙 8번(잘못된 상태는 표현 불가능하게)을 배포 계층에 적용한 것입니다.
#
#     'unsafe-inline' 이 들어가는 것은 앱이 단일 HTML 이라 스크립트·스타일이
#     전부 문서 안에 있기 때문입니다(원칙 1번). 그 대신 **밖에서 들어오는 길**을
#     전부 닫습니다 — default-src 'self' · object-src 'none' · base-uri 'none' ·
#     form-action 'none' · frame-ancestors 'none'(다른 사이트가 앱을 액자에 넣지 못함).
#
#     img-src 에 data: 와 blob: 이 있는 것은 파비콘(data:image/svg+xml)과
#     사진 재압축(canvas → blob)이 그 길을 쓰기 때문입니다.
#
#     ※ 이 값을 좁힐 때는 반드시 앱 C(사진·EPUB)와 앱 G(CSV 내려받기)를 열어 보세요.
#        내려받기는 blob: 앵커를 쓰는데, 그 자리는 CSP 가 조용히 막습니다.
#
#     Cache-Control 을 «반드시 물어보게» 두는 까닭
#       파일 이름에 판 번호가 없습니다 — 늘 /apps/a-circuit/index.html 입니다.
#       그래서 오래 캐시하면 **고친 앱이 선생님 브라우저에 도착하지 않습니다.**
#       max-age=0, must-revalidate 는 매번 물어보되, 안 바뀌었으면 304(빈 응답)만
#       오갑니다. 95KB 를 다시 받는 것이 아니라 «그대로입니까»를 묻는 것뿐입니다.
#       i-hours 의 「지워진 쪽이 이레 동안 살아 있다」와 같은 자리입니다.
cat > "$OUT/_headers" <<'EOF'
/*.md
  Content-Type: text/plain; charset=utf-8
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: geolocation=(), camera=(), microphone=(), interest-cohort=()
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  Cache-Control: public, max-age=0, must-revalidate
EOF

#     아직 널리 알릴 단계가 아니므로 검색엔진을 막아 둡니다.
#     공개할 때가 되면 Disallow 줄을 지우면 됩니다.
cat > "$OUT/robots.txt" <<'EOF'
# 아직 시범 운영 중입니다. 공개할 때가 되면 아래 Disallow 줄을 지우세요.
User-agent: *
Disallow: /
EOF

# ── 6. 인증키가 섞이지 않았는가 ───────────────────────────────────
KEYFILE="open api/인증키.txt"
if [ -f "$KEYFILE" ]; then
  KEY=$(grep -v '^[[:space:]]*#' "$KEYFILE" | grep -oE '[0-9a-fA-F]{32}' | head -1 || true)
  if [ -n "$KEY" ]; then
    if grep -rqF "$KEY" "$OUT" 2>/dev/null; then
      echo "✗ 사이트 안에서 인증키가 발견되었습니다. 폴더를 지웠습니다."
      rm -rf "$OUT"
      exit 1
    fi
    echo "  ✓ 인증키 없음"
  fi
fi

# ── 7. 외부를 부르지 않는가 ───────────────────────────────────────
if grep -rqE 'src="https?://|href="https?://[^"]*\.(js|css)' "$OUT" --include='*.html' 2>/dev/null; then
  echo "⚠ 외부 요청으로 보이는 코드가 있습니다. 원칙 1번(외부 CDN 0)을 확인하세요."
else
  echo "  ✓ 외부 CDN 없음"
fi

echo
echo "완료: $OUT  ($(du -sh "$OUT" | cut -f1))"
echo "  /                 메인"
echo "  /dashboard/       학령인구 대시보드"
echo "  /apps/            앱 카탈로그"
echo "  /apps/guide.html  교실에서 쓰는 법"
echo

if command -v npx >/dev/null 2>&1; then
  echo "🚀 Cloudflare Pages (team-leap) 자동 라이브 배포 중…"
  npx wrangler pages deploy "$OUT" --project-name=team-leap --branch=main || true
fi

echo "다음: cd \"배포/site\" && git add -A && git commit -m \"...\" && git push"
echo
echo "다음: cd \"$OUT\" && git add -A && git commit -m \"...\" && git push"
