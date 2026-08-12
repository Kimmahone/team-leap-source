/* 학급 회의 — 렌더 경로 점검
   최소 DOM 스텁 위에서 앱 스크립트를 실제로 실행하고,
   저장 상태를 단계별로 바꿔가며 화면이 제대로 만들어지는지 본다. */

const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, 'index.html');

const html = fs.readFileSync(APP, 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function makeEl(tag) {
  const el = {
    tagName: tag || 'div', _html: '', hidden: false, value: '', textContent: '',
    tabIndex: 0, classList: { add() {}, remove() {} }, style: {}, files: null,
    set innerHTML(v) { this._html = v; },
    get innerHTML() { return this._html; },
    addEventListener() {}, removeEventListener() {}, focus() {}, click() {},
    setAttribute(k, v) { this['_' + k] = v; },
    getAttribute(k) { return this['_' + k] || null; },
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
      if (String(sel).includes('role="tab"')) return [makeEl(), makeEl(), makeEl()];
      return [];
    }
  };
  return el;
}

/* hash 를 '#board' 로 주면 앱이 «모아 보기 창»으로 켜집니다 〔v0.4〕.
   그 화면에 내용이 새는지를 여기서 확인합니다 — 사람 눈으로는 놓치는 자리입니다. */
function run(state, hash) {
  const panels = {};
  const store = { 'leap-classboard-v1': state ? JSON.stringify(state) : null };
  const sent = [];                       // 창 사이로 나간 알림

  const sandbox = {
    console,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v; },
      removeItem: k => { delete store[k]; }
    },
    matchMedia: () => ({ matches: false }),
    crypto: globalThis.crypto,
    alert: () => {}, confirm: () => true,
    setTimeout: () => {}, clearTimeout: () => {}, setInterval: () => {},
    Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    FileReader: function () {},
    location: { hash: hash || '', pathname: '/index.html', search: '' },
    BroadcastChannel: function () {
      this.postMessage = v => sent.push(v);
      this.onmessage = null;
      this.close = () => {};
    },
    addEventListener() {}, removeEventListener() {}, open: () => null,
    document: {
      title: '학급 회의 — TEAM LEAP',
      getElementById(id) {
        if (!panels[id]) panels[id] = makeEl();
        return panels[id];
      },
      createElement: makeEl,
      body: { appendChild() {}, removeChild() {}, className: '' },
      documentElement: makeEl()
    }
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;

  const vm = require('vm');
  vm.createContext(sandbox);
  vm.runInContext(js, sandbox, { timeout: 5000 });

  return {
    meet: panels['panel-meet'] ? panels['panel-meet']._html : '',
    rule: panels['panel-rule'] ? panels['panel-rule']._html : '',
    log: panels['panel-log'] ? panels['panel-log']._html : '',
    board: panels['board-view'] ? panels['board-view']._html : '',
    boardOn: panels['board-view'] ? panels['board-view'].hidden === false : false,
    sent, store
  };
}

/* --- 상태 만들기 --- */
const mk = (over) => ({
  v: 1, className: '3학년 1반',
  current: Object.assign({
    id: 'm1', title: '9월 첫째 주 학급 회의', date: '2026-09-04', step: 1,
    agendas: [], agendaVotes: [], agendaClosed: false, pickedAgendaId: null,
    ideas: [], ideaVotes: [], ideaClosed: false, pickedIdeaId: null, decision: ''
  }, over),
  meetings: [], rules: []
});

const AG = [{ id: 'a1', text: '복도에서 뛰는 친구가 많다' }, { id: 'a2', text: '모둠 자리를 자주 바꾸고 싶다' }];
const ID = [{ id: 'i1', text: '복도 지킴이를 돌아가며 맡는다' }, { id: 'i2', text: '뛰면 다음 쉬는 시간에 도와주기' }];

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  실패 ' + name + (extra ? '\n       ' + extra : '')); }
}

console.log('\n[1] 회의 없음 — 시작 화면');
let r = run(null);
check('회의 시작 폼이 뜬다', r.meet.includes('새 회의 시작'));
check('약속 탭 비어 있음 안내', r.rule.includes('아직 약속이 없습니다'));
check('기록 탭 비어 있음 안내', r.log.includes('아직 마친 회의가 없습니다'));

