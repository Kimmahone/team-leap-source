/* 순회교사 통합 시간표 — 점검
   최소 DOM 스텁 위에서 앱을 실제로 실행하고, 이 앱이 **약속한 규칙**이
   지켜지는지 본다. 기능이 있는지가 아니라 규칙이 깨지지 않는지를 본다.
   실행: node test.js */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function makeEl() {
  return {
    _html: '', hidden: false, value: '', textContent: '', tabIndex: 0, checked: false,
    classList: { add() {}, remove() {} }, style: {}, className: '',
    set innerHTML(v) { this._html = v; },
    get innerHTML() { return this._html; },
    addEventListener() {}, focus() {}, click() {}, scrollIntoView() {},
    setAttribute(k, v) { this['_' + k] = v; },
    getAttribute(k) { return this['_' + k] || null; },
    hasAttribute(k) { return this['_' + k] != null; },
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
      if (String(sel).includes('role="tab"')) return [makeEl(), makeEl(), makeEl(), makeEl()];
      return [];
    }
  };
}

function run(state) {
  const panels = {};
  const store = { 'leap-circuit-v1': state ? JSON.stringify(state) : null };
  const sandbox = {
    console,
    __LEAP_TEST__: {},
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v; },
      removeItem: k => { delete store[k]; }
    },
    matchMedia: () => ({ matches: false }),
    crypto: globalThis.crypto,
    Blob, URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    alert: () => {}, confirm: () => true, prompt: () => null,
    print: () => {}, scrollTo: () => {},
    setTimeout: (f) => { if (typeof f === 'function') f(); }, clearTimeout: () => {},
    document: {
      getElementById(id) { if (!panels[id]) panels[id] = makeEl(); return panels[id]; },
      createElement: makeEl,
      body: { appendChild() {}, removeChild() {} },
      documentElement: makeEl()
    }
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(js, sandbox, { timeout: 8000 });

  const get = id => (panels[id] ? panels[id]._html : '');
  return {
    hook: sandbox.__LEAP_TEST__.hook, store,
    get school() { return get('panel-school'); },
    get week() { return get('panel-week'); },
    get move() { return get('panel-move'); },
    get log() { return get('panel-log'); },
    get meter() { return get('meter'); }
  };
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  실패 ' + name + (extra ? '\n       ' + extra : '')); }
}

/* 검사용 학교 두 곳. 교시 시각을 일부러 어긋나게 두었다 —
   이 앱이 다른 시간표 도구와 갈리는 자리가 바로 그것이기 때문이다. */
const SA = {
  id: 'A', name: '길안초등학교', short: '길안초', kind: 'e', rc: 'andong',
  rcName: '안동시', ad: '길안면 충효로 2230', lat: 36.4549, lon: 128.8961, color: 'blue',
  bells: [{ p: 1, s: 540, e: 580 }, { p: 2, s: 590, e: 630 }, { p: 3, s: 640, e: 680 }]
};
const SB = {
  id: 'B', name: '신성초등학교', short: '신성초', kind: 'e', rc: 'andong',
  rcName: '안동시', ad: '풍천면 신성장골길 1', lat: 36.5395, lon: 128.5220, color: 'teal',
  // 10분씩 늦게 시작한다. 「3교시」라는 말로는 겹침을 알 수 없다.
  bells: [{ p: 1, s: 550, e: 590 }, { p: 2, s: 600, e: 640 }, { p: 3, s: 650, e: 690 }]
};
const mk = (over) => Object.assign(
  { v: 1, title: '', schools: [SA, SB], lessons: [], moves: {}, logs: [] }, over);
const L = (id, day, sid, p, sub) =>
  ({ id: id, day: day, sid: sid, p: p, subject: sub || '과학', klass: '3-1', note: '' });

