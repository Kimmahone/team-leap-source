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
  q("homeState.mapMode") === 'offline' && byId['home-tilemap'].hidden === false &&
  /간편 지도를 유지/.test(byId['sgis-status'].textContent || ''));
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

console.log('\n■ 시뮬레이터 정책 검토 기능');
check('행정안전부 지정 경북 인구감소지역은 15곳이고 예천은 제외한다',
  q('SIGUNGU.filter(sg=>sg.decline).length') === 15 && q("SIG_META['예천'].decline") === false);
q("sim.sigungu=new Set(['영주']);sim.level='중';renderSim()");
const yjMid = q("aggregate(SIGUNGU.find(sg=>sg.s==='영주'),'중').stu");
check('시뮬레이터 전체 행이 현재 지역 필터를 따른다',
  q('simExportRows[0].base.stu') === yjMid && /선택 지역: 영주시/.test(q('aiContext')),
  '영주 중학생: '+yjMid+' / 내보내기 합계: '+q('simExportRows[0].base.stu'));
check('AI가 변화·위험·질문·추가자료 형식으로 정책 검토안을 요청한다',
  /학교 운영 검토 신호/.test(q('aiContext')) && /추가 확인자료/.test(q('aiContext')));
check('현재 조건 비교표를 Excel xls로 저장할 수 있다',
  html.includes('id="sim-export-xls"') && /function exportSimXls/.test(html) && /\.xls`/.test(html));
check('상세 Excel은 요약·기준·예측·시각화·산출기준 시트를 만든다',
  (q('spreadsheetXml(simulatorSheets())').match(/<Worksheet /g)||[]).length===5 &&
  /변화시각화/.test(q('spreadsheetXml(simulatorSheets())')));
check('Excel 시군 행은 기능개선안의 표준 순서로 다시 정렬한다',
  /EXPORT_SIGUNGU_ORDER\s*=\s*\['포항','경주','김천','안동','구미','영주','영천','상주','문경','경산','의성','청송','영양','영덕','청도','고령','성주','칠곡','예천','봉화','울진','울릉'\]/.test(html) &&
  /orderedExportRows[\s\S]*exportSigunguIndex/.test(html));
q("sim.sigungu=new Set();sim.decline=null;sim.admin=null;renderSim()");
check('상세 Excel의 실제 행도 포항부터 울릉까지 표준 순서다',
  q("simulatorSheets()[1].rows.slice(2).map(r=>r[0]).join(',')") === '포항,경주,김천,안동,구미,영주,영천,상주,문경,경산,의성,청송,영양,영덕,청도,고령,성주,칠곡,예천,봉화,울진,울릉');
check('모든 메뉴에 현재 화면 인쇄와 Excel 출력 도구가 있다',
  html.includes('id="export-current"') && html.includes('id="print-current"') && /function currentViewExport/.test(html));
check('인쇄물에 전용 표제와 A4 가로 쪽 설정이 있다',
  html.includes('class="print-letterhead print-only"') && /@page\{size:A4 landscape/.test(html));
check('본문을 덮던 고정 인쇄 꼬리말을 제거했다',
  !html.includes('class="print-footer print-only"') && /\.print-footer\{display:none\s*!important\}/.test(html));
check('긴 카드 전체를 한 쪽에 강제하지 않아 페이지 잘림을 막는다',
  !/\.card\{[^}]*break-inside:avoid/.test(html) && /thead\{display:table-header-group\}/.test(html));
check('종합 대시보드 인쇄는 요약·지도·기준을 의미 단위로 쪽 나눔한다',
  ['home-summary-card','home-news-card','home-kpi-card','home-map-card'].every(id=>html.includes(`id="${id}"`)) &&
  /#home-map-card\{break-before:page/.test(html) && /#home-map-card \.criteria-guide\{break-before:page/.test(html));
check('정책 검토안은 보고서 HTML과 별도 인쇄 기능을 제공한다',
  html.includes('id="ai-print"') && /function policyMarkdown/.test(html) && /function renderPolicyReport/.test(html) && html.includes('id="ai-print-report"'));
check('일반 사용자 화면에 서비스 사업자·모델명이 드러나지 않는다',
  !/>[^<]*(Gemini|Cloudflare|gemini-3\.7)[^<]*</i.test(html.split('<script>')[0]));
check('경북교육청 상징 워터마크 파일과 화면·인쇄 스타일이 있다',
  fs.existsSync(path.join(path.dirname(APP),'symbol1.jpg')) && /body::before[\s\S]*symbol1\.jpg/.test(html) && /@media print[\s\S]*body::before/.test(html));
check('조회 조건을 지우지 않고 다중 필터를 교차 적용한다',
  !/sim\.sigungu\.clear\(\);\s*syncSigChips\(\);\s*}\s*renderSim/.test(html) &&
  /sim\.maxSize/.test(html) && html.includes('id="size-max"'));
check('출처 없는 교육혁신선도지역 버튼 대신 자료 상태를 알린다',
  !html.includes('data-f="innov"') && /공식 대상 명부 미확보/.test(html));
check('AI 정책 검토 브리핑은 시뮬레이터 설명 뒤 맨 아래에 둔다',
  html.indexOf('id="ai-briefing"') > html.indexOf('<b>계산 방식</b>'));
check('가나다순 용어 도움말을 오른쪽 서랍으로 제공한다',
  html.includes('id="glossary-drawer"') && html.includes('id="glossary-toggle"') &&
  html.indexOf('<summary>교원 수</summary>') < html.indexOf('<summary>학령인구</summary>'));
check('전체 작업을 설명하는 사용 안내 서랍을 제공한다',
  html.includes('id="guide-drawer"') && html.includes('id="guide-toggle"') && /출력 방법/.test(html));
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

const CODE_ONLY = html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
const fetchTargets = [...CODE_ONLY.matchAll(/\bfetch\s*\(\s*(['"])([^'"]+)\1/g)].map(m=>m[2]);
check('fetch는 같은 출처 AI 분석·상태 중계만 호출한다',
  fetchTargets.length===2 && fetchTargets.includes('/api/ai-analysis') && fetchTargets.includes('/api/data-status'), fetchTargets.join(', '));
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
/* 쪽 넘기기 — 한 쪽 20건(4열 × 5줄). 히스토리가 60건까지 쌓이므로 한 쪽에 다 넣으면 길어집니다. */
check('한 쪽에 20건이다', /NEWS_PER_PAGE = 20/.test(html));
check('쪽 넘기기 자리가 있다', html.includes('id="news-pager"'));
check('쪽이 하나뿐이면 쪽 넘기기를 감춘다', /pageCount <= 1[\s\S]{0,80}hidden = true/.test(html));
check('기간을 바꾸면 첫 쪽으로 돌아간다', /newsPage = 1;\s*\/\/ 기간을 바꾸면/.test(html));
check('쪽 넘기기 단추가 44px 이상이다', /\.news-pager button\{[^}]*min-height:44px/.test(html));
check('인쇄에서 쪽 넘기기를 감춘다', /@media print\{\.news-pager\{display:none\}\}/.test(html));

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
check('공식 원문 최종 확인이 필요함을 밝힌다', html.includes('공식 원문 최종 확인 필요'));

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
check('주요업무계획이 지어낸 정책을 싣지 않는다',
  !/지능형 튜터링 시스템 도입|이중언어 강점 개발/.test(CODE_ONLY));
check('폐교 탭이 지어낸 사례를 싣지 않는다',
  !/dummyCases/.test(CODE_ONLY) && !/closed-pin/.test(CODE_ONLY));
check('비운 자리는 무엇이 필요한지 적는다',
  html.includes('지방교육재정알리미') && html.includes('원고를 누가 주는지'));
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
check('분석 서비스 키는 HTML에 없고 같은 출처 중계만 쓴다', html.includes("fetch('/api/ai-analysis'") && !/GEMINI_API_KEY|generativelanguage\.googleapis\.com/.test(html));
check('720px 모바일 레이아웃이 있다', /@media \(max-width:720px\)[\s\S]*?\.shell\{display:block/.test(html));
check('가짜 소재지 배정이 없다', !/i\s*%\s*3|임의 배정한 더미/.test(CODE_ONLY));

console.log(`\n${fail ? '✗' : '✓'}  통과 ${pass} · 실패 ${fail}\n`);
process.exit(fail ? 1 : 0);