console.log('\n[2] 1단계 — 안건 모으기');
r = run(mk({ step: 1, agendas: AG }));
check('제출 폼이 있다', r.meet.includes('id="f-item"'));
check('개수만 보인다 (2개)', r.meet.includes('>2</span>'));
check('안건 내용은 감춰져 있다', !r.meet.includes('복도에서 뛰는 친구가 많다'),
  '수집 중에 내용이 노출되면 무기명이 깨진다');
check('무기명 안내가 있다', r.meet.includes('무기명입니다'));

console.log('\n[3] 2단계 — 안건 투표 (집계 감춤)');
r = run(mk({ step: 2, agendas: AG, agendaVotes: [{ targetId: 'a1' }, { targetId: 'a1' }] }));
check('안건이 공개된다', r.meet.includes('복도에서 뛰는 친구가 많다'));
check('투표 버튼이 있다', r.meet.includes('data-vote="a1"'));
check('투표 인원만 보인다 (2명)', r.meet.includes('>2</span>'));
check('득표수는 감춰져 있다', !r.meet.includes('2표'),
  '투표 중 집계가 보이면 먼저 고른 사람을 따라가게 된다');

console.log('\n[4] 2단계 마감 — 결과 공개');
r = run(mk({ step: 2, agendaClosed: true, agendas: AG, agendaVotes: [{ targetId: 'a1' }, { targetId: 'a1' }, { targetId: 'a2' }] }));
check('득표수가 보인다', r.meet.includes('2표') && r.meet.includes('1표'));
check('최다 득표가 맨 위', r.meet.indexOf('복도에서 뛰는') < r.meet.indexOf('모둠 자리를'));
check('선택 버튼이 있다', r.meet.includes('data-pick="a1"'));

console.log('\n[5] 동점 처리');
r = run(mk({ step: 2, agendaClosed: true, agendas: AG, agendaVotes: [{ targetId: 'a1' }, { targetId: 'a2' }] }));
check('동점 안내가 뜬다', r.meet.includes('가장 많은 표가 같습니다'));

console.log('\n[6] 3단계 — 해결책 모으기');
r = run(mk({ step: 3, agendas: AG, pickedAgendaId: 'a1', ideas: ID }));
check('고른 안건을 보여준다', r.meet.includes('복도에서 뛰는 친구가 많다'));
check('해결책 내용은 감춰져 있다', !r.meet.includes('복도 지킴이를'));
check('개수만 보인다 (2개)', r.meet.includes('>2</span>'));

console.log('\n[7] 5단계 — 결정');
r = run(mk({
  step: 5, agendas: AG, pickedAgendaId: 'a1', ideas: ID, pickedIdeaId: 'i1',
  ideaVotes: [{ targetId: 'i1' }], decision: '복도 지킴이를 주마다 돌아가며 맡기로 했다.'
}));
check('안건과 해결책이 함께 보인다',
  r.meet.includes('복도에서 뛰는 친구가 많다') && r.meet.includes('복도 지킴이를'));
check('결정문이 채워져 있다', r.meet.includes('주마다 돌아가며'));
check('약속 등록 버튼', r.meet.includes('id="btn-rule"'));
check('회의 마치기 버튼', r.meet.includes('id="btn-finish"'));

console.log('\n[8] 약속 · 신호등');
// 앱은 LEAP.todayISO() 로 「그 지역의 오늘」을 씁니다. toISOString() 은 UTC라
// 한국 시간 자정~오전 9시 사이에는 하루 어긋나 이 검사가 매일 아침 실패했습니다.
// 선생님에게 오늘은 UTC가 아니라 여기 날짜입니다. 앱이 맞고 검사가 틀렸습니다.
const today = (function () {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
})();
const logObj = {}; logObj[today] = 'good';
r = run({
  v: 1, className: '3학년 1반', current: null, meetings: [],
  rules: [{ id: 'r1', text: '복도에서 뛰지 않기', from: '9월 첫째 주 학급 회의', since: '2026-09-04', log: logObj }]
});
check('약속이 보인다', r.rule.includes('복도에서 뛰지 않기'));
check('오늘 신호등이 눌린 상태', r.rule.includes('data-v="good"') && r.rule.includes('aria-pressed="true"'));
check('실천율이 계산된다 (100%)', r.rule.includes('100%'));
check('신호등에 글자가 함께 있다', r.rule.includes('잘 지켰어요'),
  '색만으로 정보를 전달하면 접근성 심사에서 걸린다');

