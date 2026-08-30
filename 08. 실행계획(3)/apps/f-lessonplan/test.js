/* 수업 설계안 만들기 (앱 F) — 점검
   최소 DOM 스텁 위에서 앱 스크립트를 **실제로 실행**하고, 나온 결과를 봅니다.

   이 앱에서 가장 중요한 것 넷입니다.
     1. **시간이 넘치는 수업안을 만들 수 없다** — 경고가 아니라 구조입니다.
     2. **학생 이름을 담을 자리가 없다** — 원칙 3번.
     3. **왼쪽을 고치면 오른쪽 종이가 바뀐다** — 다 적고 나서 알면 늦습니다.
     4. **약속한 쪽수 안에 개요·수업·평가가 모두 들어간다** — 넘치면 줄여서라도.
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

/* 흉내는 진짜보다 너그러우면 안 됩니다. id 로 찾을 때는 **그려 놓은 HTML 에
   그 id 가 있을 때만** 돌려줍니다. 늘 무언가를 돌려주면, 화면에 없는 단추를
   잡는 코드가 검사에서는 멀쩡히 지나갑니다. */
function makeEl(tag) {
  return {
    tagName: tag || 'div', _html: '', hidden: false, value: '', textContent: '',
    tabIndex: 0, style: {}, files: null, disabled: false, className: '',
    offsetTop: 0, offsetHeight: 0, clientWidth: 900, children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    set innerHTML(v) { this._html = String(v); },
    get innerHTML() { return this._html; },
    addEventListener() {}, removeEventListener() {}, focus() {}, click() {}, select() {},
    setAttribute(k, v) { this['_' + k] = String(v); },
    getAttribute(k) { return this['_' + k] === undefined ? null : this['_' + k]; },
    appendChild() {}, removeChild() {}, remove() {},
    querySelector(sel) {
      const q = String(sel);
      const m = /^#([\w-]+)$/.exec(q);
      if (m) return this._html.includes('id="' + m[1] + '"') ? makeEl() : null;
      return makeEl();
    },
    querySelectorAll(sel) {
      if (String(sel).includes('role="tab"')) return [makeEl(), makeEl(), makeEl()];
      return [];
    },
    get lastElementChild() { return null; }
  };
}

