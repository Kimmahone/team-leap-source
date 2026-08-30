/* TEAM LEAP 메인 페이지 — 점검
   앱들과 같은 방식입니다. 최소 DOM 스텁 위에서 스크립트를 **실제로 실행**하고,
   나온 결과를 봅니다.

   이 페이지에서 가장 잘 깨지는 것은 **링크**입니다.
   대시보드(06)와 앱(08)을 가리키므로, 폴더 이름이 바뀌면 조용히 죽습니다.
   그래서 링크가 실제로 파일에 닿는지 하나씩 확인합니다.

   쓰는 법:  node test.js */

const fs = require('fs'), path = require('path'), vm = require('vm');
const HERE = __dirname;
const ROOT = HERE;
const APP = path.join(HERE, 'index.html');
const html = fs.readFileSync(APP, 'utf8');

let pass = 0, fail = 0;
const check = (n, c, extra) => {
  if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (extra ? '\n         ' + extra : '')); }
};

/* ---------- 링크 ---------- */
console.log('\n■ 링크가 실제 파일에 닿는가');
const links = [...new Set([...html.matchAll(/href="(\.\/[^"]+)"/g)].map(m => m[1]))];
check('상대 링크가 12개 이상 있다', links.length >= 12, '개수: ' + links.length);
const broken = links.filter(l => !fs.existsSync(path.join(HERE, decodeURIComponent(l.slice(2)))));
check('깨진 링크가 없다', broken.length === 0, broken.join('\n         '));

const must = [
  ['대시보드',     '06. 실행계획(1)/prototype/index.html'],
  ['앱 카탈로그',  '08. 실행계획(3)/apps/index.html'],
  ['앱 A',        '08. 실행계획(3)/apps/a-circuit/index.html'],
  ['앱 B',        '08. 실행계획(3)/apps/b-classboard/index.html'],
  ['앱 C',        '08. 실행계획(3)/apps/c-storybook/index.html'],
  ['앱 D',        '08. 실행계획(3)/apps/d-multigrade/index.html'],
  ['앱 E',        '08. 실행계획(3)/apps/e-together/index.html'],
  ['앱 F',        '08. 실행계획(3)/apps/f-lessonplan/index.html'],
  ['앱 G',        '08. 실행계획(3)/apps/g-classdata/index.html'],
  ['앱 J',        '08. 실행계획(3)/apps/j-howmany/index.html'],
  ['앱 K',        '08. 실행계획(3)/apps/k-year/index.html'],
  ['앱 L',        '08. 실행계획(3)/apps/l-rooms/index.html'],
  ['앱 I',        '08. 실행계획(3)/apps/i-required/index.html']
];
const decoded = links.map(l => decodeURIComponent(l.slice(2)));
must.forEach(([name, p]) => check(name + ' 로 가는 길이 있다', decoded.includes(p), p));

/* 이 페이지는 **입구**입니다. 안쪽 문서로 가는 길은 일부러 걷어 냈습니다.
   나중에 무심코 되살아나면 여기서 걸립니다. */
console.log('\n■ 내부 문서로 가는 길이 없다 (입구만 남긴다)');
[
  ['프로젝트 마스터', '프로젝트'],
  ['진행상황',       '진행상황'],
  ['브랜드 가이드',   'brand-guide'],
  ['대시보드 실행계획','실행계획(마스터)']
].forEach(([name, needle]) =>
  check(name + ' 로 가는 길이 없다', !decoded.some(d => d.includes(needle)),
    decoded.filter(d => d.includes(needle)).join(' ')));

/* ---------- 머리의 이동 단추 ---------- */
console.log('\n■ 머리에서 절로 바로 갈 수 있는가');
const navLinks = [...(html.match(/<div class="nav-links" id="nav-links">([\s\S]*?)<\/div>/) || ['', ''])[1]
  .matchAll(/href="#([^"]+)"/g)].map(m => m[1]);
check('절로 가는 단추가 5개 있다', navLinks.length === 5, navLinks.join(' '));
check('그 단추가 가리키는 절이 모두 있다',
  navLinks.every(id => html.includes('id="' + id + '"')),
  navLinks.filter(id => !html.includes('id="' + id + '"')).join(' '));
check('로고를 누르면 맨 위로 간다',
  /class="nav-home" href="#top"/.test(html) && html.includes('id="top"'));
check('지금 보고 있는 절을 aria-current 로 알린다', /aria-current/.test(html));
check('고정된 머리 아래로 절이 숨지 않는다', /\[id\]\{scroll-margin-top/.test(html));

/* ---------- 돌아오는 길 ----------
   앱을 열면 되돌아올 방법이 있어야 합니다. 브라우저 뒤로 가기는 방법이 아닙니다 —
   링크를 새 창으로 열거나 바탕화면 바로가기로 연 사람에게는 뒤로 갈 곳이 없습니다. */
console.log('\n■ 열한 곳 모두에서 메인으로 돌아올 수 있는가');
const homes = [
  ['대시보드',    '06. 실행계획(1)/prototype/index.html', '../../index.html'],
  ['앱 카탈로그', '08. 실행계획(3)/apps/index.html',      '../../index.html'],
  ['앱 A',       '08. 실행계획(3)/apps/a-circuit/index.html',    '../../../index.html'],
  ['앱 B',       '08. 실행계획(3)/apps/b-classboard/index.html', '../../../index.html'],
  ['앱 C',       '08. 실행계획(3)/apps/c-storybook/index.html',  '../../../index.html'],
  ['앱 D',       '08. 실행계획(3)/apps/d-multigrade/index.html', '../../../index.html'],
  ['앱 E',       '08. 실행계획(3)/apps/e-together/index.html',   '../../../index.html'],
  ['앱 F',       '08. 실행계획(3)/apps/f-lessonplan/index.html', '../../../index.html'],
  ['앱 G',       '08. 실행계획(3)/apps/g-classdata/index.html',  '../../../index.html'],
  ['앱 J',       '08. 실행계획(3)/apps/j-howmany/index.html',    '../../../index.html'],
  ['앱 K',       '08. 실행계획(3)/apps/k-year/index.html',       '../../../index.html'],
  ['앱 L',       '08. 실행계획(3)/apps/l-rooms/index.html',      '../../../index.html'],
  ['앱 I',       '08. 실행계획(3)/apps/i-required/index.html',      '../../../index.html']
];
homes.forEach(([name, file, up]) => {
  const s = fs.readFileSync(path.join(HERE, file), 'utf8');
  const has = s.includes('href="' + up + '"');
  const lands = path.resolve(path.dirname(path.join(HERE, file)), up) === APP;
  check(name + ' 에 홈 단추가 있고 이 페이지로 닿는다', has && lands,
    has ? '경로가 메인을 가리키지 않음' : '홈 단추 없음');
  /* 〔2026. 8. 7.〕 이 단추의 글자가 「처음으로」였습니다.
     한국어에서 그 말은 **앱 안에서 처음부터 다시**로 먼저 읽힙니다.
     그래서 새 수업을 짜려던 분이 이것을 눌러 앱을 나가 버렸습니다.
     어디로 가는 단추인지 이름에 적고, **나가도 잃는 것이 없다**는 것도 함께 적습니다. */
  check(name + ' 홈 단추가 어디로 가는지 이름으로 말한다',
    s.includes('메인으로') && !/>\s*처음으로\s*<\/a>/.test(s),
    '「처음으로」는 앱 안에서 새로 시작한다는 뜻으로 읽힌다');
  check(name + ' 나가도 잃는 것이 없다고 알려 준다',
    s.includes('이 앱에 적은 것은 그대로 남습니다') || s.includes('메인 페이지로 나가기'));
});

/* ---------- AI 초안 도우미 ----------
   아홉 앱 모두에 있어야 합니다. 그리고 **어느 앱도 API 키를 받지 않습니다** —
   키를 넣는 순간 그 앱은 인터넷이 필요한 앱이 되고, 원칙 1번이 무너집니다. */
console.log('\n■ AI 초안 도우미 — 교사가 쓰는 앱에만');
/* 〔2026. 8. 7.〕 **앱 C 에서는 걷어냈습니다.**
   이 앱은 **학생이 직접 쓰는 앱**입니다. 아이의 글을 AI 에게 맡길 자리가 아니고,
   교실에서 아이 손에 AI 단추를 쥐여 주는 것도 지금 단계에서 할 일이 아닙니다.
   나머지 여섯은 교사가 쓰는 앱이라 그대로 둡니다. */
const aiApps = [
  ['앱 A', '08. 실행계획(3)/apps/a-circuit/index.html',    'btn-ai'],
  ['앱 B', '08. 실행계획(3)/apps/b-classboard/index.html', 'btn-ai'],
  ['앱 D', '08. 실행계획(3)/apps/d-multigrade/index.html', 'AI 초안 도우미'],
  ['앱 E', '08. 실행계획(3)/apps/e-together/index.html',   'btn-ai'],
  ['앱 F', '08. 실행계획(3)/apps/f-lessonplan/index.html', 'AI 초안 도우미'],
  ['앱 G', '08. 실행계획(3)/apps/g-classdata/index.html',  'AI 초안 도우미'],
  ['앱 J', '08. 실행계획(3)/apps/j-howmany/index.html',    'btn-ai'],
  ['앱 K', '08. 실행계획(3)/apps/k-year/index.html',       'btn-ai'],
  ['앱 L', '08. 실행계획(3)/apps/l-rooms/index.html',      'btn-ai'],
  ['앱 I', '08. 실행계획(3)/apps/i-required/index.html',      'btn-ai']
];
{
  const c = fs.readFileSync(path.join(HERE, '08. 실행계획(3)/apps/c-storybook/index.html'), 'utf8');
  check('앱 C 에는 AI 초안 도우미가 없다',
    !c.includes('btn-ai') && !c.includes('LEAPAI') && !c.includes('leap-aim'),
    '학생이 직접 쓰는 앱이다 — 아이의 글을 AI 에게 맡길 자리가 아니다');
  check('앱 C 도 여전히 아무 데도 보내지 않는다',
    !/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|WebSocket/.test(c));
}
aiApps.forEach(([name, f, needle]) => {
  const s = fs.readFileSync(path.join(HERE, f), 'utf8');
  check(name + ' 에 AI 초안 도우미가 있다', s.includes(needle));
  check(name + ' 은 API 키를 받지 않는다', !/api[-_ ]?key/i.test(s),
    '키를 받으면 인터넷이 필요한 앱이 된다 (원칙 1번)');
  check(name + ' 은 프롬프트를 만들 뿐 보내지 않는다',
    !/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|WebSocket/.test(s));
});

/* ---------- 활용 가이드 ----------
   README 는 만든 사람의 문서이고, 이것은 쓰는 사람의 문서입니다.
   앱이 늘었는데 가이드가 안 늘면 조용히 낡습니다. 그래서 개수를 맞춰 봅니다. */
/* 앱 목록은 «폴더»가 진짜입니다. 손으로 적으면 앱이 늘 때마다 어긋납니다.
   내린 앱(안내 쪽만 있는 것)은 test.js 가 없으므로 그것으로 가립니다. */
const APP_DIRS = fs.readdirSync('08. 실행계획(3)/apps')
  .filter(d => /^[a-z]-/.test(d))
  .filter(d => fs.existsSync('08. 실행계획(3)/apps/' + d + '/test.js'))
  .sort();

console.log('\n■ 활용 가이드가 열한 앱을 다 다루는가');
{
  const gf = path.join(HERE, '08. 실행계획(3)/apps/guide.html');
  check('활용 가이드 파일이 있다', fs.existsSync(gf));
  const g = fs.existsSync(gf) ? fs.readFileSync(gf, 'utf8') : '';
  /* 〔8. 31.〕 범위를 [A-I] 로 못박아 두었더니 앱이 J·K·L 로 늘면서 걸렸습니다.
     한 글자 대문자면 앱 표시로 봅니다 — 앱이 더 늘어도 따라옵니다. */
  const entries = (g.match(/^\s{4}k: '[A-Z]'/gm) || []).length;
  check('가이드가 앱을 다 다룬다', entries === APP_DIRS.length,
    '앱 ' + APP_DIRS.length + '개 · 가이드 ' + entries + '개');
  APP_DIRS.forEach(dir => {
    check(dir + ' 로 가는 길이 가이드에 있다', g.includes("dir: '" + dir + "'"));
  });
  check('앱마다 새 쪽에서 인쇄된다', /\.g \+ \.g\{break-before:page/.test(g),
    '필요한 앱의 쪽만 뽑아 돌릴 수 있어야 한다');
  check('「어디서 막히나」가 앱마다 있다',
    (g.match(/stuck: \[/g) || []).length === APP_DIRS.length);
  check('「AI 초안 도우미로 받는 것」이 앱마다 있다',
    (g.match(/^\s{4}ai: /gm) || []).length === APP_DIRS.length);
  check('가이드에도 메인으로 가는 홈 단추가 있다', g.includes('href="../../../index.html"'));
  check('가이드는 외부를 부르지 않는다',
    !/<(script|link)[^>]+(src|href)\s*=\s*["']https?:/i.test(g));
}

/* ---------- 실행 ---------- */
console.log('\n■ 실행');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const els = {};
function makeEl() {
  const cls = new Set();
  return {
    _html: '', textContent: '', style: {}, offsetHeight: 800,
    classList: {
      add(c) { cls.add(c); }, remove(c) { cls.delete(c); },
      toggle(c, on) { on ? cls.add(c) : cls.delete(c); },
      contains(c) { return cls.has(c); }
    },
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
    addEventListener() {}, setAttribute(k, v) { this['_' + k] = String(v); },
    getAttribute(k) { return this['_' + k] === undefined ? null : this['_' + k]; },
    getBoundingClientRect() { return { top: 0, height: 2000 }; }
  };
}
const sandbox = {
  console,
  localStorage: { getItem: () => null, setItem() {} },
  matchMedia: () => ({ matches: false }),
  innerHeight: 900, scrollY: 0,
  addEventListener() {}, removeEventListener() {},
  requestAnimationFrame() {},
  setTimeout() {}, clearTimeout() {},
  IntersectionObserver: function () {
    this.observe = () => {}; this.unobserve = () => {}; this.disconnect = () => {};
  },
  document: {
    getElementById(id) { return els[id] || (els[id] = makeEl()); },
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    documentElement: makeEl()
  }
};
sandbox.window = sandbox;
let threw = null;
try { vm.createContext(sandbox); vm.runInContext(js, sandbox, { timeout: 5000 }); }
catch (e) { threw = e; }
check('스크립트가 예외 없이 끝까지 실행된다', !threw, threw && threw.message);

/* ---------- 작은 지도 ---------- */
console.log('\n■ 작은 지도 (대시보드·앱 C·E 와 같은 자료)');
const map = els['mini-map'] ? els['mini-map']._html : '';
const shapes = (map.match(/<path class="sg"/g) || []).length;
check('시군 22곳이 면으로 그려진다', shapes === 22, '그려진 수: ' + shapes);
check('점으로 물러나지 않았다 (경계가 구워져 있다)',
  !map.includes('<circle class="dot"'), '경계 자료를 못 찾아 점으로 그렸습니다');
check('울릉군이 별도 상자에 들어간다', map.includes('stroke-dasharray'));
check('시군 이름이 글자로도 적힌다', (map.match(/class="lb"/g) || []).length === 22);

/* 좌표가 뒤집히지 않았는지 — 울진(동북)과 고령(서남).
   이름표의 자리를 봅니다. 이름표는 시군 중심의 위경도를 그대로 옮긴 것이라,
   투영이 뒤집히면 여기서 바로 드러납니다. */
const xy = {};
[...map.matchAll(/<text class="lb" x="([\d.-]+)" y="([\d.-]+)">([^<]+)</g)]
  .forEach(m => { xy[m[3]] = { x: +m[1], y: +m[2] }; });
check('이름표 22개의 자리를 모두 읽었다', Object.keys(xy).length === 22,
  Object.keys(xy).length + '개');
check('울진이 고령보다 오른쪽·위쪽에 있다',
  xy['울진'] && xy['고령'] && xy['울진'].x > xy['고령'].x && xy['울진'].y < xy['고령'].y,
  JSON.stringify({ 울진: xy['울진'], 고령: xy['고령'] }));
check('포항이 상주보다 오른쪽에 있다',
  xy['포항'] && xy['상주'] && xy['포항'].x > xy['상주'].x);

/* 경계 자료 자체 — 네 곳이 **같은 자료**를 쓰는가.
   한 곳만 다시 구우면 나머지가 조용히 낡습니다 (함정 13번). */
console.log('\n■ 시군 경계 — 네 곳이 같은 자료를 쓰는가');
/* 파일마다 들여쓰기가 다르므로 줄 앞 공백을 떼고 견줍니다 —
   같은 자료인지가 궁금한 것이지, 몇 칸 들여썼는지가 궁금한 게 아닙니다. */
const POLY_RE = /var GB_POLY = \{[\s\S]*?\n\s*\};/;
const flat = t => t.split('\n').map(l => l.trim()).join('\n');
const boundaryFiles = [
  ['메인',      'index.html'],
  ['대시보드',  '06. 실행계획(1)/prototype/index.html'],
  ['앱 C',     '08. 실행계획(3)/apps/c-storybook/index.html'],
  ['앱 E',     '08. 실행계획(3)/apps/e-together/index.html']
];
const blocks = boundaryFiles.map(([name, f]) => {
  const s = fs.readFileSync(path.join(HERE, f), 'utf8');
  const m = s.match(POLY_RE);
  check(name + ' 에 시군 경계가 심어져 있다', !!m);
  return m ? flat(m[0]) : null;
});
check('네 곳의 경계가 글자 하나까지 같다',
  blocks.every(b => b && b === blocks[0]));
check('군위군이 들어 있지 않다 (2023 대구 편입)', !blocks[0] || !blocks[0].includes("'군위'"));
check('시군 22곳이 다 있다', !!blocks[0] &&
  (blocks[0].match(/^'[^']+': '/gm) || []).length === 22,
  blocks[0] ? (blocks[0].match(/^'[^']+': '/gm) || []).length + '곳' : '');
check('울릉이 따로 들어 있다', !!blocks[0] && blocks[0].includes("'울릉'"));
check('출처를 밝힌다 (공공누리 제1유형)',
  html.includes('공공누리') || /SGIS|통계청/.test(html));

/* ---------- 원칙 ---------- */
console.log('\n■ 설계 원칙');
/* ★ 2026. 8. 12. — 이 두 검사에 구멍이 있었습니다. 넓혔습니다.
     예전 검사는 `<script src="https://…">` 같은 **태그의 속성만** 봤습니다.
     그런데 밖을 부르는 길은 그것만이 아닙니다 —
       import … from "https://…"   (ES 모듈. 속성이 아니라 스크립트 본문입니다)
       import("https://…")          (동적 import)
       new Worker('https://…')
       @import url(https://…) · url(https://…)   (CSS 쪽 길)
     Firebase SDK 가 첫 번째 길로 들어와 있었는데 검사는 초록이었습니다.

     「서버로 보내는 코드」도 마찬가지입니다. fetch·XHR·sendBeacon 이라는
     **낱말만** 찾고 있었습니다. SDK 는 그 낱말을 우리 파일에 남기지 않고
     자기 안에서 통신합니다. 그래서 밖으로 나가는 SDK 이름 자체를 봅니다.
     원칙 2번은 「fetch 를 안 쓴다」가 아니라 「아무것도 안 보낸다」입니다. */
const EXTERNAL_PATTERNS = [
  [/<(script|link|iframe|img)[^>]+(src|href)\s*=\s*["']https?:/i, '태그 속성'],
  [/\bimport\s+[^;]*?\bfrom\s*["']https?:/i,                      'ES 모듈 import'],
  [/\bimport\s*\(\s*["']https?:/i,                                '동적 import'],
  [/new\s+Worker\s*\(\s*["']https?:/i,                            'Worker'],
  [/@import\s+(url\()?["']?https?:/i,                             'CSS @import'],
  [/url\(\s*["']?https?:\/\//i,                                   'CSS url()']
];
const externalHits = EXTERNAL_PATTERNS.filter(([re]) => re.test(html)).map(([, n]) => n);
check('외부 CDN·웹폰트를 부르지 않는다', externalHits.length === 0,
  externalHits.length ? '밖을 부르는 길: ' + externalHits.join(' · ') : '');

const SEND_PATTERNS = [
  [/\bfetch\s*\(/,                        'fetch()'],
  [/XMLHttpRequest/,                      'XMLHttpRequest'],
  [/navigator\.sendBeacon/,               'sendBeacon'],
  [/new\s+WebSocket\s*\(/,                'WebSocket'],
  [/new\s+EventSource\s*\(/,              'EventSource'],
  [/\bfirebase|initializeApp|getFirestore|firestore\.googleapis/i, 'Firebase SDK'],
  [/gtag\(|googletagmanager|google-analytics/i,                    '구글 애널리틱스']
];
const sendHits = SEND_PATTERNS.filter(([re]) => re.test(html)).map(([, n]) => n);
check('서버로 보내는 코드가 없다', sendHits.length === 0,
  sendHits.length ? '밖으로 보내는 길: ' + sendHits.join(' · ') : '');
check('다크 모드가 있다', /@media \(prefers-color-scheme:\s*dark\)/.test(html));
check('인쇄 스타일이 있다', /@media print/.test(html));
check('모션 축소 요청을 존중한다', /prefers-reduced-motion/.test(html));
check('건너뛰기 링크가 있다', /class="skip"/.test(html));
check('인쇄에서 조작 단추를 감춘다', /@media print[\s\S]*?\.themebtn[^}]*display:\s*none/.test(html));
check('소개 인쇄 단추가 없다', !/id="btn-print"/.test(html) && !html.includes('소개 인쇄'));
check('버튼이 44px 이상이다', /\.btn\{[^}]*min-height:48px/.test(html) && /\.themebtn\{[^}]*min-height:44px/.test(html));

/* 애플식으로 다시 짠 뒤 늘어난 것들 */
console.log('\n■ 움직임 — 정보를 나르지 않는가');
check('나타남은 .js 가 붙은 뒤에만 숨긴다 (JS 꺼져도 다 보임)', /\.js \.rise\{[^}]*opacity:0/.test(html));
check('움직임 줄이기를 켜면 전부 보인다', /prefers-reduced-motion[\s\S]*?\.js \.rise\{opacity:1!important/.test(html));
check('브랜드 절이 스크롤을 따라 그려진다', /id="seq-track"/.test(html) && /stroke-dashoffset/.test(html));
check('브랜드 네 걸음의 설명이 다 있다', (html.match(/class="cap[ "]/g) || []).length === 4);
check('걸음마다 켜지는 이름표가 4개 있다',
  (((html.match(/<ul class="seq-legend"[\s\S]*?<\/ul>/) || [''])[0])
    .match(/<li /g) || []).length === 4);

/* 「간극」 글자가 선 위에 올라앉지 않는가 —
   예전에는 두 지면을 잇는 빗금 한가운데에 얹혀서 글자도 선도 읽히지 않았습니다.
   낮은 지면(y=52, 굵기 6.5)의 아래 끝은 y=55.25 입니다. 글자는 그보다 아래여야 합니다. */
{
  const y = +((html.match(/class="gaplb"[^>]*\by="([\d.]+)"/) || [])[1]);
  check('「간극」 글자가 지면 선과 겹치지 않는다', y >= 55.25, '글자 y: ' + y);
  check('간극 표시가 두 지면 사이만 잰다',
    /class="gapline"[^>]*d="M29\.5 52 H39 V40\.5"/.test(html));
}

/* ---------- 마지막 절 ---------- */
console.log('\n■ 마지막 절 — 다른 연구원의 앱 자리');
check('연구소 절이 있다', /id="lab"/.test(html));
check('비워 둔 자리가 3칸 있다', (html.match(/class="link empty rise"/g) || []).length === 3);
check('빈 자리는 눌리지 않는다 (a 가 아니라 div)', !/<a class="link empty/.test(html));
check('자리를 채우는 법이 주석으로 적혀 있다', html.includes('그 자리에 이렇게 넣으세요'));
check('마지막 한마디가 있다', /class="closing/.test(html));
/* ★ 〔2026. 8. 12.〕 이 검사가 없어서 **스타일이 안 먹는 절**이 그대로 나갔습니다.
   연구소 절이 `sec`·`sec-h`·`sec-p` 를 쓰고 있었는데 CSS 에 그 이름이 없었고,
   푸터 브랜드는 `brand` 인데 CSS 는 `foot-brand` 였습니다. 정의가 **0개**라
   두 곳 다 날것으로 떠 있었는데 아무 검사도 그것을 보지 않았습니다.
   ※ 앱 카드의 한 글자 클래스는 «자리표»라 색이 없습니다 — 빼고 봅니다.
   〔8. 31.〕 범위를 a~i 로 못박아 두었더니 앱이 J·K·L 로 늘면서 걸렸습니다.
   한 글자면 자리표로 봅니다 — 앱이 더 늘어도 따라옵니다. */
const styleSheet = (html.match(/<style>[\s\S]*?<\/style>/g) || []).join('\n');
const definedClasses = new Set([...styleSheet.matchAll(/\.([A-Za-z][\w-]*)/g)].map(m => m[1]));
const usedClasses = new Set();
for (const m of html.matchAll(/class="([^"]+)"/g)) {
  m[1].split(/\s+/).forEach(c => { if (c) usedClasses.add(c); });
}
const orphanClasses = [...usedClasses]
  .filter(c => !definedClasses.has(c))
  .filter(c => !/^[a-z]$/.test(c));
check('CSS 가 없는 클래스를 쓰지 않는다', orphanClasses.length === 0,
  '정의가 없는 클래스: ' + orphanClasses.join(', '));
check('숫자 세기는 원래 글자로 되돌린다', /el\.textContent = text;/.test(html));
check('인쇄 직전에 숫자를 제 값으로 되돌린다', /beforeprint/.test(html));
check('외부 애니메이션 라이브러리를 쓰지 않는다',
  !/gsap|lottie|aos\.js|scrollmagic|framer/i.test(html));

/* ---------- 숫자가 다른 문서와 어긋나지 않는가 ----------
   함정 12번: 같은 숫자가 여러 파일에 흩어져 있습니다. 하나를 고치면 나머지가 낡습니다. */
console.log('\n■ 숫자가 대시보드·마스터와 맞는가');
const dash = fs.readFileSync(path.join(HERE, '06. 실행계획(1)/prototype/index.html'), 'utf8');
const kinds = { e: 0, m: 0, h: 0 };
const rawBlock = dash.match(/ {2}var SCHOOL_RAW = \{\n([\s\S]*?)\n {2}\};/);
if (rawBlock) {
  for (const line of rawBlock[1].split('\n')) {
    const lm = line.match(/^\s*\w+: '(.*)',?$/);
    if (!lm) continue;
    for (const rec of lm[1].split(';')) kinds[rec.split('|')[1]]++;
  }
}
const total = kinds.e + kinds.m + kinds.h;
check('학교 수 917 이 실제 자료와 같다', total === 917 && html.includes('917'), '실제: ' + total);
check('초 474 · 중 260 · 고 183 이 실제 자료와 같다',
  kinds.e === 474 && kinds.m === 260 && kinds.h === 183 &&
  html.includes('초 474 · 중 260 · 고 183'), JSON.stringify(kinds));

/* 학생수 — 대시보드가 실제로 더한 값과 맞는지 */
const stuBlock = dash.match(/ {2}var STUDENT_RAW = \{\n([\s\S]*?)\n {2}\};/);
let byKind = { e: 0, m: 0, h: 0 };
if (stuBlock) {
  for (const line of stuBlock[1].split('\n')) {
    const lm = line.match(/^\s*\w+: '(.*)',?$/);
    if (!lm || !lm[1]) continue;
    for (const rec of lm[1].split(';')) {
      const f = rec.split('|');
      const g = f[2] ? f[2].split(',').reduce((a, v) => a + (+v || 0), 0) : 0;
      const sp = +(f[4] || '0,0').split(',')[0] || 0;
      byKind[f[1]] += g + sp;
    }
  }
}
check('초 101,176 이 실제 자료와 같다', byKind.e === 101176 && html.includes('101,176'), '실제: ' + byKind.e);
check('중 63,119 이 실제 자료와 같다',  byKind.m === 63119  && html.includes('63,119'),  '실제: ' + byKind.m);
check('고 63,189 이 실제 자료와 같다',  byKind.h === 63189  && html.includes('63,189'),  '실제: ' + byKind.h);
const sum = byKind.e + byKind.m + byKind.h;
check('계 227,484 가 세 값을 더한 것과 같다', sum === 227484 && html.includes('227,484'), '더한 값: ' + sum);

/* 점검 개수 — **앱의 검사를 실제로 돌려서** 나온 수와 맞는지 봅니다.
   〔2026. 8. 7.〕 여기 숫자를 손으로 적어 두고 있었습니다. 그래서 이 검사는
   **메인 페이지와 이 파일이 같은지**만 보았고, 둘 다 낡으면 아무 말도 하지
   않았습니다. 실제로 일곱 앱의 판 번호와 검사 개수가 전부 낡은 채로
   여러 판이 지나갔습니다 (앱 E 는 화면 v0.4 · 메인 v0.1).

   검사가 검사할 대상을 **베껴 적고 있으면 검사가 아닙니다.** 함정 12·30번과
   같은 자리입니다. 이제 각 앱의 test.js 를 돌려 나온 수를 씁니다. */
const { execFileSync } = require('child_process');

function runCount(dir) {
  const t = path.join(ROOT, dir, 'test.js');
  if (!fs.existsSync(t)) return null;
  try {
    const out = execFileSync('node', [t], { cwd: path.join(ROOT, dir), encoding: 'utf8',
      timeout: 120000, stdio: ['ignore', 'pipe', 'ignore'] });
    const m = out.match(/(\d+)개 통과/) || out.match(/통과 (\d+)/);
    return m ? +m[1] : null;
  } catch (e) {
    const out = String((e.stdout || '') + (e.stderr || ''));
    const m = out.match(/(\d+)개 통과/) || out.match(/통과 (\d+)/);
    return m ? +m[1] : null;
  }
}

/* 앱 목록을 **손으로 적지 않습니다** (마스터 함정 35번).
   손으로 적으면 앱을 새로 만든 날 이 줄을 고치는 것을 잊고, 그 앱은
   검사되지 않은 채 배포됩니다. 실제로 앱 H·I 가 그렇게 지나갔습니다.
   `test.js` 가 있는 폴더 = 살아 있는 앱입니다. i-hours 처럼 내려간 앱은
   검사 파일이 없으므로 저절로 빠집니다. */
const APPS_DIR = path.join(ROOT, '08. 실행계획(3)/apps');
const APPS = fs.readdirSync(APPS_DIR)
  .filter(d => /^[a-z]-/.test(d) && fs.existsSync(path.join(APPS_DIR, d, 'test.js')))
  .sort();

/* ---------- 「몇 개인가」를 페이지가 세 가지로 말하고 있었다 ---------- */
console.log('\n■ 앱이 몇 개인지 페이지가 한 가지로 말하는가 — 함정 52번');
{
  /* 검사는 앱«마다»의 판 번호는 원본에서 읽어 견주고 있었는데, 정작
     **「모두 몇 개인가」는 아무 데서도 세지 않았습니다.** 그래서 앱이 다섯일 때
     적은 말이 앱이 아홉이 되도록 남았습니다 — 머리 주석 「앱 5종」,
     본문 「여기 있는 여덟」 두 곳, 판 번호 v0.2.
     세지 않는 숫자는 낡습니다. 그래서 **카드를 실제로 셉니다.** */
  const NUM = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열',
               '열한', '열두', '열세', '열네'];
  const cards = [...html.matchAll(/href="\.\/08\.%20실행계획\(3\)\/apps\/([a-z]-[a-z]+)\/index\.html"/g)]
    .map(m => m[1]);
  const n = new Set(cards).size;

  /* 아래 검사들은 **주석을 걷어 낸 글**을 봅니다. 여기서 세는 것은
     「선생님이 읽는 말」이고, 주석은 「예전에 이렇게 적혀 있었다」를 적어 두는
     자리라 옛 말이 그대로 인용되어 있습니다. 걷어 내지 않으면 검사가
     자기 설명을 잡습니다. 머리 주석은 따로 봅니다 — 아래 별도 검사. */
  const prose = html.replace(/<!--[\s\S]*?-->/g, '');

  check('메인에 걸린 앱 카드 수가 살아 있는 앱 수와 같다', n === APPS.length,
    '카드 ' + n + '개 · 실제 앱 ' + APPS.length + '개 — 새로 만든 앱을 메인에 안 걸었거나, 내린 앱이 남아 있다');

  /* 「하나라도 맞으면 통과」로 두면 안 됩니다 — 이 말은 페이지에 **여러 번**
     나오고, 한 곳만 고치면 나머지가 조용히 낡습니다. 그것이 애초에 여기서
     일어난 일입니다. 그래서 **나오는 자리 전부**가 같은 수를 말하는지 봅니다. */
  const said = [...prose.matchAll(/(?:교실 )?도구 (\d+)종|앱 (\d+)종/g)]
    .map(m => +(m[1] || m[2]));
  check('「N종」이 나오는 자리가 있다', said.length > 0);
  check('「N종」이 나오는 자리 ' + said.length + '곳이 **전부** ' + n + '을 말한다',
    said.length > 0 && said.every(v => v === n),
    '나온 수: ' + said.join(', ') + ' — 카드는 ' + n + '개. 한 곳만 고치면 나머지가 낡는다');

  /* 〔v0.8〕 **위의 그물은 「종」이 붙은 말만 잡습니다.** 그래서 숫자 타일의
     「대시보드 1 + 교실 도구 7」이 v0.7 을 통째로 지나갔습니다 — 「종」이 없었으니까요.
     세는 자리를 「종」에 매어 두면 안 됩니다. **「종」을 떼고도 셉니다.** */
  const tools = [...prose.matchAll(/교실 도구 (\d+)/g)].map(m => +m[1]);
  check('「교실 도구 N」이 나오는 자리 ' + tools.length + '곳이 **전부** ' + n + '을 말한다',
    tools.length > 0 && tools.every(v => v === n),
    '나온 수: ' + tools.join(', ') + ' — 카드는 ' + n + '개. 「종」이 안 붙은 자리도 낡는다');

  /* 타일의 큰 숫자는 `<span>` 안에 있고 「종」은 `<u>` 안에 따로 있습니다.
     글자로는 영영 안 잡히므로 **타일의 생김새 그대로** 읽습니다.
     타일 모양을 바꿀 때는 이 검사도 함께 고쳐야 합니다 — 못 읽으면 실패합니다. */
  const tile = prose.match(
    /<span data-count="(\d+)">[\d,]+<\/span><u>종<\/u><\/div>\s*<div class="k">대시보드 (\d+) \+ 교실 도구 (\d+)<\/div>/);
  check('「N종」 숫자 타일을 읽을 수 있다', !!tile,
    '타일의 생김새가 바뀌었다 — 이 검사도 함께 고쳐야 한다');
  if (tile) {
    const [total, dash, tool] = [+tile[1], +tile[2], +tile[3]];
    check('숫자 타일의 큰 수 ' + total + ' 이 대시보드 ' + dash + ' + 도구 ' + tool + ' 과 같다',
      total === dash + tool, '앞에 크게 쓴 수와 밑에 적은 셈이 어긋난다');
    check('숫자 타일이 세는 도구 수가 카드 수와 같다', tool === n,
      '타일 ' + tool + '개 · 카드 ' + n + '개');
  }

  /* 「여덟」이 남아 있던 자리입니다. 지금 개수가 아닌 우리말 수사가
     본문에 있으면 그것은 옛날에 적은 말입니다. */
  /* ★ 「열한」은 「한」과 「열」을 품고 있습니다. 그냥 찾으면 지금 개수가
     옛 개수로 잘못 잡힙니다. **지금 쓰는 말을 먼저 지우고** 남은 것만 봅니다. */
  const cleaned = prose
    .split('여기 있는 ' + NUM[n]).join('여기 있는 ✓')
    .split(NUM[n] + ' 앱').join('✓ 앱');
  const wrong = NUM.slice(1).filter(w => w !== NUM[n] &&
    new RegExp('여기 있는 ' + w + '|' + w + ' 앱').test(cleaned));
  check('옛 개수를 가리키는 우리말 수사가 본문에 남아 있지 않다', wrong.length === 0,
    '남은 말: ' + wrong.join(', ') + ' (지금은 「' + NUM[n] + '」)');

  /* 머리 주석의 「앱 N종」도 낡습니다 — 실제로 앱이 아홉이 될 때까지
     「앱 5종」이었습니다. 주석은 아무도 안 읽어서 더 오래 낡습니다. */
  check('머리 주석도 같은 개수를 말한다', html.includes('앱 ' + n + '종(08)'),
    '머리 주석의 「앱 N종(08)」이 카드 수(' + n + ')와 다르다');

  /* 〔2026. 8. 12. v1〕 여기 있던 「머리 주석의 판 번호가 본문 기록보다 낡지 않았다」
     검사는 없앴습니다. **판 번호 자체를 쓰지 않기로 했기 때문**입니다.
     그 자리는 아래 「판 번호가 화면에 없다」가 대신합니다. */
}

/* 〔v0.6〕 **점검 개수를 페이지에서 뺐습니다.**
   이 페이지는 선생님이 도구를 고르러 오는 자리입니다. 「점검 264개 통과」는
   만든 사람에게 뜻이 있지 검사를 안 해 본 사람에게는 아무 뜻이 없고,
   숫자만 커서 정작 무엇을 하는 도구인지가 밀립니다.
   개수는 README 와 마스터 문서에 남습니다 — 그 자리가 만든 사람의 자리입니다.
   다시 슬그머니 돌아오지 않도록 여기서 막습니다. */
check('점검 개수를 앞에 내세우지 않는다', !/점검 [\d ,+]+개 통과/.test(html),
  '선생님은 도구를 고르러 왔지 검사 결과를 보러 오지 않았다');
check('「자동 점검 전부 통과」 같은 큰 숫자도 없다', !html.includes('자동 점검'));

/* ★ 〔2026. 8. 12. v1〕 **판 번호를 화면에서 뗐습니다.**
   여기 있던 검사는 「앱이 스스로 말하는 판 번호」와 「메인에 적힌 판 번호」가
   같은지 보는 것이었습니다. 그 검사는 제 몫을 했습니다 — 일곱 앱이 낡은 채로
   여러 판이 지나간 것을 잡아 준 자리입니다.

   그런데 이제 **판 번호를 아예 쓰지 않습니다.** 선생님에게 `v0.6` 은
   「아직 덜 됐다」로 읽히는데, 아홉 앱 모두 교실에서 쓸 수 있고 자료도 실적입니다.
   「점검 264개 통과」를 뺀 것과 같은 판단입니다.

   그래서 검사를 **뒤집습니다** — 이제 «같은가»가 아니라 «없는가»를 봅니다.
   판 이력은 `08. 실행계획(3)/apps/판 번호 이력.md` 에 있습니다.

   ※ 코드 «주석» 안의 〔v0.5〕 표시는 그대로 둡니다. 화면에 나오지 않고,
     저장한 자료를 읽는 코드에서 「이 칸은 v0.4 에서 생겼다」는 꼭 필요합니다. */
const stripComments = t => t.replace(/\/\*[\s\S]*?\*\//g, '')
                            .replace(/<!--[\s\S]*?-->/g, '')
                            .replace(/\/\/[^\n]*/g, '');

check('메인 페이지 화면에 판 번호가 없다',
  !/v0\.\d+|프로토타입/.test(stripComments(html)),
  (stripComments(html).match(/v0\.\d+|프로토타입/g) || []).slice(0, 4).join(' · '));

APPS.forEach(a => {
  const f = path.join(ROOT, '08. 실행계획(3)/apps', a, 'index.html');
  if (!fs.existsSync(f)) { check(a + ' 파일이 있다', false); return; }
  const bare = stripComments(fs.readFileSync(f, 'utf8'));
  const hit = bare.match(/v0\.\d+|프로토타입/g);
  check(a + ' 화면에 판 번호가 없다', !hit, hit ? '남은 것: ' + hit.slice(0, 3).join(' · ') : '');
});

/* 판 이력을 어딘가에는 적어 두어야 합니다 — 화면에서 뺐다고 없던 일이 되면 안 됩니다 */
check('판 번호 이력 문서가 있다',
  fs.existsSync(path.join(ROOT, '08. 실행계획(3)/apps/판 번호 이력.md')));

console.log(`\n${fail ? '✗' : '✓'}  통과 ${pass} · 실패 ${fail}\n`);
process.exit(fail ? 1 : 0);