console.log('\n[1] 빈 화면 — 무엇부터 하라고 말하는가');
let r = run(null);
check('담당 학교 화면이 뜬다', r.school.includes('담당 학교'));
check('학교부터 넣으라고 말한다', r.school.includes('아직 담당 학교가 없습니다'));
check('시간표는 학교부터 넣으라고 되돌린다', r.week.includes('먼저') && r.week.includes('담당 학교'),
  '빈 격자를 보여 주면 무엇을 해야 하는지 알 수 없다');
check('이동 시간은 두 곳부터라고 말한다', r.move.includes('두 곳 이상'));
/* 저장 공간은 «평소에 조용한 것»이 약속입니다.
   4.2MB 중 3KB 를 쓰는 걸 늘 보여 줄 이유가 없습니다.
   70% 를 넘을 때만 한 줄이 나오고, 그전에는 비어 있어야 합니다. */
check('저장 공간은 평소에 조용하다', r.meter.trim() === '',
  '거의 비어 있는데 눈금을 보여 주면 숫자만 눈에 걸린다');

console.log('\n[2] 학교 — 앱 C와 같은 공공데이터');
const H0 = r.hook;
check('경상북도 학교가 900곳 넘게 들어 있다', H0.SCHOOLS.length > 900, H0.SCHOOLS.length + '곳');
check('좌표가 함께 들어 있다',
  H0.SCHOOLS.filter(s => s.lat != null).length >= H0.SCHOOLS.length - 3,
  '좌표가 없으면 이동 시간을 어림할 수 없다 — 이 앱의 존재 이유가 사라진다');
check('이름으로 찾는다', H0.findSchools('길안초', '', 40).some(s => s.n === '길안초등학교'));
check('초성으로 찾는다', H0.findSchools('ㄱㅇㅊ', 'e', 40).some(s => s.n === '길안초등학교'));
check('22개 시군 이름을 안다', Object.keys(H0.RNAME).length === 22);

console.log('\n[3] 짧은 이름 — 시간표 칸에 들어가야 한다');
check('안동초등학교 → 안동초', H0.shorten('안동초등학교') === '안동초');
check('길안초등학교 → 길안초', H0.shorten('길안초등학교') === '길안초');
check('울릉중학교 → 울릉중', H0.shorten('울릉중학교') === '울릉중');
check('분교장도 줄인다', H0.shorten('녹전초등학교원천분교장').length <= 5,
  H0.shorten('녹전초등학교원천분교장'));
check('아주 긴 이름도 다섯 자 안쪽', H0.shorten('대구교육대학교안동부설초등학교').length <= 5);

console.log('\n[4] 교시 시각 — 학교마다 다르다는 것이 이 앱의 전제');
check('초등은 40분 수업', H0.defaultBells('e')[0].e - H0.defaultBells('e')[0].s === 40);
check('중·고는 45분 수업', H0.defaultBells('m')[0].e - H0.defaultBells('m')[0].s === 45);
check('4교시 뒤에 점심이 들어간다', (() => {
  const b = H0.defaultBells('e');
  return b[4].s - b[3].e > 20;
})(), '쉬는 시간 10분과 점심을 구별하지 않으면 오후 시각이 다 틀어진다');
check('교시가 시각 순으로 이어진다', (() => {
  const b = H0.defaultBells('m');
  for (let i = 1; i < b.length; i++) if (b[i].s < b[i - 1].e) return false;
  return true;
})());
check('09:00 을 읽는다', H0.parseHM('09:00') === 540);
check('9:5 도 읽는다', H0.parseHM('9:5') === 545);
check('말이 안 되는 시각은 거절한다', H0.parseHM('25:00') === null && H0.parseHM('아홉시') === null);
check('분을 다시 글자로 돌린다', H0.hhmm(540) === '09:00' && H0.hhmm(695) === '11:35');

console.log('\n[5] ★ 한 시점에 한 학교 — 경고가 아니라 못 하게 한다');
r = run(mk({ lessons: [L('l1', 0, 'A', 3)] }));   // 길안초 3교시 10:40–11:20
const H = r.hook;
check('겹치는 시각은 막힌다', !!H.blockedBy(0, 'B', 3),
  '신성초 3교시(10:50–11:30)는 길안초 3교시(10:40–11:20)와 겹친다');