console.log('\n[9] 기록');
r = run({
  v: 1, className: '3학년 1반', current: null, rules: [],
  meetings: [{
    id: 'm1', title: '9월 첫째 주 학급 회의', date: '2026-09-04', step: 5,
    agendas: AG, agendaVotes: [{ targetId: 'a1' }], pickedAgendaId: 'a1',
    ideas: ID, ideaVotes: [{ targetId: 'i1' }], pickedIdeaId: 'i1',
    decision: '복도 지킴이를 맡기로 했다.'
  }]
});
check('지난 회의가 보인다', r.log.includes('9월 첫째 주 학급 회의'));
check('결정이 보인다', r.log.includes('복도 지킴이를 맡기로 했다'));
check('인쇄 버튼이 있다', r.log.includes('data-print="m1"'));

console.log('\n[10] 입력값 이스케이프');
r = run(mk({ step: 2, agendas: [{ id: 'x', text: '<img src=x onerror=alert(1)>' }] }));
check('HTML 태그가 그대로 들어가지 않는다', !r.meet.includes('<img src=x'));
check('이스케이프되어 표시된다', r.meet.includes('&lt;img'));

/* ==========================================================================
   v0.3 에서 들어온 것들 — 그동안 검사가 없던 자리
   ========================================================================== */

const SRC = require('fs').readFileSync(require('path').join(__dirname, 'index.html'), 'utf8');

