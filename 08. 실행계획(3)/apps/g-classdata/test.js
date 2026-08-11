/* 우리 반 데이터 보기 (앱 G) — 점검
   최소 DOM 스텁 위에서 앱 스크립트를 **실제로 실행**하고, 나온 결과를 봅니다.

   이 앱에서 가장 중요한 것 넷입니다.
     1. **빈칸은 0이 아니다** — 안 본 것과 0점은 다릅니다.
     2. **덜 채워도 그린다** — 모두 채워야 나오는 도구는 한 번도 안 쓰이고 끝납니다.
     3. **회차가 있다** — 교실에 필요한 것은 한 시점의 사진이 아니라 변화입니다.
     4. **받아서 채워서 올린다** — 앱에서 한 칸씩 두드리게 만들지 않습니다.
   그래서 검사도 「예쁘게 나오는가」가 아니라 이 넷을 봅니다.

   쓰는 법:  node test.js */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const APP = path.join(__dirname, 'index.html');
const html = fs.readFileSync(APP, 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  실패 ' + name + (extra ? '\n       ' + extra : '')); }
}

function makeEl(tag) {
  return {
    tagName: tag || 'div', _html: '', hidden: false, value: '', textContent: '',
    tabIndex: 0, style: {}, files: null, disabled: false, className: '',
    parentNode: null,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    set innerHTML(v) { this._html = String(v); },
    get innerHTML() { return this._html; },
    addEventListener() {}, removeEventListener() {}, focus() {}, click() {}, select() {},
    setAttribute(k, v) { this['_' + k] = String(v); },
    getAttribute(k) { return this['_' + k] === undefined ? null : this['_' + k]; },
    appendChild() {}, removeChild() {},
    /* id 로 찾을 때는 **그려 놓은 HTML 에 그 id 가 있을 때만** 돌려준다.
       늘 무언가를 돌려주면, 화면에 없는 단추를 잡는 코드가 검사에서는 멀쩡히
       지나간다. 흉내는 진짜보다 너그러우면 안 된다. */
    querySelector(sel) {
      const q = String(sel);
      const m = /^#([\w-]+)$/.exec(q);
      if (m) return this._html.includes('id="' + m[1] + '"') ? makeEl() : null;
      return makeEl();
    },
    querySelectorAll(sel) {
      if (String(sel).includes('role="tab"')) return [makeEl(), makeEl(), makeEl(), makeEl(), makeEl()];
      return [];
    }
  };
}

function run(state) {
  const els = {};
  const store = { 'leap-classdata-v1': state ? JSON.stringify(state) : null };
  const sandbox = {
    console,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v; },
      removeItem: k => { delete store[k]; }
    },
    matchMedia: () => ({ matches: false }),
    crypto: globalThis.crypto,
    navigator: {},
    alert: () => {}, confirm: () => true,
    setTimeout: () => {}, clearTimeout: () => {},
    TextEncoder, TextDecoder,
    Blob: globalThis.Blob, Response: globalThis.Response,
    DecompressionStream: globalThis.DecompressionStream,
    URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    FileReader: function () {},
    document: {
      getElementById(id) { return els[id] || (els[id] = makeEl(id)); },
      createElement: makeEl,
      body: { appendChild() {}, removeChild() {} },
      documentElement: makeEl(),
      addEventListener() {}, removeEventListener() {}, activeElement: null
    }
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(js, sandbox, { timeout: 15000 });
  return { G: sandbox.__G, els, store };
}

/* 검사용 학급 만들기 */
function cls(items, cells, size, names, pick) {
  return { v: 4, className: '5학년 3반', size: size || 6, items: items,
    cells: cells || {}, names: names || {}, pick: pick || {} };
}
const I = (id, n, cat, type, max, extra) => Object.assign(
  { id: id, n: n, cat: cat, type: type || 'num', max: max || 100,
    date: '', subject: '', scope: '', comp: '' }, extra || {});

/* ==========================================================================
   [1] 뜨는가
   ========================================================================== */
console.log('\n[1] 앱이 뜬다');
let r, threw = null;
try { r = run(null); } catch (e) { threw = e; }
check('스크립트가 예외 없이 끝까지 실행된다', !threw, threw && threw.stack);
if (threw) { console.log('\n' + pass + '개 통과, ' + fail + '개 실패'); process.exit(1); }
const G = r.G;
check('검사용 문(__G)이 열려 있다', !!G);
check('다섯 화면이 모두 그려진다',
  ['panel-set', 'panel-file', 'panel-in', 'panel-dash', 'panel-read']
    .every(id => r.els[id] && r.els[id].innerHTML.length > 30));
check('처음 열면 항목이 없다', G.D().items.length === 0);
check('항목이 없으면 무엇을 하면 되는지 알린다',
  r.els['panel-in'].innerHTML.includes('항목을 먼저 고르거나'), '빈 화면을 두지 않는다');
check('항목이 없어도 템플릿은 받을 수 있다',
  r.els['panel-file'].innerHTML.includes('추천 항목 12개'),
  '처음 여는 사람이 가장 먼저 할 일이 막히면 안 된다');
check('네 범주가 있다 — 성취·참여·정서·관찰',
  G.CATS.map(c => c.n).join(',') === '성취,참여,정서,관찰');

/* ==========================================================================
   [2] 빈칸은 0이 아니다 — 이 앱의 심장
   ========================================================================== */
console.log('\n[2] 빈칸은 0이 아니다');
const it100 = I('a', '단원평가', 'ach', 'num', 100);
check('빈 문자열은 값이 아니다 (null)', G.num(it100, '') === null);
check('공백만 있어도 값이 아니다', G.num(it100, '   ') === null);
check('undefined 도 값이 아니다', G.num(it100, undefined) === null);
check('0 은 값이다 (0 점과 안 본 것은 다르다)', G.num(it100, '0') === 0);
check('숫자가 아닌 글은 값이 아니다', G.num(it100, '결석') === null);
check('만점으로 나눠 0~1 로 만든다', G.num(it100, '80') === 0.8);
check('만점을 넘으면 1 로 자른다', G.num(it100, '150') === 1);
check('상·중·하도 0~1 로 바뀐다',
  G.num(I('b', 'x', 'ach', 'level'), '상') === 1 && G.num(I('b', 'x', 'ach', 'level'), '하') === 0);
check('없는 단계는 값이 아니다', G.num(I('b', 'x', 'ach', 'level'), '최상') === null);
check('O 와 X 는 1 과 0', G.num(I('c', 'x', 'eng', 'yn'), 'O') === 1 && G.num(I('c', 'x', 'eng', 'yn'), 'X') === 0);
check('O 도 X 도 아닌 글은 읽을 수 없다', G.num(I('c', 'x', 'eng', 'yn'), '보류') === null,
  'v0.2 는 O 가 아니면 무조건 0(안 함)으로 세었다 — 「보류」가 0점이 되었다');
check('글(메모)은 셈하지 않는다', G.num(I('d', 'x', 'obs', 'text'), '열심히 함') === null);

/* 평균에 빈칸이 섞이지 않는가 */
r = run(cls([it100], { a: { 1: '100', 2: '80' } }, 6));   /* 6명 중 2명만 넣음 */
check('평균은 값이 있는 사람만 셈한다 (100·80 → 90%)',
  Math.round(r.G.stat(r.G.D(), r.G.D().items[0]).avg * 100) === 90,
  '빈칸을 0 으로 세면 30% 가 된다');
check('몇 명이 넣었는지 종이에 적는다', r.G.paperHTML().includes('2/6'));
check('종이가 그 규칙을 글로 밝힌다',
  r.G.paperHTML().includes('값이 있는 학생만'));

/* ==========================================================================
   [3] 회차 — v0.3 의 새 심장
   ========================================================================== */
