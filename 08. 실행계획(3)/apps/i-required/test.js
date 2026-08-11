/* 법정 의무교육 점검표 — 점검
   최소 DOM 스텁 위에서 앱을 실제로 실행하고, 이 앱이 **약속한 규칙**이
   지켜지는지 본다. 기능이 있는지가 아니라 규칙이 깨지지 않는지를 본다.

   ★ 이 앱은 «법령에서 옮겨 적은 숫자»로 돌아간다. 그래서 검사가 하는 일의
     절반은 «옮겨 적은 것이 맞는가»를 도움자료 43~45쪽과 견주는 일이다.
     그리고 합계는 앱이 세게 두고, 검사도 **따로 센다** — 둘 다 같은 표를
     베껴 적으면 틀린 것이 안 보인다 (마스터 함정 35번).

   실행: node test.js */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const blocks = [...SRC.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

function makeEl(tag) {
  return {
    tagName: tag || 'div', _html: '', hidden: false, value: '', textContent: '',
    tabIndex: 0, checked: false, files: null,
    classList: { add() {}, remove() {} }, style: {}, className: '',
    set innerHTML(v) { this._html = v; },
    get innerHTML() { return this._html; },
    set outerHTML(v) { this._html = v; },
    addEventListener() {}, removeEventListener() {}, focus() {}, click() {},
    scrollIntoView() {},
    setAttribute(k, v) { this['_' + k] = v; },
    getAttribute(k) { return this['_' + k] == null ? null : this['_' + k]; },
    hasAttribute(k) { return this['_' + k] != null; },
    appendChild() {}, removeChild() {},
    querySelector(sel) {
      const m = /^#([\w-]+)$/.exec(String(sel));
      if (m) return this._html.includes('id="' + m[1] + '"') ? makeEl() : null;
      return this._html ? makeEl() : null;
    },
    querySelectorAll() { return []; }
  };
}

function run(state) {
  const panels = {};
  const store = { 'leap-required-v1': state ? JSON.stringify(state) : null };
  const sandbox = {
    console,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v; },
      removeItem: k => { delete store[k]; }
    },
    matchMedia: () => ({ matches: false }),
    crypto: globalThis.crypto, TextEncoder,
    Blob: function (p, o) { this.parts = p; this.type = o && o.type; },
    URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    navigator: {},
    Image: function () {}, FileReader: function () {},
    alert: () => {}, confirm: () => true, print: () => {}, scrollTo: () => {},
    setTimeout: () => {}, clearTimeout: () => {}, setInterval: () => {},
    addEventListener() {}, removeEventListener() {},
    document: {
      title: '법정 의무교육 점검표 — TEAM LEAP',
      getElementById(id) { if (!panels[id]) panels[id] = makeEl(); return panels[id]; },
      createElement: makeEl,
      body: { appendChild() {}, removeChild() {}, className: '' },
      documentElement: makeEl(),
      addEventListener() {}, removeEventListener() {}
    }
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  blocks.forEach(b => vm.runInContext(b, sandbox, { timeout: 10000 }));
  const get = id => (panels[id] ? panels[id]._html : '');
  return {
    I: sandbox.LEAP_I, LEAP: sandbox.LEAP, store,
    get panel() { return get('panel'); },
    get grades() { return get('grades'); },
    get bar() { return get('planbar'); },
    get mini() { return get('mini'); }
  };
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  실패 ' + name + (extra ? '\n       ' + extra : '')); }
}

/* ------------------------------------------------------------------------
   검사용 자료 — 4학년 한 해를 «규칙에 맞게» 다 채운 계획
   의무 127 + 권장 13 = 140시간. 창체 87 · 교과 49 · 행사 4.
   ------------------------------------------------------------------------ */
const U = (h, w, sj, n) => ({ h, n: n || [0, 0], where: w || '', subj: sj || '' });
const SEED = {
  v: 1,
  info: { year: '2026학년도', school: '포항양덕초등학교', grade: '4학년', klass: '4학년 2반' },
  cetCap: 0,
  healthGrade: true,
  units: {
    'a-life':  U([6, 6],  'cet', '', [2, 2]),
    'a-road':  U([6, 5],  'cet', '', [3, 3]),
    'a-viol':  U([4, 4],  'cet', '', [2, 2]),
    'a-drug':  U([5, 5],  'cet', '', [2, 2]),
    'a-dis':   U([3, 3],  'cet', '', [2, 2]),
    'a-job':   U([1, 1],  'cet', '', [1, 1]),
    'a-aid':   U([1, 1],  'cet', '', [1, 1]),
    fire:      U([1, 1],  'cet'),
    gender:    U([8, 7],  'cet'),
    health:    U([9, 8],  'subj', '체육'),
    food:      U([1, 1],  'cet'),
    life:      U([3, 3],  'cet'),
    bully:     U([6, 6],  'cet'),
    char:      U([0, 0],  'subj', '도덕'),
    teach:     U([1, 0],  'cet'),
    digit:     U([5, 5],  'subj', '실과·미술'),
    career:    U([0, 0],  'cet'),
    civic:     U([0, 0],  'subj', '사회'),
    disab:     U([1, 1],  'cet'),
    human:     U([0, 0],  'subj', '도덕'),
    multi:     U([1, 1],  'subj', '사회'),
    uni:       U([3, 2],  'subj', '사회'),
    dokdo:     U([5, 5],  'subj', '사회'),
    econ:      U([0, 0],  'subj', '사회'),
    env:       U([1, 1],  'subj', '과학'),
    hist:      U([2, 1],  'subj', '사회')
  },
  musts: { 'm-drill': true, 'm-fire2': true, 'm-sv3': true, 'm-deep': true, 'm-cyber3': true }
};
const mk = (over) => {
  const d = JSON.parse(JSON.stringify(SEED));
  if (over) Object.keys(over).forEach(k => {
    if (k === 'units' || k === 'musts' || k === 'info') Object.assign(d[k], over[k]);
    else d[k] = over[k];
  });
  return d;
};

console.log('\n[1] 빈 화면 — 무엇부터 하라고 말하는가');
{
  const r = run(null);
  check('학년 여섯이 늘 함께 보인다', (r.grades.match(/data-g=/g) || []).length === 6);
  check('학년마다 창체 시수를 함께 적는다', r.grades.includes('창체 102시간') && r.grades.includes('창체 119시간'));
  check('아직 아무 학년도 고르지 않았다', !r.grades.includes('aria-pressed="true"'),
    '고른 척하지 않는다');
  check('학년을 고르라고 말한다', r.panel.includes('학년을 고르면'));
  check('빈 그릇이 무엇을 담는지 말한다', r.panel.includes('법으로 시수가 박힌 교육의 합'));
  check('미리보기가 비어 있어도 그려진다', r.mini.includes('범교과 학습 주제 운영 계획'));
  check('아직 적은 것이 없다고 종이가 적는다', r.mini.includes('아직 적은 것이 없습니다'));
  check('빈 상태에서는 살펴볼 곳이 없다', r.I.problems().length === 0,
    '비어 있는 것은 틀린 것이 아니다');
}

