/* 대시보드가 화면에 내는 수를 «그 코드 그대로» 꺼냅니다 — 주간 브리프의 재료.

   쓰는 법
     node dashboard-facts.mjs            꺼낸 수를 JSON 으로 찍습니다
     import { loadDashboardFacts } ...   브리프 만들기가 부릅니다

   ★ 왜 수를 따로 적어 두지 않고 대시보드 코드를 돌리나
     브리프가 「경북 폐교 750곳」이라고 쓰고 대시보드가 다른 수를 말하면,
     읽는 사람은 둘 다 믿지 않게 됩니다. 수를 두 번 적으면 언젠가 어긋납니다.
     그래서 대시보드 스크립트를 가짜 화면 위에서 실제로 돌리고(test.js 와 같은
     방식), 화면이 쓰는 함수 — regionTotalStudents · cohortGrades · schoolSizeOf —
     를 그대로 불러 셉니다. 자료가 새로 구워지면 브리프도 같은 수를 따라갑니다. */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DASHBOARD = path.resolve(HERE, '../06. 실행계획(1)/prototype/index.html');

/* ── 가짜 화면 ────────────────────────────────────────────────────────
   test.js 의 스텁과 같은 생각입니다. 무엇을 달라고 해도 «빈 요소»를 줍니다.
   화면을 그리는 줄은 헛돌고, 수를 셈하는 줄만 의미를 가집니다. */
function stubElement(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(), hidden: false, value: '', textContent: '',
    title: '', type: '', disabled: false, checked: false, className: '', tabIndex: 0,
    children: [], dataset: {}, options: [], _html: '',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    style: { setProperty() {} },
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
    addEventListener() {}, removeEventListener() {}, focus() {}, click() {}, blur() {},
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    appendChild(c) { return c; }, removeChild() {}, add() {}, before() {}, after() {},
    querySelector() { return stubElement(); }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }; },
    closest() { return null; }, contains() { return false; }
  };
  return el;
}

/* 시뮬레이터 입력칸은 숫자를 기대합니다 — 비어 있으면 NaN 이 흘러 다닙니다. */
const NUM = { 'sch-rate': '10', 'cls-n': '20', 'cls-d': '0', 'cls-g': '20', 'cls-c': '1' };

function sandboxFor() {
  const byId = {};
  const sb = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    /* 첫 화면이 「지도」면 MapLibre 를 불러오려 듭니다 — 셈과 무관하니 현황으로 엽니다. */
    location: { hash: '#status', search: '' },
    scrollTo() {}, setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0,
    Option: function (t, v) { const e = stubElement('option'); e.text = t; e.value = String(v); return e; },
    navigator: { userAgent: 'node' },
    document: {
      getElementById(id) {
        if (!byId[id]) { byId[id] = stubElement(); if (NUM[id] !== undefined) byId[id].value = NUM[id]; }
        return byId[id];
      },
      createElement: stubElement,
      createElementNS: stubElement,
      body: stubElement('body'),
      head: stubElement('head'),
      documentElement: stubElement('html'),
      querySelector: () => stubElement(),
      querySelectorAll: () => [],
      addEventListener() {}
    },
    addEventListener() {}, removeEventListener() {}
  };
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  sb.Option.prototype = {};
  return sb;
}

