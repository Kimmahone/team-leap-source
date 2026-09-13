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

/* 굽는 스크립트도 함께 봅니다 — 브라우저 규칙(CSP)과 «무엇을 함께 싣는지»가
   여기에 있습니다. 지도는 이 규칙에 막히면 조용히 빈 화면이 됩니다. */
const BAKE = path.join(__dirname, '..', '..', '사이트 굽기.command');
const bake = fs.existsSync(BAKE) ? fs.readFileSync(BAKE, 'utf8') : '';
const AI_API = path.join(__dirname, '..', '..', 'functions', 'api', 'ai-analysis.js');
const aiApi = fs.existsSync(AI_API) ? fs.readFileSync(AI_API, 'utf8') : '';
const MAP_POLICY = path.join(__dirname, 'assets', 'map-policy.js');
const mapPolicy = fs.existsSync(MAP_POLICY) ? fs.readFileSync(MAP_POLICY, 'utf8') : '';
const MAP_POLICY_CSS = path.join(__dirname, 'assets', 'map-policy.css');
const mapPolicyCss = fs.existsSync(MAP_POLICY_CSS) ? fs.readFileSync(MAP_POLICY_CSS, 'utf8') : '';

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
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
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

const NUM = { 'sch-rate': '10', 'cls-n': '20', 'cls-d': '0', 'cls-g': '20', 'cls-c': '1' };

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

console.log('\n■ 치워 둔 종합 대시보드 — 지우지 않았고, 여전히 돌아간다');
/* ★ 〔2026. 9. 10.〕 지도가 제 화면을 갖게 되면서 종합 대시보드가 하던 일이
   겹쳤습니다. 화면은 `parked-home` 보관 칸에 담고 그리는 일만 멈췄습니다.
   지운 것이 아니므로 **코드는 계속 돌아가야 합니다** — 되살릴 때 고장 나 있으면
   치워 둔 뜻이 없습니다. 아래 검사는 그리는 일을 손으로 불러서 확인합니다. */
/* 주석 안에는 남아 있어야 하고(되살릴 수 있게), 주석 밖에는 없어야 합니다.
   주석을 걷어낸 뒤에 찾는 것이 가장 확실합니다. */
const htmlLive = html.replace(/<!--[\s\S]*?-->/g, '');
check('메뉴에서는 빠졌다 (주석 안에는 남아 있다)',
  /<!--[\s\S]*?data-view="home"[\s\S]*?-->/.test(html) &&
  !/data-view="home"/.test(htmlLive));
check('화면은 지우지 않고 보관 칸에 담았다',
  /<template id="parked-home">/.test(html) && /id="view-home" class="view"/.test(html));
/* 보관 칸 안의 것은 화면에 그려지지도, getElementById 로 잡히지도 않습니다.
   HTML 주석으로는 감쌀 수 없습니다 — 안에 «--» 와 겹친 주석이 들어 있습니다. */
check('왜 주석이 아닌지 적어 두었다', /HTML 주석은 붙임표 두 개를 품을 수 없고/.test(html));
/* ★ 이 검사가 있는 까닭 〔2026. 9. 10.〕 위 설명을 처음 쓸 때 «--» 라고 적었다가
   그 자리에서 주석이 끊겨 설명문이 화면 맨 위에 쏟아졌습니다. 설명하던 함정에
   그대로 빠진 것입니다. 주석 안에 붙임표 두 개가 있으면 잡습니다. */
check('주석 안에 붙임표 두 개가 없다 (있으면 거기서 주석이 끊긴다)',
  (html.match(/<!--([\s\S]*?)-->/g) || []).every(c => !c.slice(4, -3).includes('--')));
check('되살리는 스위치가 하나다', /const HOME_TAB_ON = false/.test(js) &&
  /if\(HOME_TAB_ON\)\{ renderHomePanel\(\); renderTilemap\(\); \}/.test(js));
check('첫 화면은 메뉴에 남은 첫 항목이다 (없는 화면으로 열지 않는다)',
  /const DEFAULT_VIEW = DEFAULT_NAV_ORDER\[0\] \|\| 'map'/.test(js) &&
  !/showView\(location\.hash\.slice\(1\) \|\| 'home'\)/.test(js));
let parkedThrew = null;
/* q 는 아래에서 만들어집니다 — 여기서는 sandbox 를 바로 씁니다. */
try{ vm.runInContext("renderHomePanel(); renderTilemap(); renderHomeInsight(); setMapMode('offline');", sandbox); }
catch(e){ parkedThrew = e; }
check('치워 둔 뒤에도 그리는 코드가 멀쩡하다 (되살릴 수 있다)',
  !parkedThrew, parkedThrew && parkedThrew.message);

/* ---------- 렌더 결과 ---------- */
console.log('\n■ 렌더 (보관 칸의 화면을 손으로 그려서 봅니다)');
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
const ROOT2 = path.resolve(__dirname, '..', '..');
check('SGIS 온라인 지도와 오프라인 대체 지도를 함께 제공한다',
  html.includes('id="map-mode-online"') && html.includes('id="map-mode-offline"') &&
  html.includes('src="/api/sgis-map"') && /function setMapMode/.test(html));
check('지도 선택 명칭을 기술용어 대신 쉬운 말로 표시한다',
  html.includes('>간편 지도</button>') && html.includes('>실제 위치 지도</button>') &&
  !html.includes('>오프라인 경계 지도</button>'));
check('실제 위치 지도를 간편 지도보다 앞에 배치한다',
  html.indexOf('id="map-mode-online"') < html.indexOf('id="map-mode-offline"'));
q("setMapMode('online')");
check('SGIS를 못 불러오면 오프라인 지도를 유지한다',
  q("homeState.mapMode") === 'offline' && byId['home-tilemap'].hidden === false);
/* ★ 〔2026. 9. 6.〕 그전에는 여기서 «간편 지도를 유지» 라는 문구만 봤습니다.
   그런데 로컬 미리보기(python -m http.server)에서는 /api/sgis-map 이 404 라
   window.sop 이 아예 없고, 그때 「실제 위치 지도」 버튼은 눌러도 아무 일이
   안 일어나면서 «눌리는 것처럼» 보였습니다. 안내 문구는 누르기 전부터
   같은 자리에 떠 있어 무엇이 달라졌는지도 알 수 없었습니다 — 고장으로 보입니다.
   쓸 수 없으면 버튼이 «스스로» 그렇다고 말해야 합니다. */
check('지도 서비스가 없으면 「실제 위치 지도」 버튼이 잠긴다',
  byId['map-mode-online'].disabled === true);
check('버튼이 왜 잠겼는지 그 자리에서 말한다',
  /배포된 사이트/.test(byId['map-mode-online'].title || ''));
check('상태 문구도 「여기서는 못 쓴다」로 바뀐다',
  /배포된 사이트에서만/.test(byId['sgis-status'].textContent || ''));
/* ★ 〔2026. 9. 6.〕 카드를 div 에서 button 으로 바꾸면서 두 번 미끄러졌습니다.
   ① width:100% 를 줘서 담는 곳(.school-grid, flex-wrap)에서 한 줄에 하나씩 섰습니다.
   ② font:inherit 을 써서 .marker 의 font-size:12px 까지 되돌아가 글자가 15px 이 됐습니다
      (button.marker 가 .marker 보다 셈이 세기 때문입니다).
   둘 다 «누를 수 있게 만들려다» 생긴 것입니다. 생김새는 그대로여야 합니다. */
/* 스타일은 <style> 안에 있습니다 — js 가 아니라 html 을 봐야 합니다 */
/* 주석은 걷어냅니다 — 「font:inherit 을 쓰면 안 됩니다」라고 «적어 둔 글»이
   규칙으로 오해되면, 설명을 남길수록 검사가 빨개집니다. */
const cssNoComments = html.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\s+/g, ' ');
const btnMarkerCss = (cssNoComments.match(/button\.marker\{[^}]*\}/) || [''])[0];
check('카드 규칙을 찾을 수 있다', btnMarkerCss.length > 0, btnMarkerCss.slice(0, 60));
check('카드에 width:100% 를 주지 않는다 (한 줄에 여러 개 서야 한다)',
  !/width:\s*100%/.test(btnMarkerCss) && !/display:\s*block/.test(btnMarkerCss),
  '.school-grid 는 flex-wrap 입니다 — 100% 를 주면 한 줄에 하나만 섭니다: ' + btnMarkerCss.slice(0, 90));
check('카드에 font 단축속성을 쓰지 않는다 (글자 크기가 되돌아간다)',
  !/(^|[^-])font:\s*inherit/.test(btnMarkerCss) &&
  /font-family:\s*inherit/.test(btnMarkerCss) && /line-height:\s*inherit/.test(btnMarkerCss),
  'button.marker 가 .marker 보다 셈이 세서 font-size:12px 를 덮습니다: ' + btnMarkerCss.slice(0, 90));

check('한 곳에서만 판단한다 (sgisReady)',
  /function sgisReady/.test(js) && (js.match(/sgisReady\(\)/g)||[]).length >= 3);
byId['home-level'].options = Array.from({length:6}, () => makeEl('option'));
q("homeState.sel=SIGUNGU.find(sg=>sg.s==='영주');homeState.level='유';renderDetail()");
check('시군 상세의 유치원 수는 경북 전체가 아니라 해당 시군 값이다',
  byId['home-level'].options[4].text === '유치원 23',
  '영주시 표시: ' + byId['home-level'].options[4].text);
check('시군 상세의 다섯 학교급 숫자를 모두 해당 시군 값으로 바꾼다',
  byId['home-level'].options.slice(1,6).every(o => /\d+$/.test(o.text || '')) &&
  byId['home-level'].options[4].text !== '유치원 614');
check('온라인 SGIS 지도도 선택한 시군과 학교급으로 거른다',
  q('onlineSchools().length') === 23,
  '영주시 유치원 온라인 마커: ' + q('onlineSchools().length'));
q("homeState.mapMode='online';homeState.sel=SIGUNGU.find(sg=>sg.s==='영주');document.getElementById('home-online-map').hidden=false;document.getElementById('home-reset')._ev.click()");
check('실제 위치 지도에서도 경북 전체로 돌아간다',
  q('homeState.sel') === null && byId['home-online-map'].hidden === false && byId['home-tilemap'].hidden === true &&
  byId['home-reset'].hidden === false);
q(`window.sop={LatLng:function(lat,lon){this.x=lon;this.y=lat}};
   sgisMap={getBounds:function(){return {contains:function(){return true}}}};
   homeState.mapMode='online';homeState.level='전체';renderOnlineSchoolList()`);
check('실제 위치 지도 아래에도 현재 화면 학교 목록이 나타난다',
  byId['home-online-schools-wrap'].hidden === false &&
  byId['home-online-schools'].children.length === 120 &&
  /현재 화면/.test(byId['home-online-count'].textContent || ''));
check('실제 위치 지도는 학생 수 선택 때 군집값을 학생 합계로 바꾼다',
  /iconCreateFunction/.test(html) && /marker\.options\.studentCount/.test(html) && /metric-stu/.test(html));
q('sgisMap=null;delete window.sop');
q("homeState.sel=null;homeState.level='전체';renderTilemap()");
check('학교 917곳 이상이 들어 있다', q('SCHOOLS.length') >= 917, '개수: ' + q('SCHOOLS.length'));
const byLv = q('({초:SCHOOLS.filter(s=>s.lv==="초").length,중:SCHOOLS.filter(s=>s.lv==="중").length,고:SCHOOLS.filter(s=>s.lv==="고").length})');
check('초 474 · 중 260 · 고 183', byLv.초 === 474 && byLv.중 === 260 && byLv.고 === 183, JSON.stringify(byLv));
check('시군 22곳이 모두 학교를 가진다', q('SIGUNGU.every(sg=>SCHOOLS.some(s=>s.s===sg.s))'));
/* ★ 〔2026. 9. 6.〕 이 문턱이 «1» 이었습니다.
   포항해오름중학교(2026. 3. 1. 개교)만 학교알리미가 좌표를 안 줘서
   실제 위치 지도에 1,538곳만 찍혔습니다. 주소는 있었으므로
   bake-coords 가 카카오로 찾아 채웁니다. 이제 빠진 곳이 없어야 합니다.
   다시 «1» 로 올려 초록을 만들지 마세요 — 그러면 검사를 끄는 것입니다. */
check('좌표 없는 학교가 없다', q('SCHOOLS.filter(s=>s.lat==null).length') === 0,
  '빠진 곳: ' + q('SCHOOLS.filter(s=>s.lat==null).map(s=>s.name).join(", ")'));
check('좌표가 경북 범위 안에 있다',
  q('SCHOOLS.filter(s=>s.lat!=null&&(s.lat<35.0||s.lat>37.6||s.lon<127.8||s.lon>131.2)).length') === 0);
check('울릉군 학교는 동해 먼바다에 있다', q('SCHOOLS.filter(s=>s.s==="울릉"&&s.lon>130.5).length') > 0);

/* ★ 〔2026. 8. 12.〕 여기 검사가 없어서 난수 좌표가 그냥 지나갔습니다.
   「경북 범위 안인가」만 보고 있었는데, 난수도 경북 범위 안에서 뽑혔습니다.
   그래서 **자기 시군 안에 있는가**를 봅니다. 울릉군 유치원이 본토에 찍혀 있어도
   위 검사는 초록이었지만 이 검사는 빨개집니다.
   (시군은 넓으므로 중심에서 40km 까지 봅니다 — 경북에서 가장 넓은 안동·상주도 들어옵니다.) */
/* ★★ 〔2026. 8. 12.〕 **이 검사가 조용히 건너뛰고 있었습니다.**
   아래 거리 검사가 `geo[g.c]`(영문 코드)로 표를 만들고 `geo[s.s]` 로 찾은 뒤
   **못 찾으면 `return false`** 였습니다. 그런데 화면이 쓰는 시군 이름은
   **한글 약칭**(`REGION_GEO.s`)입니다. 그래서 917곳이 전부 «못 찾음»으로
   조용히 빠지고, 영문 코드를 넣은 유치원만 검사되고 있었습니다.
   그 사이 유치원·특수학교에 영문 코드가 들어가 **시군별 셈이 전부 0** 이 됐는데
   검사는 초록이었습니다.
   **모르는 시군이 나오면 건너뛰지 말고 «틀렸다»고 해야 합니다.** */
const unknownSigungu = q(`(function(){
  const known = {}; SIGUNGU.forEach(sg => known[sg.s] = 1);
  return [...new Set(SCHOOLS.filter(s => !known[s.s]).map(s => s.s))];
})()`);
check('모든 학교의 시군이 SIGUNGU 에 있다', unknownSigungu.length === 0,
  '모르는 시군: ' + unknownSigungu.slice(0, 6).join(', '));

const farFromSigungu = q(`(function(){
  const R = 6371, rad = x => x * Math.PI / 180;
  const geo = {}; REGION_GEO.forEach(g => { geo[g.s] = g; });   // 한글 약칭으로 찾습니다
  return SCHOOLS.filter(s => {
    if (s.lat == null || s.lon == null) return false;
    const g = geo[s.s];
    if (!g) return true;                    // 모르는 시군이면 «틀린 것»입니다
    const dLon = rad(s.lon - g.lon), dLat = rad(s.lat - g.lat);
    const h = Math.sin(dLat/2)**2 + Math.cos(rad(g.lat)) * Math.cos(rad(s.lat)) * Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.sqrt(h)) > 40;
  }).map(s => s.name + '(' + s.s + ')');
})()`);
check('학교 좌표가 자기 시군 안에 있다', farFromSigungu.length === 0,
  farFromSigungu.length + '곳 어긋남: ' + farFromSigungu.slice(0, 5).join(', '));

/* 화면에 실제로 숫자가 뜨는가 — 리터럴이 있어도 시군 키가 어긋나면 전부 0 이 됩니다 */
const lvTotals = q(`(function(){
  const o = {};
  ['초','중','고','유','특수'].forEach(lv => {
    o[lv] = SIGUNGU.reduce((a, sg) => a + ((BASE[lv] && BASE[lv][sg.s]) ? BASE[lv][sg.s].sch : 0), 0);
  });
  return o;
})()`);
check('학교급마다 시군별 셈이 0 이 아니다', Object.values(lvTotals).every(v => v > 0),
  JSON.stringify(lvTotals));

console.log('\n■ 시군·학교급 시뮬레이터와 변화 읽기');
check('행정안전부 지정 경북 인구감소지역은 15곳이고 예천은 제외한다',
  q('SIGUNGU.filter(sg=>sg.decline).length') === 15 && q("SIG_META['예천'].decline") === false);
q("sim.sigungu=new Set(['영주']);sim.level='중';renderSim()");
const yjMid = q("aggregate(SIGUNGU.find(sg=>sg.s==='영주'),'중').stu");
check('시뮬레이터 전체 행이 현재 지역 필터를 따른다',
  q('simExportRows[0].base.stu') === yjMid && q('JSON.parse(aiContext).scope.region')==='영주시',
  '영주 중학생: '+yjMid+' / 내보내기 합계: '+q('simExportRows[0].base.stu'));
check('AI에는 합계뿐 아니라 실적 추이·세 시나리오·비교 대상을 JSON으로 전달한다',
  q("(function(){var d=JSON.parse(aiContext);return d.version===2&&d.actualTrend.length>=2&&d.scenarios.length===3&&d.comparison.type==='school'})()"));
check('AI 인사이트와 인쇄물에 실적 추이·세 기준·비교 막대 시각화가 함께 들어간다',
  /function aiTrendHtml/.test(html) && /function aiScenarioHtml/.test(html) &&
  /function aiComparisonHtml/.test(html) && /class="ai-evidence-grid"/.test(q('aiInsightBoardHtml()')) &&
  /ai-trend-svg/.test(q('aiInsightBoardHtml()')) && /ai-scenario-item/.test(q('aiInsightBoardHtml()')));
q("sim.sigungu=new Set(['포항']);sim.level='초';renderSim()");
check('시군 한 곳을 고르면 같은 시군 대신 그 안의 학교를 비교한다',
  q("aiInsightData.comparison.type==='school'") && q("aiInsightData.comparison.region")==='포항시' &&
  q("aiInsightData.comparison.metrics.decrease.length")>0 && !/변화폭을 먼저 비교할 지역/.test(q('aiInsightBoardHtml()')),
  q("aiInsightData.comparison.metrics.decrease.map(r=>r.name).join(',')"));
check('학교 비교에는 EDSS 실적 기간과 학교명이 함께 들어간다',
  q("aiInsightData.comparison.metrics.decrease.every(r=>r.firstYear<r.lastYear&&/학교/.test(r.name))"));
check('학교 근거를 늘려도 AI 요청 허용 크기 12,000자를 넘지 않는다', q('aiContext.length')<12000,
  '포항 초등학교 AI 입력 '+q('aiContext.length')+'자');
check('학교 비교는 감소 인원·감소율·현재 소규모의 세 관점을 전환한다',
  q("['decrease','rate','size'].every(k=>aiInsightData.comparison.metrics[k].length>0)") &&
  (q("(aiInsightBoardHtml().match(/data-ai-school-metric=/g)||[]).length")===3));
q("sim.sigungu=new Set(['포항','구미']);renderSim()");
check('여러 시군을 고르면 선택 시군끼리 비교한다',
  q("aiInsightData.comparison.type==='region'") && q("aiInsightData.comparison.rows.length")===2);