console.log('\n[2] ★ 시수가 도움자료 43~44쪽과 같은가');
{
  const I = run(null).I;
  const T = {}; I.TOPICS.forEach(t => T[t.id] = t);
  /* [법정 시수, 의무여부(1=의무), 교과통합인가] — 원본 표를 그대로 옮긴 기대값 */
  const want = {
    safe:   [51, 1, 0], fire:  [2,  1, 0], gender: [15, 1, 0], health: [17, 1, 0],
    food:   [2,  1, 0], life:  [6,  1, 0], bully:  [12, 1, 0],
    char:   [0,  1, 1], teach: [1,  1, 0], digit:  [10, 1, 0],
    career: [0,  1, 1], civic: [0,  0, 1],
    disab:  [2,  1, 0], human: [0,  0, 1], multi:  [2,  1, 0], uni:    [5,  1, 0],
    dokdo:  [10, 0, 0], econ:  [0,  0, 1], env:    [2,  1, 0], hist:   [3,  0, 0]
  };
  check('주제가 스무 개다', I.TOPICS.length === 20, '경북은 11개 주제 · 세부 20개');
  Object.keys(want).forEach(id => {
    const w = want[id], t = T[id];
    check(id + ' — ' + (t ? t.n : '(없음)') + ' ' + (w[0] || '교과통합') + (w[1] ? ' 의무' : ' 권장'),
      !!t && t.h === w[0] && (t.duty ? 1 : 0) === w[1] && (t.integ ? 1 : 0) === w[2]);
  });
  check('모든 주제에 근거가 붙어 있다', I.TOPICS.every(t => (t.law || []).length > 0),
    '계획서에는 근거를 적어야 한다');
  check('모든 주제에 편성·운영 방법이 붙어 있다', I.TOPICS.every(t => !!t.how));
}

console.log('\n[3] ★ 근거 법령을 «원문 그대로» 옮겼는가');
{
  /* 기억으로 적으면 조문이 틀린다. 실제로 처음에 통일교육을 제11조,
     교원지위법을 제16조의3 으로 적을 뻔했다 — 둘 다 원문과 다르다. */
  const want = [
    ['「학교안전사고 예방 및 보상에 관한 법률」 제8조'],
    ['「양성평등기본법」 제30조·제36조'],
    ['「학교보건법」 제9조·제9조의2'],
    ['「학교폭력예방법」 제15조 및 동법 시행령 제17조'],
    ['「교원의 지위 향상 및 교육활동 보호를 위한 특별법」 제24조 / 동법 시행령 제21조'],
    ['「통일교육 지원법」 제4조 및 제8조 / 동법 시행령 제6조의2'],
    ['「장애인복지법」 제25조 / 동법 시행령 제16조'],
    ['「다문화가족지원법」 제5조'],
    ['「자살예방 및 생명존중문화 조성을 위한 법률」 제17조 / 동법 시행령 제10조의2'],
    ['「디지털 기반의 원격교육 활성화 기본법」 제10조'],
    ['「인성교육진흥법」 제6조·제10조 / 동법 시행령 제11조'],
    ['「진로교육법」 제12조 / 동법 시행령 제5조·제6조'],
    ['「독도의 지속가능한 이용에 관한 법률」 제5조'],
    ['「환경교육의 활성화 및 지원에 관한 법률」 제4조·제10조의2'],
    ['경상북도교육청 독립운동사 교육 활성화 조례 제6조'],
    ['「어린이 식생활안전관리 특별법」 제13조'],
    ['「경제교육지원법」 제4조·제5조 / 동법 시행령 제3조'],
    ['「국가인권위원회법」 제26조']
  ];
  want.forEach(([law]) => check('근거 — ' + law, SRC.includes(law)));
  check('틀린 조문이 남아 있지 않다',
    !SRC.includes('「통일교육 지원법」 제11조') && !SRC.includes('제16조의3'),
    '기억으로 적었다면 여기서 걸렸을 것이다');
}

console.log('\n[4] ★ 의무 시수의 합 — 표에서 «따로» 세어 본다');
{
  const I = run(null).I;
  /* 검사가 앱의 셈을 베껴 쓰면 둘 다 틀려도 통과한다 (마스터 함정 35번).
     그래서 여기서는 도움자료의 숫자를 직접 늘어놓고 더한다. */
  const 도움자료 = [51, 2, 15, 17, 2, 6, 12, 1, 10, 2, 2, 5, 2];
  const 손으로_더한_값 = 도움자료.reduce((a, b) => a + b, 0);
  check('★ 의무 시수의 합이 127시간이다', 손으로_더한_값 === 127,
    '안전51·소방2·양성평등15·보건17·영양2·생명존중6·학교폭력12·' +
    '교육활동침해1·디지털10·장애인식2·다문화2·통일5·환경2');
  check('★ 앱이 세는 값과 같다', I.DUTY_FULL === 손으로_더한_값,
    '앱 값 ' + I.DUTY_FULL + ' · 손으로 더한 값 ' + 손으로_더한_값);
  check('권장 시수의 합이 13시간이다', I.recTotal() === 10 + 3, '독도 10 · 역사 3');
  check('★ 127 을 상수로 적어 두지 않았다',
    !/DUTY_FULL\s*=\s*127|var\s+\w+\s*=\s*127\b/.test(SRC),
    '손으로 더하면 한 줄을 빠뜨린다 — 실제로 환경 2시간을 빠뜨렸다 (마스터 함정 34번)');
  check('보건 17시간을 빼면 110시간이다', I.DUTY_NOHEALTH === 110);
}

console.log('\n[5] ★ 보건교육 17차시는 «한 개 학년 이상»이다');
{
  const on = run(mk()).I;
  const off = run(mk({ healthGrade: false })).I;
  check('중점학년이면 127시간을 진다', on.dutyTotal() === 127);
  check('★ 중점학년이 아니면 110시간이다', off.dutyTotal() === 110,
    '「한 개 학년 이상 최소 17차시」 — 모든 학년이 아니다');
  check('그때 보건교육은 모자란 것으로 세지 않는다',
    !off.problems().some(p => p.t === 'short' && p.id === 'health'));
  { const q = run(mk()); q.I.setTab('cross');
    check('화면이 그 까닭을 적는다', q.panel.includes('「<b>한 개 학년 이상</b> 최소 17차시 이상」')); }
  check('종이가 「해당 없음」이라 적는다', run(mk({ healthGrade: false })).mini.includes('해당 없음'));
  check('종이가 그 규칙을 적는다',
    run(mk()).mini.includes('보건교육 17차시는 <b>한 개 학년 이상</b>에 편성합니다'));
}

console.log('\n[6] ★ 학교안전교육 7대 표준안 — 도움자료 45쪽');
{
  const I = run(null).I;
  const want = { 'a-life': [12, 2], 'a-road': [11, 3], 'a-viol': [8, 2],
    'a-drug': [10, 2], 'a-dis': [6, 2], 'a-job': [2, 1], 'a-aid': [2, 1] };
  check('영역이 일곱이다', I.AREAS.length === 7, '「7대 표준안」 — 약물과 사이버는 한 영역이다');
  I.AREAS.forEach(a => {
    const w = want[a.id];
    check(a.n + ' ' + w[0] + '시간 · 학기당 ' + w[1] + '회 이상',
      !!w && a.h === w[0] && a.per === w[1]);
  });
  /* 51 도 베껴 적지 않고 센다 */
  check('★ 일곱 영역의 합이 51시간이다',
    I.AREAS.reduce((n, a) => n + a.h, 0) === 51 && I.SAFE_TOTAL === 51);
  check('약물·사이버가 5+5 라는 것을 적어 둔다', SRC.includes('약물 5시간') && SRC.includes('사이버 5시간'));
  check('44시간이 51시간 안에 든다고 적는다',
    SRC.includes('안전교육 44시간이 들어 있습니다') || SRC.includes('안전교육 44시간이 포함됩니다'));
}