console.log('\n[3] 회차 — 언제 본 것인지가 있어야 변화가 보인다');
{
  const a = I('a', '단원평가', 'ach', 'num', 100, { date: '2026-03-14', subject: '수학', scope: '1단원' });
  const b = I('b', '단원평가', 'ach', 'num', 100, { date: '2026-05-09', subject: '수학', scope: '3단원' });
  const rr = run(cls([b, a], { a: { 1: '60', 2: '60', 3: '60' }, b: { 1: '80', 2: '80', 3: '80' } }, 6));
  const K = rr.G;
  check('실시일순으로 줄을 세운다 (넣은 순서가 아니라)',
    K.byDate(K.D().items)[0].date === '2026-03-14',
    'v0.2 는 항목 순서를 회차로 삼았다 — 3월 자료를 나중에 더하면 없는 하락이 그려졌다');
  const dash = rr.els['panel-dash'].innerHTML;
  check('회차가 둘이면 꺾은선이 그려진다', dash.includes('class="ln"'));
  check('얼마나 움직였는지 %p 로 적는다', dash.includes('+20%p'), '색과 모양만으로 말하지 않는다');
  check('가로축이 실시일임을 밝힌다', dash.includes('가로는 <b>실시일</b>'));
  check('넣은 사람이 회차마다 다를 수 있음을 경고한다',
    dash.includes('회차마다 넣은 사람이 다르면'),
    '사람이 바뀌어 생긴 평균의 움직임을 학생의 변화로 읽으면 안 된다');

  /* 날짜가 없으면 선을 긋지 않는다 */
  const r2 = run(cls([I('a', '평가1', 'ach'), I('b', '평가2', 'ach')],
    { a: { 1: '60', 2: '70' }, b: { 1: '80', 2: '90' } }, 6));
  const d2 = r2.els['panel-dash'].innerHTML;
  check('실시일이 없으면 추이를 그리지 않는다', !d2.includes('class="ln"'),
    '언제인지 모르는 점을 선으로 이으면 없는 변화가 생긴다');
  check('실시일이 몇 개 비었는지 세어 말한다', d2.includes('실시일이 없는 항목이 2개'));
  check('어디서 고치면 되는지 짚어 준다', d2.includes('고치기'));
  check('「우리 반」 화면에서도 실시일 없음을 표시한다',
    r2.els['panel-set'].innerHTML.includes('실시일 없음'));

  /* 회차 사이에 많이 내려간 학생 */
  const r3 = run(cls([a, b], { a: { 1: '90', 2: '60', 3: '60' }, b: { 1: '50', 2: '65', 3: '62' } }, 6));
  const sp = r3.G.spots(r3.G.D());
  check('회차 사이에 많이 내려간 학생을 짚는다',
    sp.some(s => s.no === 1 && s.why.join('').includes('내림')), JSON.stringify(sp));
}

/* ==========================================================================
   [4] 덜 채워도 그린다
   ========================================================================== */
console.log('\n[4] 덜 채워도 그린다 — 그림마다 최소 조건이 다르다');
r = run(cls([it100], { a: { 3: '77' } }, 6));
let dash = r.els['panel-dash'].innerHTML;
check('한 칸만 채워도 히트맵이 그려진다', dash.includes('<table class="heat"'));
check('한 칸만 채워도 분포가 그려진다', dash.includes('class="chart"'));
check('넣은 값이 히트맵에 숫자로도 적힌다 (색만으로 말하지 않는다)', dash.includes('>77<'));
check('안 넣은 칸은 빗금으로 남는다', dash.includes('class="na"'));
check('눈금에 「안 넣음」이 글자로 적힌다', dash.includes('안 넣음'));

r = run(cls([it100], {}, 6));
check('값이 하나도 없으면 무엇을 하면 되는지 알려 준다',
  r.els['panel-dash'].innerHTML.includes('한 칸만 채워도'), '빈 화면을 두지 않는다');

r = run(cls([I('a', '단원평가', 'ach'), I('e', '자신감', 'emo', 'num', 5)],
  { a: { 1: '90', 2: '40' }, e: { 1: '2', 2: '5' } }, 6));
dash = r.els['panel-dash'].innerHTML;
check('성취와 정서가 다 있으면 산점도가 그려진다', dash.includes('오른쪽 아래'));
check('성취↑정서↓ 자리를 색이 아니라 모양으로도 나눈다',
  /<rect class="pt"[^>]*fill="var\(--leap-amber-mark\)"/.test(dash),
  '색각 이상에서도 구별되어야 한다');

r = run(cls([I('a', '단원평가', 'ach')], { a: { 1: '90' } }, 6));
check('정서가 없으면 그 사실을 콕 집어 말한다',
  r.els['panel-dash'].innerHTML.includes('정서 항목이 없습니다'));
r = run(cls([I('e', '자신감', 'emo', 'num', 5)], { e: { 1: '3' } }, 6));
check('성취가 없으면 그 사실을 콕 집어 말한다',
  r.els['panel-dash'].innerHTML.includes('성취 항목이 없습니다'));

/* ==========================================================================
   [5] 채운 정도
   ========================================================================== */
console.log('\n[5] 얼마나 채웠는지 늘 보인다');
r = run(cls([I('a', 'x', 'ach'), I('b', 'y', 'ach')], { a: { 1: '1', 2: '2', 3: '3' }, b: {} }, 6));
check('채운 정도를 셈한다 (3/12 = 25%)', r.G.fillRate() === 25, String(r.G.fillRate()));
check('항목별로 몇 명 채웠는지 센다', r.G.filledCount(r.G.D(), r.G.D().items[0]) === 3);
check('「입력」 화면에 채운 정도가 나온다', r.els['panel-in'].innerHTML.includes('class="fillbar"'));
check('「대시보드」에도 나온다', r.els['panel-dash'].innerHTML.includes('class="fillbar"'));
check('덜 채웠으면 그래도 그린다고 알린다', r.els['panel-in'].innerHTML.includes('덜 채워도 그립니다'));
r = run(cls([I('a', 'x', 'ach')], {}, 6));
check('하나도 없으면 그렇다고 말한다', r.els['panel-in'].innerHTML.includes('아직 그릴 것이 없습니다'));

/* ==========================================================================
   [6] 엑셀 템플릿 — 받아서 채워서 올린다
   ========================================================================== */
console.log('\n[6] 엑셀 템플릿 — 앱에서 한 칸씩 두드리게 만들지 않는다');
{
  const items = [
    I('a', '1단원 단원평가', 'ach', 'num', 100, { date: '2026-03-14', subject: '수학', scope: '3단원' }),
    I('c', '자기인식 문항', 'emo', 'num', 5, { date: '2026-03-06', comp: 'c1' }),
    I('m', '교사 관찰 메모', 'obs', 'text')
  ];
  const rr = run(cls(items, { a: { 1: '88', 2: '40' }, c: { 1: '2' }, m: { 1: '발표 목소리가 커졌다' } },
    4, { 1: '김민준', 2: '이서연' }));
  const K = rr.G;
  const rows = K.sheetRows(K.D(), false);

  check('A열 첫 줄이 「항목」이라는 이름표다', rows[0][0] === '항목');
  check('B·C열이 번호와 이름이다', rows[0][1] === '번호' && rows[0][2] === '이름');
  check('D열부터가 항목이다', rows[0][3] === '1단원 단원평가');
  check('머리줄이 일곱이다 — 항목·범주·종류·실시일·과목·범위·역량',
    ['항목', '범주', '종류', '실시일', '과목', '단원·범위', '사회정서역량']
      .every((k, i) => rows[i][0] === k), rows.slice(0, 7).map(x => x[0]).join('/'));
  check('학생이 시작하는 자리를 글로 표시한다', String(rows[7][0]).includes('여기부터 학생'));
  check('학생 줄에 이름이 들어간다', rows[8][2] === '김민준');
  check('넣어 둔 값이 템플릿에 함께 나간다', rows[8][3] === '88');
  check('안 넣은 칸은 비어 나간다', rows[11][3] === '',
    '0 을 적어 두면 받은 사람이 0점으로 채워 온다');

  /* 왕복 — 이것이 되지 않으면 템플릿은 장식이다 */
  const back = K.readRows(rows);
  check('내보낸 것을 그대로 되읽는다', back.ok, back.why);
  check('항목 수가 같다', back.items.length === 3, String(back.items.length));
  check('실시일이 살아남는다', back.items[0].date === '2026-03-14');
  check('과목·단원이 살아남는다', back.items[0].subject === '수학' && back.items[0].scope === '3단원');
  check('범주가 살아남는다', back.items[1].cat === 'emo');
  check('만점이 살아남는다 (5점 척도가 100점이 되지 않는다)', back.items[1].max === 5);
  check('사회정서역량이 살아남는다', back.items[1].comp === 'c1');
  check('글 항목은 관찰로 돌아온다', back.items[2].type === 'text' && back.items[2].cat === 'obs');
  check('이름이 살아남는다', back.names[1] === '김민준' && back.names[2] === '이서연');
  check('학생 수는 마지막 번호로 정한다', back.size === 4, String(back.size));
  check('값이 살아남는다', back.cells[back.items[0].id][1] === '88');
  check('빈칸은 빈칸으로 남는다 (0 이 되지 않는다)',
    back.cells[back.items[0].id][3] === undefined);
  check('메모 글이 살아남는다', back.cells[back.items[2].id][1] === '발표 목소리가 커졌다');

  /* CSV 로도 같은 길 */
  const back2 = K.readRows(K.csvIn(K.csvOut(rows)));
  check('CSV 로 저장해 올려도 똑같다', back2.ok && back2.items.length === 3 && back2.names[1] === '김민준',
    'xlsx 가 안 열리는 자리에서도 길이 하나 더 있어야 한다');
  check('쉼표가 든 문장이 CSV 에서 깨지지 않는다',
    K.csvIn(K.csvOut([['가,나', '다']]))[0][0] === '가,나');

  /* 줄이 밀리거나 설명이 끼어도 견디는가 */
  const messy = [['우리 반 자료입니다'], []].concat(rows).concat([['', '메모: 4번은 전학'], []]);
  const back3 = K.readRows(messy);
  check('위아래에 설명이 끼어들어도 읽는다', back3.ok && back3.items.length === 3, back3.why);
  check('번호가 겹친 줄은 건너뛰고 알린다', (function () {
    const dup = rows.concat([['', '1', '겹침', '99', '1', '']]);
    const b = K.readRows(dup);
    return b.ok && b.cells[b.items[0].id][1] === '88' && b.note.join('').includes('겹친');
  })(), '나중 줄이 앞 줄을 조용히 덮으면 안 된다');
  check('실시일 없는 항목이 있으면 알린다', (function () {
    const nod = K.sheetRows({ size: 2, names: {}, cells: {},
      items: [I('x', '평가', 'ach', 'num', 100)] }, false);
    return K.readRows(nod).note.join('').includes('회차 추이');
  })());

  /* 못 읽을 때 무엇이 잘못인지 */
  check('머리줄이 없으면 무엇을 봐야 하는지 말한다',
    /항목/.test(K.readRows([['가', '나'], ['1', '2']]).why || ''));
  check('학생 줄이 없으면 그렇다고 말한다',
    /번호/.test(K.readRows([['항목', '번호', '이름', '평가']]).why || ''));
}

