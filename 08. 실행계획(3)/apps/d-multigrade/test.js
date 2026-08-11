/* 복식학급 수업 도우미 — 점검
   최소 DOM 스텁 위에서 앱을 실제로 실행하고, 화면과 규칙이 맞는지 본다.
   실행: node test.js */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function makeEl() {
  return {
    _html: '', hidden: false, value: '', textContent: '', tabIndex: 0, checked: false,
    classList: { add() {}, remove() {} }, style: {}, files: null, type: '',
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
    addEventListener() {}, focus() {}, click() {},
    setAttribute(k, v) { this['_' + k] = v; }, getAttribute(k) { return this['_' + k] || null; },
    appendChild() {}, removeChild() {},
    /* id 로 찾을 때는 **그려 놓은 HTML 에 그 id 가 있을 때만** 돌려준다.
       늘 무언가를 돌려주면, 화면에 없는 단추를 잡는 코드가 검사에서는 멀쩡히
       지나간다. 실제로 그렇게 「수업 개요를 접으면 화면 전체가 죽는」 버그가
       147개 검사를 통과해 배포까지 나갔다. 흉내는 진짜보다 너그러우면 안 된다. */
    querySelector(sel) {
      const q = String(sel);
      const m = /^#([\w-]+)$/.exec(q);
      if (m) return this._html.includes('id="' + m[1] + '"') ? makeEl() : null;
      return makeEl();
    },
    querySelectorAll(s) { return String(s).includes('role="tab"') ? [makeEl(), makeEl(), makeEl()] : []; }
  };
}

function run(state) {
  const panels = {};
  const store = { 'leap-multigrade-v1': state ? JSON.stringify(state) : null };
  const sandbox = {
    console, __LEAP_TEST__: {},
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; }
    },
    matchMedia: () => ({ matches: false }),
    crypto: globalThis.crypto, Blob, alert: () => {}, confirm: () => true,
    setTimeout: f => { if (typeof f === 'function') f(); }, clearTimeout: () => {},
    URL: { createObjectURL: () => '', revokeObjectURL: () => {} }, FileReader: function () {},
    document: {
      getElementById(id) { if (!panels[id]) panels[id] = makeEl(); return panels[id]; },
      createElement: makeEl, body: { appendChild() {}, removeChild() {} }, documentElement: makeEl()
    }
  };
  sandbox.window = sandbox; sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(js, sandbox, { timeout: 8000 });
  const get = id => (panels[id] ? panels[id]._html : '');
  return {
    sb: sandbox, hook: sandbox.__LEAP_TEST__.hook,
    get plan() { return get('panel-plan'); },
    get sheet() { return get('panel-sheet'); },
    get prep() { return get('panel-prep'); },
    get ai() { return get('panel-ai'); },
    get box() { return get('panel-box'); }
  };
}

const blk = (kind, a, b) => ({ kind, noteA: a || '', noteB: b || '' });
const ws = (items) => ({ title: '', guide: '', items: items || [] });
const item = (over) => Object.assign(
  { id: 'i' + Math.random().toString(36).slice(2, 6), type: '빈칸', prompt: '문제', choices: [], space: 'short' },
  over);
const mk = (over) => ({
  v: 1, school: '○○초등학교 3·4학년',
  gradeA: { name: '3학년', count: 4 }, gradeB: { name: '4학년', count: 3 },
  current: Object.assign({
    id: 'L1', date: '2026-09-04', minutes: 40, blockLen: 5,
    subjectA: '수학', topicA: '세 자리 수의 덧셈',
    subjectB: '수학', topicB: '큰 수의 곱셈',
    blocks: ['common', 'a', 'b', 'a', 'b', 'a', 'b', 'common'].map(k => blk(k)),
    prep: [], sheets: { a: ws(), b: ws() }
  }, over),
  saved: [], ai: { model: 'gemini-2.5-flash', models: [] }
});

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  실패 ' + name + (extra ? '\n       ' + extra : '')); }
}

console.log('\n[1] 시작 화면');
let r = run(null);
check('두 학년을 묻는다', r.plan.includes('id="s-ga"') && r.plan.includes('id="s-gb"'));
check('수업 시간을 고른다', r.plan.includes('id="s-min"'));
check('지키는 규칙을 먼저 알린다', r.plan.includes('한 학년만 직접지도'));
check('준비물 탭은 수업부터 만들라고 안내', r.prep.includes('먼저 「수업 짜기」'));
check('보관함이 비어 있다', r.box.includes('아직 저장한 차시가 없습니다'));

console.log('\n[2] 잘못된 배치는 만들 수 없다 — 이 앱의 핵심 규칙');
r = run(mk());
const kinds = r.hook.KINDS;
const roleOf = r.hook.roleOf;
/* 〔v0.5〕 규칙이 **표에서 함수로** 옮겨 왔다. 학년이 셋이 되면 표는 아홉 줄이 되고
   한 줄만 빠뜨려도 조용히 어긋나기 때문이다. 그래서 표를 세는 대신
   **규칙 자체를 모든 경우에 대해** 확인한다 — 두 학년일 때도, 세 학년일 때도. */
check('두 학년일 때 고를 수 있는 배치는 네 가지', r.hook.ORDERS().length === 4,
  r.hook.ORDERS().join(','));
[['a', 'b'], ['a', 'b', 'c']].forEach(sides => {
  const ks = sides.concat(['common', 'roam']);
  const label = sides.length + '학년';
  check(label + ' — 동시에 직접지도를 받는 학년은 하나뿐',
    ks.every(k => sides.filter(w => roleOf(k, w) === 'direct').length <= 1),
    '교사는 한 시점에 한 학년만 직접지도할 수 있다');
  check(label + ' — 공통 지도는 모든 학년이 같이',
    sides.every(w => roleOf('common', w) === 'common'));
  check(label + ' — 순회는 모든 학년이 스스로',
    sides.every(w => roleOf('roam', w) === 'indirect'));
  check(label + ' — ㄱ학년 직접이면 나머지는 스스로',
    sides.filter(w => w !== 'a').every(w => roleOf('a', w) === 'indirect'));
  check(label + ' — 세 가지 역할 밖은 나오지 않는다',
    ks.every(k => sides.every(w => ['direct', 'indirect', 'common'].indexOf(roleOf(k, w)) >= 0)));
});