console.log('\n[7] ★ 영역별 20% 자율 조정 — 소수점은 «올림»');
{
  const I = run(null).I;
  /* 「총 이수 시간의 범위 내에서 … 20% 범위 내, 소수점은 올림 처리」 */
  const want = { 12: [10, 15], 11: [9, 14], 8: [7, 10], 10: [8, 12], 6: [5, 8], 2: [2, 3] };
  Object.keys(want).forEach(h => {
    const w = want[h];
    check('기준 ' + h + '시간 → ' + w[0] + '~' + w[1],
      I.adjLo(+h) === w[0] && I.adjHi(+h) === w[1],
      '올림이 아니라 반올림이면 ' + Math.round(h * 0.8) + '~' + Math.round(h * 1.2) + ' 이 된다');
  });
  check('내림이 아니다', I.adjLo(12) === 10, '12×0.8 = 9.6 → 올림 10 (내림이면 9)');

  const low = mk({ units: { 'a-life': U([4, 4], 'cet', '', [2, 2]) } });   // 8 — 하한 10 미만
  const p = run(low).I.problems();
  check('조정 범위를 벗어나면 잡는다', p.some(x => x.t === 'adj' && x.id === 'a-life'));
  check('어디까지 갈 수 있는지 함께 준다',
    p.filter(x => x.t === 'adj')[0].lo === 10 && p.filter(x => x.t === 'adj')[0].hi === 15);

  /* ★ 규칙은 두 겹이다 — 영역별로 줄여도 총 51 은 지켜야 한다 */
  const cut = mk({ units: {
    'a-life': U([5, 5], 'cet', '', [2, 2]),   // 10 — 하한, 규칙 안
    'a-road': U([5, 4], 'cet', '', [3, 3])    // 9  — 하한, 규칙 안
  } });
  const p2 = run(cut).I.problems();
  check('★ 영역별로는 규칙 안인데 총합이 모자란 것을 잡는다',
    !p2.some(x => x.t === 'adj') && p2.some(x => x.t === 'safe51'),
    '한쪽만 보면 규칙을 반만 지킨다');
  check('몇 시간 모자란지 셈해 준다',
    p2.filter(x => x.t === 'safe51')[0].have === 47 &&
    p2.filter(x => x.t === 'safe51')[0].need === 51);
}

console.log('\n[8] ★ 시수만 맞으면 되는 것이 아니다 — 학기당 횟수');
{
  const r = run(mk());
  check('맞게 짠 계획은 걸리는 것이 없다', r.I.hard().length === 0,
    '걸린 것: ' + JSON.stringify(r.I.hard()));

  /* 교통 안전 11시간을 다 채우되 1학기에 몰아 한 경우 */
  const lump = mk({ units: { 'a-road': U([11, 0], 'cet', '', [3, 0]) } });
  const p = run(lump).I.problems();
  check('★ 시수는 다 찼는데 2학기 횟수가 0 인 것을 잡는다',
    p.some(x => x.t === 'per' && x.id === 'a-road' && x.term === 2),
    '합계만 맞으면 틀린 것이 안 보인다 (마스터 함정 12번)');
  check('그것이 시수 미달로 잡히지는 않는다',
    !p.some(x => x.t === 'short' && x.id === 'a-road'));
  check('몇 회가 필요한지 함께 준다', p.filter(x => x.t === 'per')[0].need === 3);
  /* ★ 안전 7대 영역을 먼저 채워야 범교과 표의 첫 줄이 채워진다.
     걸음의 차례가 일하는 차례와 다르면, 채울 수 없는 칸을 먼저 보게 된다. */
  check('★ 걸음 ①이 안전, ②가 범교과다',
    r.panel.indexOf('① 학교안전교육 7대 영역') < r.panel.indexOf('② 범교과 학습 주제'),
    '범교과 표의 안전 줄은 7대 영역 표의 «합»이라 거기부터 채워야 한다');
  check('처음 열리는 걸음이 안전이다', r.I.getTab() === 'safe');
  check('여기부터 채우라고 말한다', r.panel.includes('여기부터 채웁니다'));
  { const q = run(mk()); q.I.setTab('cross');
    check('범교과의 안전 줄이 ① 걸음을 가리킨다',
      q.panel.includes('<b>① 7대 영역</b>에서 채운 값입니다')); }
  { const q = run(mk()); q.I.setTab('cross');
  check('학기를 나눠 받는다는 까닭을 화면이 적는다',
    q.panel.includes('「학기당 몇 회 이상」을 셀 수 있어야 하기 때문입니다')); }
}

console.log('\n[9] ★ 시수를 적어 놓고 자리를 안 정한 것은 «채운 것이 아니다»');
{
  const nw = mk({ units: { uni: U([3, 2], '') } });     // 통일 5시간, 어디에 얹을지 안 정함
  const p = run(nw).I.problems();
  check('자리를 안 정한 것을 잡는다', p.some(x => x.t === 'nowhere' && x.id === 'uni'));
  check('그것이 시수 미달로 잡히지는 않는다', !p.some(x => x.t === 'short' && x.id === 'uni'));
  const b = run(nw).I.bowls();
  check('★ 그릇에 「아직 안 정함」이 따로 있다', b.none === 5,
    '창체에도 교과에도 넣지 않는다 — 넣으면 채운 것처럼 보인다');
  check('그릇의 합은 그대로다', b.cet + b.subj + b.none === 140);
  check('화면이 그 그릇을 그린다', run(nw).panel.includes('아직 안 정함'));
}

console.log('\n[10] ★ 이 앱의 이유 — 창체만으로는 들어가지 않는다');
{
  const r = run(mk());
  const b = r.I.bowls();
  check('창의적 체험활동에 91시간', b.cet === 91);
  check('교과 통합에 49시간', b.subj === 49);
  /* ★ 얹을 수 있는 자리는 둘뿐이다 — 도움자료의 편성·운영 방법이
     스무 주제 모두 「교과 및 창의적 체험활동과 연계」로 끝난다.
     셋째 그릇을 두면 «교육과정 밖에 둔 시간»이 생긴다. */
  check('★ 그릇은 둘뿐이다', Object.keys(run(null).I.WHERE).join(',') === 'cet,subj',
    '학교 행사·훈련은 v0.2 에서 없앴다 — 훈련도 결국 창체 시간에 한다');
  check('두 그릇의 합이 140시간', b.cet + b.subj === 140, '의무 127 + 권장 13');
  check('4학년 창체 연간 시수는 102시간', r.I.cetCap() === 102, '학년군 204시간의 절반');
  check('★ 창체의 몇 %가 법정 의무교육인지 말한다',
    r.panel.includes('창의적 체험활동 102시간 가운데 91시간이 법정 의무교육입니다 — 89%'),
    '세어 보기 전에는 보이지 않는 사실이다');
  check('남은 자리가 몇 시간인지 말한다', r.panel.includes('남은 자리는 11시간입니다'));
  /* ★ 권장까지 더한 값을 의무 시수와 나란히 두면 다 못 채웠는데도 넘친 것처럼 읽힌다 */
  check('★ 얼굴에는 의무에 얹은 것만 견준다', r.I.dutyPlaced() === 127 && r.I.recPlaced() === 13);
  check('그렇게 적는다', r.panel.includes('127 / 127시간') &&
    r.panel.includes('권장은 따로 13 / 13시간'));
  check('창체 눈금이 막대 끝에 붙지 않는다', SRC.includes('scale = Math.max(scale, cap * 1.14)'),
    '눈금이 100% 자리에 있으면 있으나 마나다');
  check('창체 너머는 빗금으로 알린다', r.panel.includes('class="hatch"'));

  /* 창체에 다 넣으려 하면 */
  const all = mk();
  Object.keys(all.units).forEach(k => { all.units[k].where = 'cet'; });
  const r2 = run(all);
  check('★ 창체에 다 못 들어가는 것을 잡는다', r2.I.problems().some(x => x.t === 'cetover'));
  check('몇 시간 넘는지 셈해 준다',
    r2.I.problems().filter(x => x.t === 'cetover')[0].have === 140 &&
    r2.I.problems().filter(x => x.t === 'cetover')[0].cap === 102);
  check('창체에 자리가 없다고 말한다', r2.panel.includes('더 들어갈 자리가 없습니다'));

  /* 학교가 창체를 증감했으면 고칠 수 있다 */
  const cap = run(mk({ cetCap: 120 }));
  check('학교가 고친 창체 시수를 쓴다', cap.I.cetCap() === 120);
  check('기본값이 무엇인지도 함께 보여 준다', cap.panel.includes('기본값 102시간'));
}