console.log('\n[6-2] 엑셀이 돌려주는 여러 모양의 날짜와 종류');
{
  const K = run(null).G;
  check('2026-03-14', K.parseDate('2026-03-14') === '2026-03-14');
  check('2026. 3. 14. (한국식)', K.parseDate('2026. 3. 14.') === '2026-03-14');
  check('2026년 3월 14일', K.parseDate('2026년 3월 14일') === '2026-03-14');
  check('20260314', K.parseDate('20260314') === '2026-03-14');
  check('엑셀 일련번호 46095 도 되돌린다', K.parseDate('46095') === '2026-03-14',
    '그대로 두면 「45658」이 실시일이 되어 회차 순서가 뒤집힌다');
  check('날짜가 아니면 비운다', K.parseDate('봄') === '' && K.parseDate('') === '');

  check('100점 만점', K.parseType('100점 만점').max === 100);
  check('5점 만점 (설문 척도)', K.parseType('5점 만점').max === 5);
  check('띄어쓰기가 달라도 읽는다', K.parseType('10 점만점').max === 10);
  check('상·중·하', K.parseType('상·중·하').type === 'level');
  check('상중하 (가운뎃점 없이)', K.parseType('상중하').type === 'level');
  check('O·X', K.parseType('O·X').type === 'yn');
  check('글', K.parseType('글').type === 'text');
  check('비어 있으면 100점으로 둔다', K.parseType('').max === 100);

  check('범주 이름을 코드로 바꾼다', K.catByName('성취') === 'ach' && K.catByName('정서') === 'emo');
  check('역량 이름을 코드로 바꾼다', K.compByName('자기인식') === 'c1' && K.compByName('마음건강') === 'c6');
  check('「자기관리」도 자기조절로 받는다', K.compByName('자기관리') === 'c2',
    '학교마다 부르는 말이 조금씩 다르다');
}

console.log('\n[6-3] 템플릿이 스스로를 설명한다');
{
  const K = run(null).G;
  const g = K.guideRows().map(r => r.join(' ')).join('\n');
  check('빈칸을 0으로 적지 말라고 적는다', g.includes('0을 적지 마세요'));
  check('왜 안 되는지도 적는다', g.includes('반 평균이 무너집니다'));
  check('회차를 늘리는 법을 적는다', g.includes('실시일만 바꾸세요'));
  check('구글 시트에서 받는 법을 적는다', g.includes('Microsoft Excel'));
  check('올리면 덮어쓴다고 미리 알린다', g.includes('먼저 「파일로 내보내기」'));
  check('실시일이 추이의 조건임을 별표로 강조한다', g.includes('★'));
  const c = K.codeRows().map(r => r.join(' ')).join('\n');
  check('코드표에 6역량이 모두 있다', K.COMPS.every(x => c.includes(x.n)));
  check('코드표에 출처를 밝힌다', c.includes('한국교육환경보호원'));
  check('시트 넉 장을 화면에서도 안내한다',
    ['① 안내', '② 입력', '③ 보기', '④ 코드표'].every(s => run(null).els['panel-file'].innerHTML.includes(s)));
}

/* ==========================================================================
   [7] 항목 고치기 — v0.2 에 아예 없던 자리
   ========================================================================== */
console.log('\n[7] 항목을 고칠 수 있다');
{
  const rr = run(cls([I('a', '단원평가', 'ach')], { a: { 1: '90' } }, 6));
  check('「고치기」 단추가 있다', rr.els['panel-set'].innerHTML.includes('고치기'),
    'v0.2 는 이름 하나 고치려면 지우고 다시 만들어야 했고, 그러면 값이 함께 사라졌다');
  check('고치기 창이 이름·범주·종류를 모두 연다',
    /id="e-name"/.test(html) && /id="e-cat"/.test(html) && /id="e-type"/.test(html));
  check('실시일·과목·단원·역량도 고칠 수 있다',
    ['e-date', 'e-sub', 'e-scope', 'e-comp'].every(id => html.includes('id="' + id + '"')));
  check('고쳐도 값이 남는다는 것을 화면에서 밝힌다', html.includes('은 그대로 남습니다'));
  check('id 를 그대로 두어 값이 실제로 남는다', /x\.n = nm; x\.cat = ct; x\.type = ty;/.test(html),
    '새 id 를 주면 넣어 둔 값이 통째로 끊긴다');
  check('지울 때 몇 칸이 사라지는지 세어 보인다', html.includes('넣어 둔 값 \' + f + \'칸이 함께 사라집니다'));
}

/* ==========================================================================
   [8] 이름
   ========================================================================== */
console.log('\n[8] 이름을 쓴다 — 다만 AI 에게는 번호만 나간다');
{
  const rr = run(cls([I('a', '단원평가', 'ach')], { a: { 1: '90', 2: '30', 3: '40' } }, 6, { 1: '김민준' }));
  const K = rr.G;
  check('이름 칸이 저장 구조에 있다', typeof K.D().names === 'object');
  check('이름이 있으면 「1. 김민준」', K.label(K.D(), 1) === '1. 김민준');
  check('이름이 없으면 번호만', K.label(K.D(), 2) === '2번');
  check('입력 표에 이름 칸이 있다', rr.els['panel-in'].innerHTML.includes('data-nm="1"'));
  check('히트맵에 이름이 나온다', rr.els['panel-dash'].innerHTML.includes('김민준'));
  check('종이에도 이름이 나온다', K.paperHTML().includes('김민준'));
  check('AI 프롬프트에는 이름이 나가지 않는다', !K.promptText().includes('김민준'),
    '이름은 화면과 종이까지다. 남의 서버로는 번호만 간다');
  check('요약이 그 사실을 스스로 밝힌다', K.summary().includes('학생 이름과 관찰 메모가 들어 있지 않습니다'));
}

/* ==========================================================================
   [9] 붙여넣기
   ========================================================================== */
console.log('\n[9] 엑셀·구글시트에서 한 열씩 붙여 넣기');
r = run(cls([I('a', '점수', 'ach'), I('b', '참여', 'eng', 'num', 5)], {}, 6));
let n = r.G.paste('88\t4\n92\t5\n75\t3', 0);
let d = r.G.D();
check('탭으로 나뉜 두 칸을 한 번에 채운다', n === 6, '채운 칸 수: ' + n);
check('첫 줄이 1번이다', d.cells.a[1] === '88' && d.cells.b[1] === '4');
check('둘째 줄이 2번이다', d.cells.a[2] === '92');
check('넣지 않은 4번은 비어 있다', d.cells.a[4] === undefined);