console.log('\n[3] 시간 배치표');
/* 〔v0.5〕 수업 짜기가 걸음 셋으로 나뉘었다. 한 화면이 4,400px 이었기 때문이다.
   검사도 그 걸음으로 옮겨 가서 본다. */
r.hook.setStep(2);
check('세 줄이 나온다 (학년·학년·선생님)',
  r.plan.includes('>3학년</th>') && r.plan.includes('>4학년</th>') && r.plan.includes('>선생님</th>'));
check('구간이 8개 (40분 ÷ 5분)', (r.plan.match(/data-sel="/g) || []).length === 8);
check('시간이 표시된다', r.plan.includes('0–5분') && r.plan.includes('35–40분'));
check('색만 쓰지 않고 글자를 함께 넣는다',
  r.plan.includes('>직접</button>') && r.plan.includes('>스스로</button>') && r.plan.includes('>함께</button>'),
  '접근성 심사에서 가장 많이 걸리는 항목');
check('선생님 줄에 학년 이름이 들어간다', /data-row="t"[^>]*>3학년</.test(r.plan));
check('범례가 있다', r.plan.includes('class="legend"'));

console.log('\n[4] 구간별 활동 — 누르지 않아도 다 펼쳐져 있다');
r.hook.setStep(3);
check('구간 8개가 모두 줄로 나온다',
  [0,1,2,3,4,5,6,7].every(i => r.plan.includes('id="row-' + i + '"')),
  '눌러야 나타나면 적기가 너무 불편하다');
check('줄마다 두 학년 활동 칸이 있다',
  [0,1,2,3,4,5,6,7].every(i => r.plan.includes('id="na-' + i + '"') && r.plan.includes('id="nb-' + i + '"')));
check('줄마다 배치를 바꾸는 드롭다운이 있다',
  [0,1,2,3,4,5,6,7].every(i => r.plan.includes('data-bk="' + i + '"')));
check('줄마다 시간이 적혀 있다', r.plan.includes('>0–5분</b>') && r.plan.includes('>35–40분</b>'));
check('배치 드롭다운도 네 가지뿐',
  (r.plan.match(/<option value="a"/g) || []).length === 8, '구간마다 하나씩');
check('직접·스스로·함께를 이름표로 알려 준다',
  r.plan.includes('<em class="direct">직접</em>') &&
  r.plan.includes('<em class="indirect">스스로</em>') &&
  r.plan.includes('<em class="common">함께</em>'));
check('스스로 칸에는 무엇을 적을지 알려 준다',
  r.plan.includes('혼자서도 할 수 있는 것을 적어 주세요'),
  '복식수업이 무너지는 자리가 바로 이 칸이다');
check('직접 칸과 안내 문구가 다르다', r.plan.includes('선생님과 무엇을 하나요?'));
r.hook.setStep(2);
check('배치표 칸을 누르면 그 줄로 내려간다고 알린다', r.plan.includes('아래 그 구간으로 내려갑니다'));
r.hook.setStep(1);

console.log('\n[5] 시간 계산');
let a = r.hook.analyze(mk().current);
check('3학년 직접지도 15분', a.dirA === 15, String(a.dirA));
check('4학년 직접지도 15분', a.dirB === 15, String(a.dirB));
check('공통 10분', a.common === 10, String(a.common));
check('합이 수업 시간과 같다', a.dirA + a.dirB + a.common + a.roam === 40);

console.log('\n[6] 치우침 잡기');
a = r.hook.analyze(mk({ blocks: ['a','a','a','a','a','b','common','common'].map(k => blk(k)) }).current);
check('직접지도 25분 대 5분', a.dirA === 25 && a.dirB === 5);
check('치우쳤다고 알린다', a.issues.some(x => x.w && x.t.includes('치우쳤')),
  '한쪽 학년이 방치되면 학부모 민원으로 이어진다');
a = r.hook.analyze(mk().current);
check('고를 땐 괜찮다고 한다', a.issues.some(x => !x.w && x.t.includes('고릅니다')));

console.log('\n[7] 혼자 있는 시간 잡기');
a = r.hook.analyze(mk({ blocks: ['a','a','a','a','b','b','common','common'].map(k => blk(k)) }).current);
check('4학년이 20분 연달아 혼자', a.aloneB === 20, String(a.aloneB));
check('너무 오래 혼자라고 알린다', a.issues.some(x => x.w && x.t.includes('혼자')));
a = r.hook.analyze(mk({ blocks: ['common','a','b','a','b','a','b','common'].map(k => blk(k)) }).current);
// 번갈아 배치하면 혼자 있는 구간이 서로 떨어져서, 한 번에 5분씩만 혼자가 된다
check('교차형은 한 번에 5분만 혼자', a.aloneA === 5 && a.aloneB === 5,
  `실제: ${a.aloneA} / ${a.aloneB}`);
check('알맞다고 한다', a.issues.some(x => !x.w && x.t.includes('알맞')));

console.log('\n[8] 모두 스스로가 길면');
a = r.hook.analyze(mk({ blocks: ['roam','roam','roam','a','b','a','b','common'].map(k => blk(k)) }).current);
check('모두 스스로 15분', a.roam === 15);
/* 〔v0.5〕 학년이 셋도 되므로 「둘 다」가 아니라 「모두」라고 적는다 */
check('길다고 알린다', a.issues.some(x => x.w && x.t.includes('모두 스스로')),
  '이 시간에는 아무도 직접 배우지 않는다');

console.log('\n[9] 준비물 — 복식수업이 무너지는 이유');
a = r.hook.analyze(mk().current);
check('스스로 하는 구간이 있는데 준비물이 없으면 경고',
  a.issues.some(x => x.w && x.t.includes('준비되지 않았습니다')));
a = r.hook.analyze(mk({ prep: [{ id: 'x', text: '4학년 곱셈 학습지', done: true }] }).current);
check('준비되면 괜찮다고 한다', a.issues.some(x => !x.w && x.t.includes('모두 준비')));
a = r.hook.analyze(mk({ prep: [{ id: 'x', text: 'ㄱ', done: true }, { id: 'y', text: 'ㄴ', done: false }] }).current);
check('덜 되었으면 알린다', a.issues.some(x => x.w && x.t.includes('아직 다 되지')));
a = r.hook.analyze(mk({ blocks: new Array(8).fill(0).map(() => blk('common')) }).current);
check('전부 공통이면 준비물을 묻지 않는다',
  !a.issues.some(x => x.t.includes('준비되지 않았습니다')), '스스로 하는 시간이 없기 때문');

console.log('\n[10] 빠른 틀');
let t = r.hook.template('cross', 8);
check('교차형은 공통으로 열고 닫는다', t[0].kind === 'common' && t[7].kind === 'common');
check('가운데는 번갈아', t[1].kind === 'a' && t[2].kind === 'b' && t[3].kind === 'a');
a = r.hook.analyze({ blocks: t, blockLen: 5, prep: [{ id: 'p', text: 'x', done: true }] });
check('교차형은 균형이 맞는다', a.dirA === a.dirB);
t = r.hook.template('alt', 8);
check('번갈아만은 도입 없이 바로', t[0].kind === 'a' && t[1].kind === 'b');
t = r.hook.template('common', 8);
check('공통 중심은 대부분 함께',
  t.filter(x => x.kind === 'common').length >= 5, t.map(x => x.kind).join(','));
t = r.hook.template('cross', 9);
check('45분(9구간)에도 맞는다', t.length === 9 && t[8].kind === 'common');

console.log('\n[11] 준비물 화면');
r = run(mk({ prep: [{ id: 'x', text: '4학년 곱셈 학습지 3장', done: false }] }));
check('준비물이 보인다', r.prep.includes('4학년 곱셈 학습지 3장'));
check('체크 칸이 있다', r.prep.includes('data-pk="x"'));
check('무너지는 이유를 설명한다', r.prep.includes('스스로 해야 하는 학년의 할 거리가 없을 때'));

console.log('\n[12] 보관함');
r = run(Object.assign(mk(), { saved: [Object.assign({}, mk().current, { id: 'S1', topicA: '분수의 덧셈' })] }));
check('저장한 차시가 보인다', r.box.includes('분수의 덧셈'));
check('불러오기·복제·인쇄·지우기', ['data-open','data-copy','data-pr','data-del']
  .every(k => r.box.includes(k + '="S1"')));
r = run(Object.assign(mk(), { saved: [Object.assign({}, mk().current,
  { id: 'S2', name: '3·4학년 수학 9월 1주' })] }));
check('붙인 이름으로 보인다', r.box.includes('<b>3·4학년 수학 9월 1주</b>'),
  '교과명만으로는 차시가 쌓였을 때 못 찾는다');
const nm = r.hook.suggestName(mk().current);
check('이름을 비워 두면 그럴듯한 것을 지어 준다', nm.includes('3·4학년') && nm.includes('세 자리 수의 덧셈'), nm);
const nm2 = r.hook.suggestName(mk({ subjectA: '', topicA: '', subjectB: '', topicB: '' }).current);
check('교과가 비어도 이름이 나온다', nm2.length > 0, nm2);

console.log('\n[13] 지도안 인쇄');
const pr = r.hook.printHTML(mk().current);
check('제목이 있다', pr.includes('복식수업 지도안'));
check('학년별 교과·주제 표', pr.includes('세 자리 수의 덧셈') && pr.includes('큰 수의 곱셈'));
check('시간 배치표가 들어간다', pr.includes('class="ptl"') && pr.includes('>0–5</th>'));
check('선생님 동선 줄이 있다', pr.includes('>선생님</th>'));
check('시간 배분 요약', pr.includes('직접지도 15분'));
check('저작권이 들어간다', pr.includes('2026 TEAM LEAP'));
const pr2 = r.hook.printHTML(mk({
  blocks: ['common','a','b','a','b','a','b','common'].map((k, i) => blk(k, i === 1 ? '덧셈 설명' : '', '')),
  prep: [{ id: 'p', text: '학습지', done: true }]
}).current);
check('적어 둔 활동이 표로 들어간다', pr2.includes('덧셈 설명'));
check('준비물이 들어간다', pr2.includes('[준비됨] 학습지'));

console.log('\n[14] 입력값 이스케이프');
r = run(mk({ topicA: '<img src=x onerror=alert(1)>' }));
check('태그가 그대로 들어가지 않는다', !r.plan.includes('<img src=x'));
check('이스케이프되어 표시된다', r.plan.includes('&lt;img'));

console.log('\n[15] 학년 토글 — 적지 않고 고른다');
r = run(null);
check('1~6학년 토글이 나온다',
  [1, 2, 3, 4, 5, 6].every(n => r.plan.includes('data-ga="' + n + '학년"')));
check('둘째 학년도 토글', r.plan.includes('data-gb="6학년"'));
check('고른 값이 저장될 자리가 있다', r.plan.includes('id="s-ga"') && r.plan.includes('id="s-gb"'));
check('수업 시간도 토글', r.plan.includes('data-min="45"'));
check('첫째 학년으로 고른 학년은 둘째에서 눌리지 않는다',
  /data-gb="3학년"[^>]*disabled/.test(r.plan), '같은 학년 두 개는 복식학급이 아니다');
r = run(mk());
check('수업 정보에서도 학년을 바꾼다',
  r.plan.includes('data-ia="5학년"') && r.plan.includes('data-ib="5학년"'));
check('여기서도 같은 학년은 눌리지 않는다',
  /data-ib="3학년"[^>]*disabled/.test(r.plan) && /data-ia="4학년"[^>]*disabled/.test(r.plan));
check('고른 학년이 눌린 상태', /data-ia="3학년"[^>]*aria-pressed="true"/.test(r.plan));

console.log('\n[16] 배치표에서 바로 바꾸기');
r.hook.setStep(2);
check('칸이 눌리는 단추다', /data-cell="0" data-row="a"/.test(r.plan));
check('세 줄 모두 눌린다',
  ['a', 'b', 't'].every(w => r.plan.includes('data-row="' + w + '"')));
check('칸마다 무슨 뜻인지 읽어 준다',
  /aria-label="0–5분 · 3학년 — 함께/.test(r.plan), '스크린리더는 색을 못 본다');
check('칠하기 붓이 네 가지', ['a', 'b', 'common', 'roam']
  .every(k => r.plan.includes('data-brush="' + k + '"')));
check('붓 끄기가 있다', r.plan.includes('data-brush=""'));
r.hook.setBrush('b');
check('붓을 켜면 켜졌다고 알려 준다', r.plan.includes('붓이 켜져 있습니다'));
check('켠 붓이 눌린 상태', /data-brush="b"[^>]*aria-pressed="true"/.test(r.plan));
r.hook.setBrush(null);
check('붓을 끄면 고르기만 한다고 알려 준다', r.plan.includes('붓을 고르면'));

console.log('\n[17] 왼쪽은 쓰는 곳, 오른쪽은 보는 곳');
r = run(mk());
check('두 칸으로 나뉜다', r.plan.includes('class="split"'));
check('미리보기가 오른쪽에 붙어 따라다닌다', /class="rail/.test(r.plan));
check('미리보기 자리가 있다', r.plan.includes('id="pv-body"'));
check('종이 모양으로 보여 준다', r.plan.includes('class="sheet"'));
check('지도안이 그대로 들어 있다', r.plan.includes('복식수업 지도안'));
check('적어 둔 주제가 미리보기에 보인다', r.plan.includes('세 자리 수의 덧셈'));
check('미리보기와 인쇄가 같은 내용',
  r.plan.includes('class="ptl"') && r.hook.printHTML(mk().current).includes('class="ptl"'),
  '한 함수(printHTML)를 둘이 같이 쓴다');
check('크기 바꾸기·창으로 크게 보기가 있다',
  r.plan.includes('id="pv-size"') && r.plan.includes('id="pv-big"'));
check('수업 개요를 접을 수 있다', r.plan.includes('id="ov-fold"'), '다 적고 나면 치운다');
check('학습지 탭도 같은 얼개', r.sheet.includes('class="split"') && r.sheet.includes('id="wpv-body"'));

console.log('\n[18] 구간 길이 바꾸기');
check('구간 길이 토글이 있다', r.plan.includes('data-len="5"') && r.plan.includes('data-len="10"'));
let L = mk({ blocks: ['common','a','b','a','b','a','b','common'].map((k,i)=>blk(k, i===1?'덧셈 설명':'')) }).current;
r.hook.relen(L, 10);
check('40분을 10분씩 나누면 4구간', L.blocks.length === 4 && L.blockLen === 10);
check('시간 합은 그대로 40분', L.blocks.length * L.blockLen === 40);
check('적어 둔 활동은 살아남는다', L.blocks.some(b => b.noteA.includes('덧셈 설명')));
r.hook.relen(L, 5);
check('되돌리면 다시 8구간', L.blocks.length === 8 && L.blockLen === 5);
check('45분은 10분으로 나누어지지 않는다', r.hook.fits(45, 10) === false && r.hook.fits(40, 10) === true);
r = run(mk({ minutes: 45, blocks: new Array(9).fill(0).map(() => blk('roam')) }));
check('45분에서는 10분 토글이 눌리지 않는다', /data-len="10"[^>]*disabled/.test(r.plan));

console.log('\n[19] 학습지 만들기');
r = run(null);
check('수업이 없으면 먼저 수업을 만들라고 안내', r.sheet.includes('먼저 「수업 짜기」'));
r = run(mk());
check('학년을 골라 만든다', r.sheet.includes('data-ws="a"') && r.sheet.includes('data-ws="b"'));
check('문항 유형 다섯 가지를 더할 수 있다',
  ['빈칸', '서술', '선택', '활동', '확인'].every(t => r.sheet.includes('data-wadd="' + t + '"')));
check('왜 학습지부터인지 설명한다', r.sheet.includes('이 종이 한 장으로 버팁니다'));
check('혼자 있는 시간을 함께 보여 준다', r.sheet.includes('연달아 혼자 있는 시간'));
r = run(mk({ sheets: {
  a: { title: '덧셈 혼자 풀기', guide: '혼자 풀어 봅시다', items: [
    item({ prompt: '235 + 147 을 계산해 봅시다', space: 'lines' }),
    item({ type: '선택', prompt: '받아올림이 있나요?', choices: ['있다', '없다'] })
  ] },
  b: { title: '', guide: '', items: [] }
} }));
check('만든 문항이 보인다', r.sheet.includes('235 + 147'));
check('문항을 옮기고 지울 수 있다',
  r.sheet.includes('data-wup=') && r.sheet.includes('data-wdn=') && r.sheet.includes('data-wdel='));
check('선택형에는 보기 칸이 생긴다', r.sheet.includes('data-wc='));
check('미리보기가 함께 나온다', r.sheet.includes('id="wpv-body"') && r.sheet.includes('class="sheet"'));
let sh = r.hook.sheetHTML(mk({ sheets: {
  a: { title: '덧셈 혼자 풀기', guide: '혼자 풀어 봅시다', items: [
    item({ prompt: '235 + 147 을 계산해 봅시다', space: 'lines' }),
    item({ type: '선택', prompt: '받아올림이 있나요?', choices: ['있다', '없다'] })
  ] }, b: ws()
} }).current, 'a');
check('학습지에 제목·학년·안내문이 들어간다',
  sh.includes('덧셈 혼자 풀기') && sh.includes('3학년') && sh.includes('혼자 풀어 봅시다'));
check('이름 쓰는 칸이 있다', sh.includes('이름'));
check('보기가 인쇄된다', sh.includes('◯ 있다') && sh.includes('◯ 없다'));
check('답 쓰는 줄이 인쇄된다', sh.includes('class="wlines"'));
check('저작권이 학습지에도 들어간다', sh.includes('2026 TEAM LEAP'));
a = r.hook.analyze(mk({ sheets: {
  a: { title: '', guide: '', items: [item(), item()] }, b: ws()
} }).current);
check('학습지 문항 수를 센다', a.wsA === 2 && a.wsB === 0);
check('학습지가 있으면 준비물 경고 대신 알려 준다',
  !a.issues.some(x => x.w && x.t.includes('준비되지 않았습니다')) &&
  a.issues.some(x => !x.w && x.t.includes('학습지가 준비')));
a = r.hook.analyze(mk({
  blocks: ['a','a','a','a','b','b','common','common'].map(k => blk(k)),
  sheets: { a: { title: '', guide: '', items: [item()] }, b: ws() }
}).current);
check('오래 혼자 두는 학년의 학습지가 비면 짚는다',
  a.issues.some(x => x.w && x.t.includes('4학년 학습지가 비어')),
  '20분을 혼자 보내는데 줄 것이 없다');

console.log('\n[20] AI 초안 도우미 — API 키 없이, 프롬프트와 JSON으로');
r = run(mk());
check('머리 오른쪽에 단추가 있다', html.includes('id="btn-ai"') && html.includes('AI 초안 도우미'));
check('탭이 아니라 창으로 연다', html.includes('id="modal"') && !html.includes('id="tab-ai"'));
check('API 키를 묻는 곳이 아예 없다',
  !html.includes('apiKey') && !html.includes('generativelanguage') && !/AIza/.test(html),
  '학교에서 키 발급이 막히고, 공용 컴퓨터에 키를 남기지 않는다');

const P = r.hook.promptPlan(mk().current, '구체물로 시작해 주세요');
check('수업 설계 프롬프트가 네 가지 배치만 알려 준다',
  ['"a"', '"b"', '"common"', '"roam"'].every(k => P.includes(k)));
check('동시 직접지도가 없다고 못 박는다', P.includes('동시에 직접지도하는 배치는 존재하지 않습니다'));
check('구간 수를 정확히 알려 준다', P.includes('정확히 8개'));
check('학년·교과·주제를 넣는다',
  P.includes('3학년') && P.includes('세 자리 수의 덧셈') && P.includes('큰 수의 곱셈'));
check('교사의 추가 요청이 들어간다', P.includes('구체물로 시작해 주세요'));
check('스스로 할 거리를 강조한다', P.includes('복식수업이 무너지는 가장 흔한 이유'));
check('개인정보를 넣지 말라고 지시한다', P.includes('학생 이름·개인정보는 절대 넣지 않습니다'));
check('JSON만 내놓으라고 한다', P.includes('JSON 외의 글자'));

const S = r.hook.promptSheet(mk({
  blocks: ['a','a','a','a','b','b','common','common'].map((k,i) => blk(k, i===0?'덧셈 설명':'', '')),
}).current, '쉬운 것부터');
check('학습지 프롬프트는 혼자 있는 시간을 알려 준다', S.includes('연달아 혼자 있는 시간'));
check('짜 둔 수업 흐름을 함께 준다', S.includes('짜 둔 수업 흐름') && S.includes('덧셈 설명'));
check('혼자 풀 수 있는 것만 넣으라고 한다', S.includes('교사 도움 없이 풀 수 있는 것만'));
check('문항 유형을 목록으로 준다',
  ['빈칸','서술','선택','활동','확인'].every(t => S.includes(t)));
check('학습지 프롬프트도 추가 요청을 받는다', S.includes('쉬운 것부터'));
check('두 프롬프트가 서로 다르다', P !== S);

console.log('\n[21] AI가 보낸 것도 규칙을 못 어긴다 — 핵심 규칙의 두 번째 문');
let dr = r.hook.sanitizeDraft({
  blocks: [
    { kind: 'both', noteA: 'ㄱ', noteB: 'ㄴ' },          // 두 학년 동시 직접지도 — 있을 수 없다
    { kind: 'a' }, { kind: 'b' }, { kind: 'a' },
    { kind: 'b' }, { kind: 'a' }, { kind: 'b' }, { kind: 'common' }
  ]
}, mk().current);
check('목록에 없는 배치는 받지 않는다', dr.blocks[0].kind === 'roam', dr.blocks[0].kind);
check('고쳤다는 사실을 숨기지 않는다', dr.fixed.some(x => x.includes('목록에 없')));
check('모든 구간이 네 가지 안에 있다',
  dr.blocks.every(b => ['a', 'b', 'common', 'roam'].includes(b.kind)));
/* 〔v0.5〕 두 학년 수업에 AI 가 「셋째 학년 직접」을 보내면 규칙이 깨진다 */
{
  const two = r.hook.sanitizeDraft({ blocks: [{ kind: 'c', noteA: 'x', noteB: 'y' }] }, mk().current);
  check('없는 학년을 가리키는 배치도 막는다', two.blocks[0].kind === 'roam',
    '두 학년 수업인데 셋째 학년을 가르치라고 오면 안 된다');
}

dr = r.hook.sanitizeDraft({ blocks: new Array(20).fill(0).map(() => ({ kind: 'a' })) }, mk().current);
check('구간 수가 다르면 이 수업에 맞춘다', dr.blocks.length === 8);
check('맞췄다는 사실을 알린다', dr.fixed.some(x => x.includes('8구간')));

dr = r.hook.sanitizeDraft({}, mk().current);
check('빈 응답이 와도 무너지지 않는다', dr.blocks === null && dr.empty === true);

dr = r.hook.sanitizeDraft({ sheetA: { title: 'ㄱ', items: [{ type: '빈칸', prompt: '풀기' }] } }, mk().current);
check('학습지만 온 초안은 배치를 건드리지 않는다', dr.blocks === null,
  '학습지 프롬프트로 받은 것이 배치를 「둘 다 스스로」로 덮으면 안 된다');
check('학습지만 와도 빈 초안은 아니다', dr.empty === false && dr.sheetA.items.length === 1);

dr = r.hook.sanitizeDraft({
  blocks: [{ kind: 'common' }],
  prep: ['학습지 4장', ''],
  sheetA: { title: '연습', guide: '혼자 해요', items: [
    { type: '망한유형', prompt: '풀어 봅시다', space: '이상한칸' },
    { type: '선택', prompt: '고르기', choices: ['ㄱ', 'ㄴ'], space: 'short' },
    { type: '서술', prompt: '' }
  ] }
}, mk().current);
check('없는 문항 유형은 빈칸으로 되돌린다', dr.sheetA.items[0].type === '빈칸');
check('없는 답칸은 기본값으로', dr.sheetA.items[0].space === 'short');
check('지시문 없는 문항은 버린다', dr.sheetA.items.length === 2);
check('선택형 보기는 살린다', dr.sheetA.items[1].choices.join(',') === 'ㄱ,ㄴ');
check('빈 준비물은 버린다', dr.prep.length === 1 && dr.prep[0] === '학습지 4장');
check('받은 초안도 미리 점검해 둔다', typeof dr.check.dirA === 'number');

check('설명이 섞여 와도 JSON을 찾아낸다',
  r.hook.looseJSON('네, 만들었습니다!\n```json\n{"blocks":[]}\n```\n필요하면 말씀하세요.').blocks.length === 0);

/* ==========================================================================
   v0.4 — 수업 중 · 개요를 접어도 살아 있기
   ========================================================================== */

console.log('\n[접기] 수업 개요를 접어도 나머지가 살아 있다');
{
  const st = mk({ blocks: [blk('common','열기','열기'), blk('a','직접','스스로'),
                             blk('b','스스로','직접'), blk('common','닫기','닫기')] });
  const rf = run(st);
  let boom = null;
  try { rf.hook.setOverview(false); } catch (e) { boom = e; }
  check('접었을 때 그리다 터지지 않는다', !boom,
    boom ? String(boom) : '개요 칸을 잡으려다 여기서 멈추면 붓·배치표·활동 칸·저장·인쇄가 하나도 붙지 않는다');
  check('접힌 뒤에도 배치표가 그대로 있다', rf.plan.includes('시간 배치'));
  check('다시 펴는 단추가 살아 있다', rf.plan.includes('id="ov-fold"'));
  const srcd = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  check('없는 칸은 조용히 건너뛴다', /var el = q\('#' \+ f\[0\]\);\s*\n\s*if \(!el\) return;/.test(srcd));
}

console.log('\n[수업 중] 짠 것을 그대로 진행한다');
{
  const st = mk({ startAt: '09:40',
    blocks: [blk('common','다 함께 살펴보기','다 함께 살펴보기'),
             blk('a','받아올림 함께 풀기','학습지 1~3번'),
             blk('b','학습지 4~5번','자리 맞추기 설명'),
             blk('common','서로 말하기','서로 말하기')] });
  const rr = run(st);
  rr.hook.openRun();
  const h1 = rr.hook.runHTML();
  check('수업 중 화면이 열린다', h1.includes('수업 중'));
  check('멈춘 채로 열린다 — 저절로 흐르지 않는다', rr.hook.RUN.paused === true,
    '열자마자 시간이 가면 준비할 틈이 없다');
  check('이 구간이 끝나기까지를 센다', h1.includes('이 구간이 끝나기까지'),
    '전체 남은 시간은 시계를 보면 안다. 알 수 없는 것은 자리를 언제 옮기는가다');
  check('선생님이 어디 계셔야 하는지가 크게 나온다', h1.includes('선생님은 지금'));
  check('두 학년 활동이 함께 보인다',
    h1.includes('다 함께 살펴보기') && h1.includes('첫째 학년') === false);
  check('다음 구간을 미리 알려 준다', h1.includes('다음 ▸'),
    '바꾸기 직전에 알아야 준비가 된다');
  check('시작 시각을 적었으면 진짜 시각도 나온다', /9:40–9:45/.test(h1));

  rr.hook.runNext(true);
  const h2 = rr.hook.runHTML();
  check('다음 구간으로 넘어간다', h2.includes('받아올림 함께 풀기') && h2.includes('학습지 1~3번'));
  check('그 구간의 역할이 바뀐다', h2.includes('직접') && h2.includes('스스로'));

  rr.hook.runNext(true); rr.hook.runNext(true); rr.hook.runNext(true);
  check('마지막 뒤에는 끝났다고 말한다', rr.hook.runHTML().includes('수업이 끝났습니다'));
  check('끝나면 시간이 멈춘다', rr.hook.RUN.paused === true);

  rr.hook.runReset();
  check('처음으로 되돌릴 수 있다', rr.hook.RUN.i === 0 && rr.hook.RUN.paused === true);
  rr.hook.closeRun();
  check('닫으면 화면이 비워진다', rr.hook.runHTML() === '');
}

console.log('\n[수업 중] 교실에서 읽히는 말로');
{
  const rw = run(mk({ blocks: [blk('common'), blk('roam'), blk('a'), blk('b')] }));
  check('공통 지도는 「두 학년과 함께」', rw.hook.whereNow('common') === '두 학년과 함께');
  check('둘 다 스스로는 「돌아다니며 도와주기」', rw.hook.whereNow('roam') === '돌아다니며 도와주기');
  check('학년 직접은 「곁에」', /곁에$/.test(rw.hook.whereNow('a')),
    '배치표는 좁아서 줄여 쓰지만, 수업 중에는 읽고 바로 움직여야 한다');
}

console.log('\n[시작 시각] 없으면 없는 대로');
{
  const rc = run(mk({ startAt: '09:40', blocks: [blk('common'), blk('a')] }));
  check('구간마다 진짜 시각을 셈한다', rc.hook.clockAt({ startAt: '09:40' }, 15) === '9:55');
  check('자정을 넘겨도 터지지 않는다', rc.hook.clockAt({ startAt: '23:50' }, 20) === '0:10');
  check('안 적었으면 빈 값', rc.hook.clockAt({ startAt: '' }, 10) === '');
  check('인쇄물에도 시각이 붙는다', rc.hook.printHTML(rc.hook.ensure(
    { startAt: '09:40', date: '2026-08-05', minutes: 40, blockLen: 5,
      blocks: [blk('common'), blk('a')], prep: [], subjectA: '', topicA: '', subjectB: '', topicB: '' }
  )).includes('9:40'));
  const rn = run(mk({ blocks: [blk('common'), blk('a')] }));
  check('안 적었으면 인쇄물도 그대로', !/\d+:\d\d 시작/.test(rn.hook.printHTML(rn.hook.ensure(
    { startAt: '', date: '2026-08-05', minutes: 40, blockLen: 5,
      blocks: [blk('common')], prep: [], subjectA: '', topicA: '', subjectB: '', topicB: '' }))),
    '적지 않은 것을 지어내면 안 된다');
}

console.log('\n[마크] 이 앱의 마크');
{
  const srcd = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  check('머리말이 앱 마크를 쓴다', srcd.includes('한 교실 안의 두 줄, 그 사이를 오가는 선생님'));
  check('두 줄이 어긋나 있다', /M8 17 H34[\s\S]{0,200}M30 47 H56/.test(srcd),
    '두 학년이 같은 때에 같은 것을 하지 않는다는 것이 복식수업의 전부다');
  check('판권 표기의 상표는 그대로', srcd.includes('<path class="mk-arc" d="M16 46 Q32 -10 48 30"'),
    '저작권 표기는 지우지도 바꾸지도 않는다');
}

/* ==========================================================================
   v0.5 — 한 화면이 4,400px 이던 것을 나누고, 세 학년까지 다룬다
   ========================================================================== */

console.log('\n[v0.5-1] 수업 짜기를 걸음 셋으로');
{
  const t = run(mk());
  check('걸음이 셋', t.hook.STEPS.length === 3);
  t.hook.setStep(1);
  const s1 = t.plan;
  check('①에는 개요가 나온다', s1.includes('id="i-date"'));
  check('①에는 구간 여덟 줄이 안 나온다', !s1.includes('id="row-7"'),
    '개요를 적는 사람에게 여덟 구간이 함께 펼쳐질 까닭이 없다');
  t.hook.setStep(2);
  const s2 = t.plan;
  check('②에는 배치표가 나온다', s2.includes('data-sel="0"'));
  check('②에는 활동 칸이 안 나온다', !s2.includes('id="na-0"'));
  t.hook.setStep(3);
  const s3 = t.plan;
  check('③에는 활동 칸이 나온다', s3.includes('id="na-0"') && s3.includes('id="na-7"'));
  check('③에는 배치표가 안 나온다', !s3.includes('data-sel="0"'));
  check('걸음마다 미리보기는 늘 곁에 있다',
    [s1, s2, s3].every(x => x.includes('id="pv-body"')),
    '무엇을 고치든 종이가 어떻게 바뀌는지가 이 앱의 되먹임이다');
  check('걸음 단추가 셋 다 있다',
    [1, 2, 3].every(i => s1.includes('data-step="' + i + '"')));
  check('다음 걸음으로 가는 단추가 있다', s1.includes('시간 배치 →'));
  check('인쇄할 때 걸음 단추는 감춘다', html.includes('.steps,.stepfoot{display:none!important}'));
}

console.log('\n[v0.5-2] 미리보기를 읽을 수 있게');
{
  check('오른쪽 칸이 780px 까지 넓어졌다', html.includes('minmax(0,780px)'),
    '540px 에 A4 를 0.57 배로 넣으면 452px — 글씨를 읽을 수 없다');
  check('줄이는 배율이 .88 로 올라갔다', html.includes('.rail .sheet{zoom:.88}'));
  check('배치표가 있는 걸음만 왼쪽을 넓게 쓴다', html.includes('.split--w{grid-template-columns'));
}

console.log('\n[v0.5-3] 세 학년 복식');
{
  const three = mk({ blocks: ['common','a','b','c','a','b','c','common']
    .map(k => ({ kind: k, noteA: 'ㄱ 활동', noteB: 'ㄴ 활동', noteC: 'ㄷ 활동' })) });
  three.gradeC = { name: '5학년', count: 3 };
  three.current.subjectC = '사회'; three.current.topicC = '우리 고장';
  const t = run(three);
  check('세 학년이면 배치가 다섯 가지', t.hook.ORDERS().length === 5, t.hook.ORDERS().join(','));
  check('세 학년 이름이 다 나온다',
    ['3학년', '4학년', '5학년'].every(g => t.hook.SIDES().map(t.hook.gName).includes(g)),
    t.hook.SIDES().map(t.hook.gName).join(','));
  const a3 = t.hook.analyze(three.current);
  check('학년마다 직접지도 시간을 센다',
    a3.dir.a === 10 && a3.dir.b === 10 && a3.dir.c === 10,
    JSON.stringify(a3.dir));
  check('합이 수업 시간과 같다',
    a3.dir.a + a3.dir.b + a3.dir.c + a3.common + a3.roam === 40);
  check('세 학년 모두 혼자 있는 시간을 잰다',
    ['a', 'b', 'c'].every(w => typeof a3.alone[w] === 'number'));
  const p3 = t.hook.printHTML(three.current);
  check('종이에 학년이 세 줄', (p3.match(/<th class="rh">/g) || []).length === 5,
    '구간 + 학년 셋 + 선생님');
  check('종이 활동표도 세 칸', p3.includes('>5학년 활동</th>'));
  t.hook.setStep(2);
  check('배치표에도 세 줄', (t.plan.match(/data-row="/g) || []).length > 0 &&
    t.plan.includes('data-row="c"'));
  check('붓도 다섯 가지', ['a','b','c','common','roam']
    .every(k => t.plan.includes('data-brush="' + k + '"')));
  /* 두 학년일 때는 셋째가 아예 없어야 한다 */
  const t2 = run(mk());
  check('두 학년일 때는 셋째 학년 줄이 없다', !t2.hook.SIDES().includes('c'));
  t2.hook.setStep(2);
  check('두 학년일 때 붓은 넷', !t2.plan.includes('data-brush="c"'));
}

console.log('\n[v0.5-4] 예시안 — 빈 칸에서 시작하지 않는다');
{
  const t = run(null);
  check('예시안이 세 가지', (t.plan.match(/data-ex="/g) || []).length === 3);
  check('세 학년 예시안도 있다', t.plan.includes('1·2·3학년'));
  check('무엇을 보여 주는 예시인지 적는다', t.plan.includes('교차형'));
}

console.log('\n[v0.5-5] 인쇄 — 한 뭉치로, 가로로도');
{
  check('지도안과 학습지를 한 번에 뽑는다', html.includes('id="pv-print-all"'),
    '두 번 뽑아 손으로 겹치던 것');
  check('바닥 단추도 한 뭉치', html.includes('지도안 + 학습지 인쇄'));
  check('가로·세로를 고른다', html.includes('data-paper="land"') && html.includes('data-paper="port"'));
  check('@page 를 갈아 끼울 수 있게 따로 뺐다', html.includes('<style id="page-size">'),
    '@page 는 클래스로 못 바꾼다');
  check('가로면 미리보기 종이도 가로', html.includes(':root[data-paper="land"] .sheet{width:297mm}'));
  check('PDF 이름을 수업마다 다르게', html.includes('function fileBase(l)'),
    '열 장을 뽑으면 열 장이 같은 이름이던 것');
  check('인쇄가 끝나면 제목을 되돌린다', html.includes("window.addEventListener('afterprint', back)"));
}

console.log('\n[v0.5-6] 점검 결과가 종이에도 나간다');
{
  const t = run(mk({ blocks: ['a','a','a','a','a','b','common','common'].map(k => blk(k)) }));
  const p = t.hook.printHTML(t.hook.ensure(mk({
    blocks: ['a','a','a','b','b','b','common','common'].map(k => blk(k)) }).current));
  check('종이에 점검 절이 있다', p.includes('<h2>점검</h2>'));
  check('살펴볼 점을 펼쳐서 적는다', p.includes('살펴볼 점 —'));
  check('괜찮은 것은 한 줄로 줄인다', p.includes('확인됨 —'));
  check('규칙이 아니라 판단이라고 적는다', p.includes('규칙이 아니라 판단이 필요한'));
}

console.log('\n[v0.5-7] 인원을 안 적으면 0명이 아니라 「—」');
{
  const noCount = mk();
  noCount.gradeA = { name: '3학년', count: 0 };
  noCount.gradeB = { name: '4학년', count: 0 };
  const t = run(noCount);
  const p = t.hook.printHTML(noCount.current);
  check('종이에 0명이라고 찍지 않는다', !p.includes('>0명 ·'), '0명인 학급은 없다');
  const a = t.hook.analyze(noCount.current);
  check('점검이 인원을 적으라고 짚어 준다',
    a.issues.some(x => x.w && x.t.includes('인원을 적지 않은')));
}

console.log('\n[v0.5-8] 수업 중 — 교실 뒤에서도 읽힌다');
{
  check('글씨 크게 단추가 있다', html.includes('id="run-zoom"'));
  check('전체 화면 단추가 있다', html.includes('id="run-full"'));
  check('큰 글씨 규칙이 있다', html.includes('.run.is-big .run-g .note'));
  check('전체 화면이 안 되면 F11 을 알려 준다', html.includes('F11'));
  check('오른쪽 화살표로 다음 구간', html.includes("e.key === 'ArrowRight'"),
    '교실에서 마우스를 잡기 어렵다');
  check('활동 글을 위에 붙인다', html.includes('.run-g .note{align-self:flex-start}'),
    '가운데 띄우면 빈 상자처럼 보인다');
}

console.log('\n[v0.6] 나가는 길과 새로 짜는 길을 가른다');
{
  /* 「처음으로」가 무엇의 처음인지 애매했다. 머리의 그것은 **앱을 나가고**,
     사람들이 하려던 것은 **새 수업을 짜는 것**이었다. 한 앱 안에 같은 말이
     두 뜻으로 있기도 했다 — 「수업 중」 화면의 처음으로는 타이머 되감기였다. */
  check('머리 단추는 「메인으로」', html.includes('>\n        메인으로\n'),
    '「처음으로」는 앱 안에서 새로 시작한다는 뜻으로 읽힌다');
  check('어디로 가는지·무엇이 남는지 알려 준다',
    html.includes('TEAM LEAP 메인 페이지로 나갑니다. 이 앱에 적은 것은 그대로 남습니다.'));
  check('수업 중 화면의 되감기는 「처음 구간으로」', html.includes('>처음 구간으로</button>'),
    '한 앱 안에 같은 말이 두 뜻으로 있으면 안 된다');
  check('머리 단추 말고 「처음으로」가 남아 있지 않다',
    (html.match(/>처음으로</g) || []).length === 0);

  const t = run(mk({ blocks: ['common','a','b','a','b','a','b','common']
    .map(k => ({ kind: k, noteA: '가', noteB: '나', noteC: '' })) }));
  check('새로 짜는 단추가 늘 보인다', t.plan.includes('id="p-new"'));
  t.hook.setStep(2);
  check('②번 걸음에서도 보인다', t.plan.includes('id="p-new"'));
  t.hook.setStep(3);
  check('③번 걸음에서도 보인다', t.plan.includes('id="p-new"'));
  check('빨간 단추를 걸음 아래에 또 두지 않는다', !t.plan.includes('id="p-cancel"'),
    '같은 일을 하는 자리가 둘일 까닭이 없다');
  check('지금 무엇을 짜고 있는지 적는다', t.plan.includes('class="planbar"'));

  check('갈림길에 잃지 않는 길이 있다', html.includes('id="nw-save"') &&
    html.includes('아무것도 잃지 않습니다'),
    '「예/아니오」로 물으면 잃는 쪽에 예를 눌러야 한다');
  check('잃지 않는 길이 맨 위에 온다',
    html.indexOf('id="nw-save"') < html.indexOf('id="nw-drop"'));
  check('그냥 두는 길도 있다', html.includes('id="nw-no"'));
  check('아무것도 안 적었으면 묻지 않는다', html.includes('if (empty) {'),
    '빈 수업을 두고 「사라집니다」라고 겁줄 까닭이 없다');
  check('이미 보관함에 있으면 또 저장하라고 권하지 않는다',
    html.includes("saved\n        ? ''"));
  check('바닥 단추는 무엇이 지워지는지 이름에 적는다',
    html.includes('>보관함까지 모두 지우기</button>'));
}


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

console.log('\n----------------------------------------');
console.log(pass + '개 통과, ' + fail + '개 실패');
process.exit(fail ? 1 : 0);