function run(state) {
  const els = {};
  const store = { 'leap-lessonplan-v1': state ? JSON.stringify(state) : null };
  const sandbox = {
    console,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    setTimeout, clearTimeout, alert() {}, confirm: () => true, prompt: () => '이름',
    navigator: {}, crypto: { randomUUID: () => 'id' + (Math.random() * 1e9 | 0) },
    URL: { createObjectURL: () => 'blob:', revokeObjectURL() {} },
    Blob: function () {}, FileReader: function () {},
    document: {
      documentElement: { setAttribute() {}, getAttribute: () => null, style: {} },
      body: { appendChild() {}, removeChild() {} },
      getElementById(id) { return els[id] || (els[id] = makeEl()); },
      createElement: t => makeEl(t),
      addEventListener() {}, removeEventListener() {}, execCommand() {}
    }
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  sandbox.window.addEventListener = () => {};
  sandbox.window.print = () => { sandbox.__printed = true; };
  vm.createContext(sandbox);
  new vm.Script(js).runInContext(sandbox);
  return { els, F: sandbox.__F, sandbox, store };
}

/* ==========================================================================
   [1] 뜨는가
   ========================================================================== */
console.log('\n[1] 앱이 뜬다');
let r, threw = null;
try { r = run(null); } catch (e) { threw = e; }
check('스크립트가 예외 없이 끝까지 실행된다', !threw, threw && threw.stack);
if (threw) { console.log('\n' + pass + '개 통과, ' + fail + '개 실패'); process.exit(1); }
const F = r.F;
check('검사용 문(__F)이 열려 있다', !!F);
check('네 화면이 모두 그려진다',
  ['panel-s1', 'panel-s2', 'panel-s3', 'panel-box'].every(id => r.els[id] && r.els[id].innerHTML.length > 300));
check('처음 열면 차시 설계안이다', F.doc().kind === 'lesson');
check('처음부터 시간이 딱 맞다', F.leftMin() === 0, String(F.leftMin()));

/* ==========================================================================
   [2] 왼쪽은 쓰는 곳, 오른쪽은 나올 종이 — v0.3 에서 가장 크게 바꾼 것

   v0.2 는 「종이로 내기」가 따로 있는 탭이었습니다. 그래서 한 쪽에 안 들어간다는
   것을 다 적은 뒤에 알았고, 그때는 이미 지울 것을 고르는 일이 되어 있었습니다.
   ========================================================================== */
console.log('\n[2] 한 화면에 입력과 종이가 함께 있다 · 걸음은 셋');
{
  const S = ['s1', 's2', 's3'];
  S.forEach(id => {
    const h = r.els['panel-' + id].innerHTML;
    check(id + ' — 두 칸으로 나뉜다', h.includes('class="wb"') && h.includes('wb-out'));
    check(id + ' — 오른쪽에 종이가 놓일 자리가 있다', h.includes('id="pv-page-' + id + '"'));
    check(id + ' — 몇 쪽짜리인지 보인다', h.includes('id="pv-tag-' + id + '"'));
    check(id + ' — 그 자리에서 인쇄할 수 있다', h.includes('data-print'));
    check(id + ' — 그 자리에서 가로/세로를 뒤집을 수 있다', h.includes('data-flip'));
  });
  check('걸음이 셋이다 — 개요 · 흐름 · 평가', F.STEPS.length === 3,
    'v0.3 은 한 탭에 여덟 마디를 다 넣어 너무 길었다');
  check('① 개요에 기본 정보와 성취기준이 있다',
    r.els['panel-s1'].innerHTML.includes('id="f-topic"') &&
    r.els['panel-s1'].innerHTML.includes('id="btn-std-find"'));
  check('② 흐름에 시간 띠가 있다', r.els['panel-s2'].innerHTML.includes('class="ribbon-bar"'));
  check('③ 평가에 유의사항이 함께 있다',
    r.els['panel-s3'].innerHTML.includes('data-caution'));
  check('걸음마다 다음으로 가는 단추가 있다',
    S.every(id => r.els['panel-' + id].innerHTML.includes('data-go=')),
    '탭만 두면 「다음에 무엇을 하지」가 없다');
  check('AI 초안은 탭이 아니라 머리의 단추다',
    html.includes('id="btn-ai"') && !html.includes('id="tab-ai"'),
    '일곱 앱이 같은 자리에 둔다 — 처음으로 · AI 초안 · 밝게/어둡게');
}

/* ==========================================================================
   [3] 시간이 넘치는 수업안은 만들 수 없다 — 이 앱의 심장 (마스터 원칙 8번)
   ========================================================================== */
console.log('\n[3] 시간 — 경고가 아니라 구조로 막는다');
{
  check('초등 한 차시는 40분', F.LEVELS['초'] === 40);
  check('중학교는 45분, 고등학교는 50분', F.LEVELS['중'] === 45 && F.LEVELS['고'] === 50);

  const one = F.blankDoc('lesson');
  check('빈 차시안의 시간 합이 정확히 40분',
    one.flow.reduce((a, f) => a + f.min, 0) === 40,
    one.flow.map(f => f.min).join('+'));

  /* 2차시 블록 */
  const two = F.blankDoc('lesson'); two.periods = 2; F.fitMinutes(two);
  check('2차시 블록은 80분이 된다', two.flow.reduce((a, f) => a + f.min, 0) === 80,
    two.flow.map(f => f.min).join('+'));
  check('나눠 담아도 합이 어긋나지 않는다',
    [1, 2].every(p => {
      const d = F.blankDoc('lesson'); d.periods = p; F.fitMinutes(d);
      return d.flow.reduce((a, f) => a + f.min, 0) === 40 * p;
    }), '반올림을 나눠 담으면 합이 1~2분씩 어긋난다');

  /* 학교급을 바꾸면 그 자리에서 다시 셈한다 */
  const mid = F.blankDoc('lesson'); mid.level = '중'; F.fitMinutes(mid);
  check('학교급을 바꾸면 45분으로 다시 나뉜다',
    mid.flow.reduce((a, f) => a + f.min, 0) === 45, mid.flow.map(f => f.min).join('+'));

  /* 화면에 남은 시간이 붙어 있다 */
  check('남은 시간이 화면에 늘 보인다', r.els['panel-s2'].innerHTML.includes('class="left'));
  check('한 차시 길이를 함께 적는다', r.els['panel-s2'].innerHTML.includes('한 차시'));
  check('시간을 숫자가 아니라 **띠의 폭**으로도 본다',
    r.els['panel-s2'].innerHTML.includes('class="ribbon-bar"'),
    '이 앱의 마크가 「막대 길이가 곧 시간」인데 화면에는 숫자뿐이었다');
}

/* ==========================================================================
   [4] 성취기준 — v0.2 는 붙여 넣게 했다
   ========================================================================== */
console.log('\n[4] 성취기준을 골라 넣는다');
{
  check('초등 성취기준 611건이 들어 있다', F.stds().length === 611, String(F.stds().length));
  check('성취수준 A·B·C 가 모두 있다',
    F.stds().every(s => s.A && s.B && s.C),
    '이 셋이 그대로 기초·기본·심화 피드백이 된다 — 없으면 굽는 뜻이 없다');
  check('학년군이 셋이다', new Set(F.stds().map(s => s.band)).size === 3);
  check('교과 이름으로 풀려 있다', F.stds().some(s => s.subject === '사회'),
    '[4사06-01] 의 「사」가 「사회」로 읽혀야 고를 수 있다');
  check('코드로 하나를 찾아낸다', !!F.findStd('4사06-01'));
  check('학년으로 학년군을 안다',
    F.bandOf('1') === '2' && F.bandOf('4') === '4' && F.bandOf('6') === '6');

  /* 성취수준 → 피드백 세 수준 */
  const st = run(null); const K = st.F;
  const s = K.findStd('4사06-01');
  K.save(d => { d.doc.stds = [{ code: s.code, text: s.text, A: s.A, B: s.B, C: s.C }]; });
  K.fillFromLevel(0);
  const a0 = K.doc().assess[0];
  check('성취수준 A가 심화로 들어간다', a0.adv === s.A);
  check('성취수준 B가 기본으로 들어간다', a0.base === s.B);
  check('성취수준 C가 기초로 들어간다', a0.low === s.C);
  check('평가요소도 비어 있으면 채운다', !!a0.element);

  /* 이미 적은 것은 덮지 않는다 */
  K.save(d => { d.doc.assess[0].adv = '내가 적은 것'; });
  K.fillFromLevel(0);
  check('이미 적은 줄은 덮어쓰지 않는다', K.doc().assess[0].adv === '내가 적은 것',
    '공들여 적은 것을 단추 하나로 날리면 다시는 안 누른다');

  /* 직접 적기 — 목록에 없는 것(중·고, 창체) */
  const got = F.parseStds('[4국01-01] 대화의 즐거움을 알고 대화를 나눈다.\n[4국01-02] 회의에서 의견을 교환한다.');
  check('붙여 넣은 여러 줄을 나눈다', got.length === 2, JSON.stringify(got));
  check('줄바꿈이 코드와 내용 사이에 들어와도 붙인다',
    F.parseStds('[4국01-01]\n대화의 즐거움을 알고 대화를 나눈다.')[0].text.startsWith('대화의'),
    '교육과정 문서에서 긁으면 이렇게 오는 일이 흔하다');
  check('대괄호 안의 빈칸도 견딘다', F.parseStds('[ 4국01-01 ] 내용')[0].code === '4국01-01');
}

/* ==========================================================================
   [5] 차시안 · 단원안 · 1차시 · 2차시
   ========================================================================== */
console.log('\n[5] 차시안(1·2차시)과 단원안');
{
  const u = F.blankDoc('unit');
  check('단원안에는 탐구 유형이 있다', u.flow.every(f => F.INQUIRY.indexOf(f.inquiry) >= 0));
  check('단원안은 뒤로 갈수록 주도성이 커진다',
    u.flow[0].inquiry === '구조화된 탐구' && u.flow[u.flow.length - 1].inquiry === '개방형 탐구');
  check('단원안에는 시간 칸이 없다', u.flow.every(f => f.min === undefined),
    '단원은 분으로 재는 것이 아니다');
  check('단원안 평가에는 영역 칸이 비어 있다', u.assess.every(a => a.domain === ''));

  const l = F.blankDoc('lesson');
  check('차시안 평가는 세 영역이다',
    l.assess.map(a => a.domain).join(',') === F.DOMAINS.join(','));
  check('차시안에는 학습 형태가 있다', l.flow.every(f => Array.isArray(f.group) && f.group.length));
}

/* ==========================================================================
   [6] 종이 — 가로와 세로, 약속한 쪽수
   ========================================================================== */
console.log('\n[6] 종이 — 가로 한 쪽, 세로 한두 쪽');
{
  const o = F.EXAMPLES[0].f();
  const land = F.pageHTML(o, 'land', 1), port = F.pageHTML(o, 'port', 1);
  check('가로 종이가 나온다', land.includes('class="page land"'));
  check('세로 종이가 나온다', port.includes('class="page port"'));
  ['개요 표', '교수·학습 설계', '과정 중심 평가', 'AI·디지털 활용 유의사항'].forEach(k => {
    const key = k === '개요 표' ? '수업 주제' : k;
    check('가로에 ' + k + '가 들어간다', land.includes(key));
    check('세로에 ' + k + '가 들어간다', port.includes(key));
  });
  check('두 양식이 같은 자료를 쓴다',
    land.includes('우리 지역의 역사 조사하기') && port.includes('우리 지역의 역사 조사하기'),
    '양식이 늘어도 만드는 쪽은 그대로여야 한다');
  check('제목에 교과와 종류가 들어간다',
    F.docTitle(o).includes('사회과') && F.docTitle(o).includes('차시'));
  check('단원안 제목은 「단원」이라 적힌다', F.docTitle(F.blankDoc('unit')).includes('단원'));

  check('가로는 한 쪽까지', F.pageLimit({ orient: 'land', kind: 'lesson', periods: 1 }) === 1);
  check('세로 1차시도 한 쪽까지', F.pageLimit({ orient: 'port', kind: 'lesson', periods: 1 }) === 1);
  check('세로 2차시는 두 쪽까지', F.pageLimit({ orient: 'port', kind: 'lesson', periods: 2 }) === 2);
  check('세로 단원안은 두 쪽까지', F.pageLimit({ orient: 'port', kind: 'unit', periods: 1 }) === 2);

  /* 태그가 붙어 안 나가야 한다 */
  const bad = F.blankDoc('lesson');
  bad.topic = '<script>alert(1)</script>';
  check('입력한 태그가 종이에 그대로 새지 않는다',
    !F.pageHTML(bad, 'land', 1).includes('<script>alert'));

  /* 꼬리말이 내용을 덮지 않는다 — v0.3 을 만들며 실제로 겪은 일 */
  check('꼬리말이 자리를 차지하는 요소다', !/\.page \.foot\{position:absolute/.test(html),
    'absolute 로 띄웠더니 평가표 글자 위에 겹쳐 찍혔다');
  check('가로의 흐름 칸은 늘되 줄지 않는다', /\.page\.land \.flowrow\{flex:1 0 auto\}/.test(html),
    '줄어들 수 있게 두면 칸이 내용보다 작아지며 도구·역할 줄이 잘린다');
  check('종이의 회색이 한 가지다', (html.match(/--fill:#[0-9A-F]{6}/g) || []).length === 1,
    '회색이 셋이면 얼룩덜룩해 보인다');
  check('인쇄에서 종이가 제 높이를 갖는다', /\.page\.land\{min-height:\d+mm\}/.test(html),
    '0 이면 짧은 설계안이 종이 위쪽에만 붙어 나온다');
  check('인쇄 높이를 꽉 채우지 않는다', /min-height:191mm/.test(html) && /min-height:270mm/.test(html),
    '딱 맞추면 반올림 1px 때문에 백지가 한 장 더 나온다');
}

/* ==========================================================================
   [7] 예시안
   ========================================================================== */
console.log('\n[7] 예시안 — 채워진 것을 한 벌 보여 준다');
{
  check('예시안이 셋이다', F.EXAMPLES.length === 3);
  check('차시안·2차시·단원안이 모두 있다',
    F.EXAMPLES.map(x => x.k).join(',') === 'lesson,block,unit');
  F.EXAMPLES.forEach(ex => {
    const o = ex.f();
    check(ex.k + ' — 흐름이 비어 있지 않다', o.flow.length >= 3);
    check(ex.k + ' — 평가가 채워져 있다',
      o.assess.every(a => a.element && a.adv && a.base && a.low),
      '비어 있으면 「예시안」이라는 말이 거짓말이 된다');
    check(ex.k + ' — 성취기준에 성취수준이 붙어 있다', o.stds.length && !!o.stds[0].A);
    check(ex.k + ' — 도구마다 역할이 적혀 있다', o.tools.every(t => t.name && t.role),
      '이름만 적힌 지도안은 다음 해에 못 쓴다');
    if (o.kind === 'lesson') {
      check(ex.k + ' — 시간 합이 정확하다',
        o.flow.reduce((a, f) => a + f.min, 0) === F.LEVELS[o.level] * o.periods,
        o.flow.map(f => f.min).join('+'));
    }
  });
  /* 예시안끼리 내용이 섞이지 않았는가 — 실제로 한 번 섞였다 */
  const sci = F.EXAMPLES[1].f();
  check('과학 예시안의 평가가 사회 예시안 것이 아니다',
    !JSON.stringify(sci.assess).includes('우리 지역의 역사'),
    '한 예시안을 다른 예시안에서 복제하면 이런 일이 조용히 생긴다');
  check('과학 예시안은 제 성취기준을 쓴다', sci.stds[0].code.startsWith('6과'));
}

/* ==========================================================================
   [8] AI 초안 — 프롬프트 생성기이고, 돌아온 것은 반드시 거른다
   ========================================================================== */
console.log('\n[8] AI 초안 — 사람이 못 만드는 상태는 AI 도 못 만든다');
{
  const p = F.buildPrompt();
  check('프롬프트가 만들어진다', p.length > 500);
  check('출력 형식을 JSON 으로 못박는다', p.includes('JSON') && p.includes('"flow"'));
  check('시간 합을 프롬프트에서 먼저 못박는다', p.includes('합계는 반드시 40'));
  check('학생 이름을 쓰지 말라고 적는다', p.includes('학생 이름'),
    '앱 밖으로 나가는 유일한 길목이다');
  check('피드백 세 수준을 요구한다', p.includes('심화') && p.includes('기본') && p.includes('기초'));
  check('기초 → 기본 → 심화 차례로 못박는다', p.includes('기초·기본·심화'),
    '왼쪽에서 오른쪽으로 올라가는 순서라야 「어디까지 데려갈 것인가」로 읽힌다');
  check('활동을 「~하기」 꼴로 쓰라고 못박는다', p.includes('「~하기」 꼴'),
    '서술형 문장은 표의 칸을 넘친다');
  check('API 키를 쓰지 않는다고 창에 적는다', html.includes('API 키가 필요 없습니다'));

  /* 시간이 안 맞게 오면 맞춰서 담는다 */
  const over = F.takeAI(JSON.stringify({
    kind: 'lesson', topic: '주제',
    flow: [{ name: '가', min: 100, group: ['전체'] }, { name: '나', min: 100, group: ['모둠'] }]
  }));
  check('시간 합이 200분으로 와도 받는다', over.ok, over.why);
  check('40분에 맞춰 다시 나눈다',
    over.ok && over.doc.flow.reduce((a, f) => a + f.min, 0) === 40,
    over.ok ? over.doc.flow.map(f => f.min).join('+') : '');
  check('무엇을 고쳤는지 적는다',
    over.ok && over.notes.join(' ').includes('맞춰'),
    '조용히 고치면 교사가 종이를 그대로 믿는다');

  /* 없는 학습 형태 */
  const weird = F.takeAI(JSON.stringify({
    kind: 'lesson', flow: [{ name: '가', min: 40, group: ['텔레파시'] }]
  }));
  check('모르는 학습 형태는 「전체」로 되돌린다',
    weird.ok && weird.doc.flow[0].group.join() === '전체');
  check('되돌렸다는 것을 적는다', weird.ok && weird.notes.join(' ').includes('학습 형태'));

  /* 흐름이 비면 아예 받지 않는다 */
  const empty = F.takeAI(JSON.stringify({ kind: 'lesson', topic: '주제', flow: [] }));
  check('흐름이 비면 받지 않는다', !empty.ok,
    '받으면 종이의 가운데가 통째로 빈다');
  check('왜 못 받는지 말한다', !empty.ok && empty.why.includes('흐름'));

  /* JSON 이 아니면 */
  check('JSON 이 아니면 무엇을 하면 되는지 말한다',
    !F.takeAI('안녕하세요 수업 설계안입니다').ok);
  check('앞뒤에 설명이 섞여 있어도 { } 만 찾아 읽는다',
    F.takeAI('네! 아래와 같습니다.\n{"kind":"lesson","flow":[{"name":"가","min":40}]}\n도움이 되셨길!').ok);

  /* 단원안의 탐구 유형 */
  const uq = F.takeAI(JSON.stringify({
    kind: 'unit', flow: [{ range: '1차시', inquiry: '초능력 탐구' }]
  }));
  const uq2 = (function () {
    const st = run(null); st.F.save(d => { d.doc = st.F.blankDoc('unit'); });
    return st.F.takeAI(JSON.stringify({ kind: 'unit', flow: [{ range: '1차시', inquiry: '초능력 탐구' }] }));
  })();
  check('모르는 탐구 유형은 되돌린다',
    uq2.ok && F.INQUIRY.indexOf(uq2.doc.flow[0].inquiry) >= 0);

  /* 받기 전에는 아무것도 바뀌지 않는다 */
  const before = JSON.stringify(F.doc());
  F.takeAI(JSON.stringify({ kind: 'lesson', topic: '바뀌면 안 됨', flow: [{ name: '가', min: 40 }] }));
  check('보기만 해서는 지금 것이 바뀌지 않는다', JSON.stringify(F.doc()) === before,
    '초안은 초안이다 — 눌러서 받기 전에는 그대로여야 한다');
}

/* ==========================================================================
   [9] 학생 이름을 담을 자리가 없다 (마스터 원칙 3번)
   ========================================================================== */
console.log('\n[9] 학생을 담는 자리가 아예 없다');
{
  const keys = new Set();
  (function walk(v) {
    if (!v || typeof v !== 'object') return;
    Object.keys(v).forEach(k => { keys.add(k); walk(v[k]); });
  })(F.blankDoc('lesson'));
  (function walk(v) {
    if (!v || typeof v !== 'object') return;
    Object.keys(v).forEach(k => { keys.add(k); walk(v[k]); });
  })(F.blankDoc('unit'));
  check('저장 구조에 학생 하나하나를 담을 칸이 없다',
    !['students', 'names', 'roster', 'student'].some(k => keys.has(k)),
    [...keys].join(','));
  check('평가는 「누구를」이 아니라 「무엇을 어떻게」만 적는다',
    ['element', 'adv', 'base', 'low', 'method'].every(k => keys.has(k)));
  check('지도교사 말고 사람 이름 칸이 없다',
    [...keys].filter(k => /name/i.test(k)).join(',') === 'name',
    '도구 이름(name)만 있어야 한다');
}

/* ==========================================================================
   [10] 옛 자료도 열린다 (함정 10번)
   ========================================================================== */
console.log('\n[10] 칸이 없던 시절의 자료도 열린다');
{
  const old = run({ v: 1, doc: { kind: 'lesson' } });
  check('거의 빈 문서도 터지지 않고 열린다', !!old.F && old.F.doc().flow.length >= 0);
  check('없던 칸을 채워 준다',
    Array.isArray(old.F.doc().stds) && Array.isArray(old.F.doc().cautions));
  const junk = run({ v: 1, doc: { kind: '엉뚱한값', periods: 9, orient: 'zz', level: 'X', flow: 'x' } });
  check('말이 안 되는 값이 들어 있어도 되돌려 연다',
    junk.F.doc().kind === 'lesson' && junk.F.doc().periods === 1 &&
    junk.F.doc().orient === 'land' && junk.F.doc().level === '초' &&
    Array.isArray(junk.F.doc().flow));
  const nobox = run({ v: 3, doc: F.blankDoc('lesson') });
  check('보관함이 없던 파일도 연다', Array.isArray(nobox.F.D().box));
}

/* ==========================================================================
   [11] 보관함 — 열기 전에 지금 것을 넣어 둔다
   ========================================================================== */
console.log('\n[11] 보관함 — 파일 한 번 열었다고 쌓아 둔 것이 사라지지 않는다');
{
  const st = run(null); const K = st.F;
  K.save(d => { d.doc.topic = '첫 번째'; });
  K.stash('첫 번째 보관');
  check('보관함에 들어간다', K.D().box.length === 1);
  check('넣어도 화면의 것은 그대로다', K.doc().topic === '첫 번째',
    '넣었더니 화면이 비면 아무도 안 넣는다');
  check('보관함이 보관함을 품지 않는다', K.D().box[0].doc.box === undefined,
    '품으면 한 번 저장할 때마다 자료가 두 배가 된다');
  K.stash('두 번째 보관');
  check('이름이 같아도 덮지 않고 쌓는다', K.D().box.length === 2);
  check('가장 나중 것이 맨 위에 온다', K.D().box[0].name === '두 번째 보관');
}

/* ==========================================================================
   [12] 설계 원칙
   ========================================================================== */
console.log('\n[12] 설계 원칙 — 검사가 고정한다');
{
  check('외부 호출이 없다 (원칙 1)',
    !/\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/.test(js),
    '단일 HTML · 외부 CDN 0');
  check('외부 파일을 부르지 않는다',
    !/<script[^>]+src=/.test(html) && !/<link[^>]+stylesheet/.test(html));
  check('API 키를 적는 칸이 없다', !/api[-_ ]?key/i.test(html));
  check('h1 이 하나다', (html.match(/<h1[ >]/g) || []).length === 1);
  check('저작권 표기가 있다', html.includes('© 2026 TEAM LEAP'));
  check('출처를 밝힌다', html.includes('KERIS') && html.includes('한국교육과정평가원'));
  check('메인으로 돌아가는 길이 있다', html.includes('iconbtn--home'));
  check('마크의 획 색이 정해져 있다', /\.mk-low\{stroke:/.test(html),
    'stroke 가 없으면 SVG 는 선을 그리지 않는다 — 보여야 표기다');
  check('인쇄 스타일이 있다 (원칙 5)', html.includes('@media print'));
  check('용지 방향을 바꿀 수 있다', html.includes('id="page-size"'),
    '@page 는 클래스로 못 바꾼다');
  check('색만으로 말하지 않는다 — 학습 형태에 글자가 붙는다',
    F.pageHTML(F.EXAMPLES[0].f(), 'land', 1).includes('class="who g-'));
}

/* ==========================================================================
   [13] v0.4 에서 현장이 짚어 준 것들
   ========================================================================== */
console.log('\n[13] 현장에서 짚어 준 것들');
{
  /* 활동 어미 — 지도안은 읽는 글이 아니라 보는 표다 */
  const bad = [];
  F.EXAMPLES.forEach(ex => {
    const o = ex.f();
    o.flow.forEach(f => {
      [f.tAct, f.sAct, f.act, f.detail].filter(Boolean).forEach(t => {
        String(t).split('\n').forEach(line => {
          if (/(합니다|한다|习니다|입니다)\s*$/.test(line.trim())) bad.push(ex.k + ': ' + line.trim());
        });
      });
    });
  });
  check('예시안의 활동이 모두 「~하기」 꼴이다', bad.length === 0, bad.slice(0, 3).join(' | '));

  /* 학습 형태 — 색으로 나누되 글자를 함께 (원칙 4) */
  const tags = F.groupTags(['전체', '모둠']);
  check('학습 형태에 색 갈래가 붙는다', tags.includes('g-전체') && tags.includes('g-모둠'));
  check('색 옆에 글자가 함께 있다', tags.includes('>전체<') && tags.includes('>모둠<'),
    '색만으로 정보를 전달하지 않는다 (원칙 4)');
  check('네 형태에 각각 다른 색이 있다',
    F.GROUPS.every(g => new RegExp('\\.who\\.g-' + g + '\\s*\\{').test(html)),
    F.GROUPS.join(','));

  /* 평가 순서 — 종이와 입력 화면이 같아야 옮겨 적을 때 헷갈리지 않는다 */
  const paper = F.pageHTML(F.EXAMPLES[0].f(), 'land', 1);
  check('종이의 피드백이 기초 → 기본 → 심화 순이다',
    paper.indexOf('>기초<') < paper.indexOf('>기본<') &&
    paper.indexOf('>기본<') < paper.indexOf('>심화<'),
    paper.indexOf('>기초<') + '/' + paper.indexOf('>기본<') + '/' + paper.indexOf('>심화<'));
  const inp = r.els['panel-s3'].innerHTML;
  /* 이름표가 <p> 였다가 <label for> 이 되었습니다(칸에 안 붙는 이름표였습니다).
     여기서 지키려는 것은 «순서»이지 «태그»가 아니므로 태그를 묻지 않습니다. */
  const at = (t) => inp.search(new RegExp('>' + t + '<\\/(p|label)>'));
  check('입력 화면도 같은 순서다',
    at('기초') >= 0 && at('기초') < at('기본') && at('기본') < at('심화'),
    '종이와 다르면 옮겨 적을 때 헷갈린다 — ' +
    at('기초') + '/' + at('기본') + '/' + at('심화'));

  /* 머리 단추 — 일곱 앱이 같은 자리 */
  const head = html.slice(html.indexOf('top-actions'), html.indexOf('</header>'));
  check('머리 차례가 처음으로 · AI 초안 · 밝게/어둡게',
    head.indexOf('iconbtn--home') < head.indexOf('id="btn-ai"') &&
    head.indexOf('id="btn-ai"') < head.indexOf('id="btn-theme"'), head.length + '자');
  check('화면 전환 대신 무엇이 되는지 적는다',
    html.includes('어둡게 보기') && !html.includes('>화면 전환<'),
    '「화면 전환」은 무엇이 바뀌는지 말해 주지 않는다');
  check('단추가 스스로 말을 바꾼다', html.includes('LEAP.initThemeBtn'));
}

/* ==========================================================================
   [14] 종이를 인쇄해 보고 나온 것들 — 화면에서는 안 보이던 자리
   ========================================================================== */
console.log('\n[14] 인쇄해 보고 나온 것들');
{
  const paper = F.pageHTML(F.EXAMPLES[0].f(), 'land', 1);

  /* 같은 이름을 두 뜻으로 쓰지 않는다 — 이번 판에서 가장 크게 물린 자리 */
  check('종이의 소제목은 psec 다', paper.includes('class="psec"') && !paper.includes('<h2 class="sec"'),
    '`sec` 로 두면 입력 화면의 카드 규칙(.sec{background·border·padding:18px 20px·shadow})이 ' +
    '**겹치지 않는 성질만 골라** 그대로 얹힌다 — specificity 로는 못 막는다');
  check('psec 는 배경·테두리·그림자를 스스로 끈다',
    /\.page h2\.psec\{[^}]*background:none[^}]*box-shadow:none[^}]*border:0/.test(html),
    '한 번 물린 자리는 다시 물리지 않게 못박아 둔다');
  check('입력 화면의 카드는 그대로 sec 다', r.els['panel-s1'].innerHTML.includes('class="sec"'));

  /* 머리 표의 세로 정렬 */
  check('머리 표가 가운데 정렬이다', /\.page table\.hd td\{vertical-align:middle\}/.test(html),
    '이름표(작은 글씨)와 값(큰 글씨)의 밑선이 어긋나 아래로 처져 보였다');
  check('개요의 이름표는 위 정렬이다', /\.ovw td\.k\{vertical-align:top\}/.test(html),
    '값이 여러 줄이면 가운데는 한참 아래로 내려간다');
  check('머리 표에 hd 가 붙어 있다', paper.includes('<table class="hd">'));

  /* 인쇄에서 오른쪽 테두리가 잘리던 것 */
  check('인쇄에서 안쪽 여백을 0으로 두지 않는다',
    /padding:0 \.6mm!important/.test(html),
    '표의 오른쪽 테두리가 인쇄 경계에 딱 붙으면 1px 이 잘려 「테두리 없는 표」가 나온다');

  /* PDF 로 저장할 때의 파일 이름 */
  const nm = F.fileBase(F.EXAMPLES[0].f());
  check('파일 이름이 종류_교과_단원_날짜 다', /^차시안_사회_.+_\d{4}-\d{2}-\d{2}$/.test(nm), nm);
  check('2차시와 단원안을 이름으로 가른다',
    F.fileBase(F.EXAMPLES[1].f()).startsWith('차시안2_') &&
    F.fileBase(F.EXAMPLES[2].f()).startsWith('단원안_'));
  check('파일 이름에 못 쓰는 글자를 걷어낸다',
    !/[\\/:*?"<>|]/.test(F.fileBase({ kind: 'lesson', periods: 1, subject: '국어',
      unit: '3/4단원: "물음표"가 <든> 이름 *별*' })),
    F.fileBase({ kind: 'lesson', periods: 1, subject: '국어', unit: '3/4단원: "물음표"가 <든> 이름 *별*' }));
  check('단원도 주제도 비면 「설계안」으로 둔다',
    F.fileBase({ kind: 'lesson', periods: 1, subject: '국어', unit: '', topic: '' }).includes('설계안'));
  check('인쇄하는 동안만 제목을 바꾸고 되돌린다',
    html.includes("document.title = fileBase(o)") && html.includes("afterprint"),
    '되돌리지 않으면 브라우저 탭 이름이 파일 이름인 채로 남는다');
}

/* ==========================================================================
   [15] 종이 마무리 · 이 앱의 얼굴
   ========================================================================== */
console.log('\n[15] 종이 마무리 · 시간 띠');
{
  const o = F.EXAMPLES[0].f();
  const land = F.pageHTML(o, 'land', 1), port = F.pageHTML(o, 'port', 1);

  /* 꼬리말 */
  check('꼬리말이 오른쪽으로 붙는다', /\.page \.foot\{[^}]*text-align:right/.test(html),
    '가운데에 두면 「본문의 일부」처럼 보인다');
  check('「학교 안에서 쓰는 자료입니다」를 뺐다', !land.includes('학교 안에서 쓰는 자료'));
  check('꼬리말에 제목은 남는다', land.includes('TEAM LEAP 수업 설계안 만들기'));

  /* 개요 — 여섯 칸이 모두 점으로 */
  const ov = land.slice(land.indexOf('class="ovw"'), land.indexOf('psec'));
  check('개요의 여섯 칸이 모두 점으로 시작한다',
    (ov.match(/<ul class="tight">/g) || []).length === 6,
    (ov.match(/<ul class="tight">/g) || []).length + '개 — 셋만 점이고 셋은 맨 글자였다');
  check('빈 칸에는 점을 찍지 않는다',
    !F.pageHTML(F.blankDoc('lesson'), 'land', 1).includes('<li></li>'));

  /* 도구 · 역할 줄바꿈 */
  check('카드의 도구와 역할이 줄을 나눈다',
    /<div class="f"><span><b>도구<\/b>[^<]*<\/span><span><b>역할<\/b>/.test(land),
    '한 줄에 붙이면 어디까지가 도구고 어디부터가 역할인지 안 갈린다');
  check('도구만 있어도 깨지지 않는다',
    F.pageHTML({ kind: 'lesson', periods: 1, orient: 'land', level: '초', stds: [], tools: [],
      cautions: [], assess: [], flow: [{ name: '가', min: 40, group: ['전체'], tool: '패들렛', role: '' }] },
      'land', 1).includes('<b>도구</b>'));

  /* 시간 띠 — 이 앱의 얼굴 */
  const rb = F.ribbonHTML(o);
  check('시간 띠가 그려진다', rb.includes('class="ribbon-bar"'));
  check('칸의 폭이 곧 시간이다',
    o.flow.every(f => rb.includes('flex:0 0 ' + (f.min / 40 * 100).toFixed(2) + '%')),
    o.flow.map(f => (f.min / 40 * 100).toFixed(2)).join(' / '));
  check('칸마다 학습 형태 색이 붙는다', rb.includes('gc-전체') && rb.includes('gc-모둠'));
  check('두 형태가 섞이면 「섞임」이다', F.groupClass(['모둠', '개별']) === 'gc-섞임');
  check('무슨 색이 무엇인지 글자로도 적는다', rb.includes('class="ribbon-key"'),
    '색만으로 정보를 전달하지 않는다 (원칙 4)');
  check('띠를 눌러 그 단계로 갈 수 있다', rb.includes('data-jump="0"'));
  check('남은 시간은 빗금으로 남는다', (function () {
    const half = F.blankDoc('lesson');
    half.flow = [{ id: 'x', name: '가', min: 10, group: ['전체'], title: '', tAct: '', sAct: '', tool: '', role: '' }];
    return F.ribbonHTML(half).includes('class="rest"');
  })(), '아직 안 쓴 시간이 눈에 보여야 한다');
  check('딱 맞으면 빗금이 없다', !rb.includes('class="rest"'));

  /* 걸음 표시 */
  const wk = F.walkRow(o, 's1');
  check('걸음 표시가 세 걸음을 보여 준다', (wk.match(/data-go=/g) || []).length === 3);
  check('지금 걸음에 표가 붙는다', wk.includes('aria-current="true"'));
  check('채운 걸음은 체크로 바뀐다', wk.includes('✓'), '어디까지 했는지 사람이 기억하지 않아도 된다');
  check('빈 설계안은 체크가 없다', !F.walkRow(F.blankDoc('lesson'), 's1').includes('✓'));
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

console.log('\n' + '-'.repeat(40));
console.log(pass + '개 통과, ' + fail + '개 실패');
process.exit(fail ? 1 : 0);