/* 대시보드의 첫 인라인 스크립트가 본체입니다(test.js 와 같은 규칙). */
export function runDashboard(file = DASHBOARD) {
  /* 대시보드 안의 비동기 줄(지도 라이브러리 불러오기 등)이 가짜 화면에서 실패해도
     셈에는 영향이 없습니다. 그 실패가 이 도구를 죽이지 않게 합니다. */
  if (!process.listenerCount('unhandledRejection')) process.on('unhandledRejection', () => {});
  const html = fs.readFileSync(file, 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('대시보드 본체 스크립트를 찾지 못했습니다');
  const sb = sandboxFor();
  vm.createContext(sb);
  vm.runInContext(m[1], sb, { timeout: 15000 });
  return sb;
}

const pct = (a, b) => (a && b != null) ? Math.round((b / a - 1) * 1000) / 10 : null;

/* 브리프가 쓸 수 있는 수를 한 벌로 꺼냅니다.
   ★ 각 값에 «어디서 온 수인지»(src)를 붙입니다. 브리프 카드의 출처 줄이 이것입니다. */
export function loadDashboardFacts(file = DASHBOARD) {
  const sb = runDashboard(file);
  const ev = (expr) => vm.runInContext(expr, sb);

  const years = [];
  for (let y = 2016; y <= 2036; y++) years.push(y);
  const province = years.map((y) => {
    const t = ev(`regionTotalStudents(null, ${y})`);
    const lv = {};
    ['초', '중', '고'].forEach((l) => { lv[l] = ev(`regionStudents(null, ${JSON.stringify(l)}, ${y})`).v; });
    return { year: y, total: t.v, kind: t.kind, ...lv };
  });

  /* 학급 — EDSS 는 시군·학교급·해마다 학급 수를 갖고 있습니다.
     「학생은 줄어도 학급은 덜 준다」는 교부금 논쟁의 한가운데 있는 수입니다. */
  const edssYears = ev('EDSS ? EDSS.years.slice() : []');
  const classes = edssYears.map((y, i) => {
    const sum = ev(`Object.values(EDSS.sgg).reduce((a, g) => a + ['초','중','고'].reduce((b, l) => b + (((g[l]||{}).c||[])[${i}]||0), 0), 0)`);
    const stu = ev(`['초','중','고'].reduce((a, l) => a + ((EDSS.total[l]||[])[${i}]||0), 0)`);
    return { year: y, classes: sum, students: stu };
  });

  const sigungu = ev(`SIGUNGU.map(sg => {
    const now = regionTotalStudents(sg.s, 2026).v, end = regionTotalStudents(sg.s, 2036).v, first = regionTotalStudents(sg.s, 2016).v;
    const sch = SCHOOLS.filter(s => s.s === sg.s && ['초','중','고'].indexOf(s.lv) >= 0);
    const small = sch.filter(s => { const k = schoolSizeOf(s).key; return k === 'small' || k === 'minimum'; });
    return { s: sg.s, type: sg.type, students2016: first, students2026: now, students2036: end,
             schools: sch.length, small: small.length };
  })`).map((r) => ({
    ...r,
    change10yPast: pct(r.students2016, r.students2026),
    change10yNext: pct(r.students2026, r.students2036),
    smallShare: r.schools ? Math.round(r.small / r.schools * 1000) / 10 : null
  }));

  const grades = ev('cohortGrades(null)');
  const schoolsAll = ev(`(() => {
    const L = SCHOOLS.filter(s => ['초','중','고'].indexOf(s.lv) >= 0);
    const by = { appropriate:0, small:0, minimum:0, unclassified:0 };
    L.forEach(s => { by[schoolSizeOf(s).key] = (by[schoolSizeOf(s).key]||0) + 1; });
    return { total: L.length, bySize: by,
             stu: L.reduce((a,s)=>a+(s.stu||0),0), cls: L.reduce((a,s)=>a+(s.cls||0),0) };
  })()`);

  /* 면 지역 초등학교 — 기사가 「구미 면 지역 초등 147명」처럼 말할 때 맞춰 봅니다. */
  const myeonElementary = ev(`SIGUNGU.map(sg => {
    const L = SCHOOLS.filter(s => s.s === sg.s && s.lv === '초' && /[가-힣]+면(\\s|$)/.test(s.addr||''));
    return { s: sg.s, schools: L.length, students: L.reduce((a,s)=>a+(s.stu||0),0),
             list: L.map(s => ({ name: s.name, stu: s.stu, addr: s.addr })) };
  })`);

  const closed = ev(`(() => {
    const c = CLOSED || {};
    const byDecade = {};
    Object.keys(c.byYear || {}).forEach(y => { const d = Math.floor(+y / 10) * 10 + '년대'; byDecade[d] = (byDecade[d] || 0) + c.byYear[y]; });
    /* 목록 한 줄은 '시군|학교|폐교연도|학교급|활용|위도|경도' 입니다.
       «미활용» 폐교가 언제 문을 닫았는지를 셉니다 — 새 활용 사업의 후보군입니다. */
    const unusedByDecade = {}, unusedBySig = {};
    (c.list || []).forEach(row => {
      const a = String(row).split('|'); if (a[4] !== '미활용') return;
      const d = Math.floor(+a[2] / 10) * 10 + '년대';
      unusedByDecade[d] = (unusedByDecade[d] || 0) + 1; unusedBySig[a[0]] = (unusedBySig[a[0]] || 0) + 1;
    });
    return { total: c.total, basis: c.basis, src: c.src, bySig: c.bySig || {}, byUse: c.byUse || null,
             byYear: c.byYear || {}, byDecade, unusedByDecade, unusedBySig };
  })()`);

  return {
    builtAt: new Date().toISOString(),
    source: {
      students: '학교알리미 2026 공시 · EDSS 교육통계 2016~2025 실적 · 2027~ 코호트 진급법 전망(대시보드와 같은 셈)',
      classes: 'EDSS 교육통계 유초중등학급현황 2016~2025',
      grades: '학교알리미 2026 공시 학년별 학생 수',
      closed: closed.src || '지방교육재정알리미 폐교정보',
      births: '통계청 출생통계(경북)'
    },
    province, classes, sigungu, grades, schools: schoolsAll, myeonElementary, closed,
    births: ev('EDSS ? Object.assign({}, EDSS.birth) : {}')
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const facts = loadDashboardFacts();
  process.stdout.write(JSON.stringify(facts, null, 1) + '\n');
}
