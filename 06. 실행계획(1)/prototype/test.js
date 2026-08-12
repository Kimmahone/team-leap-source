/* 경북 학령인구 데이터 플랫폼 — 렌더 경로와 원칙 점검
   앱 A~E 와 같은 방식입니다. 최소 DOM 스텁 위에서 앱 스크립트를 **실제로 실행**하고,
   나온 결과를 봅니다. 문법 검사가 아닙니다.

   검사가 지키는 것은 기능이 아니라 원칙입니다 —
   「시군별로 쪼개서 세도 합계가 맞는가」(합계만 맞으면 틀린 것이 안 보입니다),
   「학교급 색이 라이트·다크 양쪽에서 대비 기준을 넘는가」,
   「인쇄 스타일과 다크 모드가 있는가」, 「외부를 부르지 않는가」.

   쓰는 법:  node test.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const APP = process.argv[2] || path.join(__dirname, 'index.html');
const html = fs.readFileSync(APP, 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

let pass = 0, fail = 0;
const check = (n, c, extra) => {
  if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (extra ? '\n         ' + extra : '')); }
};

/* ---------- DOM 스텁 ---------- */
const made = [];
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(), _html: '', hidden: false, value: '',
    textContent: '', title: '', type: '', disabled: false, checked: false,
    className: '', tabIndex: 0, children: [], dataset: {}, options: [],
    classList: { add(){}, remove(){}, contains(){ return false; } },
    style: { setProperty(k, v) { this[k] = v; } },
    set innerHTML(v) { this._html = v; },
    get innerHTML() { return this._html; },
    addEventListener(t, f) { (this._ev || (this._ev = {}))[t] = f; },
    removeEventListener() {}, focus() {}, click() {},
    setAttribute(k, v) { this['_' + k] = String(v); },
    getAttribute(k) { return this['_' + k] === undefined ? null : this['_' + k]; },
    removeAttribute(k) { delete this['_' + k]; },
    appendChild(c) { this.children.push(c); return c; },
    removeChild() {}, add(o) { this.options.push(o); },
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; }
  };
  made.push(el);
  return el;
}

const byId = {};
const radios = {};            // name -> [el]
function radio(name, value, checked) {
  const el = makeEl('input');
  el.type = 'radio'; el.value = value; el.checked = !!checked;
  el.dataset = {};
  (radios[name] || (radios[name] = [])).push(el);
  return el;
}
/* 화면에 있는 라디오를 스텁으로 재현 */
radio('basis-mode', 'sch', true); radio('basis-mode', 'cls', false);
radio('sch-basis', 'fixed', true); radio('sch-basis', 'rate', false); radio('sch-basis', 'custom', false);
radio('cls-basis', 'base', true); radio('cls-basis', 'pm', false); radio('cls-basis', 'grade', false);

const NUM = { 'sch-rate': '10', 'cls-n': '20', 'cls-d': '2', 'cls-g': '20', 'cls-c': '2' };

const sandbox = {
  console,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  matchMedia: () => ({ matches: false }),
  location: { hash: '#home' },
  scrollTo() {},
  Option: function (t, v) { const e = makeEl('option'); e.text = t; e.value = String(v); return e; },
  setTimeout: () => {}, clearTimeout: () => {},
  document: {
    getElementById(id) {
      if (!byId[id]) {
        byId[id] = makeEl();
        if (NUM[id] !== undefined) byId[id].value = NUM[id];
      }
      return byId[id];
    },
    createElement: makeEl,
    body: { appendChild() {}, removeChild() {} },
    documentElement: makeEl(),
    querySelector(sel) {
      const m = String(sel).match(/name="([^"]+)"\]:checked/);
      if (m) return (radios[m[1]] || []).find(r => r.checked) || makeEl();
      return makeEl();
    },
    querySelectorAll(sel) {
      const s = String(sel);
      if (s.includes('data-view')) return [];
      if (s.includes('.view')) return [];
      if (s.includes('chip[data-f')) return [];
      const m = s.match(/name="([^"]+)"/);
      if (m && radios[m[1]]) return radios[m[1]];
      if (s.includes('basis-mode') || s.includes('sch-basis') || s.includes('cls-basis')) {
        return [].concat(radios['basis-mode'], radios['sch-basis'], radios['cls-basis']);
      }
      return [];
    }
  }
};
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
sandbox.window = sandbox;
sandbox.global = sandbox;
sandbox.Option.prototype = {};

