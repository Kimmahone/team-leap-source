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
  { dir: 'h-project',    name: '프로젝트 학습 계획서' },
  { dir: 'i-required',   name: '법정 의무교육 점검표' }
];

console.log('\n[1] 링크가 살아 있다 — 카탈로그가 깨지는 첫 번째 방식');
const hrefs = [...html.matchAll(/href="\.\/([^"]+)"/g)].map(m => m[1]);
check('아홉 앱 + 설명서 + 활용 가이드 링크가 모두 있다', hrefs.length === 19, hrefs.join(' '));
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
  (html.match(/<article class="app/g) || []).length === 9);
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