r = run(cls([I('a', '점수', 'ach')], {}, 6));
r.G.paste('국어점수\n88\n92', 0);
check('머리글 줄은 건너뛴다', r.G.D().cells.a[1] === '88');

r = run(cls([I('a', '점수', 'ach')], {}, 6));
r.G.paste('88,92,75', 0);
check('쉼표로 나뉜 것도 받는다 (CSV)', r.G.D().cells.a[1] === '88');

r = run(cls([I('a', '점수', 'ach')], {}, 3));
r.G.paste('1\n2\n3\n4\n5', 0);
check('학생 수보다 줄이 많으면 넘치는 줄은 버린다',
  r.G.D().cells.a[3] === '3' && r.G.D().cells.a[4] === undefined);

r = run(cls([I('a', '점수', 'ach')], { a: { 2: '기존' } }, 6));
r.G.paste('88\n\n99', 0);
check('가운데 빈 줄은 건너뛰지 않고 자리를 지킨다',
  r.G.D().cells.a[1] === '88' && r.G.D().cells.a[2] === '기존' && r.G.D().cells.a[3] === '99',
  '빈 줄을 지우면 그 아래 번호가 통째로 한 칸씩 밀린다 — 조용히 틀린 자료가 된다');

/* ==========================================================================
   [10] 눈에 띄는 학생
   ========================================================================== */
console.log('\n[10] 눈에 띄는 학생 — 기계가 고르고 사람이 판단한다');
r = run(cls([I('a', '단원평가', 'ach')],
  { a: { 1: '90', 2: '88', 3: '92', 4: '30', 5: '85' } }, 6));
let sp = r.G.spots(r.G.D());
check('평균보다 많이 낮은 학생을 찾아낸다', sp.some(s => s.no === 4), JSON.stringify(sp));
check('왜 걸렸는지 함께 적는다', sp[0] && sp[0].why.join('').includes('단원평가'));

r = run(cls([I('a', 'x', 'ach')], { a: { 1: '10', 2: '90' } }, 6));
check('두 명뿐이면 짚지 않는다', r.G.spots(r.G.D()).length === 0,
  '자료가 적으면 평균이 뜻이 없다');
check('짚을 것이 없으면 무엇이 필요한지 적는다',
  r.els['panel-dash'].innerHTML.includes('세 명 이상'));

r = run(cls([I('a', '단원평가', 'ach'), I('e', '자신감', 'emo', 'num', 5)],
  { a: { 1: '95', 2: '90', 3: '92' }, e: { 1: '1', 2: '5', 3: '5' } }, 6));
sp = r.G.spots(r.G.D());
check('성취는 높은데 정서가 낮은 학생을 짚는다',
  sp.some(s => s.no === 1 && s.why.join('').includes('성취↑ 정서↓')), JSON.stringify(sp));
check('판단은 교사가 한다고 못박는다',
  r.els['panel-dash'].innerHTML.includes('판단은 선생님이 합니다'));

/* ==========================================================================
   [11] 관찰 메모 — v0.2 는 넣게 해 놓고 어디에도 보여 주지 않았다
   ========================================================================== */
console.log('\n[11] 관찰 메모가 실제로 쓰인다');
{
  const rr = run(cls([I('m', '교사 관찰 메모', 'obs', 'text')],
    { m: { 1: '발표 목소리가 커졌다', 3: '짝과 다툰 뒤 회복이 빨랐다' } }, 6, { 1: '김민준' }));
  const K = rr.G;
  check('메모를 모은다', K.memos(K.D()).length === 2);
  check('대시보드에 메모가 나온다', rr.els['panel-dash'].innerHTML.includes('발표 목소리가 커졌다'),
    'v0.2 는 넣어 두고 아무 데도 보여 주지 않았다');
  check('누구의 메모인지 이름표가 붙는다', rr.els['panel-dash'].innerHTML.includes('1. 김민준'));
  check('종이에도 나간다', K.paperHTML().includes('짝과 다툰 뒤'));
  check('AI 프롬프트에는 나가지 않는다', !K.promptText().includes('발표 목소리가 커졌다'),
    '반 전체의 원자료를 남의 서버에 붙여 넣게 만들면 안 된다');
  check('그 사실을 화면에서 밝힌다', rr.els['panel-dash'].innerHTML.includes('AI 프롬프트에 들어가지 않습니다'));
  check('메모 항목이 없으면 무엇을 하면 되는지 적는다',
    run(cls([I('a', 'x', 'ach')], { a: { 1: '1' } }, 3)).els['panel-dash'].innerHTML
      .includes('글(메모) 항목이 없습니다'));
  check('메모는 읽을 수 없는 값이 될 수 없다', K.badCells(K.D()).length === 0,
    '글은 애초에 셈하지 않기로 한 것이다');
}

/* ==========================================================================
   [12] 사회정서역량 — 한국형 6역량
   ========================================================================== */
console.log('\n[12] 사회정서역량 — 학교에서 쓰는 말과 이어 둔다');
{
  check('여섯 역량이 있다', G.COMPS.length === 6);
  check('네 영역이 있다 — 자기·관계·공동체·마음건강',
    ['자기', '관계', '공동체', '마음건강'].every(a => G.COMPS.some(c => c.area === a)));
  /* v0.4 — 기본은 「역량 이름 여섯」입니다.
     설문 문장을 항목 이름으로 두면, 이미 정리해서 가져온 값을 다시 그 문장에
     맞춰 쪼개야 합니다. 정제한 것을 또 정제하게 만드는 셈이었습니다. */
  check('기본 정서 항목이 여섯이다', G.SEL_SET.length === 6);
  check('여섯이 여섯 역량을 하나씩 덮는다',
    new Set(G.SEL_SET.map(i => G.TPL[i].comp)).size === 6);
  check('여섯이 모두 5점 척도다', G.SEL_SET.every(i => G.TPL[i].max === 5));
  check('항목 이름이 곧 역량 이름이다 — 설문 문장이 아니다',
    G.SEL_SET.every(i => G.COMPS.some(c => c.n === G.TPL[i].n)),
    G.SEL_SET.map(i => G.TPL[i].n).join(' / '));
  check('기본 정서 항목 이름에 「나는」으로 시작하는 문장이 없다',
    G.SEL_SET.every(i => !/^나는/.test(G.TPL[i].n)),
    '여기에 적는 것은 설문지 원본이 아니라 이미 한 번 정리된 값이다');
  check('무엇을 보고 매기는지 곁말이 붙어 있다',
    G.SEL_SET.every(i => !!G.TPL[i].hint));
  check('한 번에 더하는 단추가 있다', html.includes('사회정서역량 6가지 한 번에 더하기'));

  /* 설문지를 그대로 돌린 학교를 위해 7문항은 남겨 둡니다 — 지운 것이 아닙니다 */
  check('진단 설문 7문항이 그대로 남아 있다', G.SURVEY.length === 7);
  check('7문항도 여섯 역량을 모두 덮는다',
    new Set(G.SURVEY.map(t => t.comp)).size === 6);
  check('7문항을 고르는 길이 따로 있다', html.includes('설문 7문항 그대로 쓰기'));
  check('정서 자료가 어디서 오는지 화면에 적는다',
    r.els['panel-set'].innerHTML.includes('관찰 · 감정 진단 · 일기 · 상담'),
    '설문지를 옮겨 적는 자리가 아니라는 것을 말해야 한다');

  const items = [
    I('e1', '자기인식 문항', 'emo', 'num', 5, { comp: 'c1', date: '2026-03-06' }),
    I('e2', '자기조절 문항', 'emo', 'num', 5, { comp: 'c2', date: '2026-03-06' })
  ];
  const rr = run(cls(items, { e1: { 1: '5', 2: '5', 3: '5' }, e2: { 1: '1', 2: '1', 3: '1' } }, 6));
  const K = rr.G;
  const rows2 = K.compRows(K.D());
  check('역량별로 묶어 평균을 낸다', rows2.length === 2);
  check('자기인식 100% (5점 만점에 5)', Math.round(rows2[0].v * 100) === 100,
    JSON.stringify(rows2.map(x => x.v)));
  check('자기조절 20% (5점 만점에 1)', Math.round(rows2[1].v * 100) === 20,
    '모든 값은 「만점 대비 %」로 한 자에 놓는다. 5점 척도의 1점은 0이 아니라 20%다');
  check('분포 그림이 그 눈금을 글로 밝힌다',
    rr.els['panel-dash'].innerHTML.includes('만점 대비 %'),
    '100점 평가와 5점 척도를 한 그림에 놓으려면 눈금이 무엇인지 적혀 있어야 한다');
  check('대시보드에 막대로 나온다', rr.els['panel-dash'].innerHTML.includes('compbar'));
  check('가장 낮은 역량을 짚고 한 개만 다뤄도 된다고 말한다',
    rr.els['panel-dash'].innerHTML.includes('한 역량'));
  check('종이에도 역량표가 나간다', K.paperHTML().includes('사회정서역량'));
  check('출처를 화면과 종이에 밝힌다',
    rr.els['panel-dash'].innerHTML.includes('한국교육환경보호원') &&
    K.paperHTML().includes('한국교육환경보호원'));
  check('레이더 차트를 쓰지 않는다', !/radar/i.test(html),
    '축이 셋 미만이면 삼각형이 되고, 축 순서를 바꾸면 넓이가 달라져 없는 뜻이 생긴다');

  const noComp = run(cls([I('e', '자신감', 'emo', 'num', 5)], { e: { 1: '3' } }, 6));
  check('역량을 안 붙였으면 붙이라고 말한다',
    noComp.els['panel-dash'].innerHTML.includes('어느 역량인지'));
}