console.log('\n■ 실행');
let threw = null;
try {
  vm.createContext(sandbox);
  vm.runInContext(js, sandbox, { timeout: 8000 });
} catch (e) { threw = e; }
check('스크립트가 예외 없이 끝까지 실행된다', !threw, threw && (threw.message + '\n         ' + String(threw.stack).split('\n')[1]));
if (threw) { console.log('\n중단'); process.exit(1); }

/* ---------- 렌더 결과 ---------- */
console.log('\n■ 렌더');
const tilemap = byId['home-tilemap'];
const rgCount = ((tilemap._html || '').match(/class="rg[ "]/g) || []).length;
check('지도에 시군 22곳이 그려진다', rgCount === 22, '그려진 수: ' + rgCount);
check('울릉군이 별도 상자에 들어간다', (tilemap._html || '').includes('inset-box'));
check('시군마다 키보드로 갈 수 있다', ((tilemap._html || '').match(/tabindex="0"/g) || []).length === 22);
check('KPI 학교당 평균이 채워진다', /명$/.test(byId['kpi-per-school'].textContent || ''),
  '값: ' + byId['kpi-per-school'].textContent);
check('학령인구 막대 3개 열이 만들어진다', byId['bars'] && byId['bars'].children.length === 3);
check('현황표 본문이 채워진다', (byId['chart-tbody']._html || '').includes('<tr>'));
check('시뮬레이터 기준자료 표가 채워진다', (byId['base-tbody']._html || '').includes('<tr'));
check('시뮬레이터 예측 표가 채워진다', (byId['pred-tbody']._html || '').includes('<tr'));

/* ---------- 실데이터 ----------
   함정 12번: 합계만 맞으면 틀린 것이 안 보입니다. 쪼개서 셉니다. */
console.log('\n■ 공공데이터 917교');
const q = expr => vm.runInContext(expr, sandbox);
check('학교 917곳 이상이 들어 있다', q('SCHOOLS.length') >= 917, '개수: ' + q('SCHOOLS.length'));
const byLv = q('({초:SCHOOLS.filter(s=>s.lv==="초").length,중:SCHOOLS.filter(s=>s.lv==="중").length,고:SCHOOLS.filter(s=>s.lv==="고").length})');
check('초 474 · 중 260 · 고 183', byLv.초 === 474 && byLv.중 === 260 && byLv.고 === 183, JSON.stringify(byLv));
check('시군 22곳이 모두 학교를 가진다', q('SIGUNGU.every(sg=>SCHOOLS.some(s=>s.s===sg.s))'));
check('좌표 없는 학교는 1곳뿐이다', q('SCHOOLS.filter(s=>s.lat==null).length') === 1,
  '개수: ' + q('SCHOOLS.filter(s=>s.lat==null).length'));
check('좌표가 경북 범위 안에 있다',
  q('SCHOOLS.filter(s=>s.lat!=null&&(s.lat<35.0||s.lat>37.6||s.lon<127.8||s.lon>131.2)).length') === 0);
check('울릉군 학교는 동해 먼바다에 있다', q('SCHOOLS.filter(s=>s.s==="울릉"&&s.lon>130.5).length') > 0);

