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

/* ★ 〔2026. 8. 12.〕 여기 검사가 없어서 난수 좌표가 그냥 지나갔습니다.
   「경북 범위 안인가」만 보고 있었는데, 난수도 경북 범위 안에서 뽑혔습니다.
   그래서 **자기 시군 안에 있는가**를 봅니다. 울릉군 유치원이 본토에 찍혀 있어도
   위 검사는 초록이었지만 이 검사는 빨개집니다.
   (시군은 넓으므로 중심에서 40km 까지 봅니다 — 경북에서 가장 넓은 안동·상주도 들어옵니다.) */
const farFromSigungu = q(`(function(){
  const R = 6371, rad = x => x * Math.PI / 180;
  const geo = {}; REGION_GEO.forEach(g => geo[g.c] = g);
  return SCHOOLS.filter(s => {
    if (s.lat == null || s.lon == null) return false;
    const g = geo[s.s]; if (!g) return false;
    const dLon = rad(s.lon - g.lon), dLat = rad(s.lat - g.lat);
    const h = Math.sin(dLat/2)**2 + Math.cos(rad(g.lat)) * Math.cos(rad(s.lat)) * Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.sqrt(h)) > 40;
  }).map(s => s.name + '(' + s.s + ')');
})()`);
check('학교 좌표가 자기 시군 안에 있다', farFromSigungu.length === 0,
  farFromSigungu.length + '곳 어긋남: ' + farFromSigungu.slice(0, 5).join(', '));

/* 같은 학교가 두 번 들어오는 것 — 굽는 스크립트가 «덧붙이기»만 하면 생깁니다.
   실제로 유치원이 두 번 구워져 614곳이 1,228곳이 되어 있었습니다. */
const dupNames = q(`(function(){
  const seen = {}, dup = [];
  SCHOOLS.forEach(s => { const k = s.name + '|' + (s.addr || ''); if (seen[k]) dup.push(s.name); else seen[k] = 1; });
  return dup;
})()`);
check('같은 학교가 두 번 들어 있지 않다', dupNames.length === 0,
  dupNames.length + '곳 중복: ' + dupNames.slice(0, 5).join(', '));

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
/* ★ 이 문턱이 «1250» 이었습니다 〔2026. 8. 12.〕
   원래 「추정으로 남은 학교가 없다」를 보는 검사인데, 지어낸 유치원 1,228곳과
   특수학교 10곳이 전부 est:true 로 들어오면서 검사가 빨개지자 **문턱을 올려**
   초록으로 만들어 두었습니다. 검사를 고친 것이 아니라 검사를 껐던 것입니다.
   지어낸 자료를 걷어냈으므로 원래 뜻으로 되돌립니다 — 좌표가 없는 한 곳뿐입니다. */
/* ★ 이 세 검사는 **초·중·고 전용**입니다 〔2026. 8. 12.〕
   학년별 자료(D2)가 있는 것은 초·중·고뿐입니다. 유치원은 나이별(3·4·5세·혼합)이고,
   특수학교는 초·중·고 과정을 한 학교에서 함께 운영해 학년이 18칸까지 갑니다.
   그래서 둘 다 `grades` 배열이 없습니다 — 없는 것이 맞습니다.
   예전에는 SCHOOLS 에 초·중·고밖에 없어서 굳이 적지 않았는데, 유치원 614곳과
   특수학교 8곳이 들어오면서 이 검사가 그것들까지 보고 빨개졌습니다.
   **검사의 범위를 넓히지 말고, 원래 보던 것을 분명히 적습니다.** */
const K12 = 's=>["초","중","고"].includes(s.lv)';
check('초·중·고 추정으로 남은 학교가 없다',
  q(`SCHOOLS.filter(${K12}).filter(s=>s.est).length`) <= 1,
  '개수: ' + q(`SCHOOLS.filter(${K12}).filter(s=>s.est).length`));
check('공시년도가 적혀 있다', q('D2_YEAR') === 2026, '연도: ' + q('D2_YEAR'));
check('학년별 값이 학교마다 들어 있다',
  q(`SCHOOLS.filter(${K12}).filter(s=>!s.est).every(s=>s.grades && s.grades.length === (s.lv==="초"?6:3))`));
check('학년별 합 + 특수 = 학교 계',
  q(`SCHOOLS.filter(${K12}).filter(s=>!s.est).every(s=>s.grades.reduce((a,v)=>a+v,0)+s.sped === s.stu)`));

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
/* ★ 2026. 8. 12. — 이 두 검사를 다시 세웠습니다.
     「외부 CDN」은 태그 속성만 보고 있었습니다. import·Worker·CSS url() 도 밖으로 나가는 길입니다.

     「서버로 보내는 코드가 없다」는 더 나빴습니다. 이렇게 되어 있었습니다 —
         (!/\bfetch\s*\(/.test(html) || /fetch\(p\)/.test(html))
     파일 어딘가에 `fetch(p)` 가 **한 번만** 있으면 나머지 fetch 가 전부 통과합니다.
     검사가 아니라 통과권이었습니다.

     처음에는 「fetch 를 부르는 자리가 한 곳뿐일 것」으로 고쳤습니다. 그런데
     **뉴스를 굽는 방식으로 바꾸면서 그 한 곳도 없어졌습니다.** 이제 다른 앱과 같은
     조건입니다 — fetch 가 아예 없어야 합니다. 뉴스는 굽을 때 심고 화면은 읽기만 합니다. */