/* ==========================================================================
   [12-2] 재는 자 — v0.4 에서 가장 크게 고친 것

   현장에서 이렇게 나왔다. 단원평가(100점 만점)에 3·10·8… 을 넣고,
   수행평가(상·중·하)에 반 전체 「상」을 넣었더니 「성취」 한 줄에 섞여
   31% → 100% 「+69%p 상승」이 그려졌다. 오른 것은 아이가 아니라 자였다.

   0~1 로 고르게 만들었다는 것은 그림을 그릴 수 있다는 뜻이지,
   서로 더해도 된다는 뜻이 아니다.
   ========================================================================== */
console.log('\n[12-2] 재는 자가 다르면 한 선으로 잇지 않는다');
{
  const a1 = I('a1', '단원평가', 'ach', 'num', 100, { date: '2026-07-28' });
  const a2 = I('a2', '단원평가', 'ach', 'num', 100, { date: '2026-08-05' });
  const lv = I('lv', '수행평가', 'ach', 'level', 0, { date: '2026-08-05' });
  const rr = run(cls([a1, a2, lv], {
    a1: { 1: '30', 2: '32', 3: '31' },
    a2: { 1: '60', 2: '62', 3: '61' },
    lv: { 1: '상', 2: '상', 3: '상' }
  }, 6));
  const K = rr.G, dash = rr.els['panel-dash'].innerHTML;
  const grp = K.trendLines(K.D());

  check('같은 자끼리만 한 계열이 된다', grp.lines.length === 1,
    grp.lines.map(L => L.c.n + '/' + L.scale).join(', '));
  check('그 계열이 100점 만점 쪽이다', grp.lines[0] && grp.lines[0].scale === '100점 만점');
  check('상·중·하는 회차가 하나뿐이라 선이 되지 않는다',
    grp.dropped.some(x => x.scale === '상·중·하'));
  check('한 범주에 자가 둘임을 알아챈다',
    grp.mixed.length === 1 && grp.mixed[0].scales.length === 2,
    JSON.stringify(grp.mixed));
  check('섞지 않았다고 화면에 적는다', dash.includes('다른 자로 잰 값은 한 선으로 잇지 않았습니다'));
  check('상·중·하를 어디에 놓았는지 밝힌다', dash.includes('상 100 · 중 50 · 하 0'));
  check('이름표에 자가 함께 적힌다', dash.includes('성취 · 100점 만점'));
  check('없는 상승(+69%p)이 그려지지 않는다', !dash.includes('+69%p'),
    '31%(100점 만점 평균)와 100%(모두 「상」)를 이으면 나오던 숫자다');
  check('실제 변화(+30%p)는 그대로 나온다', dash.includes('+30%p'));

  /* 자가 같으면 물론 이어진다 */
  const l2 = I('l2', '수행평가', 'ach', 'level', 0, { date: '2026-09-01' });
  const rr2 = run(cls([lv, l2, a1, a2], {
    lv: { 1: '하', 2: '하', 3: '하' }, l2: { 1: '상', 2: '상', 3: '상' },
    a1: { 1: '30' }, a2: { 1: '60' }
  }, 6));
  const g2 = rr2.G.trendLines(rr2.G.D());
  check('같은 자로 두 번 재면 선이 둘이 된다', g2.lines.length === 2,
    g2.lines.map(L => L.scale).join(', '));
  check('선마다 점 모양이 다르다',
    g2.lines[0].mk.mark !== g2.lines[1].mk.mark,
    '색은 같은 범주라 같다 — 모양이 다르지 않으면 색만으로 말하는 것이 된다 (원칙 4)');

  /* 히트맵과 종이도 같은 것을 말해야 한다 */
  check('히트맵 머리줄에 자가 적힌다', dash.includes('상·중·하') && dash.includes('100점 만점'));
  check('종이의 추이표도 자를 나눠 적는다', K.paperHTML().includes('범주 · 자'));
  check('종이에도 섞지 않는 까닭이 적힌다',
    K.paperHTML().includes('재는 자가 다르면 줄을 따로 두었습니다'));

  /* 올릴 때 미리 알린다 */
  const up = K.readRows(K.sheetRows(K.D(), false));
  check('파일을 올릴 때도 자가 섞였음을 알린다',
    up.note.join(' ').includes('재는 자가'), up.note.join(' | '));

  /* 「많이 내려간 학생」도 같은 자끼리만 견준다 */
  const rr3 = run(cls([
    I('p1', '단원평가', 'ach', 'num', 100, { date: '2026-03-02' }),
    I('p2', '수행평가', 'ach', 'level', 0, { date: '2026-06-02' })],
    { p1: { 1: '100', 2: '100', 3: '100' }, p2: { 1: '하', 2: '하', 3: '하' } }, 6));
  check('자가 다르면 「내림」으로 잡지 않는다',
    !rr3.G.spots(rr3.G.D()).some(s => s.why.join('').includes('내림')),
    '100점 만점 100점과 상·중·하의 「하」를 빼면 나오는 숫자는 아무 뜻이 없다');
}

/* ==========================================================================
   [12-3] 성취 × 정서 — 축을 고를 수 있다

   v0.3 은 「가장 나중 항목」을 말없이 골랐다. 그것이 상·중·하이고 반 전체가
   「상」이면 스물넷이 오른쪽 끝 한 점에 겹쳐, 그림은 그려졌는데 아무것도
   보이지 않았다. 왜 그런지도 적혀 있지 않았다.
   ========================================================================== */