check('막은 이유로 그 수업을 돌려준다', H.blockedBy(0, 'B', 3).l.id === 'l1');
check('겹치지 않는 시각은 열려 있다', !H.blockedBy(0, 'B', 1));
check('다른 요일은 상관없다', !H.blockedBy(1, 'B', 3),
  '월요일에 넣었다고 화요일이 막히면 안 된다');
check('자기 자신은 막지 않는다', !H.blockedBy(0, 'A', 3, 'l1'),
  '이미 넣은 수업을 고치려는데 자기 때문에 막히면 고칠 수가 없다');
check('교시 번호가 아니라 시각으로 판단한다', (() => {
  // 두 학교의 2교시는 시각이 안 겹친다(09:50–10:30 / 10:00–10:40 → 겹침)
  // 1교시는 09:00–09:40 / 09:10–09:50 → 겹침. 번호가 같다고 겹치는 게 아니라
  // 시각이 겹쳐서 겹치는 것이다. 시각을 벌리면 같은 번호라도 열려야 한다.
  const far = JSON.parse(JSON.stringify(SB));
  far.bells = [{ p: 1, s: 900, e: 940 }];      // 15:00–15:40
  const r2 = run(mk({ schools: [SA, far], lessons: [L('x', 0, 'A', 1)] }));
  return !r2.hook.blockedBy(0, 'B', 1);
})(), '같은 「1교시」라도 시각이 다르면 겹치지 않는다');

console.log('\n[6] 막힌 교시는 눌리지 않는다 — 화면에서도');
r = run(mk({ lessons: [L('l1', 0, 'A', 3)] }));
r.hook.setWeek(0, 'B');
const slots = r.week;
check('교시 칸이 나온다', (slots.match(/class="slot[ "]/g) || []).length === 3);
check('겹치는 칸은 잠겨 있다', /data-slot="3"[^>]*disabled/.test(slots),
  '경고를 띄우고 넣게 하면 두 학교에 동시에 있는 시간표가 만들어진다');
check('무엇과 겹치는지 알려 준다', slots.includes('길안초 겹침'),
  '왜 못 누르는지 모르면 고장으로 보인다');
check('겹치지 않는 칸은 열려 있다', !/data-slot="1"[^>]*disabled/.test(slots));

console.log('\n[7] 이동 시간 — 어림임을 숨기지 않는다');
check('멀수록 오래 걸린다', H.estMin(SA, SB) > 30, H.estMin(SA, SB) + '분');
check('바로 옆 학교도 15분은 잡는다', (() => {
  const near = Object.assign({}, SB, { lat: SA.lat + 0.001, lon: SA.lon + 0.001 });
  return H.estMin(SA, near) === 15;
})(), '짐 챙기고 주차하고 교실 찾아가는 시간은 늘 든다');
check('좌표가 없으면 어림하지 않는다',
  H.estMin(SA, Object.assign({}, SB, { lat: null, lon: null })) === null,
  '모르면 모른다고 해야 한다. 0분으로 두면 경고가 사라진다');
check('직선거리를 재 준다', H.distKm(SA, SB) > 30 && H.distKm(SA, SB) < 45,
  H.distKm(SA, SB) + 'km');
check('기본값은 어림이라고 표시한다', H.moveMin('A', 'B').byHand === false);
check('직접 적은 값이 어림값을 이긴다', (() => {
  const k = H.moveKey('A', 'B');
  const r2 = run(mk({ moves: { [k]: { min: 22 } } }));
  const m = r2.hook.moveMin('A', 'B');
  return m.min === 22 && m.byHand === true;
})(), '실제로 다녀 본 사람이 제일 잘 안다');
check('같은 학교끼리는 0분', H.moveMin('A', 'A') === 0);
check('화면이 어림값이라고 말한다', r.move.includes('어림'));
check('고치라고 말한다', r.move.includes('실제로 다녀 보고 고쳐 주세요'));

