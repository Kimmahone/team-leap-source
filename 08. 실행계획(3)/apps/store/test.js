/* 앱 모음(store) 검사 — node test.js
   ==========================================================================
   이 페이지는 다른 앱을 «가리키는» 페이지입니다. 그래서 가장 쉽게 깨지는 곳은
   화면이 아니라 **주소**입니다. 앱 폴더 이름이 바뀌거나, 카탈로그에 앱이 늘었는데
   여기만 그대로이면 아무 오류 없이 낡습니다. 그 둘을 먼저 봅니다.
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HERE = __dirname;
const html = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  실패 ' + name + (extra ? '\n       ' + extra : '')); }
}

/* ── 1. 목록 ─────────────────────────────────────────────────────────── */
const m = html.match(/<script type="application\/json" id="apps-data">([\s\S]*?)<\/script>/);
check('앱 목록(apps-data)이 문서 안에 있다', !!m);
let data = { apps: [] };
try { data = JSON.parse(m[1]); check('앱 목록이 JSON 으로 읽힌다', true); }
catch (e) { check('앱 목록이 JSON 으로 읽힌다', false, e.message); }
const apps = data.apps || [];
check('기준 주소(base)가 https 로 끝이 / 이다', /^https:\/\/.+\/$/.test(data.base || ''));
check('앱이 하나 이상 있다', apps.length > 0);

const NEED = ['id', 'group', 'kind', 'name', 'lead', 'who', 'by', 'href'];
apps.forEach(a => check(`${a.id || '(이름 없음)'}: 필수 칸이 다 있다`,
  NEED.every(k => typeof a[k] === 'string' && a[k].trim()), NEED.filter(k => !a[k]).join(', ')));
check('id 가 겹치지 않는다', new Set(apps.map(a => a.id)).size === apps.length);
check('묶음(group)은 analyze·tools·members 가운데 하나', apps.every(a => ['analyze', 'tools', 'members'].includes(a.group)));
check('갈래(kind)는 work·class·data 가운데 하나', apps.every(a => ['work', 'class', 'data'].includes(a.kind)));
check('표시(badge)는 use·wip·auto 가운데 하나', apps.every(a => !a.badge || ['use', 'wip', 'auto'].includes(a.badge)));
['analyze', 'tools', 'members'].forEach(g =>
  check(`화면에 「${g}」 묶음 자리가 있다`, html.includes(`data-group="${g}"`)));
['work', 'class', 'data'].forEach(k =>
  check(`거르개에 「${k}」 단추가 있다`, html.includes(`data-kind="${k}"`)));

/* ── 2. 사이트 안 주소가 실제 파일에 닿는가 ─────────────────────────────
   구운 사이트에서 대시보드는 /dashboard/ 이지만 원본에서는 06 폴더에 있습니다.
   그 하나만 옮겨 읽고, 나머지는 이 폴더 기준으로 읽습니다. */
const DASH = path.join(HERE, '..', '..', '..', '06. 실행계획(1)', 'prototype', 'index.html');
function target(href) {
  href = href.split('#')[0];
  if (href === '../../dashboard/index.html') return DASH;
  return path.join(HERE, decodeURIComponent(href));
}
apps.filter(a => !/^https?:/.test(a.href)).forEach(a => {
  check(`${a.id}: 링크가 파일에 닿는다`, fs.existsSync(target(a.href)), a.href);
  if (a.readme) check(`${a.id}: 설명서가 있다`, fs.existsSync(target(a.readme)), a.readme);
  check(`${a.id}: QR 에 쓸 사이트 안 주소(path)가 있다`, typeof a.path === 'string' && a.path && !a.path.startsWith('/'));
});
apps.filter(a => /^https?:/.test(a.href)).forEach(a =>
  check(`${a.id}: 바깥 주소는 https 이고 url 칸이 있다`, /^https:\/\//.test(a.href) && /^https:\/\//.test(a.url || '')));

/* ── 3. 교실도구가 카탈로그와 같은가 ────────────────────────────────────
   카탈로그에 앱이 늘거나 내려가면 여기도 따라 바뀌어야 합니다. */
const cat = fs.readFileSync(path.join(HERE, '..', 'index.html'), 'utf8');
const catDirs = [...cat.matchAll(/<article class="app [^"]*">([\s\S]*?)<\/article>/g)]
  .map(x => (x[1].match(/href="\.\/([^/"]+)\/index\.html"/) || [])[1]).filter(Boolean).sort();
const ourDirs = apps.filter(a => a.group === 'tools')
  .map(a => (a.href.match(/^\.\.\/([^/]+)\/index\.html$/) || [])[1]).filter(Boolean).sort();
check('교실도구 목록이 카탈로그와 같다', JSON.stringify(catDirs) === JSON.stringify(ourDirs),
  '카탈로그: ' + catDirs.join(',') + '\n       여기: ' + ourDirs.join(','));

/* ── 4. QR ──────────────────────────────────────────────────────────────
   휴대폰 카메라가 못 읽는 주소(한글 도메인 등)는 qr 칸에 퓨니코드로 적습니다. */
apps.forEach(a => {
  const t = a.qr || a.url || (data.base + a.path);
  check(`${a.id}: QR 주소가 ASCII https`, /^https:\/\/[\x21-\x7e]+$/.test(t), t);
});
const libSrc = (html.match(/<script>\s*\/\*! qrcode-generator[\s\S]*?<\/script>/) || [''])[0]
  .replace(/^<script>/, '').replace(/<\/script>$/, '');
check('QR 라이브러리가 문서 안에 있다(바깥을 부르지 않음)', libSrc.length > 1000);
try {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(libSrc, ctx);
  const q = ctx.qrcode(0, 'M');
  q.addData(data.base + 'apps/store/');
  q.make();
  const n = q.getModuleCount();
  check('QR 이 실제로 만들어진다', n >= 21 && (n - 17) % 4 === 0, 'modules=' + n);
  check('QR 세 모서리에 찾기 무늬가 있다', q.isDark(0, 0) && q.isDark(0, n - 1) && q.isDark(n - 1, 0));
} catch (e) {
  check('QR 이 실제로 만들어진다', false, e.message);
}

/* ── 5. 원칙 ──────────────────────────────────────────────────────────── */
check('fetch·XHR·sendBeacon·WebSocket 을 쓰지 않는다', !/\bfetch\s*\(|XMLHttpRequest|sendBeacon|new WebSocket/.test(html));
check('바깥 스크립트·스타일을 부르지 않는다', !/<script[^>]+\bsrc=/i.test(html) && !/<link[^>]+stylesheet/i.test(html));
check('form 을 쓰지 않는다(CSP form-action \'none\')', !/<form\b/i.test(html));
check('메인으로 가는 길이 카탈로그와 같은 깊이다', html.includes('href="../../../index.html"'));
check('카탈로그와 「교실에서 쓰는 법」으로 가는 링크', html.includes('href="../index.html"') && html.includes('href="../guide.html"'));
check('새 창 링크에 noopener', /rel\s*=\s*'noopener'/.test(html));
check('밝기 열쇠가 카탈로그와 같다(leap-theme)', html.includes("'leap-theme'"));
check('인쇄 안내문 자리가 있다', html.includes('id="print-area"') && /@media print/.test(html));

console.log('\n' + pass + '개 통과' + (fail ? ', ' + fail + '개 실패' : ''));
process.exit(fail ? 1 : 0);