console.log('\n[11] ★ 함께 지킬 조건 — 시수와 다른 종류의 확인');
{
  const I = run(mk()).I;
  const ids = I.MUSTS.map(m => m.id);
  ['m-drill', 'm-fire2', 'm-sv3', 'm-deep', 'm-cyber3'].forEach(id =>
    check('조건 — ' + id, ids.indexOf(id) >= 0));
  check('조건이 다섯 개다', I.MUSTS.length === 5);
  const want = [
    '재난 대비 훈련을 <b>2종류 이상</b>',
    '소방 안전교육을 <b>연 2회</b>',
    '성폭력·가정폭력·성매매 예방교육을 <b>3차시 이상</b>',
    '디지털 성폭력(딥페이크·AI 등) 예방교육을 <b>1차시 별도</b>',
    '사이버폭력 예방을 <b>3차시 이상</b>'
  ];
  want.forEach(w => check('조건을 그대로 적는다 — ' + w.replace(/<[^>]+>/g, ''), SRC.includes(w)));

  const un = mk({ musts: { 'm-cyber3': false } });
  const p = run(un).I.problems();
  check('확인하지 않은 조건을 잡는다', p.some(x => x.t === 'must' && x.id === 'm-cyber3'));
  check('★ 시수가 다 차 있어도 잡는다',
    run(un).I.uSum('bully') === 12 && p.some(x => x.t === 'must'),
    '학교폭력 12시간을 채워도 사이버폭력 3차시는 따로 확인해야 한다');
  check('종이에도 조건 표가 있다', run(mk()).mini.includes('3. 함께 지킬 조건'));
  check('★ 학급당이라는 것을 적는다', SRC.includes('<b>학급당</b> 12차시 이상입니다'),
    '학교 단위가 아니라 우리 반이다');
}

console.log('\n[12] 시수가 모자라면 «몇 시간»인지 말한다');
{
  const s = mk({ units: { gender: U([5, 5], 'cet') } });   // 양성평등 10 / 15
  const p = run(s).I.problems();
  const x = p.filter(y => y.t === 'short' && y.id === 'gender')[0];
  check('모자란 것을 잡는다', !!x);
  check('얼마나 모자란지 알 수 있다', !!x && x.need === 15 && x.have === 10);
  check('종이에도 몇 시간 모자란지 적는다',
    run(s).mini.includes('5시간 모자람'),
    '화면에서만 알리면 종이를 들고 간 사람은 모른다');

  /* 권장은 어긴 것이 아니다 */
  const rec = mk({ units: { dokdo: U([3, 2], 'subj', '사회') } });   // 독도 5 / 10 권장
  const pr = run(rec).I;
  check('권장 미달도 알리기는 한다', pr.problems().some(y => y.t === 'rec' && y.id === 'dokdo'));
  check('★ 그것은 「어긴 것」이 아니다', pr.hard().every(y => y.t !== 'rec'));
  check('화면이 그렇게 말한다', run(rec).panel.includes('<b>권장은 어긴 것이 아닙니다.</b>'));
}

console.log('\n[13] 종이 — 미리보기와 인쇄가 같은 HTML 이다');
{
  const r = run(mk());
  check('미리보기가 곧 그 HTML 이다', r.mini === r.I.paperHTML(),
    '따로 만들면 「여기 보이는 것이 그대로 나옵니다」가 거짓말이 된다');
  check('표 세 장이 다 있다',
    r.mini.includes('1. 범교과 학습 주제별 운영 시수') &&
    r.mini.includes('2. 학교안전교육 7대 영역') &&
    r.mini.includes('3. 함께 지킬 조건'));
  check('근거 법령이 종이에 실린다', r.mini.includes('「학교안전사고 예방 및 보상에 관한 법률」 제8조'));
  check('학교·학년·학급이 실린다',
    r.mini.includes('포항양덕초등학교') && r.mini.includes('4학년 2반'));
  check('편성 자리가 실린다', r.mini.includes('교과(체육)') && r.mini.includes('창의적 체험활동'));
  check('없앤 자리가 종이에 남아 있지 않다', !r.mini.includes('학교 행사·훈련'));
  check('학기당 횟수 기준이 실린다', r.mini.includes('(3회 이상)'));
  check('법령이 바뀐다고 알린다', r.mini.includes('법령은 바뀝니다'));
  const bad = mk({ units: { gender: U([5, 5], 'cet') } });
  check('★ 살펴볼 곳을 종이에도 적는다', run(bad).mini.includes('살펴볼 곳'));
  check('맞게 짠 계획에는 살펴볼 곳이 없다', !r.mini.includes('살펴볼 곳'));
  check('판면 규칙이 @media print 밖에 있다',
    SRC.includes('.pv-page h2.P-h') &&
    SRC.indexOf('.pv-page h2.P-h') > SRC.indexOf('@media print{'));
  check('긴 표는 머리줄을 다시 그린다', SRC.includes('thead{display:table-header-group}'));
  check('줄이 장 사이에서 잘리지 않는다', SRC.includes('.pv-page tr{break-inside:avoid}'),
    '마스터 함정 29번');
  check('A4 세로다', SRC.includes('@page{size:A4 portrait'));
  check('미리보기 폭이 @page 와 같다',
    SRC.includes('.pv-scroll > .pv-page{width:210mm') && SRC.includes('padding:14mm 12mm'),
    '마스터 함정 31번');
}