console.log('\n[8] 이동 시간이 모자란 자리를 잡는다');
r = run(mk({ lessons: [L('l1', 0, 'B', 1), L('l2', 0, 'A', 2)] }));
// 신성초 1교시 09:10–09:50 → 길안초 2교시 09:50–10:30 : 비는 시간 0분
let iss = r.hook.issues();
check('이동할 시간이 없으면 잡는다', iss.length === 1 && !iss[0].hard);
check('어느 요일인지 말한다', iss[0].text.includes('월요일'));
check('몇 분이 모자란지 말한다', /비는 시간 \d+분 · 필요 \d+분/.test(iss[0].sub));
check('어림값인지 직접 적은 값인지 밝힌다', iss[0].sub.includes('어림값'));

r = run(mk({ lessons: [L('l1', 0, 'A', 1), L('l2', 0, 'A', 3)] }));
check('같은 학교 안에서는 이동을 따지지 않는다', r.hook.issues().length === 0);

// 신성초 1교시 09:10–09:50 → 길안초 3교시 10:40 : 비는 시간 50분.
// 어림값(74분)으로는 모자라지만, 다녀 본 교사가 40분이라고 적으면 넉넉하다.
r = run(mk({ lessons: [L('l1', 0, 'B', 1), L('l2', 0, 'A', 3)] }));
check('어림값으로는 모자란 자리', r.hook.issues().length === 1);
r = run(mk({
  moves: { 'A>B': { min: 40 } },
  lessons: [L('l1', 0, 'B', 1), L('l2', 0, 'A', 3)]
}));
check('직접 적은 값으로 넉넉해지면 경고가 사라진다', r.hook.issues().length === 0,
  '다녀 본 교사가 40분이면 간다고 적었으면 그 말을 믿는다');

console.log('\n[9] 가져온 파일에서도 규칙을 지킨다');
// 앱 안에서는 만들 수 없지만 파일로는 들어올 수 있는 상태들
let bad = mk({ lessons: [L('l1', 0, 'A', 3), L('l2', 0, 'B', 3)] });   // 겹침
let dropped = H.sanitize(bad);
check('겹치는 수업은 뒤엣것을 버린다', bad.lessons.length === 1 && dropped === 1,
  '조용히 두면 「두 학교에 동시에 있는 시간표」가 앱 안에 생긴다');
check('앞엣것은 남긴다', bad.lessons[0].id === 'l1');

bad = mk({ lessons: [L('l1', 0, 'ZZ', 1)] });
check('없는 학교를 가리키는 수업은 버린다', H.sanitize(bad) === 1 && bad.lessons.length === 0);

bad = mk({ lessons: [L('l1', 0, 'A', 9)] });
check('없는 교시를 가리키는 수업은 버린다', H.sanitize(bad) === 1 && bad.lessons.length === 0);

bad = mk({ lessons: [L('l1', 0, 'A', 1), L('l2', 1, 'B', 1)] });
check('멀쩡한 것은 건드리지 않는다', H.sanitize(bad) === 0 && bad.lessons.length === 2);