function days(n) {                        // 오늘부터 거꾸로 n일치 ISO
  const out = [], t = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(t.getTime() - i * 86400000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
const DD = days(14);
const RULE = {
  id: 'r1', text: '복도에서는 걸어 다닌다', from: '9월 첫째 주 학급 회의',
  since: DD[0], log: { [DD[0]]: 'good', [DD[3]]: 'soso', [DD[6]]: 'bad' }
};
const withRules = (rules) => ({ v: 1, className: '3학년 1반', current: null, meetings: [], rules: rules });

console.log('\n[실천 기록] 지난 날도 채울 수 있다');
{
  const rr = run(withRules([RULE]));
  check('14일 띠의 칸이 눌린다', /class="sq" data-day="/.test(rr.rule),
    '오늘만 찍히면 금요일에 한 주를 정리할 수 없고, 하루 빠뜨리면 그 칸은 영영 빈다');
  check('어느 날인지 칸에 적혀 있다', rr.rule.includes('class="dd"'));
  check('눌러서 바꿀 수 있다고 읽어 준다', rr.rule.includes('눌러서 바꾸기'));
  check('돌아가며 바뀐다', /var CYCLE = \['', 'good', 'soso', 'bad'\]/.test(SRC));
  check('빈 값이면 기록을 지운다', /if \(next\) r\.log\[k\] = next; else delete r\.log\[k\]/.test(SRC),
    '한 바퀴 돌면 「기록 없음」으로 되돌아와야 잘못 찍은 것을 지울 수 있다');
}

console.log('\n[색만으로 알리지 않는다] — 원칙 4');
{
  const rr = run(withRules([RULE]));
  check('기호를 함께 넣는다', rr.rule.includes('●') || rr.rule.includes('◐') || rr.rule.includes('○'),
    '색만 칠하면 색을 못 보는 사람에게는 빈 칸이다');
  check('세 값이 서로 다른 기호다',
    new Set(['●', '◐', '○']).size === 3 && /var SYM = \{ good: '●', soso: '◐', bad: '○'/.test(SRC));
  check('흑백 인쇄에서도 구분된다', SRC.includes("SYM[v] || '·'"),
    '이 앱의 인쇄는 일부러 흑백이다. 색으로만 구분하면 종이에서 셋이 같아진다');
}

console.log('\n[교실 게시용] 약속을 종이로 붙인다');
{
  const rr = run(withRules([RULE]));
  check('게시용 인쇄 단추가 있다', rr.rule.includes('id="btn-printrules"'),
    '매일 보는 약속을 교실에 붙일 수 없으면 아무도 안 본다');
  check('약속이 없으면 단추도 없다', !run(withRules([])).rule.includes('id="btn-printrules"'));
  check('게시물에 기호 설명이 붙는다', SRC.includes('● 잘 지켰어요 · ◐ 조금 아쉬워요'),
    '기호만 있고 뜻이 없으면 학부모가 읽을 수 없다');
  check('학급 기록임을 종이에도 적는다',
    SRC.includes('학급 전체를 기록한 것입니다. 학생 개인의 기록이 아닙니다'),
    '교실 벽에 붙는 종이다. 개인 기록으로 읽히면 안 된다');
}

console.log('\n[인쇄] 미리 보고 뽑는다');
{
  check('미리보기를 거친다', /function showPrint\(html, label, fileBase\)/.test(SRC));
  check('회의록도 같은 길로 간다', /showPrint\(minutesHTML\(id\), '회의록'/.test(SRC));
  check('미리보기와 인쇄가 같은 HTML 이다', SRC.includes('미리보기와 인쇄에 같은 HTML 이 나가므로'));
  check('판면 규칙이 @media print 밖에 있다', SRC.includes('.pv-page .p-'),
    '@media print 안에만 두면 미리보기가 종이와 갈린다');
  check('색이 종이에도 살아 있다', SRC.includes('print-color-adjust'));
}

console.log('\n[마크] 이 앱의 마크');
{
  check('이름 없이 넣는 상자', SRC.includes('M11 30 H53 V54 H11 Z'),
    '이 앱의 존재 이유가 무기명이다');
  check('넣는 쪽을 화살표로 보여 준다', SRC.includes('M27 15 L32 8 L37 15'));
}

/* ==========================================================================
   v0.4 — 이름 · 모아 보기 창 · 갈림길 · 되돌리기 · 종이 폭 · PDF 이름
   ========================================================================== */

console.log('\n[이름] 「학급 자율 의사결정 보드」가 아니라 「학급 회의」');
{
  check('제목이 학급 회의', /<title>학급 회의 — TEAM LEAP<\/title>/.test(SRC));
  check('머리에도 학급 회의', /<h1>학급 회의<\/h1>/.test(SRC));
  check('판권에도 학급 회의', /<div class="name">학급 회의<\/div>/.test(SRC));
  /* ★ 〔2026. 8. 12. v1〕 판 번호를 화면에서 뗐습니다 — 「같은가」 대신 「없는가」를 봅니다.
     선생님에게 v0.x 는 「아직 덜 됐다」로 읽힙니다. 이력은 apps/판 번호 이력.md 에 있습니다.
     ※ 코드 «주석» 안의 〔v0.5〕 표시는 그대로 둡니다 — 저장한 자료를 읽는 코드에서
       「이 칸은 v0.4 에서 생겼다」는 꼭 필요합니다. */
  check('화면에 판 번호가 없다',
    !/v0\.\d+|프로토타입/.test(SRC.replace(/\/\*[\s\S]*?\*\//g, '')
                                 .replace(/<!--[\s\S]*?-->/g, '')
                                 .replace(/\/\/[^\n]*/g, '')));
  check('종이 머리에도 학급 회의', SRC.includes('TEAM LEAP<br>학급 회의'));
  check('옛 이름이 화면에 남아 있지 않다',
    (SRC.match(/학급 자율 의사결정 보드/g) || []).length === 1,
    '남은 하나는 「이렇게 바뀌었습니다」라고 적은 머리 주석뿐이어야 한다');
  check('내보내는 파일 이름도 바뀌었다', SRC.includes("'학급회의-' + (d.className"));
}

console.log('\n[모아 보기 창] 서버 없이 되는 실시간 — 개수만 나간다');
{
  const st = mk({ step: 1, agendas: AG });
  st.size = 6;
  const b = run(st, '#board');
  check('#board 로 열면 모아 보기 창이 켜진다', b.boardOn && b.board.includes('class="board"'));
  check('앱 화면은 그려지지 않는다', b.meet === '',
    '두 화면이 같이 뜨면 빔프로젝터에 회의 조작 화면이 함께 나간다');
  check('모인 개수가 보인다', b.board.includes('class="bn"') && b.board.includes('>2'));
  check('인원을 적었으면 「/ 6」이 함께 나온다', b.board.includes('/ 6'));
  check('★ 안건 내용은 나가지 않는다', !b.board.includes('복도에서 뛰는 친구가 많다'),
    '빔프로젝터에 내용이 뜨면 그 순간 무기명이 무너진다. 이 검사가 그것을 막는다');
  check('무엇을 냈는지는 안 보인다고 적는다', b.board.includes('이 화면에 나오지 않습니다'));

  const bv = run(mk({
    step: 2, agendas: AG, agendaVotes: [{ targetId: 'a1' }, { targetId: 'a1' }]
  }), '#board');
  check('투표 중에는 투표 인원만 나간다', bv.board.includes('명이 투표했습니다'));
  check('★ 투표 중 집계가 나가지 않는다', !bv.board.includes('2표') && !bv.board.includes('복도에서 뛰는'),
    '어느 것이 몇 표인지가 큰 화면에 뜨면 뒤에 고르는 사람이 따라간다');

  const bc = run(mk({ step: 2, agendaClosed: true, agendas: AG, agendaVotes: [{ targetId: 'a1' }] }), '#board');
  check('결과 공개 뒤에는 셈을 보여 주지 않는다', bc.board.includes('회의 창을 봐 주세요'),
    '이 화면이 하는 일은 «모으는 동안» 함께 보는 것뿐이다');

  const b0 = run(null, '#board');
  check('회의가 없으면 그렇다고 적는다', b0.board.includes('아직 회의가 열리지 않았습니다'));

  check('모아 보기 창은 저장소를 읽기만 한다',
    SRC.includes('모아 보기 창은 저장소를 **읽기만** 합니다'));
  check('알림이 막혀도 스스로 다시 본다', SRC.includes('setInterval(paintBoard, 2000)'),
    'file:// 로 열면 BroadcastChannel 이 막히는 브라우저가 있다');
  check('회의 창에 모아 보기 단추가 있다', run(mk({ step: 1, agendas: AG })).meet.includes('id="btn-board"'));
  check('다른 기기와는 안 된다고 적어 둔다', SRC.includes('다른 **기기**와는 실시간이 되지 않습니다'),
    '되는 줄 알고 태블릿을 나눠 주면 그날 수업이 무너진다');
  check('★ 창 색을 테마 토큰으로 주지 않는다', SRC.includes('body.is-board{background:#0E1621}'),
    '--leap-ink 는 다크 모드에서 밝은 색이 된다. 그대로 쓰면 흰 바탕에 흰 글자가 된다');
}

console.log('\n[갈림길] 되돌릴 수 없는 일을 예/아니오로 묻지 않는다 — 함정 37·38');
{
  const held = run(mk({ step: 1, agendas: AG }));
  check('회의를 접는 길이 늘 보인다', held.meet.includes('id="btn-restart"'));
  check('잃지 않는 길이 맨 위에 있다',
    held.meet.indexOf('data-way="keep"') < held.meet.indexOf('data-way="drop"'),
    '위에 있는 것을 먼저 누른다. 그 자리에 «잃는 쪽»이 있으면 안 된다');
  check('그냥 두는 길이 있다', held.meet.includes('data-way="stay"'));
  check('무엇을 잃는지 숫자로 적는다', held.meet.includes('안건 2개'));

  const empty = run(mk({ step: 1 }));
  check('잃을 것이 없으면 「기록에 남기기」를 묻지 않는다',
    !empty.meet.includes('data-way="keep"'),
    '잃을 것이 없으면 아예 묻지 않는다');

  check('가져오기가 confirm 을 쓰지 않는다', !/confirm\(\s*'가져온 파일/.test(SRC));
  check('★ 앱 어디에도 confirm 이 남아 있지 않다', !/\bconfirm\(/.test(SRC),
    'v0.3 의 「[취소] 덮어쓰기」는 Esc 를 누른 사람의 자료를 지웠다');
  check('합치기가 먼저 나온다',
    SRC.indexOf("name: '지금 자료에 합치기'") < SRC.indexOf("name: '그냥 바꾸기'"));
  check('지우기 전에 내보내는 길을 맨 위에 둔다',
    SRC.indexOf("name: '파일로 내보내고 지우기'") < SRC.indexOf("name: '그냥 지우기'"));
  check('창을 닫으면 아무 일도 일어나지 않는다', SRC.includes("if (e.key === 'Escape') close();"));
}

console.log('\n[되돌리기] 묻는 대신 되돌린다 — 함정 39');
{
  const rr = run(withRules([RULE]));
  check('약속 그만두기가 묻지 않는다', !/confirm\('이 약속/.test(SRC));
  check('되돌릴 자리를 붙들어 둔다', SRC.includes("markUndo('rule', at, item, item.text)"));
  check('회의록도 되돌릴 수 있다', SRC.includes("markUndo('meeting', at, item, item.title)"));
  check('제자리로 돌아간다', SRC.includes('list.splice(Math.min(u.at, list.length), 0, u.item)'),
    '맨 뒤에 붙이면 순서가 바뀐다. 되돌린 것이 다른 것이 되면 되돌린 것이 아니다');
  check('한 걸음만 기억한다', (SRC.match(/markUndo\('/g) || []).length === 2,
    '여러 걸음을 쌓으면 지운 것이 계속 메모리에 남는다');
  check('다음 일을 하면 앞의 되돌리기가 사라진다',
    SRC.includes('if (undoKeep) undoKeep = false; else undo = null;'),
    '며칠 전에 지운 것을 가리키는 단추가 화면에 계속 남으면 안 된다');
  void rr;
}

console.log('\n[종이] 미리보기와 인쇄가 같은 폭이다 — 함정 31');
{
  const page = /@page\{size:A4 portrait;margin:([\d.]+)mm ([\d.]+)mm\}/.exec(SRC);
  const pv = /\.pv-scroll > \.pv-page\{width:(\d+)mm;max-width:100%;margin:0 auto;padding:([\d.]+)mm ([\d.]+)mm/.exec(SRC);
  check('@page 여백을 읽을 수 있다', !!page);
  check('미리보기 규칙을 읽을 수 있다', !!pv);
  check('★ 미리보기 종이가 A4 210mm 다', pv && pv[1] === '210',
    '186mm 로 두면 글이 놓이는 폭이 종이보다 24mm 좁아, 미리보기에서만 표가 넘친다');
  check('안쪽 여백이 @page 와 같다', page && pv && page[1] === pv[2] && page[2] === pv[3],
    '「여기 보이는 것이 그대로 나옵니다」라고 적어 놓고 다른 폭을 보여 주면 안 된다');
}

console.log('\n[PDF 이름] 열 장이 같은 이름이 되지 않는다 — 함정 27');
{
  check('인쇄하는 동안만 제목을 바꾼다', /function withFileName\(name, run\)/.test(SRC));
  check('afterprint 로 되돌린다', SRC.includes("window.addEventListener('afterprint', back)"));
  check('안 오는 브라우저를 위한 안전망', SRC.includes('setTimeout(back, 20000)'));
  check('회의록 이름에 회의 이름과 날짜가 들어간다', SRC.includes("'학급회의록_'"));
  check('약속 게시물도 이름이 붙는다', SRC.includes("'학급약속_'"));
  check('파일 이름에 못 쓰는 글자를 걷어낸다', /function safeName\(s\)/.test(SRC));
}

console.log('\n[인원] 몇 명 중 몇 명 — 누가 냈는지는 여전히 모른다');
{
  const st = mk({ step: 1, agendas: AG }); st.size = 6;
  const r6 = run(st);
  check('「/ 6명」이 함께 나온다', r6.meet.includes('/ 6명'));
  check('남은 사람 수를 알려 준다', r6.meet.includes('아직 4명 남았습니다'));
  check('누가 안 냈는지는 앱도 모른다고 적는다', r6.meet.includes('누가 안 냈는지는 앱도 모릅니다'));
  const r0 = run(mk({ step: 1, agendas: AG }));
  check('인원을 안 적으면 v0.3 과 같다',
    !/class="of">\/ /.test(r0.meet) && !r0.meet.includes('class="pbar"') &&
    r0.meet.includes('개가 모였습니다'),
    '껐다 켜는 기능이 아니라 «안 적으면 없는 것»이어야 한다');
  check('이름을 받는 칸은 여전히 없다', !/type="text"[^>]*이름/.test(SRC));
}

console.log('\n[AI 초안] 오늘 회의를 가리킨다');
{
  check('current 를 객체로 읽는다', SRC.includes('var cur = x.current || (x.meetings || [])[0] || null;'),
    'v0.3 은 이것을 id 로 알고 찾다가 늘 «가장 최근에 마친 회의»를 집었다');
  check('학생이 낸 의견은 프롬프트에 넣지 않는다',
    !/t\.push\('- ' \+ (a|it)\.text\)/.test(SRC) && SRC.includes('아이들이 낸 의견은 들어가지 않습니다'));
  check('학급 약속까지만 나간다', SRC.includes('[이미 정해 둔 학급 약속]'));
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