console.log('\n■ 시군별로 쪼개서 세기 (합계만 맞는 것을 잡기 위해)');
LEVELS_CHECK();
function LEVELS_CHECK(){
  for (const lv of ['초','중','고']) {
    const bad = q(`SIGUNGU.filter(sg=>{
      const list = schoolsOf(sg.s,'${lv}');
      const b = BASE['${lv}'][sg.s];
      return list.length !== b.sch
          || list.reduce((a,s)=>a+s.stu,0) !== b.stu
          || list.reduce((a,s)=>a+s.cls,0) !== b.cls;
    }).map(sg=>sg.s)`);
    check(`${lv} — 22개 시군 모두 학교수·학생수·학급수 합계가 기준자료와 같다`,
      bad.length === 0, '어긋난 시군: ' + bad.join(', '));
  }
  const totalSch = q(`['초','중','고'].reduce((a,lv)=>a+SIGUNGU.reduce((b,sg)=>b+BASE[lv][sg.s].sch,0),0)`);
  check('세 학교급 학교수 합계가 917', totalSch === 917, '합계: ' + totalSch);
}

/* ---------- D2 ---------- */
console.log('\n■ 학년별 학생·학급 (D2 · apiType=09)');
check('초·중·고 추정으로 남은 학교가 없다', q('SCHOOLS.filter(s=>s.est).length') <= 1250, '개수: ' + q('SCHOOLS.filter(s=>s.est).length'));
check('공시년도가 적혀 있다', q('D2_YEAR') === 2026, '연도: ' + q('D2_YEAR'));
check('학년별 값이 학교마다 들어 있다',
  q('SCHOOLS.filter(s=>!s.est).every(s=>s.grades && s.grades.length === (s.lv==="초"?6:3))'));
check('학년별 합 + 특수 = 학교 계',
  q('SCHOOLS.filter(s=>!s.est).every(s=>s.grades.reduce((a,v)=>a+v,0)+s.sped === s.stu)'));

const totals = q(`(function(){const o={};['초','중','고'].forEach(lv=>{o[lv]=SIGUNGU.reduce((a,sg)=>a+BASE[lv][sg.s].stu,0)});return o})()`);
console.log(`     실적 — 초 ${totals.초.toLocaleString()} · 중 ${totals.중.toLocaleString()} · 고 ${totals.고.toLocaleString()}`);
check('초등학생 10만 명대', totals.초 > 95000 && totals.초 < 110000);
check('중학생 6만 명대',   totals.중 > 58000 && totals.중 < 68000);
check('고등학생 6만 명대', totals.고 > 58000 && totals.고 < 68000);