console.log('\n[12-3] 성취 × 정서 — 겹친 점을 겹친 채로 두지 않는다');
{
  const good = I('g', '단원평가', 'ach', 'num', 100, { date: '2026-03-02' });
  const flat = I('f', '수행평가', 'ach', 'level', 0, { date: '2026-06-02' });
  const emo = I('e', '자기인식', 'emo', 'num', 5, { comp: 'c1', date: '2026-06-02' });
  const cells = {
    g: { 1: '90', 2: '70', 3: '50', 4: '30' },
    f: { 1: '상', 2: '상', 3: '상', 4: '상' },
    e: { 1: '5', 2: '4', 3: '2', 4: '1' }
  };
  const rr = run(cls([good, flat, emo], cells, 6));
  const K = rr.G, d = K.D();

  check('값이 흩어지는 항목을 가로축으로 고른다', K.axisOf(d, 'ach').id === 'g',
    'v0.3 은 나중 것(모두 「상」)을 골라 점이 한 줄로 섰다');
  check('갈래가 몇 가지인지 셀 줄 안다',
    K.spread(d, good) === 4 && K.spread(d, flat) === 1);
  check('선생님이 고른 것이 있으면 그것을 쓴다',
    run(cls([good, flat, emo], cells, 6, null, { ach: 'f' })).G.axisOf(
      run(cls([good, flat, emo], cells, 6, null, { ach: 'f' })).G.D(), 'ach').id === 'f');

  const dash = rr.els['panel-dash'].innerHTML;
  check('고를 것이 둘 이상이면 고르는 자리가 나온다', dash.includes('id="sc-x"'));
  check('고를 것이 하나뿐이면 고르는 자리를 두지 않는다', !dash.includes('id="sc-y"'),
    '고를 수 없는 선택지를 보여 주는 것은 안내가 아니라 잡음이다');
  check('정서도 둘 이상이면 고르는 자리가 나온다', (function () {
    const e2 = I('e2', '자기조절', 'emo', 'num', 5, { comp: 'c2', date: '2026-06-02' });
    return run(cls([good, emo, e2], { g: cells.g, e: cells.e, e2: { 1: '3', 2: '3' } }, 6))
      .els['panel-dash'].innerHTML.includes('id="sc-y"');
  })());
  check('고르는 자리에 자가 함께 적힌다', dash.includes('(100점 만점)'));
  check('두 축 모두에 이름이 붙는다', dash.includes('자기인식 ↑'),
    'v0.3 은 세로축에 아무 말이 없었다');
  check('사분면의 뜻이 그림 안에도 적힌다', dash.includes('성취↑ 정서↓'));

  /* 한 줄로 서 버렸을 때 — 왜 그런지, 무엇을 하면 되는지 */
  const flatOnly = run(cls([flat, emo], { f: cells.f, e: cells.e }, 6));
  const fd = flatOnly.els['panel-dash'].innerHTML;
  check('흩어지지 않으면 그렇다고 말한다', fd.includes('좌우로 흩어지지 않습니다'));
  check('무엇을 하면 되는지까지 적는다', fd.includes('촘촘한 자'));

  /* 겹친 점 — 흔들어 흩뜨리지 않고 묶는다 */
  const same = run(cls([flat, emo], { f: cells.f, e: { 1: '5', 2: '5', 3: '5', 4: '5' } }, 6));
  const sd = same.els['panel-dash'].innerHTML;
  check('같은 자리에 선 사람은 하나로 묶고 인원을 적는다', sd.includes('>4명<'),
    '넷을 겹쳐 그리면 이름표가 서로 위에 얹혀 아무것도 읽히지 않는다');
  check('묶었다는 사실을 밝힌다', sd.includes('하나로 묶고 인원을 적었습니다'));
  check('흔들어 흩뜨리지 않았다고 못박는다', sd.includes('흔들어 흩뜨리지 않았습니다'),
    'jitter 는 없는 자리를 만들어 낸다');

  /* 이름표가 그림 밖으로 나가지 않는가 */
  check('오른쪽 끝 이름표는 왼쪽으로 넘긴다', sd.includes('text-anchor="end"'),
    'v0.3 은 x=1 인 점의 이름표가 viewBox 밖으로 나갔다');

  /* 목록과 그림이 같은 축을 본다 */
  const sp = rr.G.spots(d);
  check('「눈에 띄는 학생」도 같은 두 축을 쓴다',
    sp.some(s => s.no === 4 && s.why.join('').includes('성취↑ 정서↓')) === false &&
    sp.some(s => s.why.join('').includes('성취↑ 정서↓')),
    '그림과 목록이 다른 것을 가리키면 어느 쪽을 믿어야 할지 알 수 없다');
}

/* ==========================================================================
   [13] 읽을 수 없는 값
   ========================================================================== */
