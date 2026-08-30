/* TEAM LEAP 앱 카탈로그 — 점검
   카탈로그가 깨지는 방식은 정해져 있다. 링크가 죽거나, 앱은 올라갔는데
   카탈로그에 적힌 판 번호가 옛것으로 남거나. 둘 다 여기서 잡는다.
   실행: node test.js */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function makeEl() {
  return {
    _html: '', hidden: false, value: '', textContent: '',
    classList: { add() {}, remove() {} }, style: {},
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
    addEventListener() {}, focus() {}, click() {},
    setAttribute(k, v) { this['_' + k] = v; }, getAttribute(k) { return this['_' + k] || null; },
    appendChild() {}, removeChild() {}, querySelector() { return makeEl(); }, querySelectorAll() { return []; }
  };
}

function run() {
  const panels = {}, store = {};
  const sandbox = {
    console, __LEAP_TEST__: {},
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
    matchMedia: () => ({ matches: false }),
    document: {
      getElementById(id) { if (!panels[id]) panels[id] = makeEl(); return panels[id]; },
      createElement: makeEl, body: { appendChild() {}, removeChild() {} }, documentElement: makeEl()
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(js, sandbox, { timeout: 5000 });
  return sandbox.__LEAP_TEST__.hook;
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  실패 ' + name + (extra ? '\n       ' + extra : '')); }
}

/* 카탈로그가 광고하는 앱 — 폴더 / 화면에 적힌 판 번호 */
const CLAIMS = [
  { dir: 'a-circuit',    name: '순회교사 통합 시간표' },
  { dir: 'b-classboard', name: '학급 회의' },
  { dir: 'c-storybook',  name: '지역 탐방 디지털 스토리북' },
  { dir: 'd-multigrade', name: '복식학급 수업 도우미' },
  { dir: 'e-together',   name: '이웃 학교 함께하기' },
  { dir: 'f-lessonplan', name: '수업 설계안 만들기' },
  { dir: 'g-classdata',  name: '우리 반 데이터 보기' },
  { dir: 'i-required',   name: '법정 의무교육 점검표' },
  { dir: 'j-howmany',    name: '몇 명이면 되나' },
  { dir: 'k-year',       name: '우리 학교 한 해' },
  { dir: 'l-rooms',      name: '남는 교실' }
];

/* 〔2026. 8. 30.〕 **내린 앱.** 주소를 그냥 없애면 즐겨찾기로 오신 분이 404 를
   만나고, 적어 두신 자료를 꺼낼 길도 사라집니다. 그 자리에 안내 쪽을 세우고
   12월 배포 때 걷습니다. 앱이 아니므로 위 검사는 받지 않습니다. */
const RETIRED = [
  { dir: 'i-hours',   name: '교육과정 시수 짜기',   when: '2026. 8. 7.' },
  { dir: 'h-project', name: '프로젝트 학습 계획서', when: '2026. 8. 30.' }
];

console.log('\n[1] 링크가 살아 있다 — 카탈로그가 깨지는 첫 번째 방식');
const hrefs = [...html.matchAll(/href="\.\/([^"]+)"/g)].map(m => m[1]);
check('앱마다 열기·설명서 링크 + 활용 가이드가 있다',
  hrefs.length === CLAIMS.length * 2 + 1, hrefs.join(' '));
check('활용 가이드로 가는 길이 있다', hrefs.includes('guide.html'));
hrefs.forEach(h => {
  check('파일이 실제로 있다 — ' + h, fs.existsSync(path.join(__dirname, h)));
});
CLAIMS.forEach(c => {
  check(c.dir + ' 열기 링크', hrefs.includes(c.dir + '/index.html'));
});

/* ★ 〔2026. 8. 12. v1〕 여기는 「카탈로그에 적어 둔 판 번호가 앱과 같은가」를
   보던 자리입니다. 그 검사는 제 몫을 했습니다 — 카탈로그가 낡는 두 번째 방식이
   바로 판 번호였습니다.

   그런데 **판 번호를 아예 쓰지 않기로 했습니다.** 선생님에게 `v0.6` 은
   「아직 덜 됐다」로 읽히는데, 아홉 앱 모두 교실에서 쓸 수 있습니다.
   그래서 «같은가»가 아니라 **«없는가»**를 봅니다.
   판 이력은 `판 번호 이력.md` 에 있습니다. */
console.log('\n[2] 판 번호를 화면에 두지 않는다 — 두 번째 방식');
const bareOf = t => t.replace(/\/\*[\s\S]*?\*\//g, '')
                     .replace(/<!--[\s\S]*?-->/g, '')
                     .replace(/\/\/[^\n]*/g, '');
check('카탈로그 화면에 판 번호가 없다', !/v0\.\d+|프로토타입/.test(bareOf(html)),
  (bareOf(html).match(/v0\.\d+|프로토타입/g) || []).slice(0, 4).join(' · '));
CLAIMS.forEach(c => {
  const app = fs.readFileSync(path.join(__dirname, c.dir, 'index.html'), 'utf8');
  const hit = bareOf(app).match(/v0\.\d+|프로토타입/g);
  check(c.dir + ' 화면에 판 번호가 없다', !hit, hit ? '남은 것: ' + hit.slice(0, 3).join(' · ') : '');
  check(c.dir + ' 이름이 같다', app.includes(c.name) && html.includes(c.name));
});
check('판 번호 이력 문서가 있다', fs.existsSync(path.join(__dirname, '판 번호 이력.md')));

/* 문서가 무엇을 불러오는지는 「마크업」을 봐야 한다.
   스크립트 안의 문자열까지 세면 앱 C가 EPUB 안에 넣는 style.css 같은 것이
   바깥 파일로 잘못 잡힌다. 그건 EPUB 꾸러미 내부라 이 앱과 무관하다. */
const markupOf = s => s.replace(/<script[\s\S]*?<\/script>/g, '<script></script>');

console.log('\n[3] 다섯 앱이 정말 카탈로그 말대로인가');
CLAIMS.forEach(c => {
  const app = fs.readFileSync(path.join(__dirname, c.dir, 'index.html'), 'utf8');
  check(c.dir + ' — 서버를 부르지 않는다',
    !/fetch\s*\(|XMLHttpRequest|new WebSocket/.test(app),
    '"어떤 자료도 외부로 전송하지 않습니다"가 사실이어야 한다');
  check(c.dir + ' — 파일 하나로 끝난다',
    !/<script[^>]+src=|<link[^>]+stylesheet/.test(markupOf(app)), '"파일 하나를 브라우저로 열면 끝"');
  check(c.dir + ' — 인쇄 서식이 있다', /@media\s+print/.test(app));
  check(c.dir + ' — 저작권이 있다', app.includes('2026 TEAM LEAP'));
});

/* ★ 〔2026. 8. 30.〕 사본이 «이름»만 같고 «속»이 다르던 자리입니다.

   앱마다 있는 「kit 사본이 낡지 않았는가」 검사는 **앱이 부르는 창구가
   사본에 정의되어 있는가**만 봅니다. 이름만 보고 속은 안 봅니다.
   그래서 `LEAP.store.update` 가 두 갈래로 갈린 것을 아무도 못 봤습니다 —

     A · C · D · E   update:function(fn){ … return flush(); }   ← 저장됐는지를 돌려줌
     B · F · G · H · I   update:function(fn){ … flush(); return d; }   ← 늘 참

   앱 H 는 `if (db.update(fn)) return true;` 로 저장 실패를 잡으려 했는데,
   자료 객체는 늘 참이라 **되돌리기와 「저장 공간이 가득 찼습니다」가
   한 번도 실행되지 않았습니다.** 하필 사진을 담는 앱입니다.

   저장 한 줄은 아홉 앱이 같아야 합니다. 여기서 글자까지 맞춰 둡니다. */
console.log('\n[3-2] 저장 창구가 아홉 앱에서 같은가 — 이름 말고 속');

const STORE_UPDATE = 'update:function(fn){var d=read();fn(d);return flush();}';
CLAIMS.forEach(c => {
  const app = fs.readFileSync(path.join(__dirname, c.dir, 'index.html'), 'utf8');
  check(c.dir + ' — update() 가 저장됐는지를 돌려준다',
    app.includes(STORE_UPDATE),
    '자료를 돌려주면 늘 참이 되어, 부르는 쪽이 저장 실패를 성공으로 읽는다');
});
check('kit 원본도 같은 모양이다',
  /update:\s*function\s*\(fn\)\s*\{\s*var d = read\(\);\s*fn\(d\);\s*return flush\(\);\s*\}/
    .test(fs.readFileSync(path.join(__dirname, 'kit', 'leap.js'), 'utf8')),
  '원본이 옛것이면 다음 앱에 옛것이 다시 번진다');

/* ★ 〔2026. 8. 30.〕 설명서가 조용히 낡던 자리입니다.

   아홉 설명서 가운데 **여덟이** 검사 개수를 틀리게 적고 있었습니다
   (105↔107 · 268↔269 · 245↔246 · 293↔294 · 178↔179 · 312↔314 · 94↔95 · 281↔282).
   전부 1~2개씩 — 검사를 늘리고 문서를 안 고친 자국입니다.

   손으로 적는 한 계속 어긋납니다. 그래서 **여기서 실제로 돌려 봅니다.**
   아홉 앱을 다 돌려도 1초입니다. 설명서에 「146개」라고 적어 두었으면
   `node test.js` 가 정말 146개를 세는지 확인합니다. */
console.log('\n[3-3] 설명서에 적힌 검사 개수가 실제와 같은가');

const { execFileSync } = require('child_process');
CLAIMS.forEach(c => {
  const dir = path.join(__dirname, c.dir);
  const md = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
  /* 설명서가 `node test.js` 곁에 적어 둔 수를 모읍니다 —
     「**146개**」 · 「(179개)」 · 「# 314개」 · 「— 107개 통과」 어느 모양이든. */
  const said = [...md.matchAll(/node test\.js[^\n]*?(\d[\d,]*)\s*개/g)]
    .map(m => Number(m[1].replace(/,/g, '')));
  const out = execFileSync('node', ['test.js'], { cwd: dir, encoding: 'utf8' });
  const real = Number(/(\d+)개 통과/.exec(out.trim().split('\n').pop())[1]);

  check(c.dir + ' — 설명서가 개수를 적어 두었다', said.length > 0,
    '`node test.js` 곁에 몇 개인지 적으면 여기서 지켜 드립니다');
  const wrong = said.filter(n => n !== real && n !== 42);   /* 42 는 앱 C 의 EPUB 검사 */
  check(c.dir + ' — 적어 둔 개수가 ' + real + '개와 같다', wrong.length === 0,
    wrong.length ? '설명서에 남은 옛 수: ' + wrong.join(' · ') : '');
});

/* ★ 〔2026. 8. 30.〕 선언만 하고 지키지 않던 약속.

   아홉 앱이 창에 `role="dialog" aria-modal="true"` 를 걸어 두었습니다.
   그것은 **읽어 주는 기계에게 하는 약속**입니다 — 「이 창 밖은 지금 없는 셈 치라」.
   그런데 **Tab 을 막는 코드가 한 곳도 없었습니다.** 초점은 창 뒤로 그냥 넘어갔고,
   화면을 안 보는 분은 자기가 창 안에 있는지 밖에 있는지 알 수 없었습니다.
   카탈로그는 그 사이 「키보드만으로 전부 조작됩니다」라고 적고 있었습니다.

   `LEAP.guardModals()` 가 문서에 한 번 걸려 그때그때 열린 창을 가둡니다.
   창마다 손댈 필요가 없으므로, 나중에 창이 늘어도 저절로 지켜집니다. */
console.log('\n[3-4] 창을 열면 초점이 그 안에 머무는가');

CLAIMS.forEach(c => {
  const app = fs.readFileSync(path.join(__dirname, c.dir, 'index.html'), 'utf8');
  check(c.dir + ' — 창에 role=dialog · aria-modal 을 건다',
    /role="dialog" aria-modal="true"/.test(app),
    '읽어 주는 기계는 이 표시가 없으면 그냥 글 상자로 읽는다');
  check(c.dir + ' — 초점 가두기를 갖고 있다', app.includes('LEAP.guardModals=function()'),
    'aria-modal 을 선언해 놓고 Tab 을 막지 않으면 없느니만 못하다');
  check(c.dir + ' — 시작할 때 실제로 건다', /LEAP\.guardModals\(\);/.test(app.replace('LEAP.guardModals=function()', '')),
    '정의만 하고 부르지 않으면 아무 일도 일어나지 않는다');
});

/* ★ 〔2026. 8. 30.〕 앱 A 가 v0.3 에서 겪고 적어 둔 함정(마스터 27번)인데
   **세 앱이 그대로 남아 있었습니다** — 앱 C · E · G.

   브라우저는 「PDF 로 저장」의 파일 이름에 `document.title` 을 씁니다.
   그대로 두면 몇 번을 뽑아도 이름이 같습니다. 앱 E 가 특히 아팠습니다 —
   **제안서는 학교마다 다른데** 세 학교에 보내려고 세 번 뽑으면
   세 파일이 모두 「이웃 학교 함께하기 — TEAM LEAP.pdf」였습니다.
   전화를 걸기 전에 어느 것이 어느 학교 것인지 알 수 없습니다. */
console.log('\n[3-5] 뽑은 종이가 저마다 다른 이름을 갖는가');

CLAIMS.forEach(c => {
  const app = fs.readFileSync(path.join(__dirname, c.dir, 'index.html'), 'utf8');
  check(c.dir + ' — 인쇄하는 동안만 제목을 바꾼다', /document\.title\s*=/.test(app),
    'document.title 이 곧 PDF 파일 이름이다');
  check(c.dir + ' — afterprint 로 되돌린다', app.includes("'afterprint'"),
    '되돌리지 않으면 창 제목이 파일 이름인 채로 남는다');
  check(c.dir + ' — 안 오는 브라우저를 위한 안전망', /setTimeout\(back2?/.test(app),
    'afterprint 가 오지 않는 브라우저가 있다');
  check(c.dir + ' — 이름에 날짜가 들어간다', /LEAP\.todayISO\(\)/.test(app));
});

/* ★ 〔2026. 8. 30.〕 이름표가 어느 칸에도 안 붙어 있던 자리.

   앱 H 는 `<label>교과</label><select …>` 처럼 **이름표와 칸을 나란히만** 두었습니다.
   화면으로 보는 사람에게는 이름표지만, HTML 상으로는 남남입니다 —
   읽어 주는 기계는 「편집란」이라고만 읽습니다. 평가 칸이 여섯 개 나란히 있으면
   무엇이 무엇인지 알 수 없습니다. 앱 F 는 `<p class="mini">도구</p>` 로 같은 일을 했습니다.

   `placeholder` 는 이름이 아닙니다 — **글자를 넣는 순간 사라집니다.**
   그래서 여기서는 placeholder 를 이름으로 쳐 주지 않습니다.

   붙이는 길은 셋입니다. `<label for>` · `aria-label` · (묶음이면) `aria-labelledby`.
   앱마다 `fld()` 도우미가 있어 대부분은 그것이 붙여 줍니다. */
console.log('\n[3-6] 적는 칸마다 이름이 붙어 있는가');

CLAIMS.forEach(c => {
  const app = fs.readFileSync(path.join(__dirname, c.dir, 'index.html'), 'utf8');
  /* <label for="…"> 이 가리키는 id — 만드는 중에 이어 붙이는 것이라 따옴표 앞까지만 본다 */
  const forId = new Set([...app.matchAll(/<label[^>]*\bfor="([^"']*)/g)].map(m => m[1]));
  /* fld('이름', '<input … id="x">') — 도우미가 for 를 붙여 준다 */
  const byFld = new Set([...app.matchAll(/fld\([^)]*?id="([^"]+)"/gs)].map(m => m[1]));
  const fields = app.match(/<(?:input|select|textarea)\b[^>]*>/g) || [];
  const nameless = fields.filter(t => {
    if (/aria-label|aria-labelledby|title=|type="(hidden|checkbox|radio)"/.test(t)) return false;
    const m = /\bid="([^"']*)/.exec(t);
    if (m && (forId.has(m[1]) || byFld.has(m[1]))) return false;
    return true;
  });
  check(c.dir + ' — 칸 ' + fields.length + '개가 모두 이름을 갖는다', nameless.length === 0,
    nameless.length ? '이름 없는 칸 ' + nameless.length + '개 — ' +
      nameless[0].replace(/\s+/g, ' ').slice(0, 80) : '');
});

/* ★ 〔2026. 8. 30.〕 내보낸 파일이 «어느 앱 것인지» 말하지 않던 자리.

   아홉 앱이 모두 `{v: 1, …}` 로 내보냅니다. 받는 쪽이 `v` 만 보면 전부 통과합니다 —
   앱 B 가 실제로 그랬습니다. 앱 A 의 시간표 파일을 「회의 0건」이라고 읽고
   갈림길을 열었고, 「그냥 바꾸기」를 누르면 학급 자료가 통째로 사라졌습니다.

   모양(어떤 칸이 있는가)으로만 가리면 두 앱의 모양이 닮는 순간 다시 뚫립니다.
   앱 H ↔ 앱 I 가 그랬습니다 — 둘 다 `info` 를 갖고 있었습니다.
   이제 **이름을 적고 읽습니다.** 「「법정 의무교육 점검표」에서 내보낸
   파일입니다」라고 어느 앱 것인지 대며 되돌립니다.

   앱 E 는 처음부터 `app:` 을 적고 있었는데 **적기만 하고 읽지 않았습니다.**
   반쪽짜리 안전장치가 가장 위험합니다 — 있는 줄 알기 때문입니다. */
console.log('\n[3-7] 내보낸 파일이 어느 앱 것인지 말하는가');

const APP_IDS = {
  'a-circuit': 'leap-circuit', 'b-classboard': 'leap-classboard',
  'c-storybook': 'leap-storybook', 'd-multigrade': 'leap-multigrade',
  'e-together': 'leap-together', 'f-lessonplan': 'leap-lessonplan',
  'g-classdata': 'leap-classdata', 'i-required': 'leap-required',
  'j-howmany': 'leap-howmany', 'k-year': 'leap-year', 'l-rooms': 'leap-rooms'
};
CLAIMS.forEach(c => {
  const app = fs.readFileSync(path.join(__dirname, c.dir, 'index.html'), 'utf8');
  check(c.dir + ' — 자기 표시를 갖는다', app.includes("APP_ID = '" + APP_IDS[c.dir] + "'"),
    '아홉 앱이 서로 다른 표시를 가져야 가려낼 수 있다');
  check(c.dir + ' — 내보낼 때 표시를 적는다',
    /LEAP\.stamp\(APP_ID/.test(app) || /app: APP_ID/.test(app));
  check(c.dir + ' — 가져올 때 표시를 읽는다', /LEAP\.otherApp\(APP_ID/.test(app),
    '적기만 하고 읽지 않으면 없느니만 못하다 — 앱 E 가 그랬다');
  check(c.dir + ' — 되돌릴 때 어느 앱 것인지 댄다',
    /에서 내보낸 파일입니다/.test(app),
    '「이 앱 파일이 아닙니다」만으로는 어디서 온 것인지 알 수 없다');
});
/* 아홉 이름이 한 곳에 모여 있어야 서로를 부를 수 있습니다 */
CLAIMS.forEach(c => {
  const app = fs.readFileSync(path.join(__dirname, c.dir, 'index.html'), 'utf8');
  const known = Object.values(APP_IDS).filter(id => app.includes("'" + id + "'"));
  check(c.dir + ' — 다른 앱의 이름을 다 알고 있다', known.length === CLAIMS.length,
    '모르는 표시는 「다른 앱」으로만 말하게 된다 — ' + known.length + '개만 앎');
});

/* ★ 〔2026. 8. 30.〕 앱 안에서 설명서로 갈 길이 없던 자리.

   아홉 앱 머리에 나가는 길은 「메인으로」 하나뿐이었습니다.
   앱 I 를 쓰다가 「이거 어떻게 쓰는 거지」 하면 **앱 안에서는 길이 없었습니다** —
   메인으로 나가 아래로 스크롤해 그 앱 카드를 다시 찾아야 했습니다.
   설명서는 앱 폴더 안에 나란히 있는데(`./README.html`) 링크 한 줄이 없었습니다. */
console.log('\n[3-8] 앱 안에서 설명서로 갈 수 있는가');

CLAIMS.forEach(c => {
  const app = fs.readFileSync(path.join(__dirname, c.dir, 'index.html'), 'utf8');
  const head = app.slice(app.indexOf('top-actions'), app.indexOf('</header>'));
  check(c.dir + ' — 머리에 설명서로 가는 길이 있다', /href="\.\/README\.html"/.test(head),
    '설명서는 앱 폴더에 나란히 있다. 링크 한 줄이면 닿는다');
  check(c.dir + ' — 그 설명서가 실제로 있다',
    fs.existsSync(path.join(__dirname, c.dir, 'README.html')));
  check(c.dir + ' — 머리에 메인으로 가는 길도 있다', head.includes('메인으로'));
});

/* ★ 〔2026. 8. 30.〕 「kit 은 원본입니다」가 사실이 아니던 자리.

   `apps/README.md` 는 「원본을 고치면 앱 안의 블록도 함께 고쳐야 합니다」라고
   적어 두었습니다. **실제로는 반대로 흘렀습니다** — 아홉 앱이 앞서 가고
   kit 이 뒤에 남았습니다. 모서리가 10px 대 14px, 그림자가 달랐고,
   아홉 앱이 쓰는 `--tint-*` · `--grad-*` · `--solid-*` 는 kit 에 아예 없었습니다.
   **원본에서 베껴 가는 사람은 화면이 깨집니다.**

   앱마다 있는 「kit 사본이 낡지 않았는가」 검사는 **JS 창구 이름**만 봅니다.
   CSS 는 아무도 안 보고 있었습니다. 여기서 봅니다.

   앱만의 토큰(`--grad-win`·`--h0`·`--solid-blue` 같은 것)은 kit 에 없어도 됩니다.
   막는 것은 **같은 이름이 서로 다른 값을 갖는 일**입니다 — 그때 원본이 거짓말을 합니다. */
console.log('\n[3-9] kit 의 토큰이 아홉 앱과 같은가 — CSS 도 본다');

const tokensOf = (css, from) => {
  const i = css.indexOf(from);
  if (i < 0) return null;
  const j = css.indexOf('\n}', i);
  const out = {};
  for (const m of css.slice(i, j).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]] = m[2].replace(/\s+/g, '');
  }
  return out;
};
const kitCss = fs.readFileSync(path.join(__dirname, 'kit', 'leap.css'), 'utf8');
const kitTok = tokensOf(kitCss, ':root {');
check('kit 이 토큰을 갖고 있다', kitTok && Object.keys(kitTok).length > 20);
check('kit 의 모서리가 14px 다', kitTok['--leap-radius'] === '14px',
  'kit 이 10px 로 남아 있으면 베껴 간 화면이 앱과 다르게 보인다');
check('kit 이 옅은 바탕·그러데이션을 갖고 있다',
  !!(kitTok['--tint-blue'] && kitTok['--grad-head'] && kitTok['--solid-teal']),
  '아홉 앱이 쓰는데 원본에 없으면 베껴 간 사람의 화면이 깨진다');

CLAIMS.forEach(c => {
  const app = fs.readFileSync(path.join(__dirname, c.dir, 'index.html'), 'utf8');
  const t = tokensOf(app, ':root{');
  const clash = Object.keys(t).filter(k => kitTok[k] !== undefined && kitTok[k] !== t[k]);
  check(c.dir + ' — kit 과 같은 이름이면 같은 값이다', clash.length === 0,
    clash.map(k => k + ': 앱=' + t[k] + ' / kit=' + kitTok[k]).join(' · '));
});

/* ★ 〔2026. 8. 30.〕 3단계에서 손본 자리들 */
console.log('\n[3-10] 잔손질이 아홉 앱에 고르게 들어갔는가');

CLAIMS.forEach(c => {
  const app = fs.readFileSync(path.join(__dirname, c.dir, 'index.html'), 'utf8');

  /* ① 본문 바로가기 — 머리 단추 넷과 탭 대여섯을 매번 지나지 않도록 */
  check(c.dir + ' — 본문으로 건너뛰는 길이 있다',
    /<a class="skip" href="#main">/.test(app) && /id="main"/.test(app),
    '키보드만 쓰는 분은 화면을 열 때마다 머리를 통째로 지나야 한다');

  /* ② 다른 창이 고쳤을 때 — 조용히 덮어쓰지 않는다 */
  check(c.dir + ' — 다른 창의 저장을 알아챈다',
    /LEAP\.watchOtherTabs\('leap-[a-z]+-v1'\)/.test(app),
    '두 창을 열면 늦게 고친 쪽이 앞의 것을 통째로 덮어쓴다');

  /* ③ 작은 단추도 손가락이 닿는 크기 */
  const sm = /\.btn--sm\{([^}]*)\}/.exec(app);
  check(c.dir + ' — 작은 단추가 44px 이다',
    !!sm && /min-height:44px/.test(sm[1]),
    sm ? '지금: ' + sm[1] : '.btn--sm 이 없다');

  /* ④ 인쇄에서 일하는 화면을 통째로 숨긴다 —
     패널 이름을 하나하나 적으면 탭이 늘 때 조용히 새어 나온다 */
  const printCss = [...app.matchAll(/@media\s+print\s*\{([\s\S]*?)\n\}/g)].map(m => m[1]).join('\n');
  const hidesMain = [...printCss.matchAll(/([^{}]+)\{[^}]*display\s*:\s*none[^}]*\}/g)]
    .some(m => /(^|[\s,])main([\s,.{]|$)/.test(m[1]));
  check(c.dir + ' — 인쇄에서 일하는 화면을 숨긴다', hidesMain,
    '#panel-… 을 나열해 숨기면 탭을 늘릴 때 종이 뒤에 화면이 찍힌다');

  /* ⑤ 종이의 색이 종이에서도 남는다 */
  check(c.dir + ' — 인쇄에서 색을 지우지 않는다',
    /print-color-adjust\s*:\s*exact/.test(app),
    '브라우저는 인쇄할 때 배경색을 기본으로 지운다');
});

/* ⑥ 화면의 최상위 제목은 하나 — 종이 제목은 h2 로 낮춘다.
   앱 C 의 h1 셋 가운데 둘은 EPUB 안의 «다른 문서»라 여기서 세지 않는다. */
CLAIMS.forEach(c => {
  const app = fs.readFileSync(path.join(__dirname, c.dir, 'index.html'), 'utf8');
  const body = app.slice(app.indexOf('<body>'));
  const epubFree = body.replace(/xml\(|xhtml\(/g, '');
  const n = (body.match(/<h1[\s>]/g) || []).length;
  const inEpub = (body.match(/<h1>' \+ xml\(/g) || []).length +
                 (body.match(/<h1>차례<\/h1>/g) || []).length;
  check(c.dir + ' — 화면의 최상위 제목이 하나다', n - inEpub === 1,
    '미리보기를 열면 종이 제목과 화면 제목이 한 화면에 놓인다 — ' +
    (n - inEpub) + '개');
});

/* ⑦ 탭이 주소에 남는다 — 새로고침·뒤로 가기·링크 공유 */
CLAIMS.forEach(c => {
  const app = fs.readFileSync(path.join(__dirname, c.dir, 'index.html'), 'utf8');
  /* 앱 H·I 는 걸음 탭을 따로 써서 initTabs 를 «부르지» 않습니다.
     사본에 정의만 남아 있으므로, 있는지가 아니라 **부르는지**를 봅니다. */
  if (!/LEAP\.initTabs\((?!listEl)/.test(app)) return;
  /* 〔8. 30.〕 처음에는 `location.hash` 에 적었는데, 그러면 **브라우저가 그 자리로
     화면을 끌어내려** 머리(앱 이름·단추)가 화면 밖으로 사라졌습니다. 실제로 그랬습니다.
     지금은 `history.pushState` 로 조용히 적습니다 — 주소는 남고 화면은 안 움직입니다. */
  check(c.dir + ' — 탭이 주소에 남는다', /history\.pushState\(\{leapTab:id\}/.test(app),
    '새로고침하면 늘 첫 탭으로 돌아가고, 뒤로 가기는 앱을 떠난다');
  check(c.dir + ' — 주소를 적느라 화면을 끌어내리지 않는다',
    !/location\.hash\s*=\s*['"]?#/.test(app),
    'location.hash 로 적으면 브라우저가 그 자리로 화면을 밀어 머리가 사라진다');
  check(c.dir + ' — 뒤로 가기를 받는다', /'popstate'/.test(app) && /'hashchange'/.test(app));
  check(c.dir + ' — 모르는 표시에는 반응하지 않는다', /ids\.indexOf/.test(app),
    '「본문으로 건너뛰기」가 넣는 #main 에 탭이 반응하면 안 된다');
});

/* ★ 〔2026. 8. 30.〕 「종이」가 따로 있는 탭이던 자리.
   그래서 다 적고 나서야 무엇이 나오는지 알았고, 한 쪽에 안 들어가는 것도
   그때 알았습니다. 앱 F 만 v0.3 에서 고쳤고 나머지는 그대로였습니다.
   이제 **왼쪽에서 적고 오른쪽에서 봅니다.** */
console.log('\n[3-11] 왼쪽에서 적고 오른쪽에서 보는가');

/* 앱 C 는 책 편집 화면이 곧 책 쪽이라(WYSIWYG) 오른쪽에 또 둘 것이 없습니다.
   앱 G 는 재구성 중입니다. 둘은 여기서 빼고, 뺀 사실을 적어 둡니다. */
const NO_SPLIT = { 'c-storybook': '편집 화면이 곧 책 쪽입니다 (WYSIWYG)' };
CLAIMS.forEach(c => {
  if (NO_SPLIT[c.dir]) return;
  const app = fs.readFileSync(path.join(__dirname, c.dir, 'index.html'), 'utf8');
  const twoCol = /class="wb"/.test(app) || /class="split"/.test(app) || /docgrid/.test(app);
  check(c.dir + ' — 일하는 화면이 좌·우로 나뉜다', twoCol,
    '「종이」가 따로 있는 탭이면 다 적고 나서야 무엇이 나오는지 알게 된다');
  check(c.dir + ' — 오른쪽이 붙어서 따라온다',
    /\.wb-out\{position:sticky|\.side\{position:sticky|\.docpv\{[^}]*position:sticky/.test(app),
    '왼쪽을 스크롤하면 종이가 사라져 버린다');
});
check('종이를 상자에 맞춰 줄이는 창구가 원본에 있다',
  fs.readFileSync(path.join(__dirname, 'kit', 'leap.js'), 'utf8').includes('LEAP.fitPaper'));

console.log('\n[3-12] 내린 앱이 제 몫을 하는가');
RETIRED.forEach(r => {
  const f = path.join(__dirname, r.dir, 'index.html');
  check(r.dir + ' — 자리에 안내 쪽이 있다', fs.existsSync(f));
  if (!fs.existsSync(f)) return;
  const t = fs.readFileSync(f, 'utf8');
  check(r.dir + ' — 내렸다고 말한다', t.includes('내렸습니다'));
  check(r.dir + ' — 언제 내렸는지 적는다', t.includes(r.when));
  check(r.dir + ' — 왜 내렸는지 적는다', t.includes('왜 내렸나'));
  check(r.dir + ' — ★ 적어 두신 것을 꺼내 갈 길이 있다',
    t.includes('파일로 내려받기'),
    '말없이 없애면 그 브라우저에 남은 자료를 꺼낼 길이 사라진다');
  check(r.dir + ' — 갈 곳을 알려 준다', /href="\.\.\/[a-z-]+\/index\.html"/.test(t));
  check(r.dir + ' — 검색에 잡히지 않게 한다', t.includes('name="robots" content="noindex"'));
  check(r.dir + ' — 카탈로그가 광고하지 않는다',
    !CLAIMS.some(c => c.dir === r.dir) && !html.includes(r.dir + '/index.html'),
    '내린 앱을 목록에 두면 「열기」를 눌렀다가 안내 쪽을 만난다');
});

console.log('\n[4] 카탈로그 자신도 같은 원칙을 지킨다');
check('서버를 부르지 않는다', !/fetch\s*\(|XMLHttpRequest|WebSocket/.test(html));
check('바깥 파일을 불러오지 않는다', !/<script[^>]+src=|<link[^>]+stylesheet/.test(markupOf(html)));
check('인쇄 서식이 있다', /@media\s+print/.test(html));
check('저작권이 있다', html.includes('© 2026 TEAM LEAP'));
check('다크 모드를 받는다', html.includes('prefers-color-scheme'));
check('움직임 줄이기를 존중한다', html.includes('prefers-reduced-motion'));
check('화면 전환 키를 앱과 함께 쓴다', html.includes("'leap-theme'"),
  '카탈로그에서 바꾼 화면이 앱에서도 유지되어야 한다');

console.log('\n[5] 왜 이 앱들인가 — 근거를 화면에 적었나');
check('학령인구 감소에서 시작한다', html.includes('학령인구 감소'));
check('소규모학교 · 복식학급으로 잇는다',
  html.includes('소규모학교 증가') && html.includes('복식학급'));
check('작은 학급이 다른 문제라고 말한다', html.includes('큰 학급의 축소판이 아니라'));

console.log('\n[6] 공통 원칙 다섯 가지를 적었나');
['설치가 없습니다', '이 기기 안에만', '학생 이름을 받지 않습니다', '종이로 나옵니다', '누구나 씁니다']
  .forEach(t => check('「' + t + '」', html.includes(t)));

/* ★ 〔2026. 8. 30.〕 여기는 오래 비어 있던 자리입니다.
   위의 검사는 「'학생 이름을 받지 않습니다' 라는 **문장이 있는가**」만 봅니다.
   **그 말이 참인가는 보지 않습니다.**

   앱 G 가 v0.4 에서 상담을 위해 이름 칸을 넣는 동안 이 검사는 조용했습니다.
   그래서 카탈로그가, 그리고 학교로 나가는 종이 안내문이 다섯 달 가까이
   「이름 칸을 아예 만들지 않았습니다 — 개인정보 영향평가 없이 쓸 수 있게」라고
   말했습니다. 서버 호출은 아홉 앱 소스를 실제로 뒤져 확인하면서(위 [3]),
   **개인정보는 문장만 세고 있었습니다.**

   이제 «누가 이름을 받는가»를 여기 적어 두고, 카탈로그·종이·그 앱이
   모두 같은 말을 하는지 봅니다.

   한계를 밝혀 둡니다 — 이 검사는 «앱이 이름을 받기 시작한 것»을 스스로
   알아내지 못합니다. 「학생 이름」은 코드에서 다른 것과 구별되는 모양이
   없기 때문입니다(앱 C·F·I 도 저마다 다른 뜻으로 `names` 를 씁니다).
   대신 **이 목록을 고치지 않으면 검사가 깨지도록** 묶어 두었습니다.
   앱에 이름 칸을 넣는 사람은 여기를 지나가게 됩니다. */
console.log('\n[6-2] 이름을 받는 앱을 이름 대어 밝히는가 — 문장이 아니라 사실');

const TAKES_NAME = [
  { dir: 'g-classdata', k: '앱 G', why: '상담 자리에서 「16번」을 다시 이름으로 옮겨 적지 않도록' }
];
const NO_NAME = CLAIMS.filter(c => !TAKES_NAME.some(t => t.dir === c.dir));

/* 몇 앱인지는 앱이 늘 때마다 바뀝니다. 손으로 적은 수와 실제를 맞춰 봅니다. */
const NUM = ['한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열',
             '열한', '열두', '열세'];
check('앱 전체를 뭉뚱그려 「이름을 받지 않는다」고 말하지 않는다',
  !html.includes('<b>학생 이름을 받지 않습니다</b>'),
  '앱 G 가 이름을 받으므로 「모든 앱」으로 읽히면 거짓이 된다');
check('몇 앱이 안 받는지 수가 맞는다',
  html.includes(NUM[NO_NAME.length - 1] + ' 앱은 학생 이름을 받지 않습니다'),
  '실제로 ' + NO_NAME.length + '개 — 카탈로그가 적은 수와 맞아야 한다');

TAKES_NAME.forEach(t => {
  check(t.k + ' 가 이름을 받는다는 것을 카탈로그가 밝힌다',
    html.includes('이 앱만 학생 이름을 받습니다'),
    '이름을 받는 앱은 그 카드에서 스스로 밝혀야 한다');

  const app = fs.readFileSync(path.join(__dirname, t.dir, 'index.html'), 'utf8');
  check(t.k + ' 가 실제로 이름 칸을 갖고 있다', /data-nm=/.test(app),
    '목록에 적어 두었는데 앱에 없다면 목록이 낡은 것이다');
  check(t.k + ' 가 이름을 AI 로 내보내지 않는다',
    app.includes('개별 학생의 이름은 없고 번호뿐입니다'),
    '이름을 받는 앱은 그 이름이 어디까지 가는지 프롬프트에 적어야 한다');
});


console.log('\n[7] 나눠 주는 법');
check('폴더째 복사하라고 알린다', html.includes('통째로'));
check('앱 하나만 줄 수도 있다고 알린다', html.includes('앱 하나만'));
check('자료가 옮겨지지 않는다고 알린다', html.includes('내보내기'));

console.log('\n[8] 종이 안내문');
const hook = run();
const p = hook.printHTML();
check('제목이 있다', p.includes('TEAM LEAP 앱 9종'));
CLAIMS.forEach(c => check('종이에 ' + c.name + '이 있다', p.includes(c.name)));
check('누구를 위한 것인지 적는다', p.includes('이런 분께'));
check('여는 방법이 적힌다', p.includes('index.html'));
check('공통 원칙이 적힌다', p.includes('학생 이름을 받지 않습니다'));
/* 학교로 돌리는 종이가 화면과 다른 말을 하면 안 됩니다 — [6-2] 참고 */
check('종이도 앱 G 를 이름 대어 밝힌다',
  /[가-힣]+ 앱은 학생 이름을 받지 않습니다/.test(p) && p.includes('앱 G'),
  '종이는 되돌릴 수 없습니다. 뽑아서 돌린 뒤에는 고칠 수 없습니다');
check('저작권이 들어간다', p.includes('2026 TEAM LEAP'));
check('종이에는 링크를 넣지 않는다', !p.includes('href='),
  '종이에서 누를 수 없는 것을 넣지 않는다');
check('화면과 종이가 같은 앱 목록을 쓴다', hook.APPS.length === CLAIMS.length);

console.log('\n[9] 접근성');
// 종이 안내문에도 h1 이 하나 있지만 그건 인쇄될 때만 나타나고,
// 그때는 머리글이 display:none 이라 화면·종이 각각 h1 이 하나씩이다.
check('화면의 제목이 하나뿐(h1)', (markupOf(html).match(/<h1[ >]/g) || []).length === 1);
check('꾸밈 그림은 읽지 않는다',
  (html.match(/aria-hidden="true"/g) || []).length >= 8);
check('앱마다 문서 조각(article)으로 나눴다',
  (html.match(/<article class="app/g) || []).length === CLAIMS.length);
check('화살표는 글자가 아니라 꾸밈으로 처리',
  /<b aria-hidden="true">→<\/b>/.test(html), '스크린리더가 "오른쪽 화살표"를 읽으면 방해가 된다');

console.log('\n[10] 앞에 내세우는 것');
/* 〔v0.6〕 카탈로그도 **점검 개수를 앞에 내세우지 않습니다.**
   선생님은 도구를 고르러 왔지 검사 결과를 보러 오지 않았습니다.
   개수는 README 와 마스터 문서에 남습니다 — 그 자리가 만든 사람의 자리입니다. */
check('점검 개수를 앞에 내세우지 않는다', !/점검 [\d ,+]+개 통과/.test(html),
  '선생님은 도구를 고르러 왔지 검사 결과를 보러 오지 않았다');
/* 설명서는 **읽히는 쪽**으로 갑니다. .md 를 가리키면 브라우저가 날것을 그대로 띄웁니다. */
check('설명서는 읽히는 쪽으로 간다', !/href="\.\/[\w-]+\/README\.md"/.test(html),
  '브라우저는 마크다운을 모른다 — ## 왜 이 앱인가 가 그대로 뜬다');
check('앱마다 그 앱의 마크를 쓴다',
  (html.match(/viewBox="0 0 64 64"/g) || []).length >= 7,
  '일반 그림을 쓰면 앱을 열었을 때 머리에 뜨는 마크와 달라진다');

console.log('\n----------------------------------------');
console.log(pass + '개 통과, ' + fail + '개 실패');
process.exit(fail ? 1 : 0);