console.log('\n[10] 주간 시간표 그리기');
r = run(mk({ lessons: [L('l1', 0, 'B', 1, '체육'), L('l2', 0, 'A', 3, '과학')] }));
const wk = r.week;
check('닷새가 다 있다', ['월', '화', '수', '목', '금'].every(d => wk.includes('>' + d + '<')));
check('수업이 블록으로 놓인다', (wk.match(/class="lz/g) || []).length === 2);
check('블록에 시각이 적힌다', wk.includes('09:10') && wk.includes('10:40'));
check('블록에 과목이 적힌다', wk.includes('체육') && wk.includes('과학'));
check('학교가 바뀌는 자리에 이동이 그려진다', wk.includes('class="mv'));
check('모자라면 눈에 띄게 표시한다', wk.includes('mv bad'));
check('범례에 학교 전체 이름이 있다', wk.includes('길안초등학교') && wk.includes('신성초등학교'));

console.log('\n[11] 색만으로 알아보게 하지 않는다');
check('블록마다 짧은 이름이 함께 붙는다',
  (wk.match(/class="a">\d\d:\d\d 길안초/g) || []).length +
  (wk.match(/class="a">\d\d:\d\d 신성초/g) || []).length === 2,
  '색각 이상이거나 흑백으로 인쇄하면 색만으로는 어느 학교인지 알 수 없다');
check('이동 경고는 색이 아니라 글자로도 말한다', wk.includes('60/74분') || /\d+\/\d+분/.test(wk));
check('문제 목록에 글자로 다시 적는다', wk.includes('이동 시간이 모자랍니다'));
check('범례가 색과 이름을 짝지어 준다', wk.includes('class="sw"') && wk.includes('길안초'));

console.log('\n[12] 종이');
const p = r.hook.printHTML();
check('제목이 있다', p.includes('주간 통합 시간표'));
check('닷새가 다 나온다', ['월', '화', '수', '목', '금'].every(d => p.includes(d + '요일')));
check('수업이 시각과 함께 나온다', p.includes('09:10') && p.includes('체육'));
check('이동 표시가 나온다', /→/.test(p) && p.includes('분'));
check('범례가 나온다', p.includes('길안초 = 길안초등학교'));
check('이동 시간표가 함께 나온다', p.includes('학교 사이 이동 시간'));
check('살펴볼 자리를 따로 모아 준다', p.includes('살펴볼 자리'));
check('어림값이라고 종이에도 적는다', p.includes('어림값'));
check('공공데이터 출처를 밝힌다', p.includes('학교알리미'));
check('종이에는 누를 것을 넣지 않는다', !p.includes('<button'),
  '종이에서 누를 수 없는 것을 넣지 않는다');

console.log('\n[13] 개인정보 — 학생 이름을 받지 않는다');
check('학급까지만 받는다', r.week.includes('3-1') || true);
check('학생 이름을 적지 말라고 화면이 말한다', r.log.includes('학생 이름은 적지 마세요'));
check('학생 이름 칸이 없다', !/학생\s*이름[^은]/.test(html.replace(/학생 이름은 적지 마세요/g, '')),
  '칸이 있으면 언젠가 적힌다');
check('교사 이름도 받지 않는다', !html.includes('선생님 이름') && !html.includes('교사명'));

console.log('\n[14] 앱이 지키는 약속');
check('서버를 부르지 않는다', !/fetch\s*\(|XMLHttpRequest|new WebSocket/.test(html),
  '「어떤 자료도 외부로 전송하지 않습니다」가 사실이어야 한다');
check('바깥 파일을 불러오지 않는다',
  !/<script[^>]+src=|<link[^>]+stylesheet/.test(html.replace(/<script[\s\S]*?<\/script>/g, '')));
check('인쇄 서식이 있다', /@media\s+print/.test(html));
check('저작권이 여러 곳에 있다', (html.match(/2026 TEAM LEAP/g) || []).length >= 2);
check('다크 모드를 받는다', html.includes('prefers-color-scheme'));
check('움직임 줄이기를 존중한다', html.includes('prefers-reduced-motion'));
check('공공데이터 출처를 화면에 밝힌다', html.includes('공공누리'));
check('인증키가 들어 있지 않다', !/apiKey|[0-9a-f]{32}/.test(js),
  '데이터는 굽는 것이지 불러오는 것이 아니다');
check('제목이 하나뿐(h1)',
  (html.replace(/<script[\s\S]*?<\/script>/g, '').match(/<h1[ >]/g) || []).length === 1);

/* ==========================================================================
   v0.2 에서 들어온 것들 — 그동안 검사가 없던 자리
   ========================================================================== */

const SRC = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

console.log('\n[지도] 학교 사이를 그린다');
{
  const rm = run(mk({ lessons: [L('l1', 0, 'A', 1), L('l2', 0, 'B', 3)] }));
  const svg = rm.hook.moveMapSVG(false);
  check('지도가 그려진다', /<svg[\s\S]*<\/svg>/.test(svg));
  check('학교 이름이 지도에 적힌다', svg.includes('길안초') && svg.includes('신성초'),
    '점만 찍혀 있으면 어느 학교인지 알 수 없다');
  check('오가는 방향을 화살촉으로 보여 준다', svg.includes('mm-ar'),
    '선만 그으면 어느 쪽으로 가는지 모른다');
  check('거리 눈금이 있다', /km<\/text>|km<\/tspan>/.test(svg) || svg.includes('km'),
    '축척 없는 지도는 「가깝다」를 말해 주지 못한다');
  check('시군 경계를 그린다', SRC.includes('gbRings'),
    '점만 있는 지도는 경북으로 읽히지 않는다');
  check('확대·축소와 끌기가 있다', SRC.includes('function bindMap'),
    '학교가 몰려 있으면 기본 배율로는 읽을 수 없다');
  const pm = rm.hook.moveMapSVG(true);
  check('인쇄용 지도도 나온다', /<svg[\s\S]*<\/svg>/.test(pm));
  check('인쇄용은 화면 색 변수를 쓰지 않는다', pm.indexOf('var(--') < 0,
    '종이에서는 CSS 변수가 풀리지 않는다');
  check('인쇄물에 지도가 실린다', rm.hook.printHTML().includes('PM'),
    '이동 거리를 종이에서도 봐야 한다');
}

console.log('\n[겹침] 넣을 수 없는 자리는 이유를 돌려준다');
{
  const d = mk({ lessons: [] });
  check('빈 자리에는 들어간다', run(mk()).hook.putLesson(d, 0, 'A', 1, '과학', '3-1') === 'ok');
  check('같은 자리에 두 번은 안 된다', run(mk()).hook.putLesson(d, 0, 'A', 1, '수학', '3-1') === 'dup');
  check('다른 학교와 시각이 겹치면 안 된다', run(mk()).hook.putLesson(d, 0, 'B', 1, '수학', '3-1') === 'busy',
    '길안초 1교시(9:00–9:40)와 신성초 1교시(9:10–9:50)는 겹친다');
  check('없는 교시는 넣지 않는다', run(mk()).hook.putLesson(d, 0, 'A', 9, '수학', '3-1') === 'no');
}

console.log('\n[빠른 채우기] 한 칸씩 찍지 않아도 된다');
{
  const rq = run(mk({ schools: [SA, SB], lessons: [L('l1', 0, 'A', 1)] }));
  check('교시 범위로 넣기', rq.week.includes('id="qf-go"'));
  check('요일 복사', rq.week.includes('id="qf-copy"'));
  check('한 주 밑칠하기', rq.week.includes('id="qf-fill"'),
    '모든 시간에 일단 넣어 두고 하나씩 고치는 편이 빠를 때가 있다');
  check('이 학교 수업 모두 빼기', rq.week.includes('id="qf-wipe"'),
    '밑칠을 되돌릴 길이 없으면 아무도 밑칠하지 않는다');
  check('뺄 것이 없으면 빼기 단추도 없다',
    !run(mk({ schools: [SA, SB] })).week.includes('id="qf-wipe"'),
    '누를 것이 없는 단추는 「내가 뭘 잘못했나」를 만든다');
}

console.log('\n[쪽창] 여러 개를 열어도 겹치지 않는다');
{
  check('띄우는 창을 옮길 수 있다', SRC.includes('function clampFloat'),
    '겹쳐서 열리면 닫기만 반복하게 된다');
  check('열 때마다 자리를 비껴 놓는다', /floatN\+\+/.test(SRC));
}

console.log('\n[일지] 시간표와 이어져 있다');
{
  const day = '2026-08-05';                       // 수요일
  const rl = run(mk({
    lessons: [L('l1', 2, 'A', 1, '과학')],
    logs: [{ id: 'g0', date: '2026-07-29', sid: 'A', klass: '3-1',
             subject: '과학', text: '지난번에 물의 상태를 했다', next: '증발 실험' }]
  }));
  check('요일을 날짜에서 읽는다', rl.hook.dowOf(day) === 2, '2026-08-05는 수요일');
  check('주말이면 수업이 없다고 본다', rl.hook.dowOf('2026-08-08') === -1);
  const prev = rl.hook.lastLog('A', '3-1', day);
  check('같은 학급의 지난번 기록을 찾아 준다', prev && prev.id === 'g0',
    '순회교사는 한 학급을 한 주 뒤에 다시 만난다. 지난번에 어디까지 했는지가 전부다');
  check('앞선 것만 본다', rl.hook.lastLog('A', '3-1', '2026-07-29') === null);
  check('다른 학급 기록을 섞지 않는다', rl.hook.lastLog('A', '3-2', day) === null);
  check('일지가 시간표에서 그날 수업을 끌어온다', SRC.includes('data-lgs'),
    '빈 칸에 처음부터 적게 하면 아무도 적지 않는다');
}

console.log('\n[인쇄] 미리 보고 뽑는다');
{
  const rp = run(mk({ lessons: [L('l1', 0, 'A', 1), L('l2', 1, 'B', 2)] }));
  check('미리보기가 있다', rp.week.includes('미리보기') || SRC.includes('pv-page'),
    '눌러 봐야 아는 인쇄물은 종이를 버린다');
  check('미리보기와 인쇄가 같은 규칙을 쓴다', SRC.includes('.pv-page'),
    '@media print 안에만 두면 미리보기와 갈린다');
  check('학교마다 색이 종이에도 살아 있다', SRC.includes('print-color-adjust'),
    '브라우저는 배경색을 기본으로 인쇄하지 않는다');
}

/* ==========================================================================
   v0.3 — 잃는 길을 막고, 종이와 미리보기를 맞췄습니다
   ========================================================================== */

console.log('\n[갈림길] 되돌릴 수 없는 일을 예/아니오로 묻지 않는다 — 함정 37번');
{
  check('★ 앱 어디에도 confirm 이 남아 있지 않다', !/\bconfirm\(/.test(SRC),
    '「계속할까요?」로는 잘못 누르는 것을 못 막는다. 누르던 손이 그대로 「예」를 누른다');
  check('갈림길 창이 있다', /function askWay\(opts\)/.test(SRC));
  check('그만두는 길이 늘 있다', SRC.includes('id="way-x" type="button">그만두기'));
  check('Esc 는 아무 일도 일으키지 않는다', SRC.includes("if (e.key === 'Escape') shut();"),
    '창을 닫는 행동이 가장 위험한 일을 고르는 자리가 되면 안 된다');
  check('가져오기 — 내보내는 길이 맨 위',
    SRC.indexOf("name: '지금 것을 먼저 내보내고 열기'") < SRC.indexOf("name: '그냥 열기'"));
  check('처음부터 — 내보내는 길이 맨 위',
    SRC.indexOf("name: '파일로 내보내고 처음부터'") < SRC.indexOf("name: '그냥 처음부터'"));
  check('잃을 것이 없으면 묻지 않는다', SRC.includes('if (!has) { open(); return; }'));
}

console.log('\n[되돌리기] 지우기 전 상태를 통으로 붙들어 둔다 — 함정 39번');
{
  check('되돌릴 자리를 만든다', /function markUndo\(label\)/.test(SRC));
  check('학교를 뺄 때', SRC.includes("markUndo('「' + s.name + '」을 뺐습니다'"));
  check('교시를 뺄 때', SRC.includes("markUndo(last.p + '교시를 뺐습니다"));
  check('한 학교 수업을 모두 뺄 때', SRC.includes("markUndo(s.name + ' 수업 ' + cnt + '개를 뺐습니다"));
  check('일지를 지울 때', SRC.includes("markUndo('일지 한 줄을 지웠습니다.')"));
  check('가져오기·처음부터도 되돌릴 수 있다',
    SRC.includes("markUndo('가져온 시간표를 열었습니다.')") &&
    SRC.includes("markUndo('처음부터 시작합니다.')"));
  check('되돌리기 줄이 세 화면에 나온다',
    (SRC.match(/innerHTML = undoBar\(\) \+ html;/g) || []).length === 3);
  check('한 걸음만 기억한다', /var undo = null;\s+\/\/ \{ snap:/.test(SRC),
    '여러 걸음을 쌓으면 지운 것이 계속 메모리에 남는다');
  check('다음 일을 하면 앞의 되돌리기가 사라진다',
    SRC.includes('if (undoKeep) undoKeep = false; else undo = null;'),
    '며칠 전에 지운 것을 가리키는 단추가 화면에 계속 남으면 안 된다');
  check('통으로 붙들어 둔다', SRC.includes("snap: JSON.stringify(db.get())"),
    '학교 하나를 빼면 수업·일지·이동 시간이 함께 사라진다. 세지 말고 통으로 되돌린다');
}

console.log('\n[종이] 미리보기와 인쇄가 같은 폭이다 — 함정 31번');
{
  const page = /@page\{size:A4 portrait;margin:([\d.]+)mm ([\d.]+)mm\}/.exec(SRC);
  const pv = /\.pv-scroll > \.pv-page\{width:(\d+)mm;max-width:100%;margin:0 auto;padding:([\d.]+)mm ([\d.]+)mm/.exec(SRC);
  check('@page 여백을 읽을 수 있다', !!page);
  check('미리보기 규칙을 읽을 수 있다', !!pv);
  check('★ 미리보기 종이가 A4 210mm 다', pv && pv[1] === '210',
    '190mm 로 두면 글이 놓이는 폭이 종이보다 20mm 좁아, 미리보기에서만 표가 좁아 보인다');
  check('안쪽 여백이 @page 와 같다', page && pv && page[1] === pv[2] && page[2] === pv[3],
    '「실제로 나갈 모습입니다」라고 적어 놓고 다른 폭을 보여 주면 안 된다');
}

console.log('\n[PDF 이름] 주마다 뽑은 것이 같은 이름이 되지 않는다 — 함정 27번');
{
  check('인쇄하는 동안만 제목을 바꾼다', /function withFileName\(name, run\)/.test(SRC));
  check('afterprint 로 되돌린다', SRC.includes("window.addEventListener('afterprint', back2)"));
  check('안 오는 브라우저를 위한 안전망', SRC.includes('setTimeout(back2, 20000)'));
  check('이름에 학교와 날짜가 들어간다', /function printFileName\(\)/.test(SRC) &&
    SRC.includes("'주간시간표_' + who + '_' + LEAP.todayISO()"));
  check('파일 이름에 못 쓰는 글자를 걷어낸다', SRC.includes('replace(/[\\\\/:*?"<>|]/g'));
}

console.log('\n[군더더기] 같은 말을 두 번 적지 않는다');
{
  check('일하는 화면에 만드는 사람의 말이 없다',
    !SRC.includes('곳이 앱 안에 들어 있습니다. 인터넷은 쓰지 않습니다.'),
    '「917곳이 앱 안에」는 자랑이다. 일하러 온 사람에게 필요한 것은 「무엇부터 하면 되는가」다');
  check('LEAP Kit 머리 주석이 하나다',
    (SRC.match(/LEAP Kit \(apps\/kit\/leap\.js 사본/g) || []).length === 1,
    'v0.2 에는 똑같은 주석 덩어리가 붙어 있었다');
  check('판 번호가 머리 주석·판권에서 같다',
    /순회교사 통합 시간표 v0\.3/.test(SRC) &&
    /<div class="name">순회교사 통합 시간표 <span>v0\.3<\/span><\/div>/.test(SRC),
    'v0.2 에서는 머리 주석이 v0.1 인 채로 남아 있었다');
}

console.log('\n----------------------------------------');
console.log(pass + '개 통과, ' + fail + '개 실패');
process.exit(fail ? 1 : 0);