console.log('\n[13] 읽을 수 없는 값 — 채운 것으로 세는데 그림에는 없던 칸');
{
  const it = I('a1', '1단원 평가', 'ach', 'num', 100);
  const rb = run(cls([it], { a1: { 1: '90', 2: '9O', 3: '결석', 4: '80' } }, 6));
  const K = rb.G;
  const bad = K.badCells(K.D());
  check('읽을 수 없는 값을 찾아낸다', bad.length === 2, bad.map(b => b.no + '번 ' + b.v).join(' · '));
  check('숫자는 그대로 둔다', !bad.some(b => b.v === '90' || b.v === '80'));
  check('빈칸은 잘못이 아니다', !bad.some(b => b.no === 5 || b.no === 6));
  check('채운 정도는 여전히 그 칸을 센다', K.filledCount(K.D(), K.D().items[0]) === 4);
  check('「9O」를 9 로 읽지 않는다 ★', K.num(it, '9O') === null,
    'parseFloat 는 앞쪽만 읽는다. v0.1 은 90 의 오타 「9O」를 9 로 그렸다');
  check('「90점」·「90%」는 받는다',
    Math.round(K.num(it, '90점') * 100) === 90 && Math.round(K.num(it, '90%') * 100) === 90);
  check('「-5」는 읽을 수 없다', K.num(it, '-5') === null);
  check('「1 2」는 읽을 수 없다', K.num(it, '1 2') === null);

  const inHTML = rb.els['panel-in'].innerHTML;
  check('입력 화면이 몇 칸인지 말한다', inHTML.includes('읽을 수 없는 값이 2칸 있습니다'));
  check('무엇을 적어야 하는지 알려 준다', inHTML.includes('0~100 사이의 숫자'),
    '「틀렸다」만으로는 고칠 수가 없다');
  check('빈칸으로 두어도 된다고 말한다', inHTML.includes('빈칸으로 두어도 됩니다'));
  check('그 칸에 표가 난다', /<td class="bad"/.test(inHTML));
  check('색만으로 알리지 않는다', /td\.bad::after\{content:'!'/.test(html));
  check('히트맵에서도 따로 표시한다', rb.els['panel-dash'].innerHTML.includes('읽을 수 없음'));
  check('종이에도 적힌다', K.paperHTML().includes('읽을 수 없는 값이 2칸 있어'));

  check('종류마다 무엇을 바라는지 말한다',
    K.wantOf(I('x', 'x', 'ach', 'num', 50)) === '0~50 사이의 숫자' &&
    K.wantOf(I('x', 'x', 'ach', 'level')).includes('상') &&
    K.wantOf(I('x', 'x', 'ach', 'yn')).includes('O'));

  const rc = run(cls([it], { a1: { 1: '90', 2: '80' } }, 6));
  check('멀쩡하면 아무 말도 하지 않는다', !rc.els['panel-in'].innerHTML.includes('읽을 수 없는 값'),
    '늘 잔소리하면 아무도 읽지 않는다');
  check('종이도 조용하다', !rc.G.paperHTML().includes('읽을 수 없는 값'));
}

console.log('\n[13-2] 표에서 세로로 오르내린다');
{
  check('↑↓ 로 옮긴다', /k === 'ArrowDown' \|\| k === 'Enter'/.test(html) && /k === 'ArrowUp'/.test(html),
    'Tab 은 가로로 가는데 이 표는 세로로 채운다');
  check('옮기기 전에 적은 값을 저장한다', /store\(\); moveCell\(inp, 1, 0\)/.test(html));
  check('표 밖으로는 나가지 않는다',
    /if \(nno < 1 \|\| nno > d\.size\) return;/.test(html) &&
    /if \(nci < 0 \|\| nci >= d\.items\.length\) return;/.test(html));
  check('적는 그 자리에서 표가 난다', /isBad\(d2, it2, no\) \? 'bad'/.test(html));
}

/* ==========================================================================
   [14] AI 초안 도우미
   ========================================================================== */
console.log('\n[14] AI 도우미는 숫자 요약만 넘긴다');
r = run(cls([
  I('a', '단원평가', 'ach', 'num', 100, { date: '2026-03-14' }),
  I('b', '단원평가', 'ach', 'num', 100, { date: '2026-06-10' }),
  I('m', '관찰메모', 'obs', 'text')],
  { a: { 1: '90', 2: '40', 3: '70' }, b: { 1: '95', 2: '50', 3: '80' },
    m: { 1: '민준이는 발표를 잘한다' } }, 6, { 1: '김민준' }));
const p = r.G.promptText();
check('학급 이름이 들어간다', p.includes('5학년 3반'));
check('사람 수·평균 같은 요약이 들어간다', p.includes('평균') && p.includes('가운데값'));
check('칸 하나하나의 값은 들어가지 않는다', !p.includes('민준이는 발표를 잘한다'));
check('학생 이름은 들어가지 않는다', !p.includes('김민준'));
check('회차 사이의 변화가 들어간다', p.includes('[회차 사이의 변화'));
check('실시일이 들어간다', p.includes('2026-03-14'));
check('채운 정도를 먼저 말하라고 못박는다', p.includes('채운 정도가 낮으면 그 사실을 먼저'));
check('단정하지 말라고 못박는다', p.includes('단정하지 말고'));
check('성격·가정환경 추측을 막는다', p.includes('추측하지 마세요'));
check('최종 판단은 교사임을 못박는다', p.includes('최종 판단은 교사가 합니다'));
check('넣은 사람 수가 회차마다 다를 수 있음을 짚으라고 한다',
  p.includes('넣은 사람 수가 회차마다 다를 수 있음'),
  '사람이 바뀌어 생긴 평균의 움직임을 학생의 변화로 읽으면 안 된다');
check('다음 한 차시 크기로 제안하라고 한다', p.includes('다음 한 차시'));
check('눈에 띄는 번호가 들어간다', p.includes('[눈에 띄는 번호'));
check('요약에 이름 칸이 없다', !/김민준|이서연/.test(r.G.summary()));

/* ==========================================================================
   [15] 종이 — v0.2 는 히트맵 그림 하나 때문에 무너졌다
   ========================================================================== */
console.log('\n[15] 종이');
r = run(cls([
  I('a', '단원평가', 'ach', 'num', 100, { date: '2026-03-14', subject: '수학', scope: '1단원' }),
  I('b', '단원평가', 'ach', 'num', 100, { date: '2026-06-10', subject: '수학', scope: '4단원' }),
  I('e', '자기인식 문항', 'emo', 'num', 5, { date: '2026-03-06', comp: 'c1' })],
  { a: { 1: '90', 2: '40', 3: '70' }, b: { 1: '95', 2: '50', 3: '80' }, e: { 1: '2', 2: '5', 3: '4' } },
  6, { 1: '김민준' }));
const pg = r.G.paperHTML();
check('학급 이름이 종이에 나간다', pg.includes('5학년 3반'));
check('회차 목록이 나간다', pg.includes('회차 목록'));
check('실시일이 나간다', pg.includes('2026-03-14'));
check('과목·범위가 나간다', pg.includes('수학'));
check('회차 추이 표가 나간다', pg.includes('회차 추이 (반 평균)'));
check('앞 회차 대비 변화가 %p 로 나간다', /\+\d+%p/.test(pg));
check('히트맵이 종이에서는 표다', pg.includes('table class="ph"'),
  'v0.2 는 SVG 였다. 학생이 스물넷이면 세로가 가로의 세 배가 되어 A4 한 장을 통째로 넘겼다');
check('종이에 SVG 히트맵이 들어가지 않는다', !/<svg class="heat"/.test(pg));
check('표는 쪽이 넘어가도 머리줄을 다시 그린다', /\.paper thead\{display:table-header-group\}/.test(html));
check('색만으로 말하지 않는다 — 칸에 값이 그대로 적힌다', pg.includes('>90<') || pg.includes('90</td>'));
check('안 넣은 칸이 무엇인지 종이에 적는다', pg.includes('안 넣은 칸'));
check('눈에 띄는 학생이 종이에 나간다', pg.includes('눈에 띄는 학생'));
check('만든 곳을 종이에 밝힌다', pg.includes('TEAM LEAP'));
check('판 번호가 종이에 적힌다', pg.includes('v0.4'));

r = run(cls([I('a', '<img src=x onerror=alert(1)>', 'ach')], { a: { 1: '1' } }, 3, { 1: '<b>해커</b>' }));
const badp = r.G.paperHTML();
check('항목 이름의 태그가 그대로 들어가지 않는다', !badp.includes('<img src=x'));
check('학생 이름의 태그도 막는다', !badp.includes('<b>해커</b>'), '이름 칸이 새로 생긴 만큼 새 구멍도 생긴다');
check('이스케이프되어 보인다', badp.includes('&lt;img'));
check('대시보드에서도 막는다', !r.els['panel-dash'].innerHTML.includes('<img src=x'));

/* ==========================================================================
   [16] 모달 — v0.2 는 이름이 어긋나 통째로 깨져 있었다
   ========================================================================== */
console.log('\n[16] 창(모달)이 실제로 열린다');
{
  check('CSS 에 있는 이름을 그대로 쓴다',
    /back\.innerHTML = '<div class="modal-back"/.test(html) &&
    /<div class="modal-box'/.test(html),
    'v0.2 는 .modal-w 를 만들었는데 CSS 에는 .modal-box 만 있었다 — 창이 모양 없이 쏟아졌다');
  check('.modal-box 가 CSS 에 정의되어 있다', /\.modal-box\{/.test(html));
  check('.modal-back 도 정의되어 있다', /\.modal-back\{/.test(html));
  check('바깥을 눌러도 닫힌다', html.includes("on(el('modal-back'), 'click', closeModal)"));
  check('Esc 로 닫힌다', /e\.key === 'Escape'/.test(html));
  check('닫으면 눌렀던 자리로 초점이 돌아간다', /lastFocus\.focus\(\)/.test(html));
  check('.sheet 가 CSS 에 정의되어 있다', /^\.sheet\{/m.test(html),
    'v0.2 는 HTML 곳곳에서 .sheet 를 쓰는데 CSS 에 정의가 없어 칸이 전부 맨 글자로 흘렀다');
  check('쓰이는 간격 토큰이 정의되어 있다',
    /--leap-4:/.test(html) && /--leap-5:/.test(html),
    'v0.2 는 var(--leap-4) 를 쓰면서 값을 만들어 두지 않았다');
}

/* ==========================================================================
   [17] 예전에 저장한 자료
   ========================================================================== */
console.log('\n[17] 칸이 없던 시절의 자료도 열린다');
r = run({ v: 1, className: 'ㄱ' });
check('items 가 없어도 터지지 않는다', Array.isArray(r.G.D().items));
check('cells 가 없어도 터지지 않는다', typeof r.G.D().cells === 'object');
check('names 가 없어도 터지지 않는다', typeof r.G.D().names === 'object');
check('학생 수가 없으면 20명으로 둔다', r.G.D().size === 20);
r = run({ v: 1, size: 999, items: [{ n: 'x', cat: 'ach' }] });
check('학생 수는 60명을 넘지 않는다', r.G.D().size === 60);
check('항목에 id 가 없으면 붙여 준다', !!r.G.D().items[0].id);
check('항목에 종류가 없으면 점수로 둔다', r.G.D().items[0].type === 'num');
check('v0.2 자료에 실시일 칸을 만들어 준다', r.G.D().items[0].date === '');
check('v0.2 자료에 역량 칸을 만들어 준다', r.G.D().items[0].comp === '');
check('실시일이 없어도 대시보드가 뜬다', r.els['panel-dash'].innerHTML.length > 100);

/* ==========================================================================
   [18] 설계 원칙
   ========================================================================== */
console.log('\n[18] 설계 원칙');
check('외부 CDN·웹폰트를 부르지 않는다',
  !/<(script|link)[^>]+(src|href)\s*=\s*["']https?:/i.test(html));
check('서버로 보내는 코드가 없다',
  !/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|WebSocket/.test(html));
check('압축 해제는 브라우저 것만 쓴다 — 라이브러리 0',
  /new DecompressionStream\('deflate-raw'\)/.test(html) && !/pako|jszip|xlsx\.min/i.test(html),
  '엑셀을 읽으려고 라이브러리를 들이면 원칙 1이 무너진다');
check('없으면 CSV 로 가라고 알려 준다', html.includes('CSV 로 저장'));
check('API 키를 받는 칸이 없다', !/api[-_ ]?key/i.test(html));
check('다크 모드가 있다', /@media \(prefers-color-scheme:\s*dark\)/.test(html));
check('인쇄 스타일이 있다', /@media print/.test(html));
check('모션 축소 요청을 존중한다', /prefers-reduced-motion/.test(html));
check('버튼이 44px 이상이다', /\.btn\{[^}]*min-height:46px/.test(html));
check('제목이 하나뿐(h1)', (html.match(/<h1[ >]/g) || []).length === 1);
check('메인으로 돌아가는 홈 단추가 있다', html.includes('href="../../../index.html"'));
check('저작권 표기가 있다', html.includes('© 2026 TEAM LEAP'));
check('「어떤 자료도 외부로 전송하지 않습니다」가 사실이어야 한다',
  html.includes('어떤 자료도 외부로 전송하지 않습니다'));
check('그림에 스크린리더용 설명이 붙는다',
  (html.match(/role="img" aria-label=/g) || []).length >= 3);
check('히트맵 표에도 설명이 붙는다', /<caption class="leap-sr">/.test(html));
check('선을 색으로만 나누지 않는다 — 모양도 다르다',
  /mark: 'circle'/.test(html) && /mark: 'square'/.test(html) && /mark: 'diamond'/.test(html));
check('히트맵 색마다 글자색을 짝지어 둔다 (대비 4.5:1)',
  /--h0f:/.test(html) && /--h4f:/.test(html));

console.log('\n[마크] 이 앱의 마크');
check('한 칸이 비어 있는 격자', html.includes('한 칸이 비어 있는 격자'));
check('빈 칸에 빗금이 그어져 있다', /<path d="M39 52 L52 39"/.test(html),
  '빈칸을 0으로 세지 않는 것이 이 앱의 심장이다');
check('판권 표기의 상표는 그대로', html.includes('d="M16 46 Q32 -10 48 30"'),
  '저작권 표기는 지우지도 바꾸지도 않는다');

/* ==========================================================================
   [19] 진짜 엑셀 파일 — 만들고, 풀고, 되읽는다 (비동기)
   ========================================================================== */
console.log('\n[19] 진짜 .xlsx 파일 — 만들고 다시 읽는다');
(async function () {
  const K = run(cls([
    I('a', '1단원 단원평가', 'ach', 'num', 100, { date: '2026-03-14', subject: '수학', scope: '3단원' }),
    I('c', '자기인식 문항', 'emo', 'num', 5, { date: '2026-03-06', comp: 'c1' }),
    I('m', '교사 관찰 메모', 'obs', 'text')],
    { a: { 1: '88', 2: '40' }, c: { 1: '2' }, m: { 1: '발표 목소리가 커졌다' } },
    4, { 1: '김민준', 2: '이서연' })).G;

  let blob = null, err = null;
  try { blob = K.templateBlob(K.D()); } catch (e) { err = e; }
  check('엑셀 파일을 만든다', !!blob, err && err.message);
  if (blob) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    check('빈 파일이 아니다', buf.length > 2000, buf.length + ' 바이트');
    check('zip 서명(PK)으로 시작한다', buf[0] === 0x50 && buf[1] === 0x4B);

    const files = await K.unzip(buf);
    const names = Object.keys(files);
    check('xlsx 가 갖춰야 할 파일이 모두 있다',
      ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml',
        'xl/_rels/workbook.xml.rels'].every(f => names.indexOf(f) >= 0), names.join(' '));
    check('시트가 넉 장이다', names.filter(f => /worksheets\/sheet\d+\.xml/.test(f)).length === 4);
    check('시트 이름이 한글 그대로다', /name="① 안내"/.test(files['xl/workbook.xml']),
      'zip 이름 칸에 UTF-8 표시(0x0800)를 켜지 않으면 여기서 깨진다');

    check('스타일 파일이 들어 있다', names.indexOf('xl/styles.xml') >= 0,
      '적을 곳과 두어야 할 곳을 색으로 가른다');

    const rows = await K.readWorkbook(buf);
    check('앱이 「입력」 시트를 골라 읽는다', rows.some(r => r && r[0] === '항목'),
      '넉 장 가운데 어느 것을 읽을지 스스로 안다');
    check('맨 위 색 안내를 건너뛰고 이름표를 찾는다', rows[0] && rows[0][0] === '색이 뜻하는 것',
      '안내가 붙어도 「항목」 줄을 찾아내야 한다');
    const back = K.readRows(rows);
    check('엑셀을 거쳐도 항목이 그대로다', back.ok && back.items.length === 3, back.why);
    if (back.ok) {
      check('엑셀을 거쳐도 실시일이 그대로다', back.items[0].date === '2026-03-14');
      check('엑셀을 거쳐도 만점이 그대로다', back.items[1].max === 5);
      check('엑셀을 거쳐도 역량이 그대로다', back.items[1].comp === 'c1');
      check('엑셀을 거쳐도 이름이 그대로다', back.names[1] === '김민준');
      check('엑셀을 거쳐도 값이 그대로다', back.cells[back.items[0].id][1] === '88');
      check('엑셀을 거쳐도 빈칸은 빈칸이다', back.cells[back.items[0].id][3] === undefined);
      check('엑셀을 거쳐도 메모가 그대로다',
        back.cells[back.items[2].id][1] === '발표 목소리가 커졌다');
    }
    /* 「③ 보기」 시트가 실제로 채워져 있는가 — 비어 있으면 안내가 거짓말이 된다 */
    const s3 = /<sheet name="③ 보기"[^>]*r:id="rId(\d+)"/.exec(files['xl/workbook.xml']);
    check('「보기」 시트에 예시가 채워져 있다',
      !!s3 && /가온/.test(files['xl/worksheets/sheet' + s3[1] + '.xml']));

    /* ---- v0.4 : 색과 틀 고정 ----
       받은 사람이 파일을 열고 가장 먼저 하는 질문은 「어디에 적나」다.
       흰 표 한 장을 주고 안내 시트를 읽으라는 것은 답이 아니다. */
    const s2 = /<sheet name="② 입력"[^>]*r:id="rId(\d+)"/.exec(files['xl/workbook.xml']);
    const inXml = s2 ? files['xl/worksheets/sheet' + s2[1] + '.xml'] : '';
    check('입력 시트가 스타일을 실제로 쓴다', / s="3"/.test(inXml),
      '노란 칸(s=3)이 하나도 없으면 색은 붙지 않은 것이다');
    check('아직 안 적은 빈칸에도 색이 붙는다', /<c r="[A-Z]+\d+" s="3"\/>/.test(inXml),
      '「여기에 적으세요」는 비어 있을 때 가장 필요한 말이다 — 셀이 없으면 색도 없다');
    check('이름표 칸과 값 칸의 색이 다르다', / s="1"/.test(inXml) && / s="3"/.test(inXml));
    check('번호·이름 칸의 색이 또 다르다', / s="4"/.test(inXml));
    check('머리줄과 번호·이름을 틀 고정한다', /state="frozen"/.test(inXml),
      '학생이 스물넷이면 내려갈수록 어느 열인지 잊는다');
    check('틀 고정이 sheetData 보다 먼저 나온다',
      inXml.indexOf('sheetViews') < inXml.indexOf('<sheetData>'),
      '순서가 어긋나면 엑셀이 파일을 열지 못한다');
    const st = files['xl/styles.xml'] || '';
    check('노란 채우기 값이 스타일에 있다', /FFFFF6D8/.test(st));
    check('스타일 수와 cellXfs 개수가 맞는다',
      (function () {
        const m = /<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/.exec(st);
        return !!m && (m[2].match(/<xf /g) || []).length === +m[1];
      })(), '개수가 어긋나면 엑셀이 파일을 고치라고 묻는다');

    /* 색을 붙여도 왕복이 깨지지 않는가 — 색은 값이 아니다 */
    const back4 = K.readRows(rows);
    check('색을 붙여도 되읽기는 그대로다', back4.ok && back4.items.length === 3, back4.why);
  }
})().then(function () {
  console.log('\n[kit] 사본이 낡지 않았는가 — 함정 46번');
  {
    /* 앱은 kit 원본의 «사본»을 문서 안에 품고 있습니다 (원칙 10번).
       앱 H·I 는 그 사본에 LEAP.saveBlob 이 빠진 채 배포되어 «내려받기»가 던졌습니다.
       검사는 만드는 함수가 낸 «글자»만 보고 통과시켰습니다 — 만드는 데까지만 가 보고
       내보내는 데까지 가 보지 않았기 때문입니다.
       그래서 여기서는 기능이 아니라 «창구가 다 있는가»를 셉니다. */
    const _kSrc = require('fs').readFileSync(require('path').join(__dirname, 'index.html'), 'utf8');
    const _kDef = new Set([..._kSrc.matchAll(/LEAP\.([A-Za-z]\w*)\s*=(?!=)/g)].map(m => m[1]));
    const _kUse = new Set();
    for (const m of _kSrc.matchAll(/\bLEAP\.([A-Za-z]\w*)\s*\(/g)) _kUse.add(m[1]);
    for (const m of _kSrc.matchAll(/[=,(]\s*LEAP\.([A-Za-z]\w*)\s*[;,)\n]/g)) _kUse.add(m[1]);
    const _kMiss = [..._kUse].filter(n => !_kDef.has(n));
    if (_kMiss.length) console.log('       빠진 것: ' + _kMiss.join(', '));
    check('★ 앱이 부르는 LEAP 창구가 사본에 다 있다', _kMiss.length === 0,
      '사본은 조용히 낡는다 — 원본을 고쳤으면 사본도 고칠 것');
  }
  console.log('\n' + '-'.repeat(40));
  console.log(pass + '개 통과, ' + fail + '개 실패');
  process.exit(fail ? 1 : 0);
}).catch(function (e) {
  console.log('  실패 [19] 비동기 검사가 터졌다\n       ' + (e && e.stack));



  console.log('\n' + '-'.repeat(40));
  console.log(pass + '개 통과, ' + (fail + 1) + '개 실패');
  process.exit(1);
});