const EXTERNAL_PATTERNS = [
  [/<(script|link|iframe|img)[^>]+(src|href)\s*=\s*["']https?:/i, '태그 속성'],
  [/\bimport\s+[^;]*?\bfrom\s*["']https?:/i,                      'ES 모듈 import'],
  [/\bimport\s*\(\s*["']https?:/i,                                '동적 import'],
  [/new\s+Worker\s*\(\s*["']https?:/i,                            'Worker'],
  [/@import\s+(url\()?["']?https?:/i,                             'CSS @import'],
  [/url\(\s*["']?https?:\/\//i,                                   'CSS url()']
];
const externalHits = EXTERNAL_PATTERNS.filter(([re]) => re.test(html)).map(([, n]) => n);
check('외부 CDN·웹폰트를 부르지 않는다', externalHits.length === 0,
  externalHits.length ? '밖을 부르는 길: ' + externalHits.join(' · ') : '');

const senders = [
  [/\bfetch\s*\(/,             'fetch()'],
  [/XMLHttpRequest/,           'XMLHttpRequest'],
  [/navigator\.sendBeacon/,    'sendBeacon'],
  [/new\s+WebSocket\s*\(/,     'WebSocket'],
  [/new\s+EventSource\s*\(/,   'EventSource'],
  [/\bfirebase|initializeApp|getFirestore/i, 'Firebase SDK']
].filter(([re]) => re.test(html)).map(([, n]) => n);
check('밖으로 보내는 코드가 없다', senders.length === 0,
  senders.length ? '밖으로 나가는 길: ' + senders.join(' · ') : '');

/* ---------- 소멸 위기 지수 — 색이 뜻과 같은 쪽을 가리키는가 ---------- */
console.log('\n■ 소멸 위기 지수');
/* 주석에 옛 식이 나오는 것은 위반이 아닙니다 — 왜 그랬는지 적어 둔 자리입니다.
   그래서 주석을 걷어 낸 뒤에 봅니다. */
const CODE_ONLY = html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
/* 〔2026. 8. 12.〕 채우기 백분율이 **음수**가 될 수 있었습니다.
   시(市)·초등학교 감소율 0.027 → (0.027−0.03)×1000 = −3 →
   color-mix 가 음수를 못 받아 선언이 통째로 무효 → .dot 의 기본 파란색으로
   떨어졌고, 화면에서는 그것이 가장 진해 보였습니다.
   **가장 안전한 시가 가장 위험해 보이는** 뒤집힘이었습니다. */
check('채우기 백분율이 음수가 될 수 없다', !/\(rate-0\.03\)\*1000/.test(CODE_ONLY.replace(/\s/g, '')));
check('채우기 백분율을 0~100 으로 가둔다',
  /Math\.max\(0,\s*Math\.min\(1,\s*t\)\)/.test(html) && /Math\.max\(12,\s*pct\)/.test(html));
check('실제 값의 최소~최대로 편다 (붙박이 문턱이 아니다)',
  /extMin/.test(html) && /extMax/.test(html));
/* 범례가 지도와 «다른 색»을 보여 주고 있었습니다 — 초록→노랑→빨강 세 색 띠였는데
   지도는 그런 색을 한 번도 쓰지 않았습니다. 한 곳만 고치면 또 어긋납니다. */
check('범례가 초록·노랑 세 색 띠를 쓰지 않는다',
  !/#4ade80|#facc15|#f87171/i.test(html));
check('범례가 지도와 같은 램프를 쓴다',
  /안전[\s\S]{0,400}color-mix\(in srgb, var\(--over\)/.test(html));
check('색이 무엇이고 넓이가 무엇인지 적는다',
  html.includes('원 넓이는 학교 수'));
check('읽어 주는 말에도 소멸 위기 지수가 들어간다', html.includes('소멸 위기 지수 ${pct}점(가상)'));

/* ---------- 뉴스 — 구운 것을 그리는가, 지어내지 않는가 ---------- */
console.log('\n■ 주간 뉴스');
check('뉴스를 심을 자리가 있다', /<script id="news-data" type="application\/json">/.test(html));
check('원본에는 뉴스가 비어 있다 (굽을 때 채웁니다)',
  /<script id="news-data" type="application\/json">\s*\[\s*\]\s*<\/script>/.test(html));
check('밖에서 온 글자를 이스케이프한다',
  /function esc\(/.test(html) && /replace\(\/&\/g, '&amp;'\)/.test(html));
check('링크는 http·https 만 받는다', /function safeUrl\(/.test(html) && /\^https\?:\\\/\\\//.test(html));
check('새 창 링크에 noopener 가 있다',
  !/target="_blank"/.test(html) || /rel="noopener/.test(html));
/* 주석에 그 낱말이 나오는 것은 위반이 아닙니다 — 왜 그랬는지 적어 둔 자리입니다.
   그래서 주석을 걷어 낸 CODE_ONLY 로 봅니다 (위 「소멸 위기 지수」에서 만들었습니다). */
check('되돌이 안에서 innerHTML 을 더하지 않는다', !/innerHTML\s*\+=/.test(CODE_ONLY));
check('뉴스가 없으면 없다고 적는다', html.includes('아직 이번 주 뉴스를 싣지 않았습니다'));
/* 〔2026. 8. 12.〕 기간 필터 단추 셋은 **아무 데도 붙어 있지 않았습니다** —
   aria-pressed 만 손으로 적힌 장식이라 눌러도 아무 일이 없었습니다.
   화면에 단추가 있으면 그 단추는 무언가를 해야 합니다. */
check('기간 필터 단추에 기간이 붙어 있다',
  (html.match(/data-news-days="\d+"/g) || []).length === 3);
check('기간 필터 단추가 실제로 걸러 준다',
  /querySelectorAll\('\[data-news-days\]'\)/.test(html) && /withinDays/.test(html));
check('몇 건인지 화면에 적는다', html.includes('id="news-count"'));

/* ---------- 주간 AI 뉴스 요약 (종합 대시보드) ---------- */
console.log('\n■ 주간 AI 뉴스 요약');
/* 〔2026. 8. 12.〕 여기 있던 것은 **전부 손으로 적은 것**이었습니다 —
   「보도 12건 수집 완료 · 적정규모화 4건 · 통학 지원 3건」이라는 숫자도,
   기사 세 건도, 네이버 링크도. 그러면서 「주간 자동 집계」라고 적혀 있었습니다. */
check('손으로 적은 건수가 없다',
  !/보도 <b>\d+건<\/b> 수집 완료|수집 완료\./.test(html));
check('손으로 적은 기사 링크가 없다',
  !/n\.news\.naver\.com\/mnews\/article/.test(html));
check('요약을 뉴스 클리핑과 같은 자료에서 셈한다',
  /function renderNewsBrief/.test(html) && /NEWS_ALL/.test(html) && /NEWS_TOPICS/.test(html));
check('주제별로 나눈다', (html.match(/^\s*\['[^']+',\s*\/.*\/\],?$/gm) || []).length >= 5
  || /NEWS_TOPICS = \[[\s\S]{80,}\]/.test(html));
check('경북 몫을 따로 센다', /GYEONGBUK\s*=/.test(html) && html.includes('경북 이야기는'));
check('주제가 겹칠 수 있다고 알린다', html.includes('주제별 합이 건수보다 클 수 있습니다'));
check('요약 글자도 이스케이프한다', /esc\(top\.name\)/.test(html) && /esc\(n\.title\)/.test(html));

/* ---------- 유치원·특수학교 ---------- */
console.log('\n■ 유치원 · 특수학교');
/* 한 배열은 한 스크립트만 가집니다 — 하나로 두면 나중에 돌린 쪽이 앞의 것을 지웁니다 */
check('굽는 배열이 둘로 나뉘어 있다',
  /const KINDERGARTENS = \[/.test(html) && /const SPECIAL_SCHOOLS = \[/.test(html));
const kg = q('SCHOOLS.filter(s=>s.lv==="유")');
const sp = q('SCHOOLS.filter(s=>s.lv==="특수")');
check('유치원이 들어 있다', kg.length >= 600, '개수: ' + kg.length);
check('특수학교가 들어 있다', sp.length >= 8, '개수: ' + sp.length);
check('유치원·특수학교가 전부 실적이다 (추정 0)',
  q('SCHOOLS.filter(s=>(s.lv==="유"||s.lv==="특수")&&s.est).length') === 0);
check('원아 수가 난수가 아니다 — 한 자릿수 유치원이 있다',
  kg.filter(s => s.stu > 0 && s.stu < 10).length > 0,
  '10명 미만: ' + kg.filter(s => s.stu > 0 && s.stu < 10).length + '곳');
check('특수학교 학급당 인원이 특수학교답다 (12명 미만)',
  sp.every(s => s.cls > 0 && s.stu / s.cls < 12));
check('유치원·특수학교에 주소가 있다',
  kg.every(s => s.addr) && sp.every(s => s.addr));
check('「(가상)」 표시가 남아 있지 않다',
  !/유치원 \$\{totalK\} \(가상\)|특수학교 \$\{totalS\} \(가상\)/.test(html));
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