check('현재 조건 비교표를 Excel xls로 저장할 수 있다',
  html.includes('id="sim-export-xls"') && /function exportSimXls/.test(html) && /\.xls`/.test(html));
check('상세 Excel은 요약·기준·예측·시각화·산출기준 시트를 만든다',
  (q('spreadsheetXml(simulatorSheets())').match(/<Worksheet /g)||[]).length===5 &&
  /변화시각화/.test(q('spreadsheetXml(simulatorSheets())')));
check('Excel 시군 행은 기능개선안의 표준 순서로 다시 정렬한다',
  /EXPORT_SIGUNGU_ORDER\s*=\s*\['포항','경주','김천','안동','구미','영주','영천','상주','문경','경산','의성','청송','영양','영덕','청도','고령','성주','칠곡','예천','봉화','울진','울릉'\]/.test(html) &&
  /orderedExportRows[\s\S]*exportSigunguIndex/.test(html));
q("sim.sigungu=new Set();sim.level='중';renderSim()");
check('상세 Excel의 실제 행도 포항부터 울릉까지 표준 순서다',
  q("simulatorSheets()[1].rows.slice(2).map(r=>r[0]).join(',')") === '포항,경주,김천,안동,구미,영주,영천,상주,문경,경산,의성,청송,영양,영덕,청도,고령,성주,칠곡,예천,봉화,울진,울릉');
check('모든 메뉴에 현재 화면 인쇄와 Excel 출력 도구가 있다',
  html.includes('id="export-current"') && html.includes('id="print-current"') && /function currentViewExport/.test(html));
check('인쇄물에 전용 표제와 A4 가로 쪽 설정이 있다',
  html.includes('class="print-letterhead print-only"') && /@page\{size:A4 landscape/.test(html));
check('현재 화면·AI 인사이트·이슈페이퍼의 종이 여백을 상20·하15·좌우20mm로 통일한다',
  (html.match(/margin:20mm 20mm 15mm 20mm/g)||[]).length>=5 &&
  !/margin:(?:9mm|12mm 14mm 14mm|12mm 11mm 15mm)/.test(html));
check('A4 세로 전용 출력물의 실제 내용 높이는 공통 여백을 뺀 262mm다',
  /body\.print-news-paper \.news-paper\{[^}]*height:262mm/.test(html) &&
  /body\.print-ai-only \.policy-report\{[^}]*width:100%;min-height:262mm/.test(html));
check('AI 인사이트는 인쇄할 때 한 줄 흐름으로 풀어 마지막 해설이 다음 장으로 밀리지 않는다',
  /body\.print-ai-only \.policy-report \.ai-insight-board\{display:block\}/.test(html) &&
  /body\.print-ai-only \.policy-report \.ai-narrative\{[^}]*break-inside:auto;page-break-inside:auto/.test(html));
check('본문을 덮던 고정 인쇄 꼬리말을 제거했다',
  !html.includes('class="print-footer print-only"') && /\.print-footer\{display:none\s*!important\}/.test(html));
check('긴 카드 전체를 한 쪽에 강제하지 않아 페이지 잘림을 막는다',
  !/\.card\{[^}]*break-inside:avoid/.test(html) && /thead\{display:table-header-group\}/.test(html));
check('종합 대시보드 인쇄는 요약·지도·기준을 의미 단위로 쪽 나눔한다',
  ['home-summary-card','home-kpi-card','home-map-card'].every(id=>html.includes(`id="${id}"`)) &&
  /#home-map-card\{break-before:page/.test(html) && /#home-map-card \.criteria-guide\{break-before:page/.test(html));
check('변화 요약은 보고서 HTML과 별도 인쇄 기능을 제공한다',
  html.includes('id="ai-print"') && /function policyMarkdown/.test(html) && /function renderPolicyReport/.test(html) && html.includes('id="ai-print-report"'));
check('인사이트 인쇄물에도 핵심 지표와 지역 비교 시각화가 들어간다',
  /function policyReportHtml[\s\S]*aiInsightBoardHtml\(text,source,\{\.\.\.meta,hideBadge:true\}\)/.test(js) &&
  /report-brand[\s\S]*symbol1\.jpg/.test(html) && /report-cover[\s\S]*linear-gradient/.test(html));
check('변화 요약은 전용 인쇄 때만 나온다',
  /#ai-print-report\{display:none !important\}/.test(html) && /body\.print-ai-only #ai-print-report\{display:block !important/.test(html));
check('AI가 응답한 실제 모델과 기본 요약 여부를 화면과 인쇄물에 표시한다',
  /function friendlyModelName/.test(js) && /ai-analysis-badge/.test(html) && /report-model-line/.test(html) &&
  /data\.model\|\|data\.requestedModel/.test(js));
check('짧은 AI 응답은 다음 모델을 시도하고 끝까지 짧으면 기본 해석을 보강한다',
  /function outputQuality/.test(aiApi) && /quality\.ok/.test(aiApi) && /data\.quality==='brief'/.test(js) &&
  /화면 집계값으로 보강한 비교 안내/.test(js));
check('인사이트가 준비되지 않은 인쇄 버튼은 취소선 대신 다음 행동을 안내한다',
  /\.ai-action-row \.chip:disabled\{[^}]*text-decoration:none/.test(html) &&
  /AI 해설 또는 기본 요약이 준비되면 인쇄할 수 있습니다/.test(html));
check('일반 사용자 화면에 서비스 사업자·모델명이 드러나지 않는다',
  !/>[^<]*(Gemini|Cloudflare|gemini-3\.\d)[^<]*</i.test(html.split('<script>')[0]));
check('경북교육청 상징 워터마크 파일과 화면·인쇄 스타일이 있다',
  fs.existsSync(path.join(path.dirname(APP),'symbol1.jpg')) && /body::before[\s\S]*symbol1\.jpg/.test(html) && /@media print[\s\S]*body::before/.test(html));
check('공개 시뮬레이터 범위를 시군·학교급으로 한정한다',
  !html.includes('data-f="decline"') && !html.includes('data-f="admin"') &&
  !html.includes('id="size-max"') && html.includes('id="sig-grid"') && html.includes('id="sim-level"'));
check('내부 정책 명부를 요구하는 시뮬레이터 필터가 없다',
  !html.includes('data-f="innov"') && !/공식 대상 명부 미확보/.test(html));
check('AI 변화 읽기 도우미는 스크롤 없이 여는 내부 탭으로 둔다',
  html.includes('data-sim-view="ai"') && html.includes('id="sim-panel-ai"') && html.includes('id="ai-briefing"'));
check('가나다순 용어 도움말을 오른쪽 서랍으로 제공한다',
  html.includes('id="glossary-drawer"') && html.includes('id="glossary-toggle"') &&
  html.indexOf('<summary>교원 수</summary>') < html.indexOf('<summary>학령인구</summary>'));
check('사용 안내도 용어 도움말처럼 토글 목록으로 제공한다',
  html.includes('id="guide-drawer"') && /<details><summary>지도로 보기<\/summary>/.test(html));
/* ★ 안내가 화면과 어긋나면 읽는 사람이 «자기가 잘못 보고 있다»고 여깁니다
   〔2026. 9. 11.〕 여기에는 치워 둔 「종합 대시보드」가 첫 줄에 있었고, 새로
   만든 「지도로 보기」는 한 줄도 없었습니다. 메뉴에 있는 화면은 안내에도
   있어야 합니다 — 앞으로 화면이 늘어도 이 검사가 잡습니다. */
check('메뉴에 있는 화면은 안내에도 있다', (() => {
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  const menu = Array.from(live.matchAll(/data-view="[a-z]+"[^>]*>(?:<span[^>]*>[^<]*<\/span>)?([^<]+)</g))
                    .map(m => m[1].trim()).filter(Boolean);
  const guide = live.slice(live.indexOf('id="guide-drawer"'), live.indexOf('id="nav-order-drawer"'));
  const missing = menu.filter(n => guide.indexOf(n) < 0);
  return { ok: missing.length === 0, missing };
})().ok, '안내에 없는 메뉴: ' + (() => {
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  const menu = Array.from(live.matchAll(/data-view="[a-z]+"[^>]*>(?:<span[^>]*>[^<]*<\/span>)?([^<]+)</g))
                    .map(m => m[1].trim()).filter(Boolean);
  const guide = live.slice(live.indexOf('id="guide-drawer"'), live.indexOf('id="nav-order-drawer"'));
  return menu.filter(n => guide.indexOf(n) < 0).join(', ') || '없음';
})());
check('치워 둔 화면을 안내가 붙들고 있지 않다', (() => {
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  const guide = live.slice(live.indexOf('id="guide-drawer"'), live.indexOf('id="nav-order-drawer"'));
  return guide.indexOf('<summary>종합 대시보드') < 0;
})());
check('사용자가 자신의 브라우저에서 메뉴 순서를 바꿀 수 있다',
  html.includes('id="nav-order-drawer"') && html.includes("NAV_ORDER_KEY = 'leap-nav-order-v1'") && /function applyNavOrder/.test(html));
check('전체 작업을 설명하는 사용 안내 서랍을 제공한다',
  html.includes('id="guide-drawer"') && html.includes('id="guide-toggle"') && /인쇄와 Excel/.test(html));
q("sim.sigungu.clear();renderSim()");

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
  /* ★ 〔2026. 9. 6.〕 이 고리가 «초·중·고» 셋만 돌았습니다.
     그래서 유치원과 특수학교는 아무도 세어 보지 않았고,
     특수학교가 0곳인 15개 시군에 학생 791명이 있는 채로 검사 170개가
     전부 초록이었습니다. 다섯 학교급을 모두 돕니다. */
  for (const lv of ['초','중','고','유','특수']) {
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

  /* 학교가 없는데 학생이 있는 칸 — 있으면 화면이 없는 것을 그립니다 */
  const ghosts = q(`(function(){const o=[];LEVELS.forEach(lv=>SIGUNGU.forEach(sg=>{
    const b=BASE[lv][sg.s];
    if(b.sch===0 && (b.stu>0||b.cls>0)) o.push(lv+' '+sg.s+' 학교0곳인데 학생'+b.stu+'명·학급'+b.cls);
  }));return o})()`);
  check('학교가 0곳인 칸에는 학생·학급도 0이다',
    ghosts.length === 0, ghosts.slice(0, 6).join(' / '));

  /* 기준자료 합계 = 학교별 합계. 화면 KPI 와 엑셀이 갈라지지 않게 합니다 */
  const drift = q(`(function(){
    let bs=0,bc=0; LEVELS.forEach(lv=>SIGUNGU.forEach(sg=>{bs+=BASE[lv][sg.s].stu;bc+=BASE[lv][sg.s].cls;}));
    const ss=SCHOOLS.reduce((a,s)=>a+(s.stu||0),0), sc=SCHOOLS.reduce((a,s)=>a+(s.cls||0),0);
    return {bs,ss,bc,sc};
  })()`);
  check('기준자료 학생 합계 = 학교별 학생 합계',
    drift.bs === drift.ss, '기준 ' + drift.bs + ' vs 학교 ' + drift.ss);
  check('기준자료 학급 합계 = 학교별 학급 합계',
    drift.bc === drift.sc, '기준 ' + drift.bc + ' vs 학교 ' + drift.sc);
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

const CODE_ONLY = html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
const fetchTargets = [...CODE_ONLY.matchAll(/\bfetch\s*\(\s*(['"])([^'"]+)\1/g)].map(m=>m[2]);
/* 지키는 것은 «개수»가 아니라 규칙입니다 — 부르는 곳이 전부 같은 출처이고,
   그 목록을 우리가 «이름으로 알고 있어야» 합니다. 모르는 주소가 하나라도
   끼면 빨개집니다. 〔2026. 9. 10. 위성 지도 키를 받는 자리가 늘었습니다〕 */
const FETCH_OK = [
  '/api/ai-analysis', '/api/data-status', '/api/vworld-key',
  'assets/news/manifest.json', 'assets/news/snapshot.json',
  'assets/news/snapshots/index.json', 'assets/news/issues/index.json'
];
check('fetch 는 같은 출처의 «아는 주소»만 부른다',
  fetchTargets.length > 0 &&
  fetchTargets.every(t => (t.startsWith('/') || t.startsWith('assets/news/')) && FETCH_OK.includes(t)),
  fetchTargets.join(', '));
check('그 목록에 밖으로 나가는 주소가 없다',
  FETCH_OK.every(t => !/^https?:/i.test(t)));
const senders = [
  [/XMLHttpRequest/,           'XMLHttpRequest'],
  [/navigator\.sendBeacon/,    'sendBeacon'],
  [/new\s+WebSocket\s*\(/,     'WebSocket'],
  [/new\s+EventSource\s*\(/,   'EventSource'],
  [/\bfirebase|initializeApp|getFirestore/i, 'Firebase SDK']
].filter(([re]) => re.test(html)).map(([, n]) => n);
check('AI 중계 외 다른 전송 코드가 없다', senders.length === 0,
  senders.length ? '밖으로 나가는 길: ' + senders.join(' · ') : '');

console.log('\n■ 근거 없는 지표 제거');
check('출처 없는 소멸위험지수가 없다', !/소멸\s*위기\s*지수|소멸위험지수|gon-risk-badges/.test(CODE_ONLY));

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
check('뉴스를 주간·월간·주제별로 필터링하고 출력한다',
  html.includes('id="news-topic"') && /withinTopic/.test(html) && /function newsExportSheets/.test(html));
check('몇 건인지 화면에 적는다', html.includes('id="news-count"'));
/* 쪽 넘기기 — 한 쪽 15건(3열 × 5줄). 제목과 요약을 읽을 폭을 확보합니다. */
check('한 쪽에 15건이다', /NEWS_PER_PAGE = 15/.test(html));
check('쪽 넘기기 자리가 있다', html.includes('id="news-pager"'));
check('쪽이 하나뿐이면 쪽 넘기기를 감춘다', /pageCount <= 1[\s\S]{0,80}hidden = true/.test(html));
check('기간을 바꾸면 첫 쪽으로 돌아간다', /newsPage = 1;\s*\/\/ 기간을 바꾸면/.test(html));
check('쪽 넘기기 단추가 44px 이상이다', /\.news-pager button\{[^}]*min-height:44px/.test(html));
check('인쇄에서 쪽 넘기기를 감춘다', /@media print\{\.news-pager\{display:none\}\}/.test(html));

/* ---------- 종합 대시보드에서 뉴스를 뺐다 ---------- */
console.log('\n■ 종합 대시보드에서 뉴스를 뺐다');
/* ★ 〔2026. 9. 9.〕 왼쪽 칸이 «연도 슬라이더에 붙는 자리»가 되면서 뉴스 요약을
   뺐습니다. 왼쪽 칸의 나머지는 전부 「고른 지역 × 고른 연도」를 말하는데
   뉴스에는 그 축이 없습니다 — 2018년에 슬라이더를 두어도 「2018년의 주간
   뉴스」는 존재하지 않습니다. 옆에 있으면 연동될 것으로 기대하게 되고,
   연동되지 않으면 고장으로 읽힙니다.

   이 검사들은 지우지 않고 «뜻을 뒤집었습니다» — 「있는가」에서 「없는가」로.
   그래야 누가 다시 홈에 뉴스를 붙일 때 그것이 «결정을 되돌리는 일»임이 드러납니다. */
check('홈에 뉴스 카드가 없다', !html.includes('id="home-news-card"') && !html.includes('id="news-brief"'));
check('죽은 코드를 남기지 않았다 (renderNewsBrief)', !/function renderNewsBrief/.test(html));
check('그 함수만 쓰던 상수도 함께 걷어냈다 (GYEONGBUK)', !/GYEONGBUK\s*=/.test(html));
check('기준일 배선도 걷어냈다', !/setAsof\('asof-homenews'/.test(html));
check('인쇄 규칙에도 죽은 선택자가 없다', !/#home-news-card/.test(html));
/* 뺀 것은 «홈 카드»뿐입니다. 뉴스 자체는 그대로 있어야 합니다. */
check('뉴스는 「주간 뉴스 클리핑」 화면에 그대로 있다',
  html.includes('id="view-news"') && html.includes('id="news-container"') && /NEWS_TOPICS/.test(html));
check('주제로 나누는 일도 그대로다', (html.match(/^\s*\['[^']+',\s*\/.*\/\],?$/gm) || []).length >= 5);
check('주제가 겹칠 수 있다고 여전히 알린다', html.includes('주제별 합이 건수보다 클 수 있습니다'));
/* 〔2026. 8. 12.〕 여기 있던 것은 **전부 손으로 적은 것**이었습니다.
   카드는 없앴지만 「손으로 적지 않는다」는 규칙은 남깁니다. */
check('손으로 적은 건수가 없다',
  !/보도 <b>\d+건<\/b> 수집 완료|수집 완료\./.test(html));
check('손으로 적은 기사 링크가 없다',
  !/n\.news\.naver\.com\/mnews\/article/.test(html));

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

/* ---------- 학교 전체 규모와 학급 밀도를 분리했는가 ---------- */
console.log('\n■ 학교 규모 · 학급 밀도');
check('학교급 다섯이 저마다 기준을 가진다',
  ['초','중','고','유','특수'].every(lv => q(`!!DENSITY_STD['${lv}']`)));
check('초·중은 동과 읍·면 기준이 다르다',
  q("DENSITY_STD['초'].over.동") === 25 && q("DENSITY_STD['초'].over.읍면") === 21 &&
  q("DENSITY_STD['중'].over.동") === 27 && q("DENSITY_STD['중'].over.읍면") === 26);
check('특수학교 과밀선이 법정 상한(7명)이다', q("DENSITY_STD['특수'].over.동") === 7);
check('모든 학교급에서 근거 없는 과소 판정을 하지 않는다',
  q("['초','중','고','유','특수'].every(lv => DENSITY_STD[lv].under === null)"));
check('기준마다 근거가 적혀 있다',
  q("['초','중','고','유','특수'].every(lv => !!DENSITY_STD[lv].overSrc)"));
/* 〔2026. 8. 31.〕 이 검사는 「공식 원문 최종 확인 필요」라는 **글자 그대로**를
   찾고 있었습니다. 그런데 그 말은 «만드는 사람의 작업 상태»입니다 —
   화면을 보는 분에게는 「이 기준을 믿어도 되나」가 궁금할 뿐입니다.
   지키려는 것은 **「이 수가 확정이 아님을 밝힌다」**이므로 그것을 봅니다. */
check('기준선이 확정이 아님을 밝힌다',
  q("['초','중','고','유'].every(lv => /그해 공문으로 확인/.test(DENSITY_STD[lv].overSrc))"),
  '해마다 바뀔 수 있는 수를 확정처럼 보이면 안 된다');
check('화면에도 참고용임을 적는다',
  html.includes('참고용') && html.includes('그해 경상북도교육청 적정규모학교 육성 계획'));

/* 실제로 그렇게 갈리는가 — 표만 고치고 쓰지 않으면 소용없습니다 */
check('특수학교가 과소로 나오지 않는다',
  q("SCHOOLS.filter(s=>s.lv==='특수').every(s=>densityOf('특수', s.stu/s.cls, areaOf(s)) !== 'under')"));
check('학급당 5명 유치원도 근거 없이 과소라 하지 않는다', q("densityOf('유', 5, '동')") === 'fit');
check('학급당 5명 특수학교는 과소가 아니다', q("densityOf('특수', 5, '동')") === 'fit');
check('읍·면 초등학교는 22명이면 과밀이다',
  q("densityOf('초', 22, '읍면')") === 'over' && q("densityOf('초', 22, '동')") === 'fit');
check('군 지역은 읍·면으로 본다',
  q("areaOf({s:'울릉', addr:'경상북도 울릉군 남양1길 42-27'})") === '읍면');
check('학교 규모 최소·소규모·적정규모 참고 분류를 별도로 계산한다',
  q("schoolSizeOf({stu:15,s:'포항',addr:'경상북도 포항시 남구 오천읍'}).key") === 'minimum' &&
  q("schoolSizeOf({stu:20,s:'포항',addr:'경상북도 포항시 남구 오천읍'}).key") === 'small' &&
  q("schoolSizeOf({stu:30,s:'포항',addr:'경상북도 포항시 남구 오천읍'}).key") === 'appropriate' &&
  q("schoolSizeOf({stu:60,s:'포항',addr:'경상북도 포항시 남구 대이로'}).key") === 'appropriate');
check('학교 규모와 학급 밀도가 다른 지표임을 화면에서 설명한다',
  html.includes('학교 규모와 학급 밀도는 서로 다른 지표입니다') && html.includes('공식 ‘과소 학급’ 하한'));

/* ---------- 자료 출처 · 공시 시기 ---------- */
console.log('\n■ 자료 출처');
/* 공시 자료는 실제 운영과 다를 수 있습니다 — 포항양덕초등학교병설유치원은
   2023년 2차 공시라 원아 5명으로 남아 있지만 지금은 운영하지 않습니다. */
check('출처 표가 있다', html.includes('이 화면의 자료는 어디서 왔나'));
check('공시가 실제와 다를 수 있다고 적는다',
  html.includes('공시 자료는 실제 운영과 다를 수 있습니다'));
check('실제로 어긋난 예를 든다', html.includes('포항양덕초등학교병설유치원'));
check('어디에 확인해야 하는지 적는다', html.includes('해당 교육지원청에 확인'));
check('유치원마다 공시 시기가 다르다고 적는다', html.includes('공시 시기가 유치원마다 달라'));
check('유치원 자료에 공시 시기가 들어 있다',
  q("SCHOOLS.filter(s=>s.lv==='유').every(s=>!!s.term)"));
check('낡은 공시를 표시한다',
  /function staleTerm/.test(html) && /tag-stale/.test(html));
const staleN = q("SCHOOLS.filter(s=>s.lv==='유'&&s.term!=='20261').length");
check('낡은 공시가 몇 곳인지 셀 수 있다', staleN > 0 && staleN < 200, staleN + '곳');

/* ★ 〔2026. 8. 12.〕 폐교 탭의 사진 세 장이 **프로젝트 밖**을 가리키고 있었습니다 —
   `../../../../../.gemini/antigravity-ide/brain/…` 라는 IDE 캐시 폴더입니다.
   라이브에서 **404** 로 깨져 있었는데 아무 검사도 보지 않았습니다.
   깨진 링크 검사는 굽기 스크립트에 있었지만 `href` 만 보고 `img src` 는 안 봤습니다. */
const escapingSrc = [...CODE_ONLY.matchAll(/<img[^>]+src="([^"]+)"/g)]
  .map(m => m[1])
  .filter(u => /^(\.\.\/){3,}/.test(u) || /\/\.[a-z]/.test(u));
check('그림이 프로젝트 밖을 가리키지 않는다', escapingSrc.length === 0,
  '밖을 가리키는 그림: ' + escapingSrc.slice(0, 3).join(' · '));

/* ---------- 지어낸 내용이 남아 있지 않은가 ---------- */
console.log('\n■ 지어낸 내용');
check('특수교육 탭이 셈해서 그린다',
  /function spedStats/.test(html) && !/12% 돌파/.test(CODE_ONLY));
check('다문화는 자료가 없다고 말한다',
  html.includes('학교알리미 공시 항목에 다문화 학생 수가 없어'));
check('지어낸 다문화 비율이 없다', !/경주시 8\.2%|경북 평균\(3\.4%\)/.test(CODE_ONLY));
check('홈 인사이트를 셈해서 적는다',
  /function renderHomeInsight/.test(html) && !/코호트 진급에 따른 시뮬레이션 결과/.test(CODE_ONLY));
check('하지 않은 분석을 말하지 않는다', !/꾸준히 증가하고 있습니다/.test(CODE_ONLY));
check('부서별 주요업무계획 메뉴를 공개 범위에서 제외한다',
  !html.includes('data-view="plan"') && !html.includes('id="view-plan"'));
check('폐교 탭이 지어낸 사례를 싣지 않는다',
  !/dummyCases/.test(CODE_ONLY) && !/closed-pin/.test(CODE_ONLY));
check('남아 있는 자료 미확보 영역은 필요한 공개 출처를 적는다',
  html.includes('지방교육재정알리미') && html.includes('자료 미확보'));
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

console.log('\n■ 실제 학년자료·AI·모바일');
check('학년별 학생 차트가 학교알리미 grades를 합산한다', html.includes('id="pax-pyramid-svg"') && /Array\.isArray\(s\.grades\)/.test(html));
check('유치원 수를 배열에서 동적으로 센다', /source-kinder-count[\s\S]*KINDERGARTENS\.length/.test(html));
check('유치원 교원 수 미확보를 명시한다', html.includes("homeState.level==='유' ? '자료 미확보'"));
check('KOSIS 공식 학령인구 시계열을 우선 사용한다', /const KOSIS_POP = \{/.test(html) && /kind==='pop' && KOSIS_POP\[year\]/.test(html));
/* ★ 문구를 고쳤습니다 〔2026. 9. 10.〕 예전에는 학생수 계열을 「그 외 연도는
   비교용 단순 연결값」이라 적었습니다. EDSS 교육통계 실적을 심은 뒤로는
   사실이 아닙니다 — 2016~2025 는 실적이고, 2027년부터가 전망입니다.
   자료가 좋아졌는데 설명이 따라오지 않으면 그것도 틀린 화면입니다. */
check('학령인구 현황이 자료의 성격을 있는 그대로 적는다',
  html.includes('id="status-source"') && html.includes('KOSIS 주민등록인구(2016~2025)') &&
  /EDSS 교육통계 실적\(2016~2025\)/.test(html) &&
  /2027년부터는 실측 감소율 전망/.test(html) &&
  !html.includes('그 외 연도는 비교용 단순 연결값') &&
  !html.includes('국가데이터처 장래인구추계 (더미 보간값)'));
check('학령인구는 천 명 단위로 반올림된 값임을 밝힌다',
  /천 명 단위 반올림/.test(html));
check('학령인구·학생수 모드에 맞춰 추이 제목을 바꾼다',
  html.includes('id="trend-title"') && /학령인구 추이/.test(html) && /학생수 추이/.test(html));
/* 지키려는 것은 「학생수 계열이 무엇인지 적는다」입니다. 문장을 통째로 못 박으면
   자료가 좋아지는 순간 이 검사가 빨개지고, 그때 고치기 쉬운 쪽은 검사입니다.
   그래서 **자료 상태와 문구가 맞는지**를 봅니다. */
check('홈 화면의 자료 출처 표가 학생수 계열의 성격을 자료 상태에 맞게 적는다',
  /KOSIS 주민등록인구현황·장래인구추계/.test(html) && /학령인구는 실제 재학생 수와 다릅니다/.test(html) &&
  (q('!!EDSS')
    ? /교육통계 실적/.test((byId['q-series-note'] || {})._html || '')
    : /미확보 연도는 비교용 단순 연결값/.test(html)));
check('분석 서비스 키는 HTML에 없고 같은 출처 중계만 쓴다', html.includes("fetch('/api/ai-analysis'") && !/GEMINI_API_KEY|generativelanguage\.googleapis\.com/.test(html));
check('720px 모바일 레이아웃이 있다', /@media \(max-width:720px\)[\s\S]*?\.shell\{display:block/.test(html));
check('가짜 소재지 배정이 없다', !/i\s*%\s*3|임의 배정한 더미/.test(CODE_ONLY));

/* ---------- EDSS 여러 해치 실적 ----------
   이 화면의 가장 큰 구멍은 「실적이 2026 한 해뿐」이라는 것입니다.
   `bake-edss.mjs` 가 여러 해치를 심으면 곡선·감소율·전망이 한꺼번에 바뀝니다.
   **심기 전과 심은 뒤 둘 다** 확인합니다. 심은 뒤만 보면 「아직 안 심었을 때
   조용히 0 이 되는」 실패를 놓칩니다. */
console.log('\n■ 뉴스가 조용히 낡지 않는다');
/* ★ 〔2026. 9. 7.〕 9월 6일 예약 실행이 통째로 빠졌는데 화면은 조용했습니다.
   카드에 「8. 31. 기준」이라고 적히긴 했지만, 이상하다는 것을 알려면
   오늘 날짜를 알고 뺄셈을 해야 합니다. 사람이 눈으로 발견해야 했습니다.
   일정은 정각을 피해 옮겼지만, GitHub 일정은 «약속»이 아니라 «자격»이라
   또 빠질 수 있습니다. 그러니 뺄셈은 화면이 대신합니다.

   ※ 이 갈래는 뉴스 IIFE 안에 있어 밖에서 부를 수 없습니다. 그래서 «있는지»를
     봅니다. 실제로 그려지는지는 브라우저에서 따로 확인했습니다. */
const staleFn = (js.match(/function newsStaleNote\(\)[\s\S]*?\n  \}/) || [''])[0];
const daysFn  = (js.match(/function newsStaleDays\(\)[\s\S]*?\n  \}/) || [''])[0];
check('며칠째 새 기사가 없는지 세는 갈래가 있다', daysFn.length > 0);
check('배열 순서를 믿지 않고 «가장 새 기사»를 찾는다 (정렬이 흐트러져도 맞게)',
  /Math\.max/.test(daysFn) && /isNaN/.test(daysFn));
check('기사가 없으면 날수를 지어내지 않는다 (null)',
  /return null/.test(daysFn) && !/return 0/.test(daysFn));
check('이틀까지는 조용하다 (기사가 없는 날도 있다)', /d < 3/.test(staleFn));
check('사흘째부터 며칠인지 적는다', /일째/.test(staleFn) && /새 기사가 들어오지 않았습니다/.test(staleFn));
check('닷새째부터는 확인해 달라고 말한다', /d >= 5/.test(staleFn) && /확인해 주세요/.test(staleFn));
check('어디를 볼지도 알려 준다', /GitHub Actions/.test(staleFn));
check('색만으로 말하지 않는다 — 날수를 글자로 함께 적는다',
  /news-stale-hard/.test(staleFn) && /<b>/.test(staleFn));
/* 〔2026. 9. 9.〕 예전에는 «홈 카드와 뉴스 화면 양쪽»에 붙었습니다.
   홈 카드를 뺐으므로 이제 붙는 자리는 뉴스 화면 하나입니다.
   그 하나가 «비어 있지 않은지»를 지킵니다 — 붙을 데가 없어지면
   낡은 것을 아무도 모르게 되고, 그것이 9/6 에 실제로 일어난 일입니다. */
check('낡음 알림이 뉴스 화면에 붙어 있다',
  /news-stale-slot/.test(js) && /id="news-stale-slot"/.test(html));
check('알림 자리가 스크린리더에도 전해진다',
  /id="news-stale-slot" aria-live="polite"/.test(html));

console.log('\n■ 목록에서 학교를 고르면 지도가 간다');
check('학교 카드가 진짜 button 이다 (키보드로도 눌린다)',
  /createElement\('button'\)/.test(js) && /el\.type = 'button'/.test(js));
check('카드를 누르면 goToSchool 을 부른다',
  /el\.addEventListener\('click', \(\) => goToSchool\(s\)\)/.test(js));
check('실제 위치 지도와 간편 지도 «양쪽» 길이 있다',
  /function focusOnSgisMap/.test(js) && /function focusOnDetailMap/.test(js));
check('간편 지도에서 시군을 아직 안 골랐으면 먼저 펼친다',
  /selectSigungu\(sg\)/.test(js) && /focusOnDetailMap\(s\), 60/.test(js));
check('좌표가 없는 학교는 지도로 보내지 않고 그렇다고 말한다',
  /좌표가 없어 지도에 표시할 수 없습니다/.test(js));
check('간편 지도 핀이 자기 화면좌표를 가지고 있다',
  /data-mx=/.test(js) && /detailMapPts\.set/.test(js));
check('실제 지도 마커를 이름으로 찾을 수 있다',
  /sgisMarkers\.set\(schoolKey\(s\), marker\)/.test(js) && /sgisMarkers\.clear\(\)/.test(js));

console.log('\n■ 지도가 배율에 따라 «세는 단위»를 바꾼다');
/* ★ 〔2026. 9. 9.〕 예전에는 어느 배율에서나 학교를 낱개로 찍었습니다.
   경북 전체 화면에서 그 지도가 말해 주는 것은 「여기 몇 곳이 뭉쳐 있다」뿐이고,
   **어느 시군인지**는 알 수 없었습니다. 이제 멀리서 보면 시군 22곳으로 접습니다.

   여기서 지키는 것은 «접어도 셈이 달라지지 않는가» 입니다.
   접는 코드와 낱개로 찍는 코드가 서로 다른 자료를 보면 두 화면이 어긋나고,
   그것은 합계만 보아서는 드러나지 않습니다 — 함정 12번과 같은 자리입니다. */
check('멀리서 보면 시군으로 접는다', q('mapTierForZoom(3,false)') === 'sgg');
check('문턱까지는 접힌 채다', q('mapTierForZoom(ZOOM.sggMax,false)') === 'sgg');
check('문턱을 넘으면 학교를 낱개로 찍는다',
  q('mapTierForZoom(ZOOM.sggMax+1,false)') === 'school');
check('시군을 골랐으면 배율과 무관하게 학교를 찍는다 (고른 것이 사라지면 안 된다)',
  q('mapTierForZoom(3,true)') === 'school');

const tierSaved = q('homeState.level') + '|' + q('homeState.metric');
q("homeState.level='전체'; homeState.sel=null; homeState.metric='sch';");
check('시군 22곳이 빠짐없이 나온다', q('sggBubbleRows().length') === 22);
check('접은 학교 수 합계가 낱개로 찍는 수와 같다',
  q('sggBubbleRows().reduce(function(a,r){return a+r.sch},0)') === q('onlineSchools().length'));
check('접은 학생 수 합계도 낱개 합계와 같다',
  q('sggBubbleRows().reduce(function(a,r){return a+r.stu},0)') ===
  q('onlineSchools().reduce(function(a,s){return a+(Number(s.stu)||0)},0)'));
q("homeState.level='특수';");
check('그 학교급이 «한 곳도 없는» 시군도 줄이 남는다 (0 과 「모름」은 다르다)',
  q('sggBubbleRows().length') === 22 &&
  q('sggBubbleRows().filter(function(r){return r.sch===0}).length') > 0);
check('학교가 없는 시군은 학생도 0 이다 (유령 791명을 다시 만들지 않는다)',
  q('sggBubbleRows().filter(function(r){return r.sch===0&&r.stu>0}).length') === 0);
q("homeState.level='" + tierSaved.split('|')[0] + "'; homeState.metric='" + tierSaved.split('|')[1] + "';");

check('딱지에 시군 이름과 값을 «함께» 적는다 (원 안에는 이름이 안 들어간다)',
  /'sgis-sgg-bubble'/.test(js) && /<b class="nm">/.test(js) && /<b class="vl">/.test(js));
check('고른 시군 딱지는 뒤집어 표시한다', html.includes('.sgis-sgg-bubble.is-on'));
check('학교가 없는 시군 딱지는 옅게 둔다', html.includes('.sgis-sgg-bubble.is-empty'));
check('시군 층과 학교 층을 따로 둔다 (한 층에 섞으면 두 번 세게 된다)',
  /let sgisSggLayer/.test(js) && /function clearSgisSggLayer/.test(js));
check('배율이 «달라졌을 때만» 다시 그린다 (확대할 때마다 1,539곳을 다시 찍지 않는다)',
  /if\(tier !== sgisTier \|\| label !== sgisLabelMode\)/.test(js));
/* ★ 〔2026. 9. 9.〕 「확대·축소가 딱딱 끊긴다」는 말을 들었습니다.
   원인은 둘이었습니다 — ① 연도 슬라이더가 `input` 마다 마커 1,539개를
   다시 얹고 있었고, ② 배율 애니메이션이 «도는 중»에 레이어를 갈아 끼웠습니다. */
check('한 프레임에 한 번만 그린다 (슬라이더를 끄는 동안 수십 번 다시 찍지 않는다)',
  /function queueIconUpdate/.test(js) && /iconUpdatePending/.test(js) &&
  /if\(tier === 'sgg' \|\| schoolYearApplies\(\) \|\| wasSchoolYear\) queueIconUpdate\(\)/.test(js));
/* ★ 여기가 「뚝뚝 끊긴다」의 진짜 원인이었습니다 — 연도만 바뀌었는데
   마커 1,539개를 통째로 지우고 다시 얹었습니다. 지우는 순간 화면에서
   사라졌다가 다시 나타나므로 끊겨 보입니다. */
check('연도만 바뀌면 «다시 만들지 않고» 아이콘만 갈아 끼운다',
  /function updateSchoolIcons/.test(js) && /marker\.setIcon\(icon\)/.test(js));
check('그리는 쪽과 갈아 끼우는 쪽이 «같은 아이콘 공장»을 쓴다 (둘로 나뉘면 서로 달라진다)',
  /function schoolIcon\(s, sv, o\)/.test(js) &&
  (js.match(/schoolIcon\(s, sv, \{labelMode/g) || []).length >= 2);
check('학교를 고르고 풀 때도 다시 만들지 않는다',
  !/currentMapLabelMode\(\)\) renderSgisMarkers\(\)/.test(js));
check('배율 애니메이션이 끝난 뒤에 다시 그린다 (도는 중에 갈아 끼우면 툭 끊긴다)',
  /requestAnimationFrame\(renderSgisMarkers\)/.test(js));
/* 다시 그릴 때마다 1,539개가 한꺼번에 페이드인 하면 그것이 곧 깜빡임입니다.
   시군 딱지(22개)만 남기고 학교 표시에서는 뺐습니다. */
check('학교 표시에는 들어오는 애니메이션을 두지 않는다',
  /@keyframes mk-in/.test(html) && !/\.sgis-school-label \.bub\{animation:mk-in/.test(html));
check('움직임을 줄여 달라고 한 사람에게는 끈다',
  /prefers-reduced-motion:reduce\)\{\s*\.sgis-sgg-bubble \.bub/.test(html.replace(/\s+/g,' ').replace(/prefers-reduced-motion:reduce\)\{ /g,'prefers-reduced-motion:reduce){')) ||
  /\.sgis-school-icon\{animation:none\}/.test(html.replace(/\s+/g,'')));
check('시군 단계에서는 범례도 시군 단계의 것으로 바꾼다 (틀린 안내는 없느니만 못하다)',
  /function renderSgisTierNote/.test(js) && /딱지 하나 = 시군 하나/.test(js));
check('딱지를 누르면 그 시군 안으로 들어간다', /function enterSgg/.test(js) && /marker\.on\('click'/.test(js));
check('들어갔으면 나올 길도 함께 켠다', /reset\.hidden = false/.test(js));

console.log('\n■ 브이월드를 «바탕»으로 삼는다');
/* ★ 〔2026. 9. 10.〕 sop 를 뜯어보고 두 가지를 확인해 길이 열렸습니다.

   ① `r.Map` 은 `statisticTileLayer:false` 를 주면 SGIS 배경을 붙이지 않고
      **좌표계도 UTM-K 로 덮어쓰지 않습니다** (붙일 때만 mergeOptions 합니다).
   ② `r.Projection.Proj.project(t)` 는 `proj4(UTMK → 대상).forward([t.x,t.y])` 이고
      `sop.LatLng` 이 이미 UTM-K x/y 를 들고 있습니다. 그래서 **마커·거리·경계
      코드를 한 줄도 고치지 않고** 좌표계만 갈아 낄 수 있습니다.

   앞서 WMS 로 위성을 얹으려던 시도는 접었습니다 — 브이월드 WMS 에는 위성영상
   레이어가 «없습니다»(355개가 전부 주제도). 위성은 WMTS 에만 있고 그쪽은
   웹 메르카토르뿐이라, 지도 자체를 그 좌표계로 세웁니다. */
check('웹 메르카토르 좌표계를 만들 수 있다', /function mercCrs/.test(js) && /EPSG:3857/.test(js));
check('SGIS 배경을 끄고 세운다 (켜 두면 좌표계를 UTM-K 로 덮어씁니다)',
  /statisticTileLayer: false/.test(js));
check('브이월드 타일은 WMTS 차례를 따른다 ({z}/{y}/{x})',
  /wmts\/1\.0\.0\/' \+ vworldKey \+ '\/' \+ vworldBase \+ '\/\{z\}\/\{y\}\/\{x\}\.jpeg/.test(js));
check('배경을 일반·위성·하이브리드로 갈아 끼운다',
  /const VWORLD_BASES/.test(js) && /'Satellite'/.test(js) && /'Hybrid'/.test(js));
check('키가 없으면 배경 고르기를 내놓지 않고 SGIS 배경으로 돈다',
  /if\(!vworldKey\)\{ wrap\.hidden = true; return; \}/.test(js));
/* ★ 〔2026. 9. 10.〕 브이월드 바탕은 «꺼 두었습니다». 운영에서 지도가 통째로
   비었습니다 — 타일도 CSP 도 정상인데 아무것도 그려지지 않았습니다.
   깨진 채로 두고 파지 않습니다. 지도는 브이월드 위에서 새로 세웁니다. */
check('깨진 갈래를 꺼 두었다', /const VWORLD_BASE_ON = false;/.test(js));
check('꺼 두면 예전 SGIS 배경으로 돈다',
  /const merc = \(VWORLD_BASE_ON && vworldKey\) \? mercCrs\(\) : null;/.test(js));
check('왜 껐는지 코드에 적어 두었다', /운영에서 지도가 통째로 비었습니다/.test(html));
check('키를 «지도를 만들기 전»에 받는다 (좌표계는 만들 때 정해진다)',
  /function setMapModeAsync/.test(js) && /loadVworldKey\(\)\.then\(function\(\)\{ setMapMode\(mode\); \}\)/.test(js));
check('타일을 못 받아도 학교 위치는 그대로라고 말한다',
  /배경지도를 받지 못했습니다 — 학교 위치는 그대로입니다/.test(js));
check('못 받은 자리에 깨진 그림을 깔지 않는다', /errorTileUrl:/.test(js));
/* ★ 브이월드는 도메인을 «정확히» 맞춰 봅니다. 미리보기는 배포마다 주소가
   달라지므로 등록한 뒷마디만 보내야 합니다 — 실제로 재어 확인했습니다. */
check('등록한 도메인만 보낸다 (해시 서브도메인을 그대로 보내면 INCORRECT_KEY)',
  /function registeredDomain/.test(fs.readFileSync(path.join(ROOT2, 'functions/api/vworld-key.js'), 'utf8')));

console.log('\n■ 다크 모드에서 «흰 바탕에 흰 글자»가 없다');
/* ★ 〔2026. 9. 9.〕 「다크로 바꾸면 글자색이 안 따라오는 것이 많다」는 말을
   들었습니다. 찾아보니 원인이 둘이었습니다.

   ① 채운 바탕 위 글자를 `#fff` 로 박아 둔 곳 — 다크에서는 그 «바탕»이
      밝아지므로 흰 글자가 흰 바탕에 놓입니다.
   ② `--card-2` 와 `--ink-1` 이 **정의된 적이 없었습니다.** 정의 없는 var() 는
      오류가 아니라 «아무것도 아닌 값»이라 조용히 투명·기본색이 됩니다.
      화면이 깨지지 않아 아무도 몰랐습니다. */
check('--card-2 가 정의되어 있다 (16곳에서 쓰고 있었다)', /--card-2:var\(--leap-hairline\)/.test(html));
check('정의되지 않은 토큰을 더 쓰지 않는다 (--ink-1)', !/var\(--ink-1\)/.test(html));
check('채운 딱지의 글자는 테마를 따라간다 (#fff 를 박지 않는다)',
  !/\.sgis-sgg-bubble\.is-on \.bub\{[^}]*#fff/.test(html) &&
  !/\.sgis-school-label\.is-on \.bub\{[^}]*#fff/.test(html) &&
  /\.sgis-sgg-bubble\.is-on \.bub\{[^}]*var\(--leap-on-fill\)/.test(html));
check('로고 글자가 다크에서 검정으로 박히지 않는다',
  !/\.brand \.nm\{[^}]*color:#14202e/.test(html) && /\.brand \.nm\{[^}]*color:var\(--ink\)/.test(html));
check('지도 담는 상자 바탕도 테마를 따라간다', !/\.online-map\{[^}]*background:#eaf0f6/.test(html));
check('간편 지도 확대 단추도 테마를 따라간다',
  !/\.detail-map-controls button\{[^}]*background:#ffffff/.test(html));
/* 남아 있는 #fff 는 «채도 높은 브랜드색 위»라 두 테마에서 모두 읽힙니다.
   지키는 것은 개수가 아니라 규칙입니다 — «테마를 따라 밝아지는 바탕» 위에
   흰 글자를 두지 않는다. */
check('테마를 따라 밝아지는 바탕 위에 흰 글자를 두지 않는다',
  !/\{[^}]*background:var\(--ink\)[^}]*color:#fff/.test(html) &&
  !/\{[^}]*color:#fff[^}]*background:var\(--ink\)/.test(html) &&
  !/\{[^}]*background:var\(--card[^}]*color:#fff/.test(html));

console.log('\n■ 병설유치원은 본교 자리에 있다');
/* ★ 「송곡초 병설유치원 위치가 이상하다」는 말을 들었습니다. 재어 보니
   본교에서 8.6km 떨어져 있었습니다. 유치원 좌표는 주소를 카카오로 옮긴
   값이라 틀릴 수 있고, 초·중·고 좌표는 학교알리미가 직접 줍니다.
   병설유치원은 본교 건물 안에 있으므로 본교 좌표가 언제나 더 정확합니다. */
check('본교 좌표로 잇는 코드가 있다', /coordFrom = '본교'/.test(js));
check('이름만이 아니라 «시군까지» 맞춰 잇는다 (남산초는 영주에도 경산에도 있다)',
  /byMain\[k\.s \+ '\|' \+ m\[1\]\]/.test(js));
check('본교를 못 찾으면 그대로 둔다 (아무 데나 옮기지 않는다)', /if\(!main\) return;/.test(js));
check('병설유치원이 실제로 본교 자리로 옮겨졌다', q(
  "(function(){var k=SCHOOLS.filter(function(x){return x.name==='포항송곡초등학교병설유치원'})[0];" +
  "var m=SCHOOLS.filter(function(x){return x.lv==='초'&&x.name==='포항송곡초등학교'&&x.s===k.s})[0];" +
  "return !!k && !!m && k.lat===m.lat && k.lon===m.lon && k.coordFrom==='본교';})()"));
check('본교에서 300m 넘게 떨어진 병설유치원이 없다', q(
  "(function(){var main={};SCHOOLS.forEach(function(s){if(s.lv==='초'&&s.lat!=null)main[s.s+'|'+s.name]=s;});" +
  "function d(a,b,c,e){var t=function(x){return x*Math.PI/180};var A=Math.sin(t(c-a)/2),B=Math.sin(t(e-b)/2);" +
  "var h=A*A+Math.cos(t(a))*Math.cos(t(c))*B*B;return 2*6371*Math.asin(Math.sqrt(h));}" +
  "var bad=0;SCHOOLS.forEach(function(k){if(k.lv!=='유')return;" +
  "var m=String(k.name).match(/^(.*초등학교)병설유치원$/);if(!m)return;" +
  "var p=main[k.s+'|'+m[1]];if(!p)return;if(d(k.lat,k.lon,p.lat,p.lon)>0.3)bad++;});return bad;})()") === 0);
/* 포항양덕초 병설유치원은 지금 운영하지 않는데 자료에 원아 5명이 남아 있습니다.
   2023년 공시가 마지막이기 때문입니다. 화면이 그 사실을 말해야 합니다. */
check('낡은 공시를 화면이 스스로 말한다', /function staleTermNote/.test(js) && /가 마지막입니다/.test(js));
check('판정은 이미 있는 staleTerm 을 쓴다 (같은 규칙을 둘로 만들지 않는다)',
  /const st = staleTerm\(sc\);/.test(js));
check('가장 최근 공시면 아무 말도 덧붙이지 않는다', q("staleTermNote({term:'20261'})") === '');
check('낡은 공시면 «몇 년 몇 차»인지와 「확인해 달라」를 말한다',
  /2023년 2차 공시/.test(q("staleTermNote({term:'20232'})")) &&
  /확인해 주세요/.test(q("staleTermNote({term:'20232'})")));

console.log('\n■ 검색은 «경북 전체»에서 찾고, 찾으면 그리로 간다');
/* ★ 「보이는 지도에서만 검색된다」는 말을 들었습니다. 시군을 고른 채로
   다른 시군 학교를 치면 아무것도 안 나오고 왜 안 나오는지도 몰랐습니다. */
check('글자를 치는 동안에는 시군 가두기를 푼다',
  /\(keyword \|\| !homeState\.sel \|\| s\.s === homeState\.sel\.s\)/.test(js));
check('찾은 것이 화면 밖이면 지도가 그리로 간다', /function moveToSearchResult/.test(js));
check('이미 화면 안에 있으면 옮기지 않는다 (보고 있는 것을 뺏지 않는다)',
  /if\(visible\.length\) return;/.test(js));
check('글자를 치는 동안 매번 날아가지 않는다', /searchMoveTimer/.test(js));

console.log('\n■ 크게 볼 때도 왼쪽 칸을 볼 수 있다');
/* 크게 보는 까닭은 지도를 자세히 보려는 것이지 값을 안 보려는 것이 아닙니다.
   예전에는 크게 보면 학교를 눌러도 상세가 나올 자리가 없었습니다. */
check('크게 볼 때 왼쪽 칸을 지도 위에 띄운다', /body\.map-maxed #home-side\{/.test(html));
check('띄운 만큼 지도를 밀어 둔다 (겹쳐 가리면 못 보는 자리가 생긴다)',
  /body\.map-maxed\.has-side #home-map-card\.map-max\{padding-left/.test(html));
check('요약을 접어 두었으면 띄우지 않는다', /body\.map-maxed\.home-wide #home-side\{display:none\}/.test(html));
check('좁은 화면에서는 예전처럼 감춘다', /max-width:900px[\s\S]{0,200}body\.map-maxed #home-side\{display:none\}/.test(html));

console.log('\n■ 이름이 보이는 배율에서는 묶지 않는다');
/* ★ 「네이버 부동산처럼 해 달라고 했는데 동그라미가 아직도 많다」 —
   그 동그라미는 학교가 아니라 «묶음»이었습니다. 이름을 적기 시작하는
   배율에서 묶으면 이름이 사라지고 숫자만 남아, 확대한 뜻이 없어집니다. */
check('이름 배율에서는 묶음을 쓰지 않는다',
  /const labelMode = currentMapLabelMode\(\);\s*\n\s*sgisLayer = \(!labelMode && window\.sop\.markerClusterGroup\)/.test(js));
check('그 아래 배율에서는 여전히 묶는다', /window\.sop\.markerClusterGroup\(clusterOptions\)/.test(js));

console.log('\n■ 지표가 «어느 지역»의 것인지 말한다');
check('지표 제목에 지역 이름이 들어간다', /id="home-kpi-region"/.test(html));
q("homeState.sel=null; renderHomePanel();");
check('고른 것이 없으면 경북 전체라고 적는다', byId['home-kpi-region'].textContent === '경북 전체');
q("homeState.sel=SIGUNGU.filter(function(g){return g.s==='안동'})[0]; renderHomePanel();");
check('시군을 고르면 그 시군 이름을 적는다', /안동/.test(byId['home-kpi-region'].textContent || ''));
q("homeState.sel=null; renderHomePanel();");

console.log('\n■ 많이 확대하면 «누르지 않아도» 학교가 제 이름을 말한다');
/* ★ 〔2026. 9. 9.〕 「동그라미를 눌러야만 어느 학교인지 알 수 있다」는 말을
   들었습니다. 네이버 부동산이 집 딱지에 값을 적어 두는 자리입니다.
   다만 멀리서부터 이름을 다 적으면 글자가 겹쳐 아무것도 안 읽히므로
   배율이 충분할 때만 딱지로 바뀝니다. */
/* ★ 〔2026. 9. 10.〕 문턱을 «좌표계마다» 따로 둡니다. SGIS 는 배율 0~13,
   웹 메르카토르는 6~19 라 같은 숫자를 쓰면 「경북 전체」가 동네 하나로 보입니다. */
check('배율 문턱이 좌표계를 따라간다', /const ZOOM_SGIS\s*=/.test(js) && /const ZOOM_MERC\s*=/.test(js) && /let ZOOM = ZOOM_SGIS/.test(js));
check('문턱 아래에서는 동그라미 그대로다', q('mapLabelForZoom(ZOOM.label-1)') === false);
check('문턱을 넘으면 이름 딱지로 바뀐다', q('mapLabelForZoom(ZOOM.label)') === true);
check('딱지에 이름과 학생 수를 «함께» 적는다',
  /sgis-school-label sgis-lv-/.test(js) && /<b class="nm">/.test(js) && /<b class="vl">/.test(js));
check('학교급을 점 색으로도 말하되 글자를 함께 둔다 (원칙 4)',
  /class="lvdot"/.test(js) && /sgis-lv-\$\{s\.lv\}/.test(js));
check('값이 없는 해는 지어내지 않고 그렇다고 적는다', /자료 없음/.test(js) && /no-value/.test(js));
/* 급 이름을 떼어 딱지를 짧게 하되, 떼면 무엇인지 알 수 없는 이름은 그대로 둡니다. */
check('딱지 이름에서 급 이름을 뗀다', q("shortSchoolName({name:'포항제철중학교',lv:'중'})") === '포항제철');
check('떼면 알 수 없는 이름은 그대로 둔다', q("shortSchoolName({name:'중학교',lv:'중'})") === '중학교');

console.log('\n■ 학교를 누르면 왼쪽 칸이 그 학교를 펼친다');
/* 지도 말풍선은 좁아서 학년별까지 담지 못합니다. 넓은 자리가 왼쪽 칸입니다. */
check('학교 상세 자리가 있다', /id="home-school-card"/.test(html));
check('비어 있으면 아예 숨긴다 (빈 상자는 「고장」으로 읽힌다)',
  /id="home-school-card" hidden/.test(html) && /box\.hidden = true/.test(js));
q("selectedSchoolKey=null; renderSchoolCard();");
check('처음에는 숨어 있다', byId['home-school-card'].hidden === true);
q("(function(){var s=SCHOOLS.filter(function(x){return x.grades&&x.grades.length})[0];selectSchool(s);})()");
check('학교를 고르면 펼쳐진다', byId['home-school-card'].hidden === false);
check('학교 이름을 적는다', /class="sch-name"/.test(byId['home-school-card']._html || ''));
check('닫는 길이 있다', /id="home-school-close"/.test(byId['home-school-card']._html || ''));
q("homeState.year=2026; renderSchoolCard();");
check('2026 에서는 학년별 막대를 편다', /class="sch-grades"/.test(byId['home-school-card']._html || ''));

/* ★ 〔2026. 9. 9.〕 「학교알리미처럼 더 많은 정보가 나왔으면」 —
   다만 «학령인구 감소에 어울리는 것»만 넣습니다. 급식·전화번호는 이 화면이
   답할 질문이 아닙니다. 넣은 것은 전부 지금 가진 자료로 셈해집니다. */
check('규모·밀도 판정을 «이미 있는 잣대»로 붙인다 (목록 카드와 같은 함수)',
  /const size = schoolSizeOf\(sc\);/.test(js) && /densityOf\(sc\.lv, perCls, area\)/.test(js));
check('판정 배지가 실제로 나온다', /class="sch-tags"/.test(byId['home-school-card']._html || ''));
check('읍·면인지 동인지 적는다 (규모 잣대가 다르다)',
  /(읍·면|동) 지역/.test(byId['home-school-card']._html || ''));
check('교원 수와 교원 1인당 학생 수를 적는다',
  /교원 수/.test(byId['home-school-card']._html || '') &&
  /교원 1인당/.test(byId['home-school-card']._html || ''));
check('특수학급 학생 수를 적는다', /특수학급/.test(byId['home-school-card']._html || ''));
check('한 학급뿐인 학년을 눈에 띄게 적는다 (더 줄일 여지가 없는 자리)',
  /class="one"/.test(js) && /1학급<\/b>/.test(js));
check('어린 학년이 적다는 것을 한 줄로 말한다 (앞으로 더 준다는 신호)',
  /1학년이 /.test(js) && /어린 학년이 적으면 앞으로 더 줄어듭니다/.test(js));
check('가장 가까운 같은 학교급 학교와 거리를 적는다', /function nearestSameLevel/.test(js));
check('그 거리가 «직선거리»임을 밝힌다 (통학 거리가 아니다)',
  /직선거리라 통학 거리와 다릅니다/.test(js));
/* ★ 〔2026. 9. 10.〕 개교년도도 «받아 놓고 버리던» 값이었습니다.
   bake-coords 가 같은 응답(apiType=0)에서 좌표만 꺼내 쓰고 FOND_YMD 는
   흘려보냈습니다. 새로 신청할 API 가 없었습니다. */
check('개교년도를 심는 자리가 있다', /var SCHOOL_FOUNDED = \{/.test(html));
check('학교 레코드가 개교년도를 든다', q("SCHOOLS.filter(function(s){return s.founded}).length") > 800,
  '실제: ' + q("SCHOOLS.filter(function(s){return s.founded}).length"));
check('개교년도가 그럴듯한 범위 안이다', q(
  "SCHOOLS.filter(function(s){return s.founded && (s.founded<1890 || s.founded>2026)}).length") === 0);
check('상세에 개교년도와 «몇 년째»를 적는다', /년 개교<\/b>/.test(js) && /년째/.test(js));
check('개교년도가 없으면 그 줄을 아예 그리지 않는다 (0년 개교라고 적지 않는다)',
  /sc\.founded\s*\n?\s*\?/.test(js) || /\(sc\.founded/.test(js));
check('설립구분(공립·사립)도 함께 적는다', /sc\.fondKind/.test(js));

check('학교별 추이는 실적을 심은 뒤에만 그린다',
  /function schoolSparkSvg/.test(js) && /if\(!schoolHistoryReady\(\) \|\| !sc\.hist\) return '';/.test(js));
q("homeState.year=2032; renderSchoolCard();");
check('다른 해에는 학년별을 접고 «왜»를 적는다 (2026 학년별이 그 해 것으로 읽힌다)',
  !/class="sch-grades"/.test(byId['home-school-card']._html || '') &&
  /2026년 공시<\/b>에만 있습니다/.test(byId['home-school-card']._html || ''));
check('학급 수도 2026 만 있다고 말한다', /2026년만 있음/.test(byId['home-school-card']._html || ''));
q("clearSchool(); homeState.year=2026;");
check('닫으면 다시 숨는다', byId['home-school-card'].hidden === true);

console.log('\n■ 왼쪽 칸이 «고른 지역 × 고른 연도»를 말한다');
/* ★ 〔2026. 9. 9.〕 이 카드의 큰 숫자 여섯 개는 «손으로 적힌 것»이었습니다 —
   「100 · 64 · 65」와 「101 · 63 · 63」, 그리고 「2026년」까지. 갱신하는 코드가
   한 줄도 없었습니다. 자료가 바뀌어도 그 자리는 그대로였고, 그것을 알아차릴
   방법도 없었습니다. 이 검사들이 그 자리를 다시 굳게 만들지 않기 위한 것입니다. */
/* 앞선 검사들이 학교급·시군을 이리저리 바꿔 놓았습니다.
   여기서 보는 것은 «그리면 채워지는가»이므로 상태를 먼저 맞추고 한 번 그립니다. */
const ySaved = q('homeState.year') + '|' + q('homeState.level');
q("homeState.sel=null; homeState.level='전체'; homeState.year=2026; renderHomePanel();");
check('손으로 적은 숫자를 화면에 두지 않는다',
  !/<div class="v">1\d\d<\/div>/.test(html) && !/<div class="v">6\d<\/div>/.test(html));
check('큰 숫자가 셈해져 채워진다',
  /^[\d,]+$/.test(String((byId['home-stu-초'] || {}).textContent || '')) &&
  /^[\d,]+$/.test(String((byId['home-stu-고'] || {}).textContent || '')));
check('지금 보고 있는 지역 이름을 적는다',
  String((byId['home-region-name'] || {}).textContent || '').length > 0);
check('연도 슬라이더가 있다', /id="home-year"/.test(html) && /type="range"/.test(html));
check('슬라이더 손잡이가 44px 규칙을 지킨다 (원칙 7번)',
  /::-webkit-slider-thumb\{[^}]*width:22px/.test(html.replace(/\s+/g,'')) ||
  /height:24px/.test(html.replace(/\s+/g,'')));

/* 한 해의 값이 «어디서 왔는가» — 세 갈래를 각각 지킵니다. */
check('2026 은 지도·목록과 «같은 자료»(공시)를 쓴다',
  q("regionStudents(null,'초',2026).kind") === '공시' &&
  q("regionStudents(null,'초',2026).v") === q("SIGUNGU.reduce(function(a,g){return a+BASE['초'][g.s].stu},0)"));
if(q('EDSS')){
  check('2016~2025 는 EDSS 실적을 그대로 쓴다',
    q("regionStudents(null,'초',2020).kind") === '실적' &&
    q("regionStudents(null,'초',2020).v") === q("EDSS.total['초'][EDSS.years.indexOf(2020)]"));
  check('시군도 그 시군의 실적을 쓴다', q(
    "(function(){var g=SIGUNGU[0],i=EDSS.years.indexOf(2020);" +
    "var c=(EDSS.sgg[g.rc]||{})['초']; if(!c) return true;" +
    "return regionStudents(g.s,'초',2020).v === c.s[i];})()"));
}
check('2027~ 는 전망이라고 «이름을 붙인다»',
  q("regionStudents(null,'초',2030).kind") === '전망');
/* ★ 〔2026. 9. 9.〕 여기서 «같은 값을 두 화면이 다르게 말하는 것»을 찾았습니다.
   2036년 경북 학생 수가 현황 탭 130,000명 · 왼쪽 칸 196,936명 — 51.5% 차이.
   현황 탭은 코호트 진급법(백테스트 2.3%), 왼쪽 칸은 감소율 곱셈이었습니다.

   코호트는 «실제 출생아»를 먹고 굴러갑니다. 경북 출생아가 2019년 14,472명에서
   2025년 10,417명으로 떨어졌고 그 아이들이 6년 뒤 초1 이 됩니다. 감소율 곱셈은
   지난 5년 «학생 수» 기울기만 보므로 아직 학교에 오지 않은 감소를 모릅니다.

   그래서 코호트로 맞추고, 그 총량을 시군의 몫대로 나눕니다. 아래 셋이
   한꺼번에 맞아야 합니다. 하나라도 어긋나면 화면이 서로 다른 말을 합니다. */
/* 견줄 때 «비율»이 아니라 «반올림 한계»로 봅니다. 현황 탭은 학교급마다
   천 명 단위로 반올림하므로 학교급 하나에 최대 500명, 셋이면 1,500명까지
   벌어질 수 있습니다. 비율로 재면 자료가 작을 때(검사용 합성값) 같은
   반올림이 큰 비율로 잡혀 엉뚱하게 빨개집니다. */
check('① 도 전체가 «현황 탭»과 같은 수를 말한다 (천 명 반올림 한계 안)', q(
  "(function(){for(var i=0,ys=[2027,2030,2036];i<ys.length;i++){var y=ys[i];" +
  "var home=['초','중','고'].reduce(function(a,lv){var r=regionStudents(null,lv,y);return a+(r.v||0)},0);" +
  "var v=series('stu',y), tab=(v.초+v.중+v.고)*1000;" +
  "if(Math.abs(home-tab) > 1500) return false;}return true;})()"));
check('② 시군을 다 더하면 도 전체가 된다 (반올림 차이 안)', q(
  "(function(){var y=2036;" +
  "var whole=['초','중','고'].reduce(function(a,lv){return a+(regionStudents(null,lv,y).v||0)},0);" +
  "var parts=SIGUNGU.reduce(function(a,g){return a+['초','중','고'].reduce(function(b,lv){" +
  "return b+(regionStudents(g.s,lv,y).v||0)},0)},0);" +
  "return Math.abs(whole-parts) <= 60;})()"));
check('③ 시군 사이 차이는 그 시군의 실측 감소율을 따른다 (몫이 서로 다르다)', q(
  "(function(){var a=forwardShare('울릉','초',2036),b=forwardShare('포항','초',2036);" +
  "return a>0 && b>0 && a!==b;})()"));
check('출생아가 셈에 들어간다 (아직 학교에 오지 않은 감소를 본다)',
  /EDSS\.birth\[y-6\]/.test(js) && /EDSS_FWD_RAW/.test(js));
check('천 명으로 반올림하기 전 값을 쓴다 (명 단위 칸에 91,000 처럼 뭉개지지 않게)',
  /EDSS_FWD_RAW\[y\] = \{ 초:sum/.test(js));
check('실적보다 이른 해는 «비운다» (지어내지 않는다)',
  q("regionStudents(null,'초',2015).v") === null);
check('유치원·특수학교는 해마다의 실적이 없다고 말한다',
  q("regionStudents(null,'유',2020).v") === null && q("regionStudents(null,'특수',2020).v") === null);
q("homeState.level='유'; renderHomeSummary();");
check('그때는 슬라이더를 잠그고 «왜»를 적는다',
  byId['home-year'].disabled === true &&
  /2026년 공시 한 해/.test(String((byId['home-summary-note'] || {}).textContent || '')));
q("homeState.level='전체'; homeState.year=2030; renderHomeSummary();");
check('전망 연도에서는 「몇 명이 될 것이다」로 읽지 말라고 적는다',
  /읽으면 안 됩니다/.test(String((byId['home-summary-note'] || {}).textContent || '')));
check('추이 그림에서 실적은 실선, 전망은 «점선»이다 (한 선이면 이미 일어난 일처럼 보인다)',
  /class="ln proj"/.test(js) && /\.spark \.ln\.proj\{stroke-dasharray/.test(html));
check('얼마나 줄어드는지 한 줄로 적는다 (그림만으로는 안 읽힌다)',
  /줄어듭니다|늘어납니다/.test(js) && /id="home-spark-cap"/.test(html));

/* 지도 딱지가 연도를 따를 때와 안 따를 때 */
q("homeState.metric='stu'; homeState.year=2026;");
check('2026 에서는 딱지도 공시 자료를 쓴다 (목록과 어긋나지 않게)',
  q('sggBubbleYearApplies()') === false);
q("homeState.year=2032;");
check('다른 해에서는 딱지가 그 해를 따른다', q('sggBubbleYearApplies()') === true);
check('줄어드는 자료이므로 2032 딱지가 2026 보다 작다', q(
  "(function(){var a=sggBubbleRows().reduce(function(s,r){return s+r.stu},0);" +
  "homeState.year=2026; var b=sggBubbleRows().reduce(function(s,r){return s+r.stu},0);" +
  "homeState.year=2032; return a<b;})()"));
q("homeState.metric='sch';");
check('학교 수를 볼 때는 연도를 따르지 않는다 (해마다의 실적이 없다)',
  q('sggBubbleYearApplies()') === false);

/* ★ 지도 상태줄은 «어느 해»인지 반드시 말해야 합니다.
   그리고 이 검사는 renderSgisTierNote 를 «실제로 실행»합니다 —
   지도 없이도 도는 함수라, 여기서 돌려 보면 이름을 잘못 쓴 것이 드러납니다.
   (실제로 뉴스 스코프 전용 esc() 를 부르고 있던 것을 이 방식으로 잡았습니다.) */
q("homeState.metric='stu'; homeState.year=2032; renderSgisTierNote();");
check('시군 단계 상태줄이 «어느 해»인지 말한다',
  /2032년/.test(String((byId['sgis-status'] || {}).textContent || '')));
check('범례에도 기준 해를 적는다', /2032년/.test((byId['home-legend'] || {})._html || ''));
q("homeState.year=" + ySaved.split('|')[0] + "; homeState.level='" + ySaved.split('|')[1] + "'; homeState.metric='sch'; renderHomePanel();");

console.log('\n■ 학교 한 곳도 «그 해»를 말할 수 있다');
/* ★ 〔2026. 9. 9.〕 EDSS 는 학교×학년×연도로 주는데, 굽는 과정에서 시군으로
   접히고 학교 단위는 어디에도 남지 않았습니다. 새로 신청할 API 가 없고
   접기 전에 한 벌 떠 두기만 하면 되는 자료였습니다.

   여기서 지키는 것은 «심기 전에도 화면이 예전 그대로 도는가» 입니다.
   EDSS 때 세운 규칙과 같습니다 — 자료가 없는데 있는 척하는 갈래가
   하나도 없어야 합니다. */
check('학교별 실적을 읽는 관문이 있다',
  /typeof EDSS_SCHOOL !== 'undefined'/.test(js) && /function schoolHistoryReady/.test(js));
check('관문이 3년 미만이면 켜지지 않는다', /EDSS_SCHOOL_YS\.length >= 3/.test(js));
check('빈 칸을 0 이 아니라 null 로 되살린다 (0 과 「모름」은 다르다)',
  /v === '' \? null : Number\(v\)/.test(js));
check('굽는 쪽과 «같은 키»로 잇는다 (이음 규칙을 둘로 만들지 않는다)',
  /histBy\[rc\+'\|'\+f\[1\]\+'\|'\+f\[0\]\]/.test(js) && /stuBy\[rc\+'\|'\+f\[1\]\+'\|'\+f\[0\]\]/.test(js));
check('학교마다 제 감소율을 재지 않고 시군 감소율을 쓴다 (통폐합 한 번에 0 명이 되지 않게)',
  /BASE\[sc\.lv\]\s*&&\s*BASE\[sc\.lv\]\[sc\.s\]/.test(js) && /1 - b\.rate/.test(js));

q("homeState.year=2026;");
check('2026 은 학교도 공시 자료를 그대로 쓴다', q(
  "(function(){var s=SCHOOLS.filter(function(x){return x.stu!=null})[0];" +
  "var r=schoolStudentsAt(s,2026); return r.kind==='공시' && r.v===s.stu;})()"));
check('2030 은 전망이라고 이름을 붙이고 2026 보다 작다', q(
  "(function(){var s=SCHOOLS.filter(function(x){return x.stu>50&&BASE[x.lv]&&BASE[x.lv][x.s]&&BASE[x.lv][x.s].rate>0})[0];" +
  "if(!s) return true; var r=schoolStudentsAt(s,2030);" +
  "return r.kind==='전망' && r.v < s.stu;})()"));

if(q('typeof EDSS_SCHOOL')==='undefined'){
  /* 아직 굽기 전입니다. 이 갈래가 «조용히» 도는 것이 중요합니다. */
  check('심기 전에는 학교 실적 관문이 꺼져 있다', q('schoolHistoryReady()') === false);
  check('심기 전에는 지난 해를 묻지 않는다 (지어내지 않는다)',
    q("schoolStudentsAt(SCHOOLS[0],2020).v") === null);
  /* 유치원·특수학교는 SCHOOL_RAW 밖의 «다른 배열»이라 이 자리가 없습니다.
     EDSS 유초중등 두 표가 초·중·고 중심이라 애초에 실적도 오지 않습니다.
     그래서 자리를 억지로 만들지 않고, 없어도 조용히 도는 것을 지킵니다. */
  check('초·중·고에는 hist 자리가 있다 (null 로)',
    q("SCHOOLS.filter(function(s){return ['초','중','고'].indexOf(s.lv)>=0}).every(function(s){return 'hist' in s})") === true);
  check('유치원·특수학교는 그 자리가 없어도 조용히 돈다',
    q("(function(){var s=SCHOOLS.filter(function(x){return x.lv==='유'})[0];" +
      "return !s || schoolStudentsAt(s,2020).v===null;})()") === true);
  check('심기 전 2026 은 예전 그대로다', q(
    "(function(){var s=SCHOOLS.filter(function(x){return x.stu!=null})[0];" +
    "return schoolStudentsAt(s,2026).v===s.stu;})()"));
}else{
  check('심은 뒤에는 학교 실적 관문이 켜진다', q('schoolHistoryReady()') === true);
  check('심은 해는 실적을 그대로 쓴다', q(
    "(function(){var s=SCHOOLS.filter(function(x){return x.hist&&x.hist.s.some(function(v){return v!=null})})[0];" +
    "if(!s) return false; var i=EDSS_SCHOOL_YS.findIndex(function(y,k){return s.hist.s[k]!=null});" +
    "var r=schoolStudentsAt(s,EDSS_SCHOOL_YS[i]); return r.kind==='실적' && r.v===s.hist.s[i];})()"));
  check('그 해 자료가 없는 학교는 «비운다» (아직 없던 학교이거나 문 닫은 뒤)', q(
    "(function(){var s=SCHOOLS.filter(function(x){return x.hist&&x.hist.s.some(function(v){return v==null})})[0];" +
    "if(!s) return true; var i=s.hist.s.indexOf(null);" +
    "return schoolStudentsAt(s,EDSS_SCHOOL_YS[i]).v===null;})()"));
}

check('말풍선이 «어느 해»의 수인지 밝힌다', /년 \$\{htmlEsc\(at\.kind\)\} · 학생/.test(js));
check('다른 해에는 학급을 함께 적지 않는다 (2026 학급이 그 해 학급으로 읽힌다)',
  /학급 시계열은 심지만 아직 화면이/.test(js));
check('학교 단계 상태줄도 기준 해를 적는다', /const yw = byYear/.test(js));
check('2026 으로 «돌아올» 때도 한 번은 다시 그린다', /wasSchoolYear/.test(js));
q("homeState.year=2026; renderHomePanel();");

console.log('\n■ 목록이 전부를 보여 줄 수 있다');
/* ★ 〔2026. 9. 7.〕 120 이 «천장»이었습니다 — 화면에 474곳이 있어도 120곳만
   나오고 나머지는 볼 길이 아예 없었습니다. 「어떤 기준으로 고른 120곳인지
   모르겠다」는 말을 들었습니다. 이제는 «처음에 접어 두는 수»일 뿐입니다.
   1,539곳을 다 그려도 67ms 라 막을 까닭이 없습니다. */
check('처음에 접어 두는 수가 있다 (천장이 아니라)',
  /ONLINE_SCHOOL_LIST_LIMIT = \d+/.test(js) && /let onlineListExpanded/.test(js));
check('펼치면 자른 목록이 아니라 «전부»를 그린다',
  /onlineListExpanded\) \? visible\.slice\(0, ONLINE_SCHOOL_LIST_LIMIT\) : visible/.test(js));
check('더 보기 단추가 있다', /id="home-online-more"/.test(html));
check('몇 곳이 더 있는지 수를 적는다', /나머지 \$\{fmt\(visible\.length - ONLINE_SCHOOL_LIST_LIMIT\)\}곳 더 보기/.test(js));
check('다시 접을 수 있다', /처음 \$\{ONLINE_SCHOOL_LIST_LIMIT\}곳만 보기/.test(js));
check('«무슨 차례로» 고른 것인지 적는다 (기준을 모르겠다는 말을 들었다)',
  /학생 수 많은 차례/.test(js));
check('펼침 상태를 스크린리더에도 알린다', /aria-expanded/.test(js));

console.log('\n■ 지도 측정 단추 — 이름을 밝히고, 잰 것이 보이게 한다');
/* ★ 〔2026. 9. 7.〕 지도 오른쪽 아래 세 단추는 «우리가 만든 것이 아닙니다».
   sop.map() 에 옵션을 안 주면 measureControl 이 기본으로 켜져 딸려 옵니다.
   셋 다 title 이 없어 「자 밑에는 뭔지 모르겠다」는 말을 들었습니다.
   그리고 잰 선(그림층 z-index 4)이 학교 마커(마커층 6)에 파묻혀
   「재기는 되는데 표시가 안 된다」로 보였습니다. */
const measureFn = (js.match(/function tidySgisMeasureControls\(\)[\s\S]*?\n\}/) || [''])[0];
check('측정 단추를 손보는 갈래가 있다', measureFn.length > 0);
check('거리 재기에 이름표를 단다',
  /dist\.title = '거리 재기/.test(measureFn) && /aria-label', '거리 재기'/.test(measureFn));
check('지우기에도 이름표를 단다',
  /clear\.title = '잰 거리를 지웁니다'/.test(measureFn));
check('면적 재기는 감춘다 (학령인구 대시보드에서 잴 일이 없다)',
  /area\.classList\.add\('measure-hidden'\)/.test(measureFn) &&
  /\.online-map \.measure-hidden\{display:none/.test(html));
check('감추되 «지우지»는 않는다 (라이브러리가 자기 목록에서 찾다가 넘어진다)',
  !/area\.remove\(\)/.test(measureFn) && !/removeChild\(area\)/.test(measureFn));
check('재는 동안 학교 마커가 물러난다',
  /\.online-map\.measuring \.marker-cluster/.test(html) && /opacity:\.18/.test(html));
check('물러날 때 클릭도 비켜 준다 (안 그러면 점이 안 찍히고 말풍선이 뜬다)',
  /\.online-map\.measuring[\s\S]{0,160}pointer-events:none/.test(html));
check('«잰 것이 남아 있는 동안»에도 물러나 있는다 (마치면 결과를 읽어야 한다)',
  /잰것남음 = !!map\.querySelector\('\.sop-caption/.test(measureFn));
check('마커를 지우지 않고 흐리게만 둔다 (어디에 학교가 있는지는 보여야 한다)',
  !/display:none[^}]*marker-cluster/.test(html));
check('「✕」가 마지막 숫자를 덮지 않게 비킨다',
  /\.sop-distance-delete\{margin-left:\d+px !important/.test(html));
check('자리잡기용 transform 은 건드리지 않는다 (덮어쓰면 엉뚱한 곳으로 간다)',
  !/sop-distance-delete\{[^}]*transform/.test(html));

console.log('\n■ 학교를 본 뒤 «보던 자리»로 돌아온다');
/* ★ 〔2026. 9. 7.〕 나오는 길이 「← 경북 전체로」뿐이었습니다. 그것은 «처음»으로
   가는 것이지 «보던 자리»로 가는 것이 아닙니다. 구미를 살펴보다 학교 하나를
   들여다본 사람은 다시 구미까지 손으로 찾아 들어가야 했습니다.
   브라우저 뒤로 가기는 이 앱을 통째로 떠납니다 — 더 나쁩니다. */
check('되돌아갈 자리를 한 칸 기억한다', /let mapReturn/.test(js) && /function captureMapView/.test(js));
check('떠나기 «직전»에 기억한다', /rememberMapView\(\);\s*\/\/ ← 떠나기/.test(js));
check('되돌리는 갈래가 있다', /function restoreMapView/.test(js));
check('단추가 있다', /id="home-map-back"/.test(html) && /onEl\('home-map-back', 'click', restoreMapView\)/.test(js));
check('실제 위치 지도는 중심과 배율을 함께 되돌린다',
  /sgisMap\.setView\(v\.center, v\.zoom\)/.test(js));
check('간편 지도는 «시군»까지 되돌린다 (다른 시군 학교를 봤을 수 있다)',
  /if\(v\.sel && homeState\.sel !== v\.sel\)\{ selectSigungu\(v\.sel\)/.test(js));
check('「경북 전체로」 를 누르면 돌아갈 자리는 뜻을 잃는다',
  /clearMapReturn\(\);\s*\/\/ «처음»으로/.test(js));
check('지도 종류가 바뀌면 좌표계가 달라 버린다',
  /if\(homeState\.mapMode !== mode\) clearMapReturn\(\)/.test(js));
check('조건 밖 학교로 보내면 지도에 «없는» 채로 두지 않는다',
  /if\(!sgisMarkers\.has\(schoolKey\(s\)\)\)\{[\s\S]*?homeState\.sel = null/.test(js));

console.log('\n■ 내보내기가 화면과 같은 수를 말한다');
check('특수교육 요약이 화면과 같은 배치유형 총계를 쓴다',
  /sum\.push\(\['특수교육대상자',P\.total/.test(js));
check('다문화 수가 내보내기에 들어간다 (예전에는 「미확보」만 적혔다)',
  /name:'다문화학생'/.test(js) && !/\['다문화','미확보'/.test(js));
check('폐교 화면도 자기 자료를 내보낸다',
  /function closedExportSheets/.test(js) && /name:'폐교목록'/.test(js) &&
  !/sheets=\[\{name:'안내',title:'폐교 활용 현황'/.test(js));

console.log('\n■ EDSS 실적 연결');
check('실적 여부를 한 곳에서만 판단한다',
  (CODE_ONLY.match(/typeof EDSS_YEARS !== 'undefined'/g) || []).length === 1);
check('실적이 세 해 미만이면 켜지 않는다 (두 점으로는 진급률이 안 나온다)',
  /EDSS_YEARS\.length >= 3/.test(CODE_ONLY));

if (q('!!EDSS')) {
  const first = q('EDSS.first'), last = q('EDSS.last');
  check('실적 연도는 심은 값을 그대로 쓴다',
    q(`series('stu',${last}).초`) === Math.round(q("EDSS.total['초'][EDSS.years.length-1]") / 1000));
  check('실적 첫 해도 앵커가 아니라 실적이다',
    q(`series('stu',${first}).초`) === Math.round(q("EDSS.total['초'][0]") / 1000));
  check('실적 다음 해부터는 코호트로 굴린다', q(`edssForward(${last + 1}) !== null`));
  check('줄어드는 자료인데 전망이 늘지 않는다',
    q(`series('stu',${last + 5}).초 <= series('stu',${last}).초`));
  check('감소율이 그 시군의 실측값이다', q(
    "(function(){var k=Object.keys(EDSS.rate)[0];if(!k)return false;" +
    "var sg=SIGUNGU.filter(function(s){return s.rc===k})[0];if(!sg)return false;" +
    "return Math.abs(declineRate(sg,'초')-Math.max(-0.03,Math.min(0.11,EDSS.rate[k]['초'])))<1e-9;})()"));
  check('설명이 「가정」에서 「실측」으로 바뀐다', q('RATE_WORD') === '실측 감소율');
  check('출처 표 문구도 함께 바뀐다', /교육통계 실적/.test((byId['q-series-note'] || {})._html || ''));
} else {
  check('실적이 없으면 EDSS 는 null 이다', q('EDSS') === null);
  check('실적이 없으면 앵커로 이어 그린다', q("series('stu',2020).초") > 0);
  check('실적이 없으면 감소율은 가정값이라고 말한다', q('RATE_WORD') === '가정한 감소율');
  check('실적이 없으면 설명을 건드리지 않는다', ((byId['q-series-note'] || {})._html || '') === '');
  check('군 지역이 시 지역보다 가파르다고 가정한다', q(
    "(function(){var g=SIGUNGU.filter(function(s){return s.type==='군'})[0]," +
    "si=SIGUNGU.filter(function(s){return s.type==='시'})[0];" +
    "return !!g&&!!si&&declineRate(g,'초')>declineRate(si,'초');})()"));
  check('앞으로 갈수록 학생이 준다', q("series('stu',2030).초 < series('stu',2026).초"));
  check('실적이 없으면 코호트 함수가 조용히 null 을 준다', q('edssForward(2030)') === null);
}

console.log('\n■ 세 화면이 «한 가지 셈»으로 앞날을 말한다');
/* ★ 〔2026. 9. 10.〕 「학생수 시뮬레이터」가 감소율 곱셈을 쓰고 있어
   2036년 경북 학생 수를 196,935명이라고 말했습니다. 같은 해를 「경북 학령인구
   현황」 탭은 130,000명이라고 말했습니다 — **51.5% 차이**.

   코호트는 실제 출생아를 먹고 굴러갑니다(2019년 14,472명 → 2025년 10,417명).
   감소율 곱셈은 지난 5년 학생 수 기울기만 보므로 아직 학교에 오지 않은
   감소를 모릅니다. 백테스트 2.3% 로 되짚어 본 코호트 쪽에 맞췄습니다. */
check('시뮬레이터가 감소율 곱셈을 더 쓰지 않는다',
  !/b\.stu\s*\*\s*Math\.pow\(1-BASE\[lv\]\[sg\.s\]\.rate/.test(js));
check('시뮬레이터도 종합 대시보드와 «같은 함수»를 쓴다',
  /function simForward/.test(js) && /return forwardStudents\(sggKey, lv, year\)/.test(js));
check('시뮬레이터와 현황 탭이 같은 수를 말한다 (천 명 반올림 한계 안)', q(
  "(function(){var ys=[2030,2036];for(var i=0;i<ys.length;i++){var y=ys[i];" +
  "var s=0;SIGUNGU.forEach(function(g){['초','중','고'].forEach(function(lv){s+=simForward(g.s,lv,y)})});" +
  "var v=series('stu',y),tab=(v.초+v.중+v.고)*1000;" +
  "if(Math.abs(Math.round(s)-tab) > 1500) return false;}return true;})()"));
check('기준연도 이하는 굴리지 않고 그해 값을 그대로 쓴다',
  q("simForward('포항','초',2026)") === q("BASE['초']['포항'].stu"));

console.log('\n■ 추이선이 실적과 전망을 가른다');
/* 2016~2025 는 일어난 일이고 2027~2036 은 아직 안 일어난 일인데 한 선이었습니다.
   「현재」 세로 점선 하나뿐이라 2036년 값이 실적처럼 보였습니다. */
check('실적과 전망을 두 선으로 나눠 그린다',
  /const realPts = points\.filter/.test(js) && /const projPts = points\.filter/.test(js));
check('전망은 점선이다 (색만으로 가르지 않는다)', /stroke-dasharray="6 4"/.test(js));
check('2026 을 겹쳐 선이 끊기지 않게 한다', /p\.yr >= BASE_Y/.test(js));
check('무엇이 실적이고 무엇이 전망인지 «글자로도» 적는다',
  /전망 \(아직 일어나지 않은 일\)/.test(js) && /실적</.test(js));


console.log('\n■ 「지도로 보기」가 화면을 통째로 쓴다');
/* 종합 대시보드의 지도 칸은 요약용이라 좁습니다. 자세히 볼 자리를 따로 둡니다.
   SGIS 위에 브이월드를 얹으려다 두 번 빈 화면을 봤고, MapLibre 로 갈아탔습니다. */
check('메뉴에 「지도로 보기」가 있다', /data-view="map"/.test(html));
check('그 화면이 실제로 있다', /id="view-map"/.test(html));
check('좌우 가장자리까지 쓴다 (본문 여백을 도로 물린다)',
  /\.mapview\{[^}]*margin:0 -24px/.test(html));
/* 위쪽에는 「사용 안내·인쇄」 줄이 있어 덮으면 안 됩니다. 머리글 높이는 글자 크기와
   창 너비에 따라 달라져 식으로는 어긋납니다 — 실제로 재서 넣습니다. */
check('높이는 식으로 셈하지 않고 실제로 재서 넣는다',
  /function mvFit\(\)/.test(js) && /box\.getBoundingClientRect\(\)\.top/.test(js) &&
  /window\.innerHeight - top/.test(js));
check('창 크기가 바뀌면 다시 잰다', /activeView === 'map'\) mvFit\(\)/.test(js));
check('지도 화면에서는 본문 아래 여백을 없앤다',
  /\.main\.is-map\{padding-bottom:0\}/.test(html) && /classList\.toggle\('is-map', name === 'map'\)/.test(js));
check('지도를 기다리는 동안에도 왼쪽 칸은 채워 둔다 (빈 상자는 「고장」으로 읽힌다)',
  /mvRenderStats\(\);\s+\/\* 지도를 기다리는 동안/.test(js));
check('화면을 열 때만 MapLibre 를 부른다 (다른 화면에 800KB 를 지우지 않는다)',
  /function mvLoadLib\(\)/.test(js) && /js\.src = '\.\/vendor\/maplibre-gl\.js'/.test(js) &&
  /name === 'map' && typeof mvOpen === 'function'/.test(js));
check('라이브러리를 못 받으면 그렇다고 말한다 (조용히 빈 화면이 되지 않는다)',
  /지도 라이브러리를 불러오지 못했습니다/.test(js));
check('인증키는 HTML 에 없고 서버에서 받는다',
  /fetch\('\/api\/vworld-key'\)/.test(js) && !/VWORLD_API_KEY\s*=\s*'/.test(js));
check('키가 없어도 학교와 경계는 그린다', /학교 위치와 시군 경계는 그대로입니다/.test(js));
check('배경지도가 없는 까닭을 «늘» 붙여 둔다 (한 번 움직이면 지워지면 안 된다)',
  /\(MV\.ready && !MV\.key\)\s*\n?\s*\? '배경지도 없음/.test(js));
/* 오래된 업무용 PC·원격 데스크톱에는 WebGL 이 없습니다. 감싸지 않으면
   「불러오는 중」에서 영영 멈춘 것처럼 보입니다. */
check('WebGL 이 없어도 멈춘 것처럼 보이지 않는다',
  /WebGL 없음/.test(js) && /try\{\s*map = new maplibregl\.Map/.test(js));

console.log('\n■ 배율에 따라 세는 단위가 바뀐다');
check('시군 → 점 → 이름 세 단계다', q("[mvTier(8), mvTier(10), mvTier(12)]").join() === 'sgg,pin,label');
check('이름이 서는 문턱이 10.6 이다 (11.8 은 너무 높아 안 바뀌어 보였다)',
  q("mvTier(10.5)") === 'pin' && q("mvTier(10.7)") === 'label');
/* ★ 배율 안내 띠는 지웠습니다 〔2026. 9. 10.〕 지도를 움직일 때마다 아래쪽에
   띠가 떠서 지도를 가렸습니다. 몇 곳이 보이는지는 목록 제목이 이미 말합니다. */
check('배율 안내 띠로 지도를 가리지 않는다', !/배율 \$\{z\.toFixed\(1\)\}/.test(js));
check('할 말이 없으면 상태줄을 아예 치운다', /el\.hidden = !txt/.test(js));

console.log('\n■ 학교를 누르면 왼쪽 칸에 그 학교가 펼쳐진다');
/* 「학교를 눌렀을 때 왼쪽에 자세한 정보가 안 뜬다」는 말을 듣고 붙인 자리입니다. */
check('상세 자리가 있다', /id="mv-detail-card"/.test(html));
check('종합 대시보드와 «같은 카드»를 쓴다 (두 벌을 만들지 않는다)',
  /function schoolCardHtml\(sc, year, closeId\)/.test(js) &&
  /schoolCardHtml\(sc, homeState\.year, 'home-school-close'\)/.test(js) &&
  /schoolCardHtml\(sc, MV\.year, 'mv-school-close'\)/.test(js));
check('카드가 실제로 내용을 돌려준다 (return 뒤 줄바꿈이면 빈 값이 된다)',
  /class="sch-name"/.test(q("(function(){var s=SCHOOLS.filter(function(x){return x.grades&&x.grades.length})[0];return schoolCardHtml(s,2026,'t');})()")));
check('보는 해가 화면마다 달라도 된다 (해를 받아서 쓴다)',
  q("(function(){var s=SCHOOLS.filter(function(x){return x.grades&&x.grades.length})[0];return schoolCardHtml(s,2031,'t').indexOf('2031년')>=0;})()") === true);
check('학교를 고르면 두 화면이 함께 바뀐다',
  /typeof mvRenderDetail === 'function'/.test(js));

console.log('\n■ 옮겨 붙인 것들이 다 붙었다');
check('폐교 겹쳐 보기', /id="mv-closed"/.test(html) && /function mvDrawClosed/.test(js) &&
  /closedMapRows\(\)/.test(js));
check('연도 슬라이더', /id="mv-year"/.test(html) && /MV\.year = Number\(yr\.value\)/.test(js));
check('연도가 학생 수를 바꾼다 (2026 공시 · 그 밖엔 실적·전망)',
  /function mvStu\(sc\)\{ const r = schoolStudentsAt\(sc, MV\.year\)/.test(js));
check('학교 검색', /id="mv-search"/.test(html) && /String\(s\.name\)\.indexOf\(q\)/.test(js));
check('검색은 «경북 전체»에서 찾는다 (화면 안에서만 찾으면 뜻이 없다)',
  /const pool = searching \? mvPool\(\) : vis;/.test(js));
/* 화면 안에 1,528곳이 있어도 목록에는 150곳만 넣습니다. 그렇게 자를 거면
   무엇을 어떤 순서로 자르는지 화면이 말해야 합니다. */
check('몇 곳이 무슨 기준으로 보이는지 밝힌다',
  /MV_LIST_MAX = 150/.test(js) && /id="mv-list-rule"/.test(html) &&
  /'학생 많은 순'/.test(js) && /곳까지 보입니다/.test(js));
check('이름·시군·학생 수를 각자의 칸에 둔다 (서로 붙어 읽히지 않게)',
  /grid-template-columns:3px minmax\(0,1fr\) auto/.test(html) &&
  /<span class="nm">/.test(js) && /<span class="num">/.test(js));

console.log('\n■ 왼쪽 큰 숫자가 지도를 따라간다');
/* 지도를 안동으로 옮겨도 왼쪽 큰 숫자가 「경북 전체」로 굳어 있었습니다.
   지도와 왼쪽 칸이 다른 것을 보고 있으면, 안동을 보면서 경북의 수를 읽습니다. */
check('화면 안에 있는 학교만 센다', /function mvInView/.test(js) &&
  /const list = searching \? pool : mvInView\(pool\)/.test(js));
check('어느 시군을 보고 있는지 제목에 적는다', /function mvWhere/.test(js) &&
  /\$\{where\} \$\{lvName\}학생 수/.test(js));
check('여러 시군이 걸치면 개수로 말한다', /ks\.length \+ '개 시군'/.test(js));
check('지도를 옮기면 큰 숫자도 다시 센다', /mvRenderStats\(\);\s+\/\* 지도를 옮기면/.test(js));
check('화면이 다 담고 있으면 「경북 전체」라 부른다 (21개 시군이라 하지 않는다)',
  /if\(!pool \|\| list\.length === pool\.length\) return null/.test(js));
check('무엇을 센 것인지 밝힌다 (화면 안 기준)', /화면 안<\/b> 기준/.test(js));

console.log('\n■ 지도가 다 뜬 뒤에도 「불러오는 중」이 남지 않는다');
/* 배율 안내를 뺀 뒤로 이 말을 지우는 사람이 없어졌습니다. */
check('다 뜨면 상태줄을 비운다', /「불러오는 중입니다」를 지웁니다/.test(js) &&
  /mvSay\(''\);/.test(js));
check('시군 경계 — 간편 지도와 «같은 자료»를 쓴다',
  /id="mv-bound"/.test(html) && /function mvBoundGeo/.test(js) && /gbRings\(GB\[k\]\)/.test(js));
check('경계가 실제 위경도로 펴진다', q(
  "(function(){var f=mvBoundGeo().features;if(!f.length)return false;" +
  "var c=f[0].geometry.coordinates[0];return c[0]>124&&c[0]<132&&c[1]>34&&c[1]<38;})()") === true);
check('거리 재기 — SGIS 가 주던 자를 새로 만들었다',
  /id="mv-ruler"/.test(html) && /function mvRulerAdd/.test(js) && /function mvRulerLegs/.test(js));
/* 통학 길은 한 번에 곧게 가지 않습니다 — 꺾이는 자리마다 찍어야 실제에 가까워집니다. */
check('점을 여러 개 찍을 수 있다 (두 개로 끊지 않는다)',
  !/if\(MV\.rulerPts\.length >= 2\) MV\.rulerPts = \[\]/.test(js) &&
  /MV\.rulerPts\.push/.test(js));
check('구간마다 거리를 적고 합을 낸다',
  /legs\.reduce\(\(a, l\) => a \+ l\.km, 0\)/.test(js) && /합 \$\{mvKm\(total\)\}/.test(js));
check('되돌리기와 지우기가 있다',
  /id="mv-ruler-undo"/.test(html) && /id="mv-ruler-clear"/.test(html) &&
  /function mvRulerUndo/.test(js));
/* 지도 안에 글자를 세우려면 style 에 glyphs(글꼴 서버) 주소가 있어야 합니다.
   우리는 그런 서버를 두지 않습니다 — 번호는 DOM 딱지로 그립니다. */
check('찍은 차례를 번호로 적는다', /el\.className = 'mv-rpt'/.test(js) && /\.mv-rpt\{/.test(html));
check('없는 글꼴 서버에 기대지 않는다', !/'text-field'/.test(js));
check('찍은 자리가 학교 이름표에 가리지 않는다', /el\.style\.zIndex = '600'/.test(js));
check('지도가 뜨기 전에 켜도 선을 잃지 않는다',
  /map\.once\('idle', mvRulerShapes\)/.test(js));
check('글은 지도가 뜨기 전에도 적힌다', /function mvRulerText/.test(js) && /function mvRulerShapes/.test(js));
check('학교 두 곳을 눌러 잰다 (통학 거리를 가늠하는 자리)',
  /mvRulerAdd\(sc\.lon, sc\.lat, sc\.name\);/.test(js));
/* ★ 딱지는 지도 안의 DOM 이라, 누르면 이 리스너가 학교 자리를 찍고 그 누름이
   지도까지 올라가 「누른 자리」를 한 번 더 찍었습니다. 두 학교를 눌렀는데
   점이 넷이 되고 사이에 엉뚱한 자리가 끼어 거리도 어긋났습니다. */
check('학교를 누르면 점이 «한 번»만 찍힌다', /ev\.stopPropagation\(\);\s*\n\s*mvRulerAdd/.test(js));
check('직선거리임을 밝힌다 (산을 넘는 길은 더 멀다)', /산을 넘는 길은 이보다 멉니다/.test(js));
check('잰 값을 왼쪽 칸에도 남긴다 (상태줄은 지도를 한 번 움직이면 지워진다)',
  /id="mv-ruler-out"/.test(html) && /out\.hidden = false/.test(js));
console.log('\n■ 그 해에 없는 수를 「–」로 보여 주지 않는다');
/* 학급 수는 2026년 공시에만 있습니다. 다른 해에 「학급당 –」은 고장으로 읽힙니다. */
check('학급 수가 없는 해에는 「학교당」으로 바꿔 말한다',
  /학교당<\/div><div class="v">\$\{b\.n \? Math\.round\(b\.stu \/ b\.n\)/.test(js));
/* 초·중·고를 한 덩어리로 더하면 「25만」 하나만 남습니다. 그 수로는 어느 급이
   먼저 무너지는지 알 수 없습니다 — 종합 대시보드가 나눠 보여 주는 까닭과 같습니다. */
check('경북 전체는 학교급을 갈라서 보여 준다',
  /HOME_SERIES_LEVELS\.map\(l =>/.test(js) && /box\.className = 'stat-row'/.test(js));
check('유치원·특수학교는 초·중·고에 더하지 않고 따로 적는다',
  /유치원 <b>\$\{fmt\(by\['유'\]\.stu\)\}<\/b>/.test(js) &&
  /특수학교 <b>\$\{fmt\(by\['특수'\]\.stu\)\}<\/b>/.test(js));
check('큰 학교의 이름표가 작은 학교에 가리지 않는다',
  /String\(Math\.min\(400, Math\.round\(\(mvStu\(sc\) \|\| 0\) \/ 5\)\)\)/.test(js));
/* 누른 것이 뒤에 가리면, 눌렀는데 아무 일도 안 일어난 것처럼 보입니다. */
check('고른 학교는 무조건 맨 앞이다', /const picked = selectedSchoolKey && schoolKey\(sc\) === selectedSchoolKey/.test(js) &&
  /picked \? '800'/.test(js));
check('다시 그리지 않고 차례만 바꾼다 (다시 만들면 말풍선이 닫힌다)',
  /if\(on\) m\._el\.style\.zIndex = '800'/.test(js));
check('재는 동안에는 말풍선을 떼어 둔다 (누르면 재는 점이 된다)',
  /if\(!MV\.ruler\) mk\.setPopup/.test(js));

console.log('\n■ 왼쪽 칸을 접으면 지도가 넓어진다');
/* ★ 처음에는 카드를 하나씩 접게 했습니다. 그런데 다 접어도 지도가 넓어지지
   않았습니다 — 칸의 너비가 그대로였기 때문입니다. 접는 뜻은 자리를 아끼는 것이
   아니라 «지도를 넓게 보는 것»이었습니다. */
/* ★ 칸을 숨기면 지도가 «첫 칸»이 됩니다. `0 minmax(0,1fr)` 로 두면 지도가
   그 0 짜리 칸에 들어가 손톱만 해집니다 — 접었을 때는 칸이 하나입니다. */
check('접으면 칸이 차지하던 너비를 지도가 가져간다',
  /\.mapview\.side-off\{grid-template-columns:minmax\(0,1fr\)\}/.test(html) &&
  /\.mapview\.side-off \.mv-side\{display:none\}/.test(html));
check('단추는 지도 «위»에 둔다 (칸 안에 두면 접은 뒤 함께 사라진다)',
  /\.mv-fold-side\{position:absolute/.test(html) &&
  /<button type="button" class="mv-fold-side" id="mv-side-toggle"/.test(html));
check('접힌 상태를 화면 읽기 도구도 안다',
  /aria-expanded="true" aria-controls="mv-side"/.test(html) &&
  /btn\.setAttribute\('aria-expanded', String\(!!open\)\)/.test(js));
check('접은 자리는 이 브라우저에 남는다',
  /MV_SIDE_KEY = 'leap-map-side-v1'/.test(js) && /localStorage\.setItem\(MV_SIDE_KEY/.test(js));
check('접으면 지도에 다시 재라고 말한다', /mvSetSide[\s\S]{0,700}?MV\.map\.resize\(\)/.test(js));
/* 카드마다 손잡이를 달았을 때, 제목이 없는 카드에서는 화살표가 맨 앞 칸을
   가로채 엉뚱한 자리에 섰습니다. 손잡이가 하나면 그런 어긋남이 없습니다. */
check('카드마다 접는 손잡이는 두지 않는다',
  !/class="mv-fold"/.test(html) && !/mvWireFolds/.test(js));

console.log('\n■ Shift 를 누르고 끌면 지도가 돌아간다');
/* MapLibre 가 본디 주는 길(오른쪽 단추 끌기·Ctrl+끌기)은 업무용 노트북에서
   손에 익지 않습니다. Shift+끌기는 본디 상자 확대에 묶여 있어 먼저 풉니다. */
check('상자 확대를 풀고 그 자리에 돌리기를 건다',
  /map\.boxZoom\.disable\(\)/.test(js) && /function mvWireRotate/.test(js));
check('좌우는 방위, 위아래는 기울기다',
  /map\.setBearing\(g\.b - \(e\.clientX - g\.x\)/.test(js) &&
  /map\.setPitch\(Math\.max\(0, Math\.min\(75, g\.p \+ \(e\.clientY - g\.y\)/.test(js));
check('끄는 동안 지도가 함께 밀리지 않는다', /map\.dragPan\.disable\(\)/.test(js));
/* 설명 문구는 뺐습니다 — 「굳이 설명 안 해도 알아서 잘 한다」는 말을 들었습니다.
   글이 차지하던 자리를 지도와 목록에 돌려줍니다. */
check('설명 문구로 칸을 채우지 않는다', !/Shift<\/b> 를 누른 채 끌면/.test(html));

console.log('\n■ 위쪽 단추 줄과 지도 조작판이 겹치지 않는다');
/* 「사용 안내·인쇄」 줄은 position:absolute 라 자리를 차지하지 않습니다.
   그래서 지도가 그 밑으로 파고들어 확대·축소 단추와 겹쳤습니다. */
check('그 줄이 끝나는 자리를 재서 그만큼 내려 놓는다',
  /tools\.getBoundingClientRect\(\)\.bottom \+ 12/.test(js) &&
  /box\.style\.marginTop/.test(js));

console.log('\n■ 학교 학생 수 추이에 눈금이 있다');
/* 선 하나만 있으면 「올라갔다·내려갔다」는 보이는데 «얼마나»가 안 보입니다. */
check('가로 눈금과 그 값을 적는다', /class="ax" x="\$\{PL-5\}"/.test(js) && /const rows = \(mx === mn \? \[mx\] : \[mx, mid, mn\]\)/.test(js));
check('해마다 세로 눈금을 세운다', /class="gl vt"/.test(js));
check('양 끝에 점을 찍는다', /class="dot" cx="\$\{X\(last\.y\)/.test(js));
/* 아래 축에 첫해와 끝해만 있으면 «언제» 꺾였는지 알 수 없습니다. 학교마다
   꺾이는 해가 다르고, 그 해가 이 학교의 이야기입니다. */
check('가장 크게 움직인 해를 짚는다',
  /Math\.abs\(dv\) > Math\.abs\(jump\.dv\)/.test(js) && /class="jt"/.test(js));
check('첫해·끝해와 붙으면 짚지 않는다 (글자가 겹친다)',
  /jump\.y !== y0 && jump\.y !== y1/.test(js) && /> 26/.test(js));
check('그해에 무슨 일이 있었는지는 모른다고 밝힌다',
  /그해에 무슨 일이 있었는지는 이 자료로 알 수 없습니다/.test(js));
check('짚은 해를 실제로 그린다', q(
  "(function(){var s=SCHOOLS.filter(function(x){return x.hist&&x.lv==='초'&&x.stu>200})[0];" +
  "var h=schoolSparkSvg(s);return /class=\"jt\"/.test(h)||/가장 크게 움직인 해/.test(h)||h.length>0;})()") === true);
check('눈금이 가리키는 값은 선이 실제로 닿는 값이다 (어림한 눈금은 거짓말을 한다)',
  /const mid = Math\.round\(\(mx \+ mn\) \/ 2\)/.test(js));

console.log('\n■ 3D 는 기울이는 것이 아니라 «땅이 솟는» 것이다');
check('고도 자료를 쓴다 (브이월드에는 없어 AWS Terrain Tiles 를 쓴다)',
  /terrarium/.test(js) && /encoding:'terrarium'/.test(js));
check('setTerrain 으로 땅을 솟게 한다', /setTerrain\(\{source:'mv-dem',exaggeration:amount\}\)/.test(js));
check('확대해도 산 높이와 기울기를 유지한다', /function mvTerrainExaggeration\(\)\{return 1\.5;\}/.test(js) && /function mvTerrainPitch\(\)\{return 62;\}/.test(js));
check('음영도 함께 켠다 (기울이지 않아도 산줄기가 보인다)',
  /setLayoutProperty\('mv-hills','visibility','visible'\)/.test(js));
check('2D 로 되돌리면 지형을 끈다', /setTerrain\(null\)/.test(js));

console.log('\n■ 배경 타일은 레이어마다 확장자가 다르다');
/* 틀린 확장자는 200 으로 «오류 XML» 을 돌려줍니다 — 조용히 빈 화면이 됩니다. */
check('위성만 jpeg 이고 나머지는 png 다', q(
  "MV_BASES.map(function(b){return b.id+':'+b.ext}).join()") === 'Base:png,Satellite:jpeg,Hybrid:jpeg,midnight:png,gray:png');
check('「위성+지명」은 위성 «위에» 얹는다 (하이브리드만 깔면 허전하다)', q(
  "(function(){var h=MV_BASES.filter(function(b){return b.id==='Hybrid'})[0];" +
  "return h.base==='Satellite'&&h.over==='Hybrid'&&h.overExt==='png';})()") === true);

console.log('\n■ 다크 모드에서 지도 위의 선도 함께 바뀐다');
/* MapLibre 의 paint 값에는 CSS 변수를 넣을 수 없습니다 — 바뀐 것을 듣고 손으로 갈아야 합니다. */
check('화면 밝기가 바뀌는 것을 듣는다',
  /attributeFilter:\['data-theme'\]/.test(js) && /prefers-color-scheme: dark\)'\)\.addEventListener\('change', repaint\)/.test(js));
check('색은 토큰에서 읽는다 (지도만 다른 팔레트를 쓰지 않는다)',
  /function mvCss\(name, fallback\)/.test(js) && /mvCss\('--brand'/.test(js));
/* 이 앱의 토큰은 `--brand:var(--leap-blue)` 처럼 별칭이라, 그대로 읽으면
   'var(--leap-blue)' 라는 «글자»가 나옵니다. MapLibre 는 그것을 색으로 읽지 못해
   시군 경계가 통째로 안 그려졌습니다. 브라우저에게 풀어 달라고 시켜야 합니다. */
check('별칭 토큰을 «풀어서» 읽는다 (var(--…) 글자를 색으로 주면 선이 안 그려진다)',
  /color:var\('\s*\+ name \+ '\)/.test(js) && /getComputedStyle\(probe\)\.color/.test(js));
check('읽은 색을 쟁여 둔다 (딱지마다 부르면 지도가 굼떠진다)',
  /MV_CSS_CACHE\[name\]/.test(js) && /MV_CSS_CACHE = \{\};\s+\/\* 쟁여 둔 색을 비웁니다/.test(js));

console.log('\n■ 지도가 브라우저 규칙(CSP)에 막히지 않는다');
check('배경지도·고도 타일이 허용되어 있다',
  /img-src[^;]*https:\/\/api\.vworld\.kr/.test(bake) && /img-src[^;]*https:\/\/s3\.amazonaws\.com/.test(bake));
check('MapLibre 의 일꾼(worker)이 허용되어 있다', /worker-src 'self' blob:/.test(bake));
check('vendor 폴더가 함께 실린다', /vendor/.test(bake));

console.log('\n■ 〔시뮬〕 시나리오를 이름으로 고른다');
check('처음 온 사람이 읽을 수 있는 시나리오 카드 세 장이 있다',
  /data-sim-scenario="fixed"/.test(html) && /학교·학급 규모를 유지하면/.test(html) &&
  /data-sim-scenario="class20"/.test(html) && /학급당 20명을 지키면/.test(html) &&
  /data-sim-scenario="grade1"/.test(html) && /학년당 1학급 기준이면/.test(html));
check('시나리오가 기존 계산 엔진의 라디오와 숫자를 실제로 바꾼다',
  /function applySimScenario/.test(js) && /setSimRadio\('basis-mode',cfg\.mode\)/.test(js) &&
  /Object\.entries\(cfg\.values/.test(js));
check('세부 설정은 자세히 고치기에 접어 둔다',
  /<details class="sim-advanced"/.test(html) && /<summary>자세히 고치기/.test(html));
check('세 시나리오 카드의 결과 수치는 조회 조건에 따라 다시 계산한다',
  /id="scenario-fixed-live"/.test(html) && /id="scenario-class20-live"/.test(html) &&
  /id="scenario-grade1-live"/.test(html) && /function renderScenarioPreviews/.test(js));
check('세 시나리오 카드의 질문 문구도 상세 설정 숫자에 맞춰 바뀐다',
  ['scenario-fixed-title','scenario-class20-title','scenario-grade1-title'].every(id=>html.includes(`id="${id}"`)) &&
  /scenario-class20-title[^\n]*classSize/.test(js) && /scenario-grade1-title[^\n]*gradesPerSchool/.test(js));
const class20Before=byId['scenario-class20-live'].textContent;
q("document.getElementById('cls-n').value=24;document.getElementById('cls-d').value=1;renderSim()");
check('학급당 인원을 바꾸면 카드 질문과 계산 결과가 함께 바뀐다',
  /24명 ± 1명/.test(byId['scenario-class20-title'].textContent) && byId['scenario-class20-live'].textContent!==class20Before,
  `${byId['scenario-class20-title'].textContent} · ${byId['scenario-class20-live'].textContent}`);
q("document.getElementById('cls-g').value=18;document.getElementById('cls-c').value=2;renderSim()");
check('학년당 학급 기준을 바꾸면 세 번째 카드 질문도 바로 바뀐다',
  /18명·학년당 2학급/.test(byId['scenario-grade1-title'].textContent),byId['scenario-grade1-title'].textContent);
q("document.getElementById('cls-n').value=20;document.getElementById('cls-d').value=0;document.getElementById('cls-g').value=20;document.getElementById('cls-c').value=1;renderSim()");
check('시나리오 카드 내용은 위에서 시작하고 결과 줄은 카드 아래에 맞춘다',
  /\.sim-scenario\{[^}]*display:flex[^}]*flex-direction:column[^}]*justify-content:flex-start/.test(html) &&
  /\.sim-scenario \.scenario-live\{[^}]*margin-top:auto/.test(html));
check('상세 Excel 저장 단추는 모의연도 표 위에서 바로 찾을 수 있다',
  html.indexOf('id="sim-export-xls"') < html.indexOf('class="sim-tables"') && /class="sim-table-tools no-print"/.test(html));
check('모의연도는 변화 요약 제목에서 선택하고 상세표는 같은 연도를 표시한다',
  html.indexOf('id="pred-year"') < html.indexOf('id="sim-panel-detail"') &&
  /id="pred-year-label"/.test(html) && /sim-change-title[^\n]*textContent=`2026년과/.test(js));
check('요약·상세 수치·AI 인사이트를 독립 내부 탭으로 전환한다',
  ['overview','detail','ai'].every(v=>html.includes(`data-sim-view="${v}"`)&&html.includes(`data-sim-panel="${v}"`)) &&
  /function showSimPanel/.test(js));
check('학생·학급·학교 변화가 상세표보다 먼저 나온다',
  html.indexOf('id="sim-change-title"') < html.indexOf('class="sim-tables"') &&
  /id="sim-delta-stu"/.test(html) && /id="sim-delta-cls"/.test(html) && /id="sim-delta-sch"/.test(html));
check('고정한 기준과 계산된 결과를 글자로도 구분한다',
  /고정한 기준/.test(html) && /계산된 결과/.test(html) && /renderSimChange/.test(js));
check('복식학급을 계산하지 않고 한 것으로 단정하지 않는다',
  !/data-sim-scenario="grade1"[\s\S]{0,400}?복식학급 없이/.test(html));

console.log('\n■ 〔현황〕 시군을 고를 수 있다');
/* 이 탭은 여태 「경북 전체」만 보여 줬습니다. 그런데 예산도 정원도 시군
   단위로 배정합니다. 도 합계로는 어디부터 할지 정할 수 없습니다. */
check('시군 22곳을 나란히 놓는 자리가 있다',
  /id="sgg-board"/.test(html) && /function renderSggBoard/.test(js));
check('22곳이 실제로 그려진다',
  ((byId['sgg-board']._html || '').match(/class="sgg-cell"/g) || []).length === 22);
check('고른 것이 눌린 상태로 보인다', q(
  "(function(){selectSgg('안동');var h=document.getElementById('sgg-board')._html||'';" +
  "return /data-sgg=\"안동\" aria-pressed=\"true\"/.test(h);})()") === true);
check('한 번 더 누르면 경북 전체로 돌아온다', q(
  "(function(){selectSgg('안동');selectSgg(null);return statusState.sgg;})()") === null);

console.log('\n■ 〔현황〕 고른 시군을 화면 전체가 따라간다');
q("selectSgg('안동')");
check('제목이 그 시군을 말한다', /안동/.test(byId['chart-title'].textContent || ''),
  '제목: ' + byId['chart-title'].textContent);
check('학년별 분포도 그 시군을 센다', /안동/.test(byId['pax-title'].textContent || ''));
check('출처 줄에도 그 시군이 적힌다', /안동/.test(byId['status-source'].textContent || ''));
check('안동 2026 합계가 시군 실적과 맞는다',
  Number(String(byId['tot-now'].textContent || '').replace(/,/g,'')) ===
  q("regionTotalStudents('안동',2026).v"),
  '화면: ' + byId['tot-now'].textContent + ' · 자료: ' + q("regionTotalStudents('안동',2026).v"));
check('시군 합계가 도 합계와 맞는다 (쪼개서 세도 같아야 한다)', q(
  "(function(){var s=0;SIGUNGU.forEach(function(g){s+=regionTotalStudents(g.s,2026).v||0});" +
  "return s === regionTotalStudents(null,2026).v;})()") === true);

console.log('\n■ 〔현황〕 없는 자료를 시군 몫으로 나누지 않는다');
/* 주민등록·장래추계는 도 단위로만 받아 두었습니다. 시군 몫으로 나누면 그것은
   우리가 만든 수이지 통계청의 수가 아닙니다. */
check('시군에는 학령인구를 주지 않는다', q("statusYear('안동','pop',2026)") === null);
check('시군을 고르면 학생수로 바꾸고 단추를 잠근다',
  q("(function(){dsKind='pop';selectSgg('안동');return dsKind;})()") === 'stu' &&
  byId['ds-pop'].disabled === true);
check('왜 잠겼는지 적어 둔다', /도 단위로만 받아 두었습니다/.test(byId['ds-pop'].title || ''));
check('잠긴 동안에는 눌러도 바뀌지 않는다',
  q("(function(){selectSgg('안동');setDs('pop');return dsKind;})()") === 'stu');

console.log('\n■ 〔현황〕 단위를 하나로 맞춘다');
/* series() 는 천 명 단위이고 regionStudents() 는 낱낱의 수입니다. 섞어 쓰면
   1,000배 틀린 수가 «오류 없이» 화면에 뜹니다. 가장 무서운 종류입니다. */
check('학령인구도 명으로 돌려준다', q("statusYear(null,'pop',2026).초") === q("series('pop',2026).초 * 1000"));
check('화면에 「천명」이라 적힌 자리가 없다', !/천명/.test(html));
check('학령인구가 반올림된 값임을 밝힌다', /천 명 단위 반올림/.test(html));

console.log('\n■ 〔현황〕 보고 있는 자료의 이름을 딱지에 적는다');
/* 재학생 수를 보는 동안에도 「KOSIS」라 적혀 있었습니다. 보고 있는 자료가
   아닌 곳의 이름이 붙으면 그 화면 전체를 의심하게 됩니다. */
q("selectSgg(null); setDs('stu');");
check('재학생을 볼 때는 EDSS·학교알리미라 적는다', /EDSS/.test(byId['asof-status'].textContent || ''),
  '딱지: ' + byId['asof-status'].textContent);
q("setDs('pop')");
check('학령인구를 볼 때는 KOSIS 라 적는다', /KOSIS/.test(byId['asof-status'].textContent || ''));

console.log('\n■ 〔현황〕 이미 학교에 앉아 있는 아이로 앞날을 말한다');
/* 학년별 인원은 917개 학교 전부 갖고 있습니다. 이 아이들이 그대로 올라오면
   몇 해 뒤 중1·고1이 몇 명이 되는지 «셀 수» 있습니다. 출산율 가정도, 추계
   모형도 들어가지 않습니다 — 「예측일 뿐」이라는 반박을 받지 않습니다. */
q("selectSgg(null)");
check('그 자리가 있다', /id="cohort-card"/.test(html) && /function renderCohort/.test(js));
check('중학교 신입생 여섯 해가 그려진다',
  ((byId['cohort-mid']._html || '').match(/class="cohort-row/g) || []).length === 7,
  '줄 수: ' + ((byId['cohort-mid']._html || '').match(/class="cohort-row/g) || []).length);
check('고등학교 신입생 아홉 해가 그려진다',
  ((byId['cohort-high']._html || '').match(/class="cohort-row/g) || []).length === 10);
check('견줄 「지금」 줄이 맨 위에 있다', /class="cohort-row now"/.test(byId['cohort-mid']._html || ''));
/* 초6(i=5)은 2027년에 중1이 되고, 초1(i=0)은 2032년에 중1이 됩니다. */
check('도착하는 해를 바르게 셈한다',
  /2027년[\s\S]*?지금 초6/.test(byId['cohort-mid']._html || '') &&
  /2032년[\s\S]*?지금 초1/.test(byId['cohort-mid']._html || ''));
check('고1은 세 해 뒤에 도착한다 (중1 → 고1 은 3년)',
  /2035년[\s\S]*?지금 초1/.test(byId['cohort-high']._html || ''));
check('지금 초1 인원이 그대로 실린다',
  new RegExp(q("fmt(cohortGrades(null)['초'][0])").replace(/,/g,',')).test(byId['cohort-mid']._html || ''));
check('머리글이 초1과 초6의 차이를 말한다',
  /초등학교 1학년은/.test(byId['cohort-lede']._html || '') &&
  /6학년은/.test(byId['cohort-lede']._html || ''));
/* 마지막 줄은 둘 다 «지금 초1» 입니다 — 같은 수를 두 번 적으면 다른 값처럼 읽힙니다. */
check('한 무리가 두 자리에 도착한다고 한 번에 말한다',
  /중학교 1학년<\/b>이 되고/.test(js) && /고등학교 1학년<\/b>이 됩니다/.test(js));
check('무엇이 빠졌는지 밝힌다 (전학·유급·사립·특수)',
  /전학·유급·사립·특수학교로의/.test(html) && /그대로 머문다고 보았을 때/.test(html));
check('고른 시군을 따라간다', q(
  "(function(){selectSgg('안동');var a=cohortGrades('안동')['초'][0];" +
  "selectSgg(null);var b=cohortGrades(null)['초'][0];return a>0&&b>a;})()") === true);

console.log('\n■ 〔현황〕 학생 수를 학급과 교원으로 옮겨 적는다');
/* 「학생 98,072명 감소」는 결정을 만들지 못합니다. 「학급 5,148개 · 교원
   8,343명」이 되어야 예산과 정원의 말이 됩니다. */
q("selectSgg(null)");
check('그 자리가 있다', /id="convert-box"/.test(html) && /function renderConvert/.test(js));
check('지금의 학생·학급·교원을 먼저 적는다',
  /2026년 학생/.test(byId['convert-now']._html || '') &&
  /2026년 학급/.test(byId['convert-now']._html || '') &&
  /2026년 교원/.test(byId['convert-now']._html || ''));
/* 두 갈래는 «나란히» 놓습니다 — 위아래로 두면 하나가 결론처럼 읽힙니다. */
check('두 갈래를 나란히 놓는다 (하나를 결론으로 고르지 않는다)',
  /id="fork-a"/.test(html) && /id="fork-b"/.test(html) &&
  /\.convert-forks\{display:grid;grid-template-columns:1fr 1fr/.test(html));
check('갈래 하나는 학급과 교원이 줄어든다',
  /필요한 학급/.test(byId['fork-a-body']._html || '') &&
  /필요한 교원/.test(byId['fork-a-body']._html || ''));
check('갈래 둘은 학급당 인원이 줄어든다',
  /학급당/.test(byId['fork-b-body']._html || '') &&
  /교원 1인당/.test(byId['fork-b-body']._html || ''));
/* ★ 여기에 「6792」 같은 실제 값을 박아 두면 안 됩니다 〔2026. 9. 10.〕
   EDSS 시험자료를 심고 다시 돌리는 검사가 있어서, 지어낸 자료에서는 그 수가
   나오지 않습니다. 값이 아니라 «관계»를 봅니다 — 화면에 뜬 학급 수가
   학생 ÷ 학급당과 같은가. */
check('셈이 맞는다 (학급당을 지키면 학급 = 학생 ÷ 학급당)', q(
  "(function(){var n=convertNow(null);var later=regionTotalStudents(null,2036).v;" +
  "if(!n.perCls||later==null) return true;" +
  "var want=Math.round(later/n.perCls);" +
  "var shown=(document.getElementById('fork-a-body')._html||'').match(/<b>([\\d,]+)<\\/b>개/);" +
  "return !!shown && Number(shown[1].replace(/,/g,'')) === want;})()") === true);
check('0 은 변화로 적지 않는다 (변화 없음이지 변화가 아니다)',
  /delta === 0\) \? '' :/.test(js));
/* 교원 수는 실제로 학급 수·과목·복식 여부·겸임으로 정해집니다. */
check('교원 셈이 거칠다고 밝힌다',
  /정원 산정에 그대로 쓸 수 없습니다/.test(html) && /크기를 가늠하는 자리/.test(html));
check('미래 연도를 바꾸면 함께 바뀐다', /renderConvert\(\);\s+\/\* 미래 연도를 바꾸면/.test(js));

console.log('\n■ 〔현황〕 두 수가 왜 다른지 화면이 말한다');
/* 단추를 갈아 끼우면 고등학교가 88천 명과 63천 명으로 갈립니다. 화면이 그
   까닭을 말하지 않으면 「어느 쪽이 맞나」에서 멈추고, 그 순간 화면 전체를
   의심하게 됩니다. */
q("selectSgg(null); setDs('pop');");
check('그 자리가 있다', /id="gap-box"/.test(html) && /function renderGap/.test(js));
check('나이 구간이 몇 살인지 적는다',
  /초 6~11세\(<b>여섯 살<\/b>\)/.test(js) && /고 15~18세\(<b>네 살<\/b>\)/.test(js));
check('고등학교는 세 학년임을 짚는다', /고등학교는 세 학년<\/b>입니다/.test(js));
/* bake-kosis.mjs 가 나누는 방식과 같아야 합니다 — 다르면 설명이 거짓말이 됩니다. */
check('구간이 굽는 스크립트와 같다',
  q("AGE_BAND['고'].from") === 15 && q("AGE_BAND['고'].to") === 18 &&
  q("AGE_BAND['초'].from") === 6 && q("AGE_BAND['초'].to") === 11);
check('학년 수에 맞추면 재학생에 가까워진다', q(
  "(function(){var r=gapRows(2026);if(!r)return true;var g=r.filter(function(x){return x.lv==='고'})[0];" +
  "return Math.abs(g.fitted-g.stu) < Math.abs(g.pop-g.stu);})()") === true);
check('구간을 맞춘 뒤 남는 차이가 진짜 신호라고 적는다',
  /남는 \$\{fmt\(Math\.abs\(sum\('rest'\)\)\)\}명<\/b>이 진짜 신호/.test(js));
check('어림이라고 밝힌다', /학년 수에 맞춘 수는 어림<\/b>/.test(js));
check('시군에는 견줄 자료가 없어 감춘다', q(
  "(function(){selectSgg('안동');var h=document.getElementById('gap-box').hidden;" +
  "selectSgg(null);return h;})()") === true);

console.log('\n■ 〔현황〕 언제 무슨 일이 오는지 짚는다');
/* 연도별 추이선은 있지만 「그래서 몇 년에 무슨 일이 있나」는 사람이 눈으로
   읽어야 했습니다. 「언제까지」가 있어야 계획이 됩니다. */
check('그 자리가 있다', /id="milestone-box"/.test(html) && /function renderMilestones/.test(js));
check('넘는 해가 실제로 그려진다',
  ((byId['milestones']._html || '').match(/class="mstone/g) || []).length >= 4,
  '개수: ' + ((byId['milestones']._html || '').match(/class="mstone/g) || []).length);
check('학교급마다 도착하는 해가 다르다고 적는다',
  /중학교에 6년, 고등학교에\s*\n?\s*'\s*\+\s*'9년 걸려 옵니다/.test(js) ||
  /9년 걸려 옵니다/.test(js));
/* 한 해 만에 문턱을 훌쩍 넘는 해가 있어서, 80% 라 적어 놓고 73% 인 일이 생깁니다. */
check('그 해의 실제 비율을 함께 적는다',
  /\$\{HOME_BASE_YEAR\}년의 <b>\$\{Math\.round\(then \/ now \* 100\)\}%<\/b>/.test(js));
check('이미 학교에 있는 아이가 도착하는 해도 짚는다',
  /전망이 아니라 이미 학교에 있는 아이입니다/.test(js) &&
  /이미 학교에 있는 아이/.test(byId['milestones']._html || ''));
check('넘는 해를 실제로 셈한다 (2026 기준 아래로 처음 내려가는 해)',
  q("crossYear(null,'초',0.8)") > 2026 && q("crossYear(null,'초',0.8)") <= 2036);
check('고른 시군을 따라간다', q(
  "(function(){selectSgg('봉화');var a=crossYear('봉화','초',0.8);selectSgg(null);" +
  "var b=crossYear(null,'초',0.8);return a!=null&&b!=null;})()") === true);

console.log('\n■ 〔현황〕 큰 수를 읽을 수 있게 적는다');
/* 값이 천 명 단위이던 때는 「321」이었는데, 낱낱의 명으로 바꾸면서
   「321000」이 되어 읽히지 않았습니다. */
check('만 명이 넘으면 접어서 적는다', q("statusShort(321000)") === '32만' &&
  q("statusShort(9412)") === '9,412');
check('「현재」 점선이 값을 관통하지 않는다', /text-anchor="\$\{isNow \? 'start' : 'middle'\}"/.test(js));

console.log('\n■ 〔현황〕 세 화면이 같은 것을 보게 잇는다');
/* 여태 탭 셋이 각자 따로 살았습니다. 현황에서 봉화가 가파르다는 것을 알아도,
   봉화의 학교가 어디 있는지 보려면 지도로 가서 다시 찾아야 했습니다. */
check('시군을 고르면 두 길이 열린다',
  /id="sgg-to-map"/.test(html) && /id="sgg-to-sim"/.test(html) &&
  /function openMapFor/.test(js) && /function openSimFor/.test(js));
check('경북 전체일 때는 감춘다', q(
  "(function(){selectSgg(null);return document.getElementById('sgg-to-map').hidden;})()") === true);
check('어디로 가는지 단추에 적는다', q(
  "(function(){selectSgg('봉화');var t=document.getElementById('sgg-to-map').textContent;" +
  "selectSgg(null);return t;})()") === '봉화 지도에서 보기');
/* 시뮬레이터는 다른 사람이 고치고 있습니다. 그쪽 모양이 바뀌어도 이 단추
   때문에 화면이 멎으면 안 됩니다. */
check('다른 화면의 속을 함부로 뒤지지 않는다',
  /typeof sim === 'object' && sim && sim\.sigungu && sim\.sigungu\.clear/.test(js) &&
  /catch\(_e\)\{ \/\* 시뮬레이터 모양이 바뀌어도/.test(js));
check('시뮬레이터 조건이 실제로 바뀐다', q(
  "(function(){openSimFor('봉화');return sim.sigungu.has('봉화') && sim.sigungu.size===1;})()") === true);
check('지도를 못 열어도 타이머가 남지 않는다', /if\(\+\+tries < 60\)/.test(js));
/* 날아가는 그림은 지도를 보고 있던 사람에게 «어디서 어디로» 갔는지 알려 주는
   것입니다. 다른 탭에서 막 넘어온 사람은 출발 자리를 본 적이 없습니다. */
check('탭을 건너올 때는 날지 않고 바로 옮긴다',
  /MV\.map\.jumpTo\(\{ center:\[sc\.lon, sc\.lat\]/.test(js) &&
  /MV\.map\.jumpTo\(\{ center:\[sg\.lon, sg\.lat\], zoom:10\.4 \}\)/.test(js));
/* 이웃이 얼마나 먼지는 학교마다 다릅니다. 1:26,000 으로 고정했더니 3.8km
   떨어진 이웃이 화면 밖으로 나가 선이 보이지 않았습니다. */
check('이웃 셋이 다 들어오는 범위로 맞춘다',
  /MV\.map\.fitBounds\(b, \{ padding/.test(js) && /maxZoom:15\.5, duration:0/.test(js));

console.log('\n■ 〔현황〕 구현 용어를 걷어냈다');
check('「Pure SVG」·「Line Chart」 같은 말이 없다',
  !/Pure SVG/.test(html) && !/Line Chart/.test(html));


console.log('\n■ 〔현황〕 안쪽 탭으로 나눈다');
/* 한 화면에 여섯 칸을 세로로 쌓았더니 끝까지 보려면 스크롤을 너무 많이
   내려야 했습니다. 무엇을 물으러 왔는지에 따라 볼 것이 다릅니다. */
check('네 갈래로 나눈다', q("STATUS_VIEWS.join()") === 'where,how,who,what' &&
  ((html.match(/data-status-view="/g) || []).length === 4));
check('갈래마다 이름이 질문이다 (차트 목록이 아니라)',
  /어디가 먼저인가<\/button>/.test(html) && /얼마나 줄어드나<\/button>/.test(html) &&
  /누가 올라오나<\/button>/.test(html) && /무엇이 달라지나<\/button>/.test(html));
check('한 갈래만 보인다', q(
  "(function(){setStatusView('who');var n=0;STATUS_VIEWS.forEach(function(k){" +
  "if(!document.getElementById('status-panel-'+k).hidden) n++});return n;})()") === 1);
check('고른 갈래가 눌린 상태로 보인다', q(
  "(function(){setStatusView('what');var b=document.querySelectorAll('[data-status-view]');" +
  "return true;})()") === true &&
  /b\.setAttribute\('aria-pressed', String\(b\.dataset\.statusView === v\)\)/.test(js));
check('없는 갈래를 부르면 첫 갈래로 간다', q(
  "(function(){setStatusView('없는것');return statusState.view;})()") === 'where');
/* 뉴스 탭이 이미 쓰고 있는 모양을 그대로 씁니다 — 한 앱 안에서 같은 것은
   같게 생겨야 합니다. */
check('뉴스 탭과 같은 모양을 쓴다',
  /<div class="news-view-tabs" role="tablist" aria-label="학령인구 현황 화면 선택">/.test(html));
check('지난번에 보던 갈래로 연다', /localStorage\.setItem\('leap-status-view-v1', v\)/.test(js));

console.log('\n■ 〔현황〕 갈래를 옮겨도 고른 시군을 잊지 않는다');
/* 탭을 옮기다 고른 시군을 잊으면 다른 지역의 수를 읽게 됩니다. */
check('어느 갈래에 있든 보고 있는 곳이 적힌다', /id="status-where"/.test(html) &&
  /function renderStatusWhere/.test(js));
check('시군을 고르면 그 이름이 적힌다', q(
  "(function(){selectSgg('봉화');var h=document.getElementById('status-where')._html||'';" +
  "return /봉화/.test(h);})()") === true);
check('거기서 바로 경북 전체로 돌아올 수 있다',
  /id="status-where-clear"/.test(byId['status-where']._html || ''));
check('갈래를 옮겨도 시군은 그대로다', q(
  "(function(){selectSgg('봉화');setStatusView('what');setStatusView('who');" +
  "var k=statusState.sgg;selectSgg(null);return k;})()") === '봉화');
check('경북 전체일 때는 고르는 법을 알려 준다', q(
  "(function(){selectSgg(null);var h=document.getElementById('status-where')._html||'';" +
  "return /어디가 먼저인가/.test(h);})()") === true);


console.log('\n■ 〔현황〕 데이터 정의가 지금 자료와 맞는다');
/* ★ 「다른 연도의 미확보 구간은 단순 연결·모의값」이라 적혀 있었습니다.
   EDSS 교육통계 실적을 심기 전에 쓴 말입니다. 지금 2016~2025 는 실적이고
   2027년부터가 전망입니다. 자료가 좋아졌는데 설명이 따라오지 않으면
   그것도 틀린 화면입니다. */
/* 주석 안에는 «왜 고쳤는지»를 적어 두었으므로, 주석을 걷어낸 뒤에 봅니다. */
check('낡은 문구가 화면에 남아 있지 않다',
  !/단순 연결·모의값/.test(html.replace(/<!--[\s\S]*?-->/g, '')));
/* 출처 표의 「미확보 연도는 비교용 단순 연결값」은 EDSS 를 못 심었을 때만 쓰는
   대비 문구입니다. 실적이 있으면 실행 중에 갈아 끼워져야 합니다. */
/* applyEdssWording 은 innerHTML 로 갈아 끼웁니다 — 스텁에서는 _html 을 봅니다. */
check('실적이 있으면 출처 표 문구도 실적으로 바뀐다',
  /교육통계 실적/.test(byId['q-series-note']._html || ''),
  '실제: ' + (byId['q-series-note']._html || '(비어 있음)'));
check('재학생 수를 세 갈래로 적는다',
  /2016~2025년은 EDSS 교육통계 실적/.test(html) &&
  /2026년은 학교알리미 공시 실적/.test(html) &&
  /2027년부터는 전망/.test(html));
check('학령인구가 도 단위뿐임을 정의에도 적는다', /시군별로는 나누지 않습니다/.test(html));
check('학년별 셈이 출산율을 가정하지 않는다고 적는다', /출산율을 가정하지 않습니다/.test(html));
check('그 대신 무엇이 빠졌는지도 적는다',
  /전학·유급·사립·\s*\n?\s*특수학교로의 이동은 들어 있지 않습니다/.test(html));


console.log('\n■ 통계가 서로 맞는다');
/* ★ 같은 것을 두 자리에서 세면 반드시 같아야 합니다. 다르면 둘 중 하나가
   틀린 것이고, 화면을 보는 사람은 어느 쪽인지 알 수 없습니다. */
const eq = (name, a, b, tol) => {
  const A = q(a), B = q(b);
  check(name, Math.abs(A - B) <= (tol || 0), A + ' vs ' + B);
};
eq('시군 합계 = 도 합계',
  'SIGUNGU.reduce((a,g)=>a+regionTotalStudents(g.s,2026).v,0)', 'regionTotalStudents(null,2026).v');
eq('학교 낱개 합 = 도 합계',
  'SCHOOLS.filter(s=>["초","중","고"].includes(s.lv)).reduce((a,s)=>a+(s.stu||0),0)',
  'regionTotalStudents(null,2026).v');
eq('BASE 학생 합 = 도 합계',
  '["초","중","고"].reduce((a,lv)=>a+SIGUNGU.reduce((x,g)=>x+BASE[lv][g.s].stu,0),0)',
  'regionTotalStudents(null,2026).v');
eq('BASE 학교 수 = 학교 낱개 수',
  '["초","중","고"].reduce((a,lv)=>a+SIGUNGU.reduce((x,g)=>x+BASE[lv][g.s].sch,0),0)',
  'SCHOOLS.filter(s=>["초","중","고"].includes(s.lv)).length');
eq('BASE 학급 합 = 학교 낱개 학급 합',
  '["초","중","고"].reduce((a,lv)=>a+SIGUNGU.reduce((x,g)=>x+BASE[lv][g.s].cls,0),0)',
  'SCHOOLS.filter(s=>["초","중","고"].includes(s.lv)).reduce((a,s)=>a+(s.cls||0),0)');
eq('현황 탭과 지도가 같은 2026 을 말한다',
  'statusTot(statusYear(null,"stu",2026))',
  'SCHOOLS.filter(s=>["초","중","고"].includes(s.lv)).reduce((a,s)=>a+(s.stu||0),0)');
/* 특수학교는 두 자료(학교알리미·특수교육통계)가 «같은 수»를 말해야 합니다. */
eq('특수학교 학생 — 학교알리미 = 특수교육통계',
  'SCHOOLS.filter(s=>s.lv==="특수").reduce((a,s)=>a+(s.stu||0),0)', 'SPED_PLACE.by["특수학교"].stu');
/* 배치 총계는 «장애영아를 뺀» 값입니다. 다 더한 값과 다른 것이 정상입니다. */
eq('특수교육 총계 = 배치 합 − 장애영아',
  'SPED_PLACE.total', 'Object.values(SPED_PLACE.by).reduce((a,o)=>a+(o.stu||0),0) - SPED_PLACE.infant');
eq('다문화 표 합계가 스스로 맞는다',
  '["초","중","고"].reduce((a,lv)=>{var o=MULTI_STU.region["경북"][lv];return a+o.국내출생+o.중도입국+o.외국인가정},0)',
  '13158');

console.log('\n■ 학년별 합이 학교 합보다 적은 까닭을 말한다');
/* 학교알리미는 학년별을 «일반학급 기준»으로 내고 특수학급을 따로 셉니다.
   (계 = 학년별 합 + 특수학급) 설계는 맞는데 화면이 말하지 않아, 같은 탭의
   두 수가 어긋나 보였습니다. */
check('차이가 정확히 특수학급 학생 수다', q(
  "(function(){var x=gradeGap(null);return x.gap === x.sped;})()") === true,
  q("JSON.stringify(gradeGap(null))"));
check('낱낱의 학교에서도 그렇다', q(
  "(function(){var L=SCHOOLS.filter(function(s){return s.grades&&s.grades.length});" +
  "return L.every(function(s){var g=s.grades.reduce(function(a,v){return a+v},0);" +
  "return (s.stu||0)-g === (s.sped||0);});})()") === true);
check('화면이 그 까닭을 적는다',
  /특수학급 학생 \$\{fmt\(x\.sped\)\}명이 빠져 있습니다/.test(js) &&
  /id="cohort-sped-note"/.test(html) && /id="pax-sped-note"/.test(html));
check('두 수를 나란히 적어 견줄 수 있게 한다',
  /학년별을 다 더하면 <b>\$\{fmt\(x\.g\)\}명<\/b>/.test(js) &&
  /학교별 학생 수를 다 더한 <b>\$\{fmt\(x\.stu\)\}명<\/b>/.test(js));

console.log('\n■ 인쇄물이 어디서 나온 무엇인지 스스로 말한다');
/* 종이는 회의 탁자에 혼자 놓입니다. 화면이 옆에 없어도 읽혀야 합니다. */
check('머리글에 기관·제목·담은 것·뽑은 때가 있다',
  /class="lh-org"/.test(html) && /id="print-report-title"/.test(html) &&
  /id="print-report-scope"/.test(html) && /id="print-report-stamp"/.test(html));
check('로고와 심볼을 함께 쓴다',
  /class="lh-symbol"/.test(html) && /class="lh-logo"/.test(html));
/* ★ 여태 AI 인쇄에서만 워터마크가 보였습니다. body::before 는 z-index:0 이라
   흰 카드들이 덮고 있었고, AI 인쇄만 .shell 을 통째로 감췄기 때문입니다. */
check('워터마크를 밑에 깔지 않고 위에 얹는다',
  /body::before\{display:none !important\}/.test(html) &&
  /body::after\{[\s\S]{0,200}?z-index:9999/.test(html));
check('모든 인쇄에 찍힌다 (이슈페이퍼·AI 인쇄 포함)',
  /body\.print-news-paper::after/.test(html) && /body\.print-ai-only::after/.test(html));
check('이슈페이퍼 워터마크도 다른 인쇄물과 같은 중앙·62mm 크기다',
  /body\.print-news-paper::after\{background-size:62mm auto;background-position:center 50%;opacity:\.06\}/.test(html) &&
  !/body\.print-news-paper::after\{[^}]*32mm|body\.print-news-paper::after\{[^}]*90%/.test(html));
check('AI 보고서는 본문을 2쪽으로 밀지 않고 마지막 안내선을 내용 영역 하단에 맞춘다',
  /\.policy-report \.report-body\{flex:0 0 auto\}/.test(html) &&
  /\.policy-report \.report-note\{margin-top:auto;padding-top:2mm/.test(html));
check('화면에서는 워터마크를 얹지 않는다 (인쇄 규칙 안에만 있다)', q(
  "true") === true && /@media print\{[\s\S]*?body::after\{/.test(html));
check('종이에서 갈래 단추는 감추고 보고 있는 곳은 남긴다',
  /\.status-bar \.news-view-tabs,\.news-view-tabs\{display:none !important\}/.test(html) &&
  /\.status-where\{margin-bottom:4mm/.test(html));

console.log('\n■ 지도 — 축척을 비율로도 적는다');
/* 종이 지도를 읽어 온 사람에게는 1:25,000 같은 비율이 더 빨리 읽힙니다. */
check('비율을 셈한다', /function mvScaleRatio/.test(js) && /MV_CSS_PX_M = 0\.0254 \/ 96/.test(js));
check('자 길이를 1·2·5 로 끊는다', /function mvNiceLen/.test(js) &&
  q("[mvNiceLen(3300), mvNiceLen(770), mvNiceLen(140)].join()") === '2000,500,100');
check('단위를 크기에 맞춰 바꾼다',
  q("[mvLen(0.4), mvLen(4.2), mvLen(420), mvLen(4200), mvLen(42000)].join()") === '40cm,4.2m,420m,4.2km,42km');
check('어림이라고 밝힌다 (모니터마다 점 크기가 다르다)',
  /모니터마다 점 크기가 달라 어림입니다/.test(js));

console.log('\n■ 지도 — 딱지가 학교 모양이다');
/* 네이버 부동산이 집 모양을 쓰는 까닭은, 무엇을 찍은 지도인지 보자마자
   알게 하려는 것입니다. 그림 파일 없이 선으로 그립니다. */
check('학교 모양을 선으로 그린다',
  /function mvSchoolGlyph/.test(js) && /function mvSchoolPin/.test(js));
check('그림 파일을 새로 들이지 않는다', !/mv-pin[^}]*background-image/.test(html));
/* 스텁에는 진짜 CSS 가 없어 다섯 급이 같은 대비색으로 나옵니다. 색이 «다른지»가
   아니라 «그 급의 색을 넣었는지»를 봅니다. */
check('학교급 색을 그때그때 넣는다', q(
  "(function(){return mvSchoolPin('초').indexOf(mvLvColor('초'))>=0 && " +
  "mvSchoolGlyph('중',15).indexOf(mvLvColor('중'))>=0;})()") === true);
check('이름표에 꼬리가 있어 어느 점인지 가리킨다',
  /\.mv-lab::after\{content:""/.test(html) && /border-top:7px solid var\(--line\)/.test(html));
check('닻을 아래에 두어 꼬리 끝이 학교 자리를 가리킨다',
  /anchor: 'bottom'/.test(js) || /anchor:'bottom'/.test(js));

console.log('\n■ 같은 자리에 겹친 학교를 위로 쌓는다');
/* 병설유치원은 본교 좌표를 그대로 씁니다 — 실제로 같은 건물이고, 그렇게
   고쳐서 8.6km 어긋나던 것을 바로잡았습니다. 그 대신 이름표가 정확히
   포개져 아래 것이 보이지 않게 되었습니다. */
check('좌표를 흔들지 않고 그리는 자리만 올린다',
  /좌표를 흔들어 놓지는 않습니다/.test(js) && /offset: \[0, \(tier === 'label' \? -6 : 0\) - idx \* step\]/.test(js));
check('픽셀로 올려 아무리 확대해도 같은 만큼 떨어진다',
  /const step = tier === 'label' \? 40 : 30/.test(js));
check('쌓는 차례를 학교급으로 고정한다 (움직일 때마다 바뀌면 어지럽다)',
  /const LV_ORDER = \{ 초:0, 중:1, 고:2, 특수:3, 유:4 \}/.test(js));
check('병설은 본교와 같은 자리라고 말풍선이 적는다',
  /본교와 같은 자리입니다 \(병설\)/.test(js));
/* 실제로 겹친 자리가 있는지 — 없으면 이 규칙이 헛돕니다. */
check('겹친 자리가 실제로 있다', q(
  "(function(){var m={};SCHOOLS.forEach(function(s){if(s.lat==null)return;" +
  "var k=s.lat.toFixed(5)+'|'+s.lon.toFixed(5);m[k]=(m[k]||0)+1});" +
  "return Object.values(m).filter(function(n){return n>1}).length;})()") > 100);

console.log('\n■ 지도 — 돌리는 법을 묻는 사람에게만 알려 준다');
/* 「안내를 빼 달라」와 「안내가 필요하다」 사이입니다. 늘 펴 두면 세 줄이
   자리를 차지하고, 아주 없으면 돌리는 법을 알 길이 없습니다. */
/* 「?」 한 글자는 오류 표시처럼 읽힙니다. 무엇을 여는 단추인지 이름으로 적습니다. */
check('무엇을 여는 단추인지 이름으로 적는다', /id="mv-turn-help"[\s\S]{0,220}?지도 사용법/.test(html));
/* 「보기」 칸에 넣었더니 단추 줄이 넘쳐 줄바꿈이 나고 못생겨졌습니다. */
check('세로 칸이 아니라 지도 위에 둔다',
  /<button type="button" class="mv-fold-side mv-help" id="mv-turn-help"/.test(html) &&
  /\.mv-help\{left:auto;right:12px;top:10px\}/.test(html));
check('확대·축소 단추와 겹치지 않는다', /\.mv-map \.maplibregl-ctrl-top-right\{top:52px\}/.test(html));
/* 접기 단추와 같은 꼴을 쓰므로, 자리를 덮어쓰는 규칙은 반드시 그 뒤에 와야
   합니다. 앞에 두었더니 둘이 겹쳐 「요약 접기」가 통째로 가려졌습니다. */
check('요약 접기를 덮지 않는다 (규칙이 뒤에 온다)',
  html.indexOf('.mv-fold-side{position:absolute') < html.indexOf('.mv-help{left:auto;right:12px'));
check('접어 둘 자리가 있다', /id="mv-turn-tip"/.test(html));
check('처음에는 접혀 있다', /id="mv-turn-tip" hidden/.test(html));
check('마우스·터치·자판 세 갈래를 다 적는다',
  /<dt>마우스<\/dt>/.test(html) && /<dt>터치<\/dt>/.test(html) && /<dt>자판<\/dt>/.test(html));
check('터치로 돌리는 법이 적혀 있다', /두 손가락을 비틀면<\/b> 돌아가고/.test(html));


console.log('\n■ 〔폐교〕 몇 곳인지가 아니라 무엇을 뜻하는지를 말한다');
/* 750곳이라는 수는 그 자체로는 결정을 만들지 않습니다. */
q("renderClosedInsight()");
check('그 자리가 있다', /id="closed-insight"/.test(html) && /function renderClosedInsight/.test(js));
check('지금이 처음이 아니라고 말한다',
  /지금이 처음 겪는\s*<\/b>|지금이 처음 겪는 일이 아닙니다/.test(byId['closed-insight-lede']._html || '') ||
  /지금이 처음 겪는 일이 아닙니다/.test(js));
check('가장 많이 문 닫은 연대를 스스로 찾는다',
  q("closedFacts().peak") === '1990' && q("closedFacts().decade['1990']") === 422);
/* 한 번 판 땅은 돌이킬 수 없습니다. 이 화면에서 가장 무거운 말입니다. */
check('판 땅은 되돌릴 수 없다고 적는다',
  /교육청 손을 떠났습니다.*되돌릴/.test(js));
check('지금 다룰 수 있는 것을 따로 센다', q("closedFacts().keep") === 255);
check('네 가지를 큰 수로 적는다',
  ((byId['closed-facts']._html || '').match(/class="cf/g) || []).length === 4);
/* 같은 100곳이라도 원래 많았던 곳과 적었던 곳은 뜻이 다릅니다. */
check('있었던 학교 가운데 사라진 몫을 센다', q(
  "(function(){var l=closedFacts().lost[0];return l.had === l.closed + l.now && l.pct > 0;})()") === true);
check('가장 많이 잃은 시군이 맨 위에 온다', q("closedFacts().lost[0].s") === '영양');
check('앞으로의 감소율도 나란히 놓는다', /앞으로 −\$\{x\.drop\.toFixed\(0\)\}%/.test(js));
check('있었던 학교 수가 어림이라고 밝힌다', /있었던 학교 수는 어림<\/b>/.test(html));

console.log('\n■ 〔폐교〕 목록은 접어 두고 지도로 잇는다');
/* 750줄짜리 목록이 화면 아래를 채우고 있었습니다. 목록은 «찾을 때» 쓰는
   것이지 «읽는 것»이 아닙니다. */
check('목록을 접어 둔다', /<details class="card closed-list-box"/.test(html));
check('무엇을 하는 자리인지 이름에 적는다', /폐교 목록에서 찾아보기/.test(html));
check('지도로 가는 길이 있다', /id="closed-to-map"/.test(html));
check('겹쳐 보기를 켠 채로 넘어간다 (가서 또 켜면 이어진 것이 아니다)',
  /MV\.closed = true;[\s\S]{0,300}?location\.hash = 'map'/.test(js));
check('좌표를 찾은 곳이 몇 곳인지 적는다', /id="closed-geo-count"/.test(html) &&
  /없는 좌표를 시군 중심으로 대신하지 않습니다/.test(html));


console.log('\n■ 〔다문화·특수〕 곁가지가 아니라 본줄기임을 첫 화면이 말한다');
/* 전체 학생은 43% 줄어드는데 이 두 무리는 그만큼 줄지 않습니다. 지금 수가
   그대로여도 합친 몫은 8.8% 에서 15.5% 가 됩니다 — 여섯 명 가운데 한 명. */
q("renderMultiHeadline(); renderMultiGroups(); renderSpedRisk(); renderSpedAccessNote();");
check('그 자리가 있다', /id="multi-headline"/.test(html) && /function renderMultiHeadline/.test(js));
check('두 해를 나란히 놓는다',
  ((byId['multi-share']._html || '').match(/class="sr"/g) || []).length === 2);
check('몫이 실제로 커진다', q(
  "(function(){var c=multiCounts();return c.then > c.now && c.then > 15;})()") === true,
  q("JSON.stringify(multiCounts())"));
/* 「늘어난다」와 「몫이 커진다」는 다릅니다. 확실한 것은 몫뿐입니다. */
check('「지금 그대로일 때」라고 밝힌다', /지금 그대로일 때<\/b>의/.test(html));
check('공식 추계가 아니라고 적는다', /공식 추계가 아닙니다/.test(html));

console.log('\n■ 〔다문화·특수〕 좌우를 맞추고 갈래를 나눈다');
/* 여태 왼쪽 3분의 2가 특수교육, 오른쪽 3분의 1에 다문화가 얹혀 있었습니다. */
check('두 갈래로 나눈다', q("MULTI_VIEWS.join()") === 'sped,multi' &&
  ((html.match(/data-multi-view="/g) || []).length === 2));
check('한 갈래만 보인다', q(
  "(function(){setMultiView('multi');var n=0;MULTI_VIEWS.forEach(function(k){" +
  "if(!document.getElementById('multi-panel-'+k).hidden) n++});return n;})()") === 1);
check('현황 탭과 같은 모양을 쓴다 (한 앱 안에서 같은 것은 같게)',
  /<div class="news-view-tabs" role="tablist" aria-label="다문화·특수교육 화면 선택">/.test(html));
check('갈래마다 기준일을 적는다', q(
  "(function(){setMultiView('multi');return document.getElementById('multi-where')._html||'';})()").indexOf('도 단위만') >= 0);

console.log('\n■ 〔다문화〕 이름이 가리고 있는 것을 드러낸다');
/* 「다문화 학생 13,158명」이라고만 적으면 13,158명 모두에게 한국어 지원이
   필요한 것처럼 읽힙니다. 실제로 시급할 수 있는 아이는 2,201명입니다. */
check('세 무리를 갈라서 보여 준다',
  ((byId['multi-groups']._html || '').match(/class="mg/g) || []).length === 3);
check('83%가 국내출생임을 앞에 적는다', q(
  "(function(){var g=multiByGroup();return Math.round(g.out['국내출생']/g.total*100);})()") === 83 &&
  /한국에서 태어나 자랐습니다\.<\/b>/.test(js));
check('한국어 지원이 시급할 수 있는 수를 따로 센다',
  /한국어 지원이 시급할 수 있는 아이는 /.test(js) &&
  /const need = \(out\['외국인가정'\] \|\| 0\) \+ \(out\['중도입국'\] \|\| 0\)/.test(js));
check('세 무리의 합이 발표 합계와 맞는다', q("multiByGroup().total") === 13158);
/* 이 구분은 교육통계연보의 분류일 뿐 한국어 능력을 잰 것이 아닙니다. */
check('분류일 뿐이라고 밝힌다', /실제 한국어 능력을 잰 것이 아닙니다/.test(html));
check('학교급마다 사정이 다른 것을 보여 준다',
  ((byId['multi-bylevel']._html || '').match(/class="mlv"/g) || []).length === 3);
check('시군을 못 고르는 까닭과 무엇을 받으면 되는지 적는다',
  /없는 것을 시군 몫으로 나누지 않습니다/.test(html) && /class="need-list"/.test(html));

console.log('\n■ 〔특수교육〕 학교가 줄면 특수학급도 옮겨야 한다');
/* 특수학급 학생은 여러 학교에 흩어져 있습니다. 그 학교가 문을 닫으면 그
   학급도 옮겨야 합니다. 적정규모 논의에서 가장 늦게 검토되는 자리입니다. */
check('그 자리가 있다', /id="sped-risk-card"/.test(html) && /function renderSpedRisk/.test(js));
check('소규모 학교만 고른다', q(
  "(function(){return spedRiskRows().every(function(r){" +
  "return r.size.key==='minimum'||r.size.key==='small';});})()") === true);
check('학생이 적은 순으로 놓는다', q(
  "(function(){var r=spedRiskRows();return r.length<2 || r[0].stu <= r[1].stu;})()") === true);
check('가장 가까운 같은 급 학교까지의 거리를 함께 적는다',
  /가장 가까운 같은 급/.test(byId['sped-risk']._html || ''));
/* 학교 이름에 판단을 붙이면 이 대시보드는 그날로 못 쓰는 물건이 됩니다. */
check('검토 순서를 정하지 않는다고 못 박는다',
  /이 목록은 <b>검토 순서를 정하지\s*\n?\s*않습니다\.<\/b>/.test(html) &&
  /적정규모학교 육성 계획을\s*\n?\s*따릅니다/.test(html));
check('세어지지 않는 사람을 수 바로 옆에 적는다',
  /일반학급에서 온전히 함께 배우는 학생은 <b>공시에 없어 빠져 있습니다\.<\/b>/.test(html));
check('특수학교가 없는 시군과 거리를 앞으로 끌어낸다',
  /function renderSpedAccessNote/.test(js) &&
  /울릉은 바다 건너<\/b>/.test(js));


console.log('\n■ 말풍선이 맨 앞에 오고, 딱지를 덮지 않고, 밝기를 따른다');
/* 딱지를 맨 앞(z-index 800)으로 올리자 말풍선이 그 뒤로 갔습니다.
   말풍선은 «누른 결과»이므로 무엇보다 앞이어야 합니다. */
check('말풍선이 딱지보다 앞이다', /\.mv-map \.maplibregl-popup\{z-index:1200\}/.test(html));
check('누른 딱지를 덮지 않게 위로 띄운다',
  /const lift = \(tier === 'label' \? 34 : 32\) \+ idx \* step/.test(js) &&
  /anchor: 'bottom', offset: \[0, -lift\]/.test(js));
/* MapLibre 가 흰 바탕·검은 글씨를 제 스타일로 박아 넣어, 어두운 화면에서
   혼자 하얬습니다. 꼬리도 함께 물들여야 흰 삼각형만 남지 않습니다. */
check('밝기를 따라간다', /\.maplibregl-popup-content\{[\s\S]{0,200}?background:var\(--card\);color:var\(--ink\)/.test(html));
check('꼬리도 함께 물든다', /\.maplibregl-popup-anchor-bottom \.maplibregl-popup-tip\{border-top-color:var\(--card\)\}/.test(html));
check('각진 네모가 아니다', /\.maplibregl-popup-content\{[\s\S]{0,260}?border-radius:14px/.test(html));

console.log('\n■ 목록에서 고르면 그 학교가 보이는 크기로 간다');
/* 여태 배율 12.4(약 1:88,000)로 갔습니다. 그 크기에서는 옆 학교 딱지가 잔뜩
   함께 보여 무엇을 고른 것인지 알기 어려웠습니다. */
check('비율에서 배율을 되돌려 셈한다', /function mvZoomForRatio/.test(js));
check('셈이 맞는다 (되돌리면 같은 비율)', q(
  "(function(){var z=mvZoomForRatio(3700,36.4);" +
  "var back=156543.03392*Math.cos(36.4*Math.PI/180)/Math.pow(2,z)/MV_CSS_PX_M;" +
  "return Math.abs(back-3700) < 1;})()") === true);
check('위도를 넣어 셈한다 (울릉과 고령이 같은 비율로 보인다)',
  q("mvZoomForRatio(3700,37.5)") !== q("mvZoomForRatio(3700,35.8)"));
check('목록에서 고르면 약 1:3,700 으로', /mvZoomForRatio\(3700, s\.lat\)/.test(js));

console.log('\n■ 이웃까지 얼마나 먼지 지도에 그린다');
/* 「이 학교가 통합되면 아이들이 어디로 가나」는 표의 숫자 한 칸으로는
   와닿지 않습니다. 선을 그으면 사이에 산이 있는지도 보입니다. */
check('그리는 코드가 있다', /function mvShowNear/.test(js) && /function mvNearestOf/.test(js));
check('같은 학교급만 견준다', q(
  "(function(){var sc=SCHOOLS.filter(function(x){return x.lv==='초'&&x.lat})[0];" +
  "return mvNearestOf(sc,3).every(function(o){return o.x.lv==='초'&&o.x!==sc;});})()") === true);
check('가까운 순으로 셋을 고른다', q(
  "(function(){var sc=SCHOOLS.filter(function(x){return x.lv==='초'&&x.lat})[0];" +
  "var n=mvNearestOf(sc,3);return n.length===3&&n[0].d<=n[1].d&&n[1].d<=n[2].d;})()") === true);
check('이름표를 선 가운데에 단다 (끝에 달면 딱지와 겹친다)',
  /\(sc\.lon \+ o\.x\.lon\) \/ 2, \(sc\.lat \+ o\.x\.lat\) \/ 2/.test(js));
check('바탕에 묻히지 않게 흰 테를 깐다', /id:'mv-near-case'/.test(js));
/* 타일을 못 받는 형편에서는 idle 이 영영 오지 않습니다. */
check('idle 을 기다리지 않는다', /if\(\+\+wait < 40\) setTimeout\(paint, 150\)/.test(js));
check('학교를 놓으면 선도 함께 걷는다',
  /mvClearNear === 'function'[\s\S]{0,80}?mvClearNear\(\)/.test(js));
check('직선거리임을 밝힌다', /산을 넘는 길은 이보다 멉니다/.test(js));

console.log('\n■ 〔특수교육〕 87곳을 다 볼 수 있고, 찾을 수 있다');
/* 12곳만 보여 주고 나머지를 감추면 우리 학교가 있는지 알 수 없습니다.
   다 보여 주되 찾을 수 있게 합니다 — 스크롤만 길어지면 그것도 못 쓰는 목록입니다. */
q("renderSpedRisk()");
check('자르지 않고 다 보여 준다', q(
  "(function(){var n=(document.getElementById('sped-risk')._html||'').match(/class=\"rk\"/g);" +
  "return n ? n.length : 0;})()") === q("spedRiskRows().length"));
check('찾기·거르기·정렬이 있다',
  /id="risk-q"/.test(html) && /id="risk-sig"/.test(html) &&
  /id="risk-lv"/.test(html) && /id="risk-sort"/.test(html));
check('네 가지로 정렬한다', /stu:  \(a, b\)/.test(js) && /sped: \(a, b\)/.test(js) &&
  /far:  \(a, b\)/.test(js) && /name: \(a, b\)/.test(js));
check('몇 곳 가운데 몇 곳인지 적는다', /id="risk-count"/.test(html) &&
  /곳 \/ \$\{fmt\(all\.length\)\}곳/.test(js));
/* 없는 시군을 골라 빈 목록을 보게 하지 않습니다. */
check('시군 고르개는 목록에 있는 시군만 채운다', /if\(sel && sel\.options\.length <= 1\)/.test(js));
check('줄을 누르면 지도로 간다', /function openMapForSchool/.test(js) &&
  /openMapForSchool\(r\.s\)/.test(js));


console.log('\n■ 위쪽 단추 줄이 화면과 맞는다');
/* ★ 지도에서 「현재 메뉴 Excel」을 누르면 «폐교 자료»가 나왔습니다
   〔2026. 9. 11.〕 갈래를 else 로 흘려 두었는데 그 뒤에 지도 화면이 생겼고
   아무도 이 자리를 고치지 않았습니다. 조용히 틀린 파일이 나가는 자리였습니다. */
check('지도에도 제 Excel 이 있다', /function mapExportSheets/.test(js) &&
  /if\(activeView==='map'\) sheets=mapExportSheets\(\)/.test(js));
check('모르는 화면이면 아무 자료나 내보내지 않는다',
  /else \{ alert\('이 화면은 아직 Excel 로 내보낼 수 없습니다\.'\); return; \}/.test(js));
check('지도 Excel 에 조건·요약·목록이 다 들어간다', q(
  "(function(){var sh=mapExportSheets();var n=sh.map(function(x){return x.name}).join();" +
  "return n.indexOf('조건')>=0 && n.indexOf('학교급별')>=0 && n.indexOf('화면안학교')>=0;})()") === true);
check('내보낸 학교 수가 화면이 세는 수와 같다', q(
  "(function(){var sh=mapExportSheets();var rows=sh.filter(function(x){return x.name==='화면안학교'})[0].rows;" +
  "return rows.length - 1 === mvInView(mvPool()).length;})()") === true);
check('인쇄 이름에도 지도가 있다', /VIEW_PRINT_NAMES=\{map:'경북 학교 지도'/.test(js));

console.log('\n■ 용어 도움말이 스스로 한 말을 지킨다');
/* 「가나다순으로 정리했습니다」라고 적어 놓고 실제로는 어긋나 있었습니다.
   적어 놓은 것과 다른 화면은 그 자체로 틀린 화면입니다. */
check('가나다순이라고 적었으면 정말 가나다순이다', (() => {
  const a = html.indexOf('id="glossary-drawer"'), b = html.indexOf('id="guide-drawer"');
  const t = Array.from(html.slice(a, b).matchAll(/<details><summary>([^<]+)<\/summary>/g)).map(m => m[1]);
  return t.length >= 10 && JSON.stringify(t) === JSON.stringify(t.slice().sort());
})());
/* 화면에 나오는 말은 용어 도움말에도 있어야 합니다. */
check('새 화면이 쓰는 말이 들어 있다',
  ['코호트','축척 비율','배치유형','직선거리','학년별 인원','다문화 학생','개교년도']
    .every(w => new RegExp('<summary>' + w + '<\/summary>').test(html)));

console.log('\n■ 지도 사용법을 닫을 수 있다');
/* 여는 단추를 다시 눌러도 닫히긴 했지만, 그 단추가 상자 «밖 위쪽»에 있어
   닫는 길로 보이지 않았습니다. */
check('상자 안에 닫는 단추가 있다', /id="mv-tip-close"/.test(html));
check('여는 길과 닫는 길이 한 자리에 모여 있다', /const turnTip = open =>/.test(js));
check('지도를 누르거나 Esc 로도 닫힌다',
  /if\(MV\.map\) MV\.map\.on\('click', \(\) => turnTip\(false\)\)/.test(js) &&
  /e\.key === 'Escape'\) turnTip\(false\)/.test(js));
/* ★ mvWireControls 안에는 `map` 이라는 이름이 없습니다. 그냥 쓰면 그 줄에서
   멎고 뒤의 배선이 통째로 달리지 않는데, 오류는 약속이 깨진 자리에만 남아
   화면에는 아무 표시도 나지 않습니다. 가장 조용한 종류입니다. */
check('그 함수에 없는 이름을 쓰지 않는다', (() => {
  const a = js.indexOf('function mvWireControls(){');
  const b = js.indexOf('\nfunction ', a + 10);
  return !/(^|[^.\w])map\.(on|flyTo|jumpTo|getZoom)\(/.test(js.slice(a, b));
})());

console.log('\n■ 잰 거리를 지도 위에서도 본다');
/* 여태 왼쪽 칸에만 있어, 지도를 보면서 재는 사람이 눈을 옮겨야 했습니다. */
check('구간마다 거리를 지도에 적는다', /'mv-nearchip mv-legchip'/.test(js));
check('두 구간을 넘으면 합도 지도에 적는다', /'mv-nearchip mv-sumchip'/.test(js));
check('이웃 선과 자를 색으로 가른다',
  /\.mv-legchip\{border-color:var\(--leap-amber-mark\)\}/.test(html) &&
  /\.mv-nearchip\{[\s\S]{0,200}?border:1px solid var\(--leap-teal\)/.test(html));

/* ── 점검 한 바퀴에서 나온 것들 〔2026. 9. 11.〕 ───────────────────────── */

check('여는 단추는 다시 누르면 닫는다', () => {
  const m = html.match(/pair\.open\.addEventListener\('click',\s*\(\)\s*=>\s*([\s\S]{0,160}?)\);/);
  if(!m) throw new Error('서랍 여닫이 배선을 못 찾았습니다');
  if(/setOpen\(pair,\s*true\)/.test(m[1]))
    throw new Error('늘 열기만 합니다 — aria-expanded 가 거짓말을 하게 됩니다');
  if(!/aria-hidden/.test(m[1]))
    throw new Error('지금 열려 있는지 보지 않고 있습니다');
});

check('좁은 화면에서 두 칸이 한 칸으로 접힌다', () => {
  if(!/\.two-cols\{/.test(html)) throw new Error('.two-cols 규칙이 없습니다');
  if(/style="display:grid; grid-template-columns:2fr 1fr/.test(html))
    throw new Error('인라인 격자가 남아 있습니다 — @media 를 걸 수 없습니다');
  const m = html.match(/@media \(max-width:900px\)\{\s*\n?\s*\.two-cols[^}]*\}/);
  if(!m) throw new Error('접는 규칙이 없습니다');
  if(!/\.two-cols\.wide/.test(m[0]) || !/\.two-cols\.even/.test(m[0]))
    throw new Error('.two-cols 만 적으면 .two-cols.wide 에 특정도로 집니다');
});

check('시뮬레이터 인쇄에도 조회 조건이 찍힌다', () => {
  const m = html.match(/function printScopeText\(\)\{[\s\S]*?\n\}/);
  if(!m) throw new Error('printScopeText 를 못 찾았습니다');
  ['status','map','sim','multi','closed','news'].forEach(v => {
    if(!new RegExp(`activeView === '${v}'`).test(m[0]))
      throw new Error(`${v} 화면의 조회 조건이 없습니다`);
  });
  if(!/sim-filter-summary/.test(m[0]))
    throw new Error('시뮬레이터는 화면이 적어 둔 요약을 그대로 옮겨야 합니다');
});

check('거리 쪽지는 겹치면 서로 비켜 준다', () => {
  if(!/function mvSpaceChips\(\)/.test(js)) throw new Error('겹침 푸는 함수가 없습니다');
  if(!/function mvChipMarker\(/.test(js)) throw new Error('쪽지 만드는 함수가 없습니다');
  if(!/mv-chipwrap/.test(js))
    throw new Error('껍데기가 없으면 MapLibre 가 transform 을 덮어씁니다');
  if(/\.mv-chipwrap[^{]*\{[^}]*transition/.test(html))
    throw new Error('쪽지에 transition 을 걸면 다시 잴 때 중간값이 잡힙니다');
  if(!/boxes\.some\(b => !b\.r\.width\)/.test(js))
    throw new Error('자리를 못 잡은 쪽지는 크기가 0 으로 잡혀 겹침을 놓칩니다');
  ["map.on('move', mvSpaceChips)", "map.on('zoom', mvSpaceChips)"].forEach(x => {
    if(js.indexOf(x) < 0) throw new Error(x + ' 가 없습니다 — 줌을 당기면 도로 겹칩니다');
  });
  const body = (js.match(/function mvSpaceChips\(\)\{[\s\S]*?\n\}/) || [''])[0];
  if(!/isConnected/.test(body)) throw new Error('지운 쪽지를 계속 세게 됩니다');
  if(!/guard/.test(body)) throw new Error('밀어내기가 멈추지 않을 수 있습니다');
});

console.log('\n■ 지도 비교 기능은 지도를 가리지 않고 필요한 때만 연다');
check('왼쪽 요약은 배경 다음 보기 순서다', () => {
  const side = html.match(/<aside class="mv-side" id="mv-side">([\s\S]*?)<\/aside>/);
  if(!side) throw new Error('지도 요약 영역을 찾지 못했습니다');
  const bg = side[1].indexOf('<h4>배경</h4>');
  const view = side[1].indexOf('<h4>보기</h4>');
  if(bg < 0 || view < 0 || bg > view) throw new Error('배경 → 보기 순서가 아닙니다');
});
check('비교 도구는 지도 위에서 필요할 때만 연다',
  /class="mp-panel"[^>]*hidden/.test(mapPolicy) &&
  /id="mp-tools-toggle"[^>]*aria-expanded="false"/.test(mapPolicy));
check('과거·현재와 현재·미래를 쉬운 이름으로 구분한다',
  />과거·현재 비교<\/option>/.test(mapPolicy) && />현재·미래 비교<\/option>/.test(mapPolicy) &&
  !/>시뮬레이터 조건 비교<\/option>/.test(mapPolicy));
check('비교 연도에는 년을 붙인다',
  /2026년 공시/.test(mapPolicy) && /\$\{P\.from\}년 실적/.test(mapPolicy));
check('지도에 지역·학교의 정확한 수치를 표시한다',
  /className='mp-value-mark'/.test(mapPolicy) && /class="mp-total-grid"/.test(mapPolicy));
check('학교 비교함은 접힌 상태로 시작한다', /<details class="mp-tray">/.test(mapPolicy));
check('별도 정책지도 출력 기능은 남기지 않는다',
  !/A4 정책지도 출력|지도로 함께 출력|async function printMap/.test(mapPolicy));
check('숨긴 비교 설명은 레이아웃을 차지하지 않는다', /#mp-caption\[hidden\]\{display:none\}/.test(mapPolicyCss));
check('비교 종료와 설정 창 접기를 서로 다르게 처리한다',
  /function closeTools\(\)\{[\s\S]*?setMode\('normal'\)/.test(mapPolicy) &&
  /id="mp-panel-min"[^>]*설정 창만 접기/.test(mapPolicy) &&
  /\$\('mp-panel-min'\)\.onclick=\(\)=>setPanel\(false\)/.test(mapPolicy) &&
  /\$\('mp-panel-close'\)\.onclick=closeTools/.test(mapPolicy));
check('과거 비교는 두 연도 값이 있는 학교만 지도에 표시한다',
  /function comparisonPool\(\)/.test(mapPolicy) &&
  /features:comparisonPool\(\)\.map/.test(mapPolicy) &&
  /미연결 \$\{fmt\(excluded\)\}교 제외/.test(mapPolicy) &&
  !/미연결은 회색/.test(mapPolicy));
check('학생 수 변화는 원 없이 네모 값 상자로 통일한다',
  /circle-opacity':0/.test(mapPolicy) &&
  /className='mp-value-mark'/.test(mapPolicy) &&
  !/className='mp-value-mark'\+\(row\.value==null/.test(mapPolicy));
check('비교 값 상자는 축척별 묶음으로 모두 대표하고 겹침을 푼다',
  /function settleValueMarks\(/.test(mapPolicy) &&
  /function boxesOverlap\(/.test(mapPolicy) &&
  /function clusterRows\(/.test(mapPolicy) &&
  /교 묶음/.test(mapPolicy) &&
  !/\.slice\(0,map\.getZoom\(\)<10\.6\?26:42\)/.test(mapPolicy) &&
  /mp-value-wrap/.test(mapPolicy) &&
  /is-crowded/.test(mapPolicy));
check('현재·미래는 확대하면 학교별 참고 배분값을 보여 준다',
  /function scenarioSchoolRows\(/.test(mapPolicy) &&
  /target\*v\/currentTotal/.test(mapPolicy) &&
  /학교별 참고 배분값/.test(mapPolicy) &&
  /공식 학교별 예측이 아닙니다/.test(mapPolicy));
check('좌우 비교의 오른쪽 값 상자는 지도 이동을 기다리지 않고 그린다',
  /if\(compare&&P\.second\)renderValueMarks\(P\.second,true\)/.test(mapPolicy) &&
  !/compare&&P\.second\?\.loaded\(\)/.test(mapPolicy));
check('비교 보조 지도도 같은 적응형 3D 높이를 쓴다',
  /typeof mvApplyTerrain==='function'\)mvApplyTerrain\(s\)/.test(mapPolicy));
check('비교 패널은 작고 가장 앞에 있으며 요약 버튼 가까이에 있다',
  /\.mp-panel\{[^}]*z-index:1600[^}]*width:min\(304px/.test(mapPolicyCss) &&
  /\.mp-tools-toggle\{left:104px!important;z-index:1501!important\}/.test(mapPolicyCss));
check('조건 바꾸기는 해시를 함께 바꿔 지도 메뉴를 다시 누를 수 있다',
  /function goView\(name\)\{[\s\S]*?location\.hash=hash/.test(mapPolicy) &&
  /\$\('mp-go-sim'\)\.onclick=\(\)=>\{setPanel\(false\);goView\('sim'\);\}/.test(mapPolicy));
check('병설유치원과 본교 이름표 간격은 상자 높이보다 크다',
  /const step = tier === 'label' \? 40 : 30/.test(js));

check('지역 여건 모듈은 로드하지 않는다', !/assets\/map-context/.test(html));

console.log(`\n${fail ? '✗' : '✓'}  통과 ${pass} · 실패 ${fail}\n`);
process.exit(fail ? 1 : 0);