console.log('\n[14] 표로 내보내기 — 학교는 엑셀에서 다시 만진다');
{
  const r = run(mk());
  const csv = r.I.csvText();
  const lines = csv.split('\r\n');
  check('머리줄이 있다', lines[0].includes('구분,범교과 학습 주제,법정 시수,의무여부'));
  check('안전 7영역이 따로 실린다',
    (csv.match(/"학교안전교육"/g) || []).length === 7);
  check('학기당 횟수도 실린다', csv.includes(',2,2,2,'));
  check('함께 지킬 조건도 실린다', csv.includes('"함께 지킬 조건"'));
  check('의무 시수 합 줄이 있다', csv.includes('"의무 시수 합",127'));
  check('쉼표가 든 이름을 감싼다', csv.includes('"생명존중 및 자살예방교육 (사회정서교육)"'));
  check('BOM 을 붙인다', SRC.includes('﻿') || SRC.includes("'\\ufeff'"),
    '없으면 엑셀에서 한글이 깨진다');
  check('줄바꿈이 CRLF 다', csv.includes('\r\n'));
  /* ★ 앱 H 에서 kit 사본에 LEAP.saveBlob 이 빠져 내려받기가 던졌다 (마스터 함정 13번).
     만드는 함수만 검사하고 «내려받는 데까지» 가 보지 않았기 때문에 통과했었다. */
  check('★ 앱이 부르는 LEAP 창구가 사본에 다 있다', (() => {
    const used = new Set([...SRC.matchAll(/\bLEAP\.([A-Za-z]\w*)\s*\(/g)].map(m => m[1]));
    const miss = [...used].filter(n => typeof r.LEAP[n] !== 'function');
    if (miss.length) console.log('       빠진 것: ' + miss.join(', '));
    return miss.length === 0;
  })(), '사본이 조용히 낡는다');
}

console.log('\n[15] PDF 파일 이름 — 함정 27번');
{
  const n = run(mk()).I.fileBase();
  check('학교·학년·학년도가 들어간다',
    n.includes('포항양덕초등학교') && n.includes('4학년') && n.includes('2026학년도'));
  check('무엇인지 이름이 말한다', n.indexOf('범교과학습주제운영계획_') === 0);
  check('인쇄하는 동안만 제목을 바꾼다', /function withFileName\(name, run\)/.test(SRC));
  check('afterprint 로 되돌린다', SRC.includes("window.addEventListener('afterprint', back)"));
  check('안 오는 브라우저를 위한 안전망', SRC.includes('setTimeout(back, 20000)'));
  check('못 쓰는 글자를 걷어낸다', !/[\\/:*?"<>|]/.test(n));
}

console.log('\n[16] AI 초안 — 시수는 AI 에게 맡기지 않는다');
{
  check('API 키를 쓰지 않는다', !/api[_ ]?key/i.test(SRC));
  check('밖으로 부르는 곳이 없다', !/fetch\(|XMLHttpRequest|WebSocket/.test(SRC));
  check('★ 받아 저장하지 않는다', SRC.includes('AI 의 답을 <b>받아 저장하지 않습니다</b>'),
    '법정 시수를 지어내면 그대로 결재에 올라간다');
  check('시수를 지어내지 말라고 적는다', SRC.includes('**시수를 지어내지 마세요.**'));
  check('숫자를 바꾸지 말라고 적는다', SRC.includes('숫자를 바꾸거나 새로 만들지 마세요'));
  check('살펴볼 곳이 있으면 먼저 알린다', SRC.includes('모자란 시수에 대한 그럴듯한 계획'));
  check('창체만으로는 안 된다는 것을 프롬프트에도 적는다',
    SRC.includes('**창의적 체험활동만으로는 다 들어가지 않습니다.**'));
  check('소규모학교의 형편을 함께 준다', SRC.includes('경상북도의 소규모학교일 수 있습니다'));
}

console.log('\n[17] 갈림길과 되돌리기 — 함정 37·39번');
{
  check('★ 앱 어디에도 confirm 이 없다', !/\bconfirm\(/.test(SRC));
  check('갈림길 창이 있다', /function askWay\(opts\)/.test(SRC));
  check('내보내는 길이 맨 위',
    SRC.indexOf("name: '파일로 내보내고 처음부터'") < SRC.indexOf("name: '그냥 처음부터'"));
  check('Esc 는 아무 일도 일으키지 않는다', SRC.includes("if (e.key === 'Escape') shut();"));
  check('잃을 것이 없으면 묻지 않는다', SRC.includes('if (!hasAny()) { wipe(); return; }'));
  check('되돌리기는 통으로 붙든다', SRC.includes('snap: JSON.stringify(db.get())'));
  check('한 걸음만 기억한다', SRC.includes('if (undoKeep) undoKeep = false; else undo = null;'));
}

console.log('\n[18] 옛 저장본이 터지지 않는다 — 함정 10번');
{
  let r = null;
  try { r = run({ v: 1, units: { bully: { h: [6, 6] } } }); } catch (e) { }
  /* 조건은 «아직 확인 안 함(false)」으로 채워야 한다 — 없는 것과 false 는 다르다.
     없으면 「살펴볼 곳」에 오르지 않아 조용히 넘어간다. */
  check('없는 칸을 채워 넣는다',
    !!r && !!r.I.read().units['a-life'] && ('m-drill' in r.I.read().musts) &&
    r.I.read().musts['m-drill'] === false);
  check('적혀 있던 값은 살아남는다', !!r && r.I.uSum('bully') === 12);
  check('화면이 그려진다', !!r && r.panel.includes('범교과 학습 주제'));
  check('기본값 채우기 함수가 있다', /function fill\(d\)/.test(SRC));
  let r2 = null;
  try { r2 = run({ v: 1, info: { grade: '7학년' }, units: { 없는주제: { h: [9, 9] } } }); } catch (e) { }
  check('표에 없는 주제는 걷어낸다', !!r2 && !('없는주제' in r2.I.read().units),
    '남겨 두면 합계가 조용히 달라진다');
  check('없는 학년은 고르지 않은 것으로 둔다', !!r2 && r2.I.read().info.grade === '');
  let r3 = null;
  try { r3 = run({ v: 1, units: { uni: { h: [3, 2], where: '엉뚱한곳' } } }); } catch (e) { }
  check('모르는 편성 자리는 비운다', !!r3 && r3.I.read().units.uni.where === '');
}

console.log('\n[19] 만드는 사람의 말이 일하는 화면에 없다');
{
  const r = run(mk());
  check('점검 개수를 화면에 적지 않는다', !/\d+개 통과|자동 점검/.test(r.panel + r.bar));
  check('「서버 없는 단일 HTML」 같은 말이 화면에 없다',
    !/단일 HTML|서버 없/.test(r.panel + r.bar + r.mini));
  check('마스터 함정 번호가 화면에 없다', !/마스터 함정|함정 \d+번/.test(r.panel + r.bar + r.mini));
  check('저작권 표기가 있다', SRC.includes('© 2026 TEAM LEAP. All rights reserved.'));
  check('판 번호가 머리 주석과 판권에서 같다',
    /법정 의무교육 점검표 v0\.5/.test(SRC) &&
    /<div class="name">법정 의무교육 점검표 <span>v0\.5<\/span><\/div>/.test(SRC));
}

console.log('\n[20] 다른 앱과 어긋나지 않는다');
{
  check('메인으로 나가는 길이 있다', SRC.includes('메인으로') && SRC.includes('../../../index.html'));
  check('나가도 잃는 것이 없다고 알린다', SRC.includes('이 앱에 적은 것은 그대로 남습니다'));
  check('테마 단추가 있다', SRC.includes('LEAP.initThemeBtn'));
  check('학생을 적는 칸이 없다', !/학생\s*이름/.test(SRC), '이 앱에는 학생이 나오지 않는다');
  check('자료는 이 기기 안에만 있다고 적는다', SRC.includes('이 브라우저 안에만'));
  check('저장 열쇠가 이 앱 것이다', SRC.includes("var KEY = 'leap-required-v1'"));
  check('기준의 출처를 판권에 밝힌다', SRC.includes('경상북도교육청연구원'));
  check('밖에서 불러오는 것이 없다', !/<script src=|<link[^>]+stylesheet/.test(SRC),
    '단일 HTML · 외부 CDN 0');
  check('창구는 늘 있는 것이다', /window\.LEAP_I = \{/.test(SRC), '마스터 함정 28번');
  check('창구로 고치는 길은 열지 않는다', !/LEAP_I[\s\S]{0,400}?(write|set)\s*:/.test(SRC));
}

/* ------------------------------------------------------------------------
   진도표에서 읽어 오기 〔v0.3〕
   아래 글은 실제 「5학년 3반 교육과정 연간 운영 및 지도계획」(45쪽) 에서
   그대로 옮긴 조각이다. **줄바꿈 자리까지 그대로 두었다** — PDF·한글에서
   복사하면 대괄호 «안»과 «사이»가 줄바꿈으로 갈리고, 그것이 이 파서가
   맨 먼저 넘어야 하는 자리이기 때문이다.
   ------------------------------------------------------------------------ */
const PLAN = `국어 교육과정 연간지도계획
주
기간
요일
단원명
학습주제
2026학년도 1학기
2
03.09. ~ 
03.15.
화
1. 대화를 나누어요
[폭력예방 및 신변보호-2][학교폭력 예방교육 어울림 프
로그램(감정조절)-2][사회정서-2]스스로 감정을 조절하
고, 다른 사람을 배려하며 대화하기
11
05.11. ~ 
05.17.
화
<매체> 필요한 정보를 찾아요
[약물 및 사이버 중독예방-3]게임 및 SNS 속 사이버 도박
유도 매체의 특성을 알아보기
수
<매체> 필요한 정보를 찾아요
[약물 및 사이버 중독예방-4]사이버 도박의 위험성 알기
목
<매체> 필요한 정보를 찾아요
[디지털 역량교육-1]필요한 정보 선택하기
금
<매체> 필요한 정보를 찾아요
[양성평등교육-14][디지털 역량교육-2]필요한 정보를 검
색하고 목적에 맞는 글 쓰기
사회 교육과정 연간지도계획
주
기간
요일
단원명
학습주제
5
03.30. ~ 
04.05.
월
1. 국토와 우리 생활
[독도교육-1][생성교육과정-1]독도의 위치와 영역 알아보기
화
1. 국토와 우리 생활
[독도교육-2][생성교육과정-2]독도의 자연환경 알아보기
자율·자치활동 교육과정 연간지도계획
주
기간
영역
학습주제
19
07.06. ~ 
07.11.
자율·자치활동
[생활안전-19]몸과 마음이 건강한 방학 식생활 계획 세우
기
20
07.13. ~ 
07.18.
자율·자치활동
[폭력예방 및 신변보호-5][생명존중 및 자살예방교육-1]
[사회정서-10]가정폭력의 이해와 민감성 기르기
21
07.20. ~ 
07.25.
자율·자치활동
[약물 및 사이버 중독 예방-5]약물 오남용의 위험성 알기
`;

console.log('\n[21] ★ 진도표에서 읽어 오기 — 학교가 이미 적어 둔 것을 읽는다');
{
  const I = run(null).I;
  const r = I.readPlan(PLAN);

  check('문서에서 학기를 읽는다', r.term === 1, '「2026학년도 1학기」');
  /* ★ 대괄호 «안»이 줄바꿈으로 갈린다 — PDF 복사의 기본값이다 */
  check('★ 대괄호 안이 줄바꿈으로 갈려도 읽는다',
    r.topics.some(t => t.id === 'bully'),
    '「[학교폭력 예방교육 어울림 프\\n로그램(감정조절)-2]」');
  /* ★ 대괄호 «사이»에도 줄바꿈이 낀다. 갈라 세면 차시 수가 늘어난다 */
  check('★ 대괄호 사이의 줄바꿈으로 차시를 갈라 세지 않는다',
    r.lessons === 10,
    '실제 45쪽 문서에서 세 군데였다. 갈라 세면 120차시가 123차시가 된다 — 차시 ' + r.lessons);
  check('한 차시가 여러 주제를 겸한다', r.tags === 17 && r.tags > r.lessons,
    '차시 10 개가 이수 시수 17 시간을 낸다 — 태그 ' + r.tags + ' · 차시 ' + r.lessons);

  const by = {}; r.topics.forEach(t => by[t.id] = t);
  check('생활 안전을 알아본다 (띄어쓰기가 달라도)', !!by['a-life'] && by['a-life'].count === 1,
    '문서 「생활안전」 · 앱 「생활 안전」');
  check('폭력예방 및 신변보호', !!by['a-viol'] && by['a-viol'].count === 2);
  check('★ 띄어쓰기가 갈린 이름을 하나로 합친다',
    !!by['a-drug'] && by['a-drug'].count === 3 && by['a-drug'].names.length === 2,
    '「약물 및 사이버 중독예방」과 「약물 및 사이버 중독 예방」 — 같은 문서 안에서 둘로 썼다');
  check('★ 괄호가 붙은 갈래도 본 주제로 본다', !!by['bully'],
    '「학교폭력 예방교육 어울림 프로그램(감정조절)」 → 학교폭력 예방교육');
  check('★ 별명으로 잡는다 — 사회정서', !!by['life'] && by['life'].count === 3,
    '「사회정서」 2 + 「생명존중 및 자살예방교육」 1 → 생명존중 및 자살예방교육');
  check('디지털 역량교육', !!by['digit'] && by['digit'].count === 2);
  check('양성평등교육', !!by['gender'] && by['gender'].count === 1);
  check('독도교육', !!by['dokdo'] && by['dokdo'].count === 2);

  check('★ 모르는 이름을 짐작하지 않는다',
    r.unknown.length === 1 && r.unknown[0].raw === '생성교육과정' && r.unknown[0].count === 2,
    '「생성교육과정」은 앱이 모르는 이름이다. 버리지도, 아무 데나 넣지도 않는다');

  /* 어느 교과에 얹었는지까지 읽는다 — 헤더를 따라간다 */
  check('교과에 얹은 것을 안다', by['digit'].where === 'subj' && /국어/.test(by['digit'].subjText));
  check('창의적 체험활동에 얹은 것을 안다', by['a-life'].where === 'cet',
    '자율·자치활동은 교과가 아니다');
  check('자리별 실제 차시를 센다', r.byWhere.cet + r.byWhere.subj === r.lessons);

  /* ★ 번호는 이름마다 매겨진다 — 합쳐 놓고 세면 거짓 경고가 난다 */
  check('★ 이름이 갈린 주제는 번호를 셈하지 않는다',
    by['a-drug'].dup.length === 0 && by['bully'].dup.length === 0,
    '어울림 세 갈래가 저마다 1·2 로 시작한다 — 합쳐 세면 「겹쳤다」는 거짓 경고');
  check('이름이 갈렸다는 것은 알린다', by['a-drug'].names.length === 2);
}

console.log('\n[22] ★ 읽은 것을 표로 옮긴다');
{
  const r0 = run(null);
  const res = r0.I.readPlan(PLAN);
  /* 앱 안에서 실제로 적용되는지를 본다 */
  const r = run(null);
  r.I.applyPlan(r.I.readPlan(PLAN), 1, { '생성교육과정': 'dokdo' });
  const d = r.I.read();

  check('1학기 칸에 들어간다', d.units['a-viol'].h[0] === 2 && d.units['a-viol'].h[1] === 0);
  check('어디에 얹었는지도 들어간다', d.units['a-life'].where === 'cet');
  check('교과 이름이 들어간다', d.units['digit'].where === 'subj' && /국어/.test(d.units['digit'].subj));
  check('학기당 횟수도 채운다', d.units['a-life'].n[0] === 1,
    '표시가 붙은 차시 하나를 한 회로 본다 — 적게 잡는 쪽이다');
  check('★ 사람이 골라 준 것이 얹힌다', d.units['dokdo'].h[0] === 2 + 2,
    '독도교육 2 + 「생성교육과정」 2 — 고르지 않았으면 세지 않는다');
  check('고르지 않으면 세지 않는다',
    run(null).I.read().units['dokdo'].h[0] === 0);

  check('읽어 온 기록이 남는다', !!d.plan && d.plan.term === 1 && d.plan.lessons === 10);
  check('흠도 기록에 남는다', d.plan.flaws.some(f => f.t === 'name'));
  /* 화면은 UI 가 다시 그리므로 여기서는 «되돌릴 자리를 붙들었는가»를 본다 */
  check('되돌릴 자리를 붙든 뒤에 덮어쓴다',
    /markUndo\('진도표에서 읽어 왔습니다[\s\S]{0,200}?save\(function/.test(SRC),
    '덮어쓰지만 한 걸음은 돌아온다 (마스터 함정 39번)');
}

console.log('\n[23] ★ 창의적 체험활동은 «차시»로 센다 — v0.2 가 틀렸던 자리');
{
  const r = run(null);
  r.I.applyPlan(r.I.readPlan(PLAN), 1, {});
  const d = r.I.read();
  /* 학년을 골라야 창체 시수가 선다 */
  const r2 = run(Object.assign(d, { info: Object.assign(d.info, { grade: '5학년' }) }));

  check('이수 시수와 실제 차시가 다르다', r2.I.bowls().cet !== r2.I.cetUsed(),
    '한 차시가 여러 주제를 겸하기 때문이다');
  check('창체에 쓴 것은 차시 수다', r2.I.cetUsed() === r2.I.read().plan.byWhere.cet);
  check('★ 화면이 그 둘을 나눠 말한다',
    r2.panel.includes('실제로 쓴 것은') && r2.panel.includes('한 차시가 여러 주제를 함께 이수하기 때문입니다'));
  check('한 차시가 평균 몇 주제인지 말한다', r2.panel.includes('개</b> 주제를 겸합니다'));
  check('★ 종이에도 적는다', r2.mini.includes('연간지도계획에서 읽어 온 것입니다'),
    '「이수 시수 195시간」만 적힌 종이를 보면 시간이 남는 줄 안다');
  check('종이가 흠도 적는다', r2.mini.includes('진도표에서 눈에 걸린 것'));
  check('진도표를 안 읽었으면 그 말이 없다', !run(mk()).mini.includes('읽어 온 것입니다'));
  check('진도표를 안 읽었으면 차시를 모른다고 말한다',
    run(mk()).panel.includes('실제 차시는 이보다 적습니다'),
    '모르는 것을 아는 척하지 않는다');
}

console.log('\n[24] 진도표 읽기가 엉뚱한 것에 걸리지 않는다');
{
  const I = run(null).I;
  check('빈 글은 아무것도 아니다', I.readPlan('').tags === 0 && I.readPlan('   ').lessons === 0);
  check('표시가 없는 진도표는 읽을 것이 없다',
    I.readPlan('국어 교육과정 연간지도계획\\n1. 대화를 나누어요\\n배울 내용 살펴보기').tags === 0);
  check('대괄호가 있어도 번호가 없으면 아니다',
    I.readPlan('[참고자료]나라 사랑').tags === 0);
  check('네 글자 밑으로는 앞부분 맞추기를 하지 않는다', I.matchUnit('안전') === '',
    '짧은 말은 엉뚱한 데 붙는다');
  check('가운뎃점이 달라도 같은 이름으로 본다',
    I.norm('환경･지속가능발전교육') === I.norm('환경·지속가능발전 교육'),
    '문서마다 · · ･ 를 섞어 쓴다');
  check('빈 이름은 아무 주제도 아니다', I.matchUnit('') === '' && I.matchUnit('없는주제입니다') === '');
}

/* ------------------------------------------------------------------------
   v0.4 검사용 1학기 조각 — 「어울림」이 세 갈래로 적힌 실제 모습을 담았다.
   갈래마다 번호가 따로 가므로, 한 갈래에 몰아넣으면 나머지가 멈춘다.
   ------------------------------------------------------------------------ */
const PLAN2 = `자율·자치활동 교육과정 연간지도계획
2026학년도 1학기
[교통안전-1][생활안전-1]안전한 통학로 알기
[교통안전-2]자전거 안전하게 타기
[학교폭력 예방교육 어울림 프로그램(감정조절)-1][사회정서-1]감정 알아차리기
[학교폭력 예방교육 어울림 프로그램(감정조절)-2][사회정서-2]감정 조절하기
[학교폭력예방교육 어울림 프로그램(사이버 의사소통)-1]댓글 예절 알기
[학교폭력예방교육 어울림 프로그램(사이버 의사소통)-2]사이버폭력 대처하기
[학교폭력 예방교육 어울림 프로그램(공감)-1]친구 마음 헤아리기
[학교폭력 예방교육 어울림 프로그램(공감)-2]공감하며 말하기
[통일교육-1]분단의 아픔 알기
체육 교육과정 연간지도계획
[보건교육-1][양성평등교육-1]몸의 변화 이해하기
[보건교육-2][양성평등교육-2]서로의 몸을 존중하기
`;

console.log('\n[25] ★ 남은 것을 차시로 묶어 준다 — 세어 가며 넣지 않게 〔v0.4〕');
{
  const seed = run({ v: 1, info: { year: '2026학년도', school: '포항양덕초등학교', grade: '5학년' } });
  seed.I.applyPlan(seed.I.readPlan(PLAN2), 1, {});
  const state = JSON.parse(seed.store['leap-required-v1']);
  const r = run(state);            /* 받은 뒤의 화면을 본다 */
  const R = r.I;
  R.setTab('next');                /* 이 걸음이 이 절의 자리다 */

  { const q = run(mk()); q.I.setTab('next');
    check('진도표를 읽기 전에는 남은 것을 셀 수 없다', !q.panel.includes('학기에 더 넣을 것'),
      '무엇이 남았는지 알 길이 없다');
    check('대신 여기서 무엇을 하는지 말해 준다',
      q.panel.includes('진도표를 읽어 오면 여기에서 남은 것을 차시로 묶어 드립니다') &&
      q.panel.includes('id="btn-plan2"'),
      '빈 화면은 아무것도 알려 주지 않는다'); }

  const rem = R.remain(), by = {}; rem.forEach(x => by[x.id] = x);
  check('남은 것을 셈한다', by['a-road'].need === 11 && by['a-road'].have === 2 && by['a-road'].left === 9);
  check('다 찬 것은 남음이 0', by['a-life'].left === 12 - 1);
  check('★ 이어 붙일 다음 번호를 안다', by['a-road'].next === 3, '교통안전이 2번까지 갔다 → 3번부터');
  check('★ 이름은 문서에서 쓰시던 그대로', by['a-road'].tag === '교통안전',
    '앱의 이름(「교통 안전」)으로 내보내면 진도표에 두 이름이 섞이고, 그러면 번호가 갈린다');
  check('교과 통합 주제는 남을 것이 없다', !by['char'] && !by['career'],
    '시수가 없는 주제다');

  /* ★ 한 차시는 40분. 10분 이상이면 이수로 보므로 넷이 끝이다 */
  check('★ 다섯 개짜리 차시는 만들 수 없다',
    R.makeLessons(9).every(one => one.length <= 4) && R.LESSON_MAX === 4,
    '40분에 다섯이면 8분이다 — 만들 수 없게 한다 (원칙 8번)');
  check('권하는 것은 셋', R.LESSON_FIT === 3);
  check('한 차시에 같은 주제를 두 번 넣지 않는다',
    R.makeLessons(4).every(one => new Set(one.map(x => x.id)).size === one.length));

  const L3 = R.makeLessons(3);
  check('셋씩 묶으면 차시마다 셋 이하', L3.every(one => one.length <= 3));
  check('남은 것을 남김없이 담는다',
    L3.reduce((n, one) => n + one.length, 0) === R.leftTotal());
  check('차시 수가 셈과 맞는다', L3.length === Math.ceil(R.leftTotal() / 3));
  check('넷씩 담으면 차시가 줄어든다', R.makeLessons(4).length <= L3.length);

  const tag = R.lessonTag(L3[0]);
  check('★ 진도표에 그대로 붙여넣을 글자를 만든다', /^(\[[^\[\]]+-\d+\])+$/.test(tag), tag);
  check('★ 만든 글자를 앱이 스스로 다시 읽는다',
    R.readPlan(tag + '무엇을 배우는 차시').tags === L3[0].length,
    '내보낸 것을 못 읽으면 형식이 틀린 것이다');
  check('번호가 이어진다', tag.indexOf('-1]') < 0 || /교통안전-3/.test(R.lessonTag(L3[0]) + R.lessonTag(L3[1] || [])));

  /* ★ 한 주제를 여러 갈래로 적으셨으면 한 갈래에 몰아넣지 않는다 */
  const flat = [].concat.apply([], R.makeLessons(3));
  const bully = flat.filter(x => x.id === 'bully').map(x => x.name);
  check('★ 어울림 세 갈래에 골고루 이어 붙인다', new Set(bully).size === 3,
    '갈래마다 번호가 따로 간다. 한 갈래에 몰면 나머지가 멈춘다 — ' + [...new Set(bully)].length + '갈래');
  check('갈래마다 3번부터 이어 붙인다', bully.length && flat.filter(x => x.id === 'bully').every(x => x.n >= 3));
  check('한 갈래로만 하겠다면 고를 수 있다', SRC.includes('갈래에 골고루') && SRC.includes('data-pick='));
  const one = run(Object.assign({}, state, {
    plan: Object.assign({}, state.plan, { pick: { bully: '학교폭력 예방교육 어울림 프로그램(공감)' } })
  }));
  check('고르면 그 갈래로만 나간다',
    [].concat.apply([], one.I.makeLessons(3)).filter(x => x.id === 'bully')
      .every(x => x.name === '학교폭력 예방교육 어울림 프로그램(공감)'));

  check('★ 1학기에 묶으신 대로 묶는다',
    /function affinity\(id, taken\)/.test(SRC) && SRC.includes('1학기에 함께 묶은 만큼'),
    '앱이 어울림을 짐작하는 것보다 그 버릇을 따르는 편이 낫다');
  check('함께 묶은 짝을 기록한다',
    !!state.plan.pairs['a-life|a-road'] && !!state.plan.pairs['gender|health'],
    '교통안전+생활안전 · 보건교육+양성평등교육을 한 차시에 두셨다');

  check('10분 규칙을 화면이 적는다', r.panel.includes('<b>10분 이상</b> 다루면 이수로 보므로'));
  check('붙여 넣는 자리를 알려 준다', r.panel.includes('학습주제 맨 앞'));
  check('몇 차시가 필요한지 말한다', /class="big">\d+차시<\/span>/.test(r.panel));
  check('차시마다 복사 단추가 있다', r.panel.includes('data-cp="0"'));
  check('한 차시에 몇 개씩 담을지 고를 수 있다',
    r.panel.includes('data-cap="2"') && r.panel.includes('data-cap="4"'));
  check('★ 일하는 화면에만 있고 종이에는 없다',
    r.panel.includes('학기에 더 넣을 것') && !r.mini.includes('학기에 더 넣을 것'),
    '이건 짜는 도구지 결재 문서가 아니다');
}

console.log('\n[26] 걸음 탭 — 한 번에 하나만 〔v0.5〕');
{
  const r = run(mk());
  check('걸음이 셋이다', (r.panel.match(/data-tab="/g) || []).length === 3);
  check('한 번에 한 걸음만 그린다',
    r.panel.includes('학교안전교육 7대 영역</h2>') && !r.panel.includes('범교과 학습 주제</h2>'),
    '셋을 한 화면에 이어 붙이면 스크롤이 너무 길다');
  r.I.setTab('cross');
  check('걸음을 옮기면 그 표가 나온다',
    r.panel.includes('범교과 학습 주제</h2>') && !r.panel.includes('학교안전교육 7대 영역</h2>'));
  check('모르는 걸음은 무시한다', r.I.setTab('없는걸음') === 'cross');
  check('탭이 지금 어디쯤인지도 말한다', /class="d">[^<]*시간/.test(r.panel),
    '이름만 있으면 어느 걸음이 남았는지 알 수 없다');
  check('얼굴은 걸음과 상관없이 늘 보인다',
    r.panel.includes('어디에 얹었는가') || r.panel.includes('어디에 얹는가'),
    '그릇은 이 앱의 얼굴이다');
  check('종이에는 탭이 없다', SRC.includes('@media print{.tabs2{display:none!important}}'));

  /* ★ 진도표를 받으면 다음에 하실 일이 있는 걸음으로 데려다 준다 */
  check('★ 진도표를 받으면 ③ 걸음으로 옮긴다',
    /curTab = 'next';\s*\/\* 받고 나면/.test(SRC));

  /* 예시로 든 표시는 화면에서 뺐다 — 그 학교의 것이었다 */
  check('★ 남의 학교 예시를 화면에 두지 않는다', !SRC.includes('<b>[생활안전-19]</b> 같은 표시'),
    '설명서에는 남기되 일하는 화면에는 두지 않는다');
  check('진도표 읽기는 머리에 있다',
    SRC.includes('id="btn-plan"') && SRC.includes('iconbtn--plan'),
    '이 앱에서 가장 먼저 하실 일이다');
  /* 다양한 HWP/HWPX 괄호 파싱 테스트 (【 】, ( ), < > 등) */
  const multiBracketText = '2026학년도 1학기 국어 교육과정 연간 지도 계획\n' +
    '【교통안전-1】 안전하게 다니기\n' +
    '(학교폭력예방-1) 배려하는 태도\n' +
    '<성폭력예방-1> 존중과 경계';
  const parsedMulti = r.I.readPlan(multiBracketText);
  check('★ 다양한 괄호(【 】, ( ), < >) 형태의 HWPX 진도표를 인식한다',
    parsedMulti.lessons === 3 && parsedMulti.tags === 3,
    '대괄호 외에 겹화살괄호/소괄호/일본식 괄호도 모두 파싱');
}

console.log('\n----------------------------------------');
console.log(pass + '개 통과, ' + fail + '개 실패');
process.exit(fail ? 1 : 0);