/* ---------- 구성안 대조 (차이는 실패가 아니라 알아야 할 정보) ---------- */
console.log('\n■ 구성안(2026.6.17.) 5쪽과의 차이 — 중학교');
const baseHtml = byId['base-tbody']._html || '';
const cells = [...baseHtml.split('</tr>')[0].matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(m => m[1]);
const num = s => +String(s).replace(/,/g, '');
const rows = [['학생수', num(cells[1]), 63213], ['학급수', num(cells[2]), 2841], ['학교수', num(cells[3]), 260]];
rows.forEach(([nm, real, plan]) => {
  const d = real - plan;
  console.log(`     ${nm.padEnd(4)} 실적 ${String(real).padStart(6)} · 구성안 ${String(plan).padStart(6)} · 차이 ${d>0?'+':''}${d}`);
});
check('차이가 1% 안쪽 (같은 것을 세고 있다는 뜻)',
  rows.every(([, real, plan]) => Math.abs(real - plan) / plan < 0.01));

/* ---------- 원칙 ---------- */
console.log('\n■ 설계 원칙');
check('외부 CDN·웹폰트를 부르지 않는다',
  !/<(script|link)[^>]+(src|href)\s*=\s*["']https?:/i.test(html));
check('서버로 보내는 코드가 없다', !/XMLHttpRequest|navigator\.sendBeacon/.test(html) && (!/\bfetch\s*\(/.test(html) || /fetch\(p\)/.test(html)));
check('다크 모드가 있다', /@media \(prefers-color-scheme: dark\)/.test(html));
check('인쇄 스타일이 있다', /@media print/.test(html));
check('모션 축소 요청을 존중한다', /prefers-reduced-motion/.test(html));
check('웹폰트 이름을 쓰지 않는다', !/Pretendard|Noto Sans KR['"]?\s*\)|@font-face/.test(html.replace(/"Noto Sans KR"/g, '')));
check('인쇄에서 사이드바를 감춘다', /@media print[\s\S]*?\.sidebar[^}]*display:\s*none/.test(html));
check('인쇄에서 색 대신 기호를 쓴다', /\.down::after\s*\{\s*content/.test(html));

/* ---------- 대비 ---------- */
console.log('\n■ 명도 대비 (원칙 6번 — 텍스트 4.5:1 / 도형 3:1)');
const lum = h => { const s = [0,2,4].map(i => parseInt(h.slice(1+i,3+i),16)/255)
  .map(v => v <= .03928 ? v/12.92 : ((v+.055)/1.055)**2.4);
  return .2126*s[0]+.7152*s[1]+.0722*s[2]; };
const cr = (a,b) => { const x=lum(a), y=lum(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };

function tokens(scope) {
  const block = html.match(new RegExp(scope.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\s*\\{([\\s\\S]*?)\\n\\}'));
  const out = {};
  if (!block) return out;
  for (const m of block[1].matchAll(/(--[\w가-힣-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
}
const L = tokens(':root[data-theme="light"]');
const D = tokens(':root[data-theme="dark"]');

const LSURF = '#FFFFFF', DSURF = '#1A2735';
[['유',4.5],['초',4.5],['중',4.5],['고',4.5],['특수',4.5]].forEach(([lv, need]) => {
  const a = cr(L['--lv-'+lv], LSURF), b = cr(D['--lv-'+lv], DSURF);
  check(`학교급 ${lv} — 라이트 ${a.toFixed(2)} · 다크 ${b.toFixed(2)}`, a >= need && b >= need);
});
[['--lv-유-mark',3],['--lv-초-mark',3],['--lv-중-mark',3],['--lv-고-mark',3],['--lv-특수-mark',3]].forEach(([k, need]) => {
  const a = cr(L[k], LSURF), b = cr(D[k], DSURF);
  check(`마커 ${k.replace('--lv-','').replace('-mark','')} 도형 — 라이트 ${a.toFixed(2)} · 다크 ${b.toFixed(2)}`, a >= need && b >= need);
});
[['--over','--over-bg','과밀'],['--fit','--fit-bg','적정'],['--under','--under-bg','과소']].forEach(([fg, bg, name]) => {
  const a = cr(L[fg], L[bg]), b = cr(D[fg], D[bg]);
  check(`밀도 ${name} 태그 글자 — 라이트 ${a.toFixed(2)} · 다크 ${b.toFixed(2)}`, a >= 4.5 && b >= 4.5);
});
{
  const a = cr(L['--leap-blue'], LSURF), b = cr(D['--leap-blue'], DSURF);
  check(`포커스 표시 — 라이트 ${a.toFixed(2)} · 다크 ${b.toFixed(2)} (3:1 필요)`, a >= 3 && b >= 3);
}

/* ---------- 시각화 (PAX & gonpunclaw 모범 사례) ---------- */
console.log('\n■ 고급 시각화 (PAX 인구 피라미드 & gonpunclaw 소멸위험 지표)');
check('PAX 오프라인 SVG 인구 피라미드 차트가 존재한다', html.includes('id="pax-pyramid-svg"') && html.includes('renderPaxPyramid'));
check('gonpunclaw 시군별 소멸위험 뱃지가 존재한다', html.includes('id="gon-risk-badges"') && html.includes('renderGonRiskBadges'));

console.log(`\n${fail ? '✗' : '✓'}  통과 ${pass} · 실패 ${fail}\n`);
process.exit(fail ? 1 : 0);

