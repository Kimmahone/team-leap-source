/* ==========================================================================
   한눈에 보기 〔로컬 실험 · 2026. 9. 26.〕
   ──────────────────────────────────────────────────────────────────────────
   디자인 팀 틀의 «총괄 정책 현황»을 실제 자료로 다시 세웠습니다.
   요청은 한 줄이었습니다 — 「많은 자료를 복잡하게 보여줄 필요는 없음.
   무엇을 보여주려고 하는지 잘 알 수 있도록 하는 것이 핵심.」

   그래서 장면마다 «말하는 것 한 줄»이 제목입니다. 그 한 줄은 손으로 적지 않고
   자료에서 셉니다 — 자료가 바뀌면 제목도 따라 바뀌어야 거짓말이 되지 않습니다.

     ① 어디가     지도 — 시군 22곳을 한 가지 잣대로 칠합니다
     ② 얼마나     네 지표 — 학생·초등·입학생·적정규모 미달
     ③ 누가       학년별 — 이미 학교에 앉아 있는 아이
     ④ 언제       2016~2036 추이 — 감소가 학교급을 타고 올라가는 모양
     ⑤ 어느 시군이 시군 비교 — 누르면 위의 장면이 모두 그 시군으로

   ★ 숫자는 본체 스크립트의 함수에서만 받습니다.
     regionTotalStudents · regionStudents · cohortGrades · schoolSizeOf · CLOSED.
     현황·지도 화면과 «같은 셈»이므로 두 화면이 다른 수를 말하지 않습니다.
     디자인 팀 시안에 있던 정책 수치(통학 예산 180억·연계율 98% 등)는
     출처를 확인할 수 없어 옮겨 오지 않았습니다.

   ★ 이 파일은 본체 «뒤»에 붙습니다. 본체가 없으면 아무 일도 하지 않습니다.
   ========================================================================== */
(function(){
'use strict';
if (typeof regionTotalStudents !== 'function' || typeof SIGUNGU === 'undefined') return;
const root = document.getElementById('ov-root');
if (!root) return;

/* ── 상태 ───────────────────────────────────────────────────────────── */
const Y0 = 2016, YN = 2026, Y1 = 2036;
const PILLS = [2016, 2021, 2026, 2031, 2036];
const OV = { year: YN, metric: 'students', sgg: null, sort: 'drop', timer: null };

/* ── 셈 ─────────────────────────────────────────────────────────────── */
const f = n => (n == null || !isFinite(n)) ? '–' : Math.round(n).toLocaleString('ko-KR');
const esc = v => (typeof htmlEsc === 'function' ? htmlEsc(v) : String(v == null ? '' : v));
const pct1 = v => (v == null || !isFinite(v)) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + '%';
const man = n => n >= 10000 ? (n / 10000).toFixed(n >= 100000 ? 1 : 1).replace(/\.0$/, '') + '만' : f(n);

function tot(sgg, y){ const r = regionTotalStudents(sgg, y); return r && r.v != null ? r.v : null; }
function kindOf(y){ const r = regionTotalStudents(null, y); return (r && r.kind) || ''; }
function lv(sgg, y){
  const o = {};
  ['초','중','고'].forEach(l => { const r = regionStudents(sgg, l, y); o[l] = r && r.v != null ? r.v : null; });
  return o;
}
function kindWord(k){ return k === '공시' ? '2026 공시' : k === '실적' ? '실적' : k === '전망' ? '전망' : k; }

/* 변화율 — 고른 해와 지금(2026) 사이를 «시간 순서대로» 잽니다.
   2026 을 고르면 지난 10년(2016→2026)을 봅니다. */
function changeSpan(y){ return y === YN ? [Y0, YN] : (y < YN ? [y, YN] : [YN, y]); }
function change(sgg, y){
  const [a, b] = changeSpan(y); const va = tot(sgg, a), vb = tot(sgg, b);
  return (va && vb != null) ? (vb / va - 1) * 100 : null;
}

/* 학교 규모 — 본체의 schoolSizeOf 를 그대로 씁니다(2026 공시 학생 수 기준) */
const SCH_LV = ['초','중','고'];
function schoolStats(sgg){
  const L = SCHOOLS.filter(s => SCH_LV.indexOf(s.lv) >= 0 && (!sgg || s.s === sgg));
  const by = { appropriate:0, small:0, minimum:0, unclassified:0 };
  L.forEach(s => { const k = schoolSizeOf(s).key; by[k] = (by[k] || 0) + 1; });
  const under = by.small + by.minimum;
  return { total: L.length, by, under, share: L.length ? under / L.length * 100 : null };
}
function closedOf(sgg){
  if (typeof CLOSED === 'undefined' || !CLOSED) return null;
  return sgg ? (CLOSED.bySig || {})[sgg] || 0 : CLOSED.total;
}
function regionName(){ return OV.sgg || '경북 전체'; }
function sggMeta(s){ return SIGUNGU.find(x => x.s === s) || {}; }

/* 22개 시군 한 줄씩 — 지도·막대·Excel 이 같은 줄을 씁니다 */
function rows(){
  return SIGUNGU.map(sg => {
    const st = schoolStats(sg.s);
    return {
      s: sg.s, type: sg.type, decline: !!sg.decline,
      y: tot(sg.s, OV.year), now: tot(sg.s, YN), first: tot(sg.s, Y0), end: tot(sg.s, Y1),
      ch: change(sg.s, OV.year), next: (tot(sg.s, Y1) / tot(sg.s, YN) - 1) * 100,
      schools: st.total, under: st.under, small: st.share, closed: closedOf(sg.s)
    };
  });
}

/* ── 잣대(칠하기) ──────────────────────────────────────────────────────
   학생 수·소규모 비율은 «크기» → 한 색의 밝기 5단(순차).
   변화율은 «방향» → 줄면 붉은 쪽, 늘면 파란 쪽, 가운데는 회색(발산). */
const METRICS = {
  students: {
    label: '학생 수', unit: '명',
    value: r => r.y,
    cls: v => v == null ? 'na' : v >= 30000 ? 'q4' : v >= 15000 ? 'q3' : v >= 5000 ? 'q2' : v >= 2000 ? 'q1' : 'q0',
    legend: [['q4','3만 명 이상'],['q3','1.5만~3만'],['q2','5천~1.5만'],['q1','2천~5천'],['q0','2천 미만']],
    fam: 'seq', short: v => man(v)
  },
  change: {
    label: '변화율', unit: '%',
    value: r => r.ch,
    cls: v => v == null ? 'na' : v > 0 ? 'up' : v > -30 ? 'd0' : v > -40 ? 'd1' : v > -50 ? 'd2' : 'd3',
    legend: [['up','늘어남'],['d0','0~−30%'],['d1','−30~−40%'],['d2','−40~−50%'],['d3','−50% 이하']],
    fam: 'div', short: v => pct1(v)
  },
  small: {
    label: '적정규모 미달 학교 비율', unit: '%',
    value: r => r.small,
    cls: v => v == null ? 'na' : v >= 50 ? 'q4' : v >= 40 ? 'q3' : v >= 25 ? 'q2' : v >= 10 ? 'q1' : 'q0',
    legend: [['q4','50% 이상'],['q3','40~50%'],['q2','25~40%'],['q1','10~25%'],['q0','10% 미만']],
    fam: 'amb', short: v => v == null ? '–' : v.toFixed(0) + '%'
  }
};

/* ── 지도 기하 — 본체의 시군 경계(GB_POLY)와 투영(projX/projY)을 그대로 ── */
const GEO = (() => {
  const out = {};
  if (typeof GB === 'undefined' || !GB) return out;
  const centroid = (pts) => {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      const c = x0 * y1 - x1 * y0; a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
    }
    return a ? [cx / (3 * a), cy / (3 * a)] : pts[0];
  };
  Object.keys(GB).forEach(k => {
    const rings = gbRings(GB[k]);
    let px = projX, py = projY;
    if (k === '울릉') {
      const B = ULLEUNG_BOX, pts = rings.flat();
      const lo0 = Math.min(...pts.map(p => p[0])), lo1 = Math.max(...pts.map(p => p[0]));
      const la0 = Math.min(...pts.map(p => p[1])), la1 = Math.max(...pts.map(p => p[1]));
      const sq = Math.cos((la1 + la0) / 2 * Math.PI / 180);
      const sc = Math.min((B.w - 20) / ((lo1 - lo0) * sq), (B.h - 26) / (la1 - la0));
      const ox = B.x + (B.w - (lo1 - lo0) * sq * sc) / 2;
      const oy = B.y + 16 + ((B.h - 26) - (la1 - la0) * sc) / 2;
      px = lo => ox + (lo - lo0) * sq * sc; py = la => oy + (la1 - la) * sc;
    }
    const big = rings.slice().sort((a, b) => b.length - a.length)[0];
    const c = centroid(big.map(p => [px(p[0]), py(p[1])]));
    out[k] = { d: gbPath(rings, px, py), cx: c[0], cy: c[1] };
  });
  /* 이름표가 이웃과 겹치는 몇 곳만 비켜 둡니다(좁고 길쭉한 시군) */
  const nudge = { 칠곡:[4,-4], 고령:[0,6], 청도:[4,4], 경산:[-4,2], 영양:[0,-4] };
  Object.keys(nudge).forEach(k => { if (out[k]) { out[k].cx += nudge[k][0]; out[k].cy += nudge[k][1]; } });
  return out;
})();

/* ── 뼈대 ───────────────────────────────────────────────────────────── */
const SCENES = [
  ['ov-s1','어디가'],['ov-s2','얼마나'],['ov-s3','누가'],['ov-s4','언제'],['ov-s5','어느 시군이'],['ov-s6','이번 주']
];
function skeleton(){
  const n = tot(null, YN), e = tot(null, Y1), d = (e / n - 1) * 100;
  root.innerHTML = `
  <header class="ov-hero">
    <p class="ov-kicker"><img src="symbol1.jpg" alt="" class="ov-kicker-logo">경상북도 22개 시·군 · 학령인구 종합 상황판</p>
    <h1 id="ov-title">경북 초·중·고 학생, 10년 뒤 <em>${Math.round(-d)}%</em> 줄어듭니다</h1>
    <p class="ov-lede">2026년 <b>${f(n)}명</b>(학교알리미 공시)이 2036년 <b>${f(e)}명</b>(전망)이 됩니다.
      아래 다섯 장면이 그 숫자를 <b>어디가 · 얼마나 · 누가 · 언제 · 어느 시군이</b>로 나눠 보여 줍니다.</p>
    <div class="ov-controls" role="group" aria-label="연도와 지역 고르기">
      <button type="button" class="ov-play" id="ov-play" aria-pressed="false">
        <span class="ic" aria-hidden="true">▶</span><span class="lb">자동 재생</span></button>
      <div class="ov-years" id="ov-years" role="group" aria-label="연도">
        ${PILLS.map(y => `<button type="button" data-y="${y}" aria-pressed="${y === OV.year}">${y}<small>${y === YN ? '현재' : y < YN ? '실적' : '전망'}</small></button>`).join('')}
      </div>
      <label class="ov-range"><span class="sr-only">연도 세밀하게</span>
        <input type="range" id="ov-year" min="${Y0}" max="${Y1}" step="1" value="${OV.year}"></label>
      <label class="ov-region"><span class="sr-only">지역</span>
        <select id="ov-region">
          <option value="">경북 전체 (22개 시·군)</option>
          ${SIGUNGU.slice().sort((a, b) => a.s.localeCompare(b.s, 'ko')).map(sg => `<option value="${esc(sg.s)}">${esc(sg.name || sg.s)}</option>`).join('')}
        </select></label>
    </div>
  </header>

  <nav class="ov-dots no-print" aria-label="장면 바로가기">
    ${SCENES.map(([id, nm]) => `<a href="#${id}" data-dot="${id}" title="${nm}"><span class="sr-only">${nm}</span></a>`).join('')}
  </nav>

  <section class="ov-scene" id="ov-s1" aria-labelledby="ov-s1-h">
    <div class="ov-map-card">
      <div class="ov-scene-head">
        <p class="ov-num">① 어디가 <span class="ov-asof" id="ov-s1-asof"></span></p>
        <h2 id="ov-s1-h"></h2>
        <div class="ov-seg" role="group" aria-label="지도에 칠할 잣대">
          <button type="button" data-metric="students">학생 수</button>
          <button type="button" data-metric="change">변화율</button>
          <button type="button" data-metric="small">적정규모 미달 비율</button>
        </div>
      </div>
      <div class="ov-map" id="ov-map"></div>
      <div class="ov-legend" id="ov-legend"></div>
    </div>
    <aside class="ov-panel" id="ov-panel" aria-live="polite"></aside>
  </section>

  <section class="ov-scene ov-block" id="ov-s2" aria-labelledby="ov-s2-h">
    <div class="ov-scene-head"><p class="ov-num">② 얼마나 <span class="ov-asof" id="ov-s2-asof"></span></p><h2 id="ov-s2-h"></h2></div>
    <div class="ov-kpis" id="ov-kpis"></div>
    <p class="ov-callout" id="ov-s2-callout"></p>
    <div class="ov-links">
      <p class="ov-links-h">더 자세히 보려면</p>
      <div class="ov-link-grid">
        <a href="#map" class="ov-link"><b>지도로 보기</b><span>학교 하나하나가 어디에 있고, 가까운 학교까지 몇 km인가</span></a>
        <a href="#status" class="ov-link"><b>경북 학령인구 현황</b><span>학생이 줄면 학급·교원은 몇이 되나</span></a>
        <a href="#sim" class="ov-link"><b>학생수 시뮬레이터</b><span>무엇을 지키면 무엇이 달라지나</span></a>
        <a href="#closed" class="ov-link"><b>폐교 활용 현황</b><span>문 닫은 750곳은 지금 무엇이 되었나</span></a>
      </div>
    </div>
  </section>

  <section class="ov-scene ov-block" id="ov-s3" aria-labelledby="ov-s3-h">
    <div class="ov-scene-head"><p class="ov-num">③ 누가 <span class="ov-asof">2026 공시 학년별</span></p><h2 id="ov-s3-h"></h2></div>
    <div class="ov-cohort">
      <div class="ov-cohort-chart" id="ov-cohort"></div>
      <div class="ov-cohort-side" id="ov-cohort-side"></div>
    </div>
  </section>

  <section class="ov-scene ov-block" id="ov-s4" aria-labelledby="ov-s4-h">
    <div class="ov-scene-head"><p class="ov-num">④ 언제 <span class="ov-asof">2016~2025 실적 · 2026 공시 · 2027~ 전망</span></p><h2 id="ov-s4-h"></h2></div>
    <div class="ov-trend" id="ov-trend"></div>
    <div class="ov-phases" id="ov-phases"></div>
  </section>

  <section class="ov-scene ov-block" id="ov-s5" aria-labelledby="ov-s5-h">
    <div class="ov-s5-grid">
      <div>
        <div class="ov-scene-head"><p class="ov-num">⑤ 어느 시군이</p><h2 id="ov-s5-h"></h2>
          <div class="ov-seg" role="group" aria-label="막대 정렬">
            <button type="button" data-sort="drop">2036년까지 감소율</button>
            <button type="button" data-sort="size">2026 학생 수</button>
            <button type="button" data-sort="small">적정규모 미달 비율</button>
          </div></div>
        <div class="ov-bars" id="ov-bars"></div>
        <p class="ov-note">막대를 누르면 위의 장면이 모두 그 시군으로 바뀝니다. 파란 테두리가 고른 시군입니다.</p>
      </div>
      <div class="ov-size" id="ov-size"></div>
    </div>
  </section>

  <section class="ov-scene ov-block" id="ov-s6" aria-labelledby="ov-s6-h">
    <div class="ov-scene-head"><p class="ov-num">⑥ 이번 주</p><h2 id="ov-s6-h">학령인구 감소 대응 주간 브리프</h2></div>
    <div id="ov-brief-teaser" class="ov-brief-teaser"><p class="ov-note">주간 브리프를 불러오고 있습니다…</p></div>
  </section>

  <footer class="ov-foot">
    <b>자료</b> 학교알리미 2026 공시(학교·학년별 학생) · EDSS 교육통계 2016~2025(학생·학급 실적) ·
    2027~2036 전망은 실적에서 잰 학년 진급률과 출생아 수로 굴린 <b>코호트 진급법</b>(백테스트 오차 ${EDSS && EDSS.backtest ? EDSS.backtest.오차율 : '–'}%) ·
    폐교는 지방교육재정알리미. 적정규모 참고선은 동 60명·읍면 30명(학교 통폐합을 정하는 기준이 아닙니다).
    <br>전망은 «이대로라면»입니다. 전입·전출과 정책 효과는 들어 있지 않습니다.
  </footer>
  <div class="ov-tip" id="ov-tip" role="tooltip" hidden></div>`;
}

/* ── 공용: 알림풍선 ─────────────────────────────────────────────────── */
let tipEl = null;
function tip(e, rowsArr){
  if (!tipEl) tipEl = document.getElementById('ov-tip');
  if (!tipEl) return;
  tipEl.textContent = '';
  rowsArr.forEach(([k, v, sw]) => {
    const r = document.createElement('div'); r.className = 'r';
    if (sw) { const s = document.createElement('i'); s.className = 'sw'; s.style.background = sw; r.appendChild(s); }
    const b = document.createElement('b'); b.textContent = v; r.appendChild(b);
    const sp = document.createElement('span'); sp.textContent = k; r.appendChild(sp);
    tipEl.appendChild(r);
  });
  tipEl.hidden = false;
  const x = (e.clientX != null ? e.clientX : 0), y = (e.clientY != null ? e.clientY : 0);
  const w = tipEl.offsetWidth || 180, h = tipEl.offsetHeight || 60;
  tipEl.style.left = Math.min(window.innerWidth - w - 8, x + 14) + 'px';
  tipEl.style.top = Math.max(8, y - h - 12) + 'px';
}
function untip(){ if (tipEl) tipEl.hidden = true; }
function tipAt(el, rowsArr){
  const r = el.getBoundingClientRect();
  tip({ clientX: r.left + r.width / 2, clientY: r.top }, rowsArr);
}

/* ── ① 지도 ─────────────────────────────────────────────────────────── */
function drawMapOnce(){
  const box = document.getElementById('ov-map');
  if (!box || box.dataset.ready) return;
  const keys = Object.keys(GEO);
  if (!keys.length) { box.innerHTML = '<p class="ov-note">시군 경계를 싣지 못해 지도를 그릴 수 없습니다. 아래 막대로 비교해 주세요.</p>'; return; }
  const B = ULLEUNG_BOX;
  box.innerHTML = `<svg viewBox="0 0 ${MAP_W} ${MAP_H}" role="group" aria-label="경북 시군 지도 — 시군을 누르면 오른쪽에 그 시군 이야기가 나옵니다">
    <rect class="ov-inset" x="${B.x}" y="${B.y}" width="${B.w}" height="${B.h}" rx="8"/>
    <text class="ov-inset-lb" x="${B.x + 8}" y="${B.y + 12}">울릉 (축척 다름)</text>
    <g class="ov-rgs">${keys.map(k => `<path class="ov-rg" data-sgg="${esc(k)}" d="${GEO[k].d}" tabindex="0" role="button"/>`).join('')}</g>
    <g class="ov-lbs" aria-hidden="true">${keys.map(k => `<g class="ov-lb" data-sgg="${esc(k)}" transform="translate(${GEO[k].cx.toFixed(1)} ${GEO[k].cy.toFixed(1)})"><text class="n" y="-2">${esc(k)}</text><text class="v" y="9"></text></g>`).join('')}</g>
  </svg>`;
  box.dataset.ready = '1';
  box.querySelectorAll('.ov-rg').forEach(p => {
    const k = p.getAttribute('data-sgg');
    const pick = () => select(OV.sgg === k ? null : k);
    p.addEventListener('click', pick);
    p.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } });
    p.addEventListener('pointermove', ev => tip(ev, mapTipRows(k)));
    p.addEventListener('pointerleave', untip);
    p.addEventListener('focus', () => tipAt(p, mapTipRows(k)));
    p.addEventListener('blur', untip);
  });
}
function mapTipRows(k){
  const r = rows().find(x => x.s === k); if (!r) return [];
  return [
    [`${k} · ${OV.year}년 학생 수 (${kindWord(kindOf(OV.year))})`, f(r.y) + '명'],
    [`${changeSpan(OV.year).join('→')} 변화`, pct1(r.ch)],
    ['적정규모 미달 학교 (2026 공시)', `${r.under}곳 / ${r.schools}곳`]
  ];
}
function renderMap(){
  drawMapOnce();
  const M = METRICS[OV.metric], R = rows();
  const box = document.getElementById('ov-map'); if (!box) return;
  box.setAttribute('data-fam', M.fam);
  R.forEach(r => {
    const v = M.value(r), c = M.cls(v);
    const p = box.querySelector(`.ov-rg[data-sgg="${r.s}"]`);
    const g = box.querySelector(`.ov-lb[data-sgg="${r.s}"]`);
    if (p) {
      p.setAttribute('class', `ov-rg ${c}${OV.sgg === r.s ? ' sel' : ''}${OV.sgg && OV.sgg !== r.s ? ' dim' : ''}`);
      p.setAttribute('aria-label', `${r.s} ${M.label} ${M.short(v)}`);
      p.setAttribute('aria-pressed', String(OV.sgg === r.s));
    }
    if (g) { g.setAttribute('class', `ov-lb ${c}`); const t = g.querySelector('.v'); if (t) t.textContent = M.short(v); }
  });
  /* 고른 시군을 맨 위로 — 굵은 테두리가 이웃 밑에 깔리지 않게 */
  const sel = OV.sgg && box.querySelector(`.ov-rg[data-sgg="${OV.sgg}"]`);
  if (sel && sel.parentNode) sel.parentNode.appendChild(sel);

  const lg = document.getElementById('ov-legend');
  if (lg) lg.innerHTML = `<span class="ov-legend-h">${esc(M.label)}${OV.metric === 'change' ? ` (${changeSpan(OV.year).join('→')})` : OV.metric === 'small' ? ' (2026 공시)' : ` (${OV.year}년)`}</span>` +
    M.legend.map(([c, t]) => `<span class="ov-lg"><i class="sw ${M.fam} ${c}"></i>${esc(t)}</span>`).join('');

  document.querySelectorAll('#ov-s1 [data-metric]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.metric === OV.metric)));
  const asof = document.getElementById('ov-s1-asof');
  if (asof) asof.textContent = OV.metric === 'small' ? '2026 공시' : `${OV.year}년 · ${kindWord(kindOf(OV.year))}`;

  /* 제목 — 이 잣대로 칠했을 때 «무엇이 보이는가»를 한 줄로 */
  const h = document.getElementById('ov-s1-h'); if (!h) return;
  if (OV.metric === 'students') {
    const top = R.slice().sort((a, b) => b.y - a.y).slice(0, 4), all = R.reduce((a, r) => a + (r.y || 0), 0);
    const sh = top.reduce((a, r) => a + r.y, 0) / all * 100;
    h.textContent = `${OV.year}년 학생의 ${sh.toFixed(0)}%가 ${top.map(r => r.s).join('·')} 네 곳에 있습니다`;
  } else if (OV.metric === 'change') {
    const s = R.filter(r => r.ch != null).sort((a, b) => a.ch - b.ch);
    const up = s.filter(r => r.ch > 0).map(r => r.s);
    h.textContent = `${changeSpan(OV.year).join('→')}년, ${s[0].s}(${pct1(s[0].ch)})이 가장 가파르고 ${s[s.length - 1].s}(${pct1(s[s.length - 1].ch)})이 가장 완만합니다` +
      (up.length ? ` — 늘어난 곳은 ${up.join('·')}뿐입니다` : '');
  } else {
    const s = R.slice().sort((a, b) => b.small - a.small);
    const over = s.filter(r => r.small >= 50).map(r => r.s);
    h.textContent = over.length
      ? `${over.join('·')}은 학교의 절반 이상이 적정규모 참고선에 못 미칩니다`
      : `${s[0].s}이 적정규모 미달 비율 ${s[0].small.toFixed(0)}%로 가장 높습니다`;
  }
}

/* 오른쪽 칸 — 고른 지역의 이야기 */
function renderPanel(){
  const el = document.getElementById('ov-panel'); if (!el) return;
  const s = OV.sgg, y = OV.year;
  const vy = tot(s, y), v0 = tot(s, Y0), vn = tot(s, YN), v1 = tot(s, Y1);
  const L = lv(s, y), st = schoolStats(s), cl = closedOf(s), meta = s ? sggMeta(s) : null;
  const sum = (L.초 || 0) + (L.중 || 0) + (L.고 || 0);
  const seg = ['초','중','고'].map(l => `<span class="ov-stack-seg lv-${l}" style="flex:${(L[l] || 0) / (sum || 1)}" title="${l} ${f(L[l])}명"></span>`).join('');
  const spark = sparkSvg(s);
  const tags = s ? [meta.type === '군' ? '군 지역' : '시 지역', meta.decline ? '인구감소지역' : ''].filter(Boolean) : ['10개 시 · 12개 군'];
  el.innerHTML = `
    <p class="ov-panel-k">${s ? '시·군 브리핑' : '경상북도 종합 브리핑'}</p>
    <h3>${esc(regionName())} ${tags.map(t => `<span class="ov-tag">${esc(t)}</span>`).join('')}</h3>
    <div class="ov-panel-kpis">
      <div class="k"><span>${y}년 초·중·고 학생 <em>${esc(kindWord(kindOf(y)))}</em></span><b>${f(vy)}<small>명</small></b>
        <div class="ov-stack" aria-hidden="true">${seg}</div>
        <p class="ov-stack-lg">${['초','중','고'].map(l => `<i class="sw lv-${l}"></i>${l} ${f(L[l])}`).join(' · ')}</p></div>
      <div class="k"><span>2026→2036 변화 <em>전망</em></span><b class="neg">${pct1((v1 / vn - 1) * 100)}</b>
        <p class="ov-sub">${f(vn)}명 → ${f(v1)}명</p></div>
      <div class="k"><span>적정규모 미달 학교 <em>2026 공시</em></span><b>${st.under}<small>곳 / ${st.total}곳</small></b>
        <p class="ov-sub">소규모 ${st.by.small} · 최소규모 ${st.by.minimum} (${st.share == null ? '–' : st.share.toFixed(0)}%)</p></div>
      <div class="k"><span>문 닫은 학교(누적)</span><b>${f(cl)}<small>곳</small></b>
        <p class="ov-sub">${s ? '지방교육재정알리미' : '1990년대에만 ' + f(decadeClosed(1990)) + '곳'}</p></div>
    </div>
    <div class="ov-spark">${spark}</div>
    <p class="ov-diag">💡 ${diagnosis(s, v0, vn, v1, st)}</p>
    <div class="ov-panel-act">
      ${s ? `<button type="button" class="ov-btn" data-act="map">${esc(s)} 지도에서 보기</button>
             <button type="button" class="ov-btn ghost" data-act="status">현황에서 자세히</button>
             <button type="button" class="ov-btn ghost" data-act="clear">경북 전체로</button>`
          : `<p class="ov-note">지도에서 시군을 누르면 이 칸이 그 시군 이야기로 바뀝니다.</p>`}
    </div>`;
  el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.act;
    if (a === 'clear') select(null);
    else if (a === 'map' && typeof openMapFor === 'function') openMapFor(s);
    else if (a === 'status') { if (typeof selectSgg === 'function') selectSgg(s); location.hash = 'status'; }
  }));
}
function decadeClosed(d){
  if (typeof CLOSED === 'undefined' || !CLOSED || !CLOSED.byYear) return null;
  return Object.keys(CLOSED.byYear).filter(y => +y >= d && +y < d + 10).reduce((a, y) => a + CLOSED.byYear[y], 0);
}
function diagnosis(s, v0, vn, v1, st){
  const past = (vn / v0 - 1) * 100, next = (v1 / vn - 1) * 100;
  const faster = Math.abs(next) > Math.abs(past) * 1.4;
  const who = s || '경북';
  let t = `${who}의 초·중·고 학생은 지난 10년 ${pct1(past)}, 앞으로 10년 ${pct1(next)}입니다.`;
  if (past > 0) t += ` 지난 10년에는 늘었지만, 앞으로는 줄어드는 쪽으로 돌아섭니다.`;
  else if (faster) t += ` 줄어드는 속도가 앞으로 ${(next / past).toFixed(1)}배 빨라집니다.`;
  if (st.share != null && st.share >= 40) t += ` 학교 ${st.total}곳 가운데 ${st.under}곳이 이미 적정규모 참고선 아래라, 학교 배치 논의가 «앞으로»가 아니라 «지금»의 일입니다.`;
  else if (st.share != null && st.share < 10) t += ` 적정규모 미달 학교는 ${st.under}곳뿐이라, 과제는 학교 수보다 학급·교원 조정 쪽에 있습니다.`;
  return esc(t);
}
function sparkSvg(s){
  const W = 280, H = 56, P = 4; const pts = [];
  for (let y = Y0; y <= Y1; y++) pts.push([y, tot(s, y)]);
  const mx = Math.max(...pts.map(p => p[1] || 0)) || 1;
  const X = y => P + (y - Y0) / (Y1 - Y0) * (W - P * 2), Yv = v => H - P - v / mx * (H - P * 2 - 10);
  const line = pts.filter(p => p[1] != null).map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Yv(p[1]).toFixed(1)).join('');
  const cur = pts.find(p => p[0] === OV.year);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(regionName())} 2016~2036 학생 수 추이">
    <rect class="pj" x="${X(YN)}" y="0" width="${W - P - X(YN)}" height="${H}"/>
    <path class="ln" d="${line}"/>
    ${cur && cur[1] != null ? `<circle class="dt" cx="${X(cur[0])}" cy="${Yv(cur[1])}" r="4"/>` : ''}
    <text x="${P}" y="${H - 1}">2016</text><text x="${X(YN)}" y="${H - 1}" text-anchor="middle">2026</text><text x="${W - P}" y="${H - 1}" text-anchor="end">2036</text>
  </svg>`;
}

/* ── ② 네 지표 ──────────────────────────────────────────────────────── */
function renderKpis(){
  const s = OV.sgg, y = OV.year;
  const vy = tot(s, y), v0 = tot(s, Y0), L = lv(s, y);
  const g = cohortGrades(s), e1 = (g.초 || [])[0] || 0, h3 = (g.고 || [])[2] || 0;
  const st = schoolStats(s);
  const eShare = vy ? (L.초 || 0) / vy * 100 : null;
  const cards = [
    { k:'초·중·고 학생', b: f(vy), u:'명', tag: kindWord(kindOf(y)), bar: v0 ? vy / v0 : 0,
      l: `2016년(${f(v0)}명)을 100으로`, r: `${v0 ? Math.round(vy / v0 * 100) : '–'}`, foot: `2016년 대비 ${pct1((vy / v0 - 1) * 100)}` },
    { k:'초등학생', b: f(L.초), u:'명', tag: `전체의 ${eShare == null ? '–' : eShare.toFixed(1)}%`, bar: (eShare || 0) / 100,
      l:'초·중·고 가운데 초등 몫', r: (eShare == null ? '–' : eShare.toFixed(1)) + '%', foot:'가장 먼저, 가장 크게 줄어드는 학교급' },
    { k:'초1 ÷ 고3', b: h3 ? Math.round(e1 / h3 * 100) : '–', u:'%', tag:'2026 공시', bar: h3 ? e1 / h3 : 0, tone:'warn',
      l:`초1 ${f(e1)}명 · 고3 ${f(h3)}명`, r:'', foot:'100보다 작을수록 아래 학년이 가늘어진 것' },
    { k:'적정규모 미달 학교', b: st.under, u:`곳 / ${st.total}곳`, tag:'2026 공시', bar: (st.share || 0) / 100, tone:'danger',
      l:`소규모 ${st.by.small} · 최소규모 ${st.by.minimum}`, r: (st.share == null ? '–' : st.share.toFixed(1)) + '%', foot:'동 60명·읍면 30명 참고선 기준' }
  ];
  const box = document.getElementById('ov-kpis'); if (!box) return;
  box.innerHTML = cards.map(c => `
    <div class="ov-kpi ${c.tone || ''}">
      <div class="top"><span>${esc(c.k)}</span><em>${esc(c.tag)}</em></div>
      <b>${esc(c.b)}<small>${esc(c.u)}</small></b>
      <div class="bar" aria-hidden="true"><i style="width:${Math.max(2, Math.min(100, c.bar * 100)).toFixed(1)}%"></i></div>
      <div class="lr"><span>${esc(c.l)}</span><span>${esc(c.r)}</span></div>
      <p>${esc(c.foot)}</p>
    </div>`).join('');
  const asof = document.getElementById('ov-s2-asof'); if (asof) asof.textContent = `${regionName()} · ${y}년`;
  const h = document.getElementById('ov-s2-h');
  if (h) h.textContent = `${regionName()}: ${y}년 학생 ${f(vy)}명 — 2016년의 ${v0 ? Math.round(vy / v0 * 100) : '–'}% · 초1은 고3의 ${h3 ? Math.round(e1 / h3 * 100) : '–'}%`;
  const c = document.getElementById('ov-s2-callout');
  if (c) c.innerHTML = `<b>이 네 숫자가 말하는 것</b> — 학생 수는 해마다 줄고(①), 그 감소는 초등에서 먼저 옵니다(②).
    지금 초1이 고3보다 ${h3 ? f(h3 - e1) : '–'}명 적다는 것은(③) 앞으로 12년 동안 이 차이가 학년을 따라 올라간다는 뜻이고,
    그 사이 적정규모 참고선 아래 학교(④)는 더 늘어날 수밖에 없습니다.`;
}

/* ── ③ 학년별 ───────────────────────────────────────────────────────── */
function renderCohortScene(){
  const s = OV.sgg, g = cohortGrades(s);
  const list = [];
  ['고','중','초'].forEach(l => { const a = g[l] || []; for (let i = a.length - 1; i >= 0; i--) list.push({ l, i: i + 1, v: a[i] || 0 }); });
  const mx = Math.max(...list.map(r => r.v)) || 1;
  const e1 = (g.초 || [])[0] || 0, h3 = (g.고 || [])[2] || 0, m1 = (g.중 || [])[0] || 0;
  const box = document.getElementById('ov-cohort'); if (!box) return;
  box.innerHTML = `<div class="ov-hbars" role="list" aria-label="${esc(regionName())} 학년별 학생 수 (2026 공시)">` + list.map(r => {
    const hl = (r.l === '초' && r.i === 1) || (r.l === '고' && r.i === 3);
    return `<div class="ov-hbar${hl ? ' hl' : ''}" role="listitem" tabindex="0" data-tip="${esc(`${r.l}${r.i} · ${f(r.v)}명`)}">
      <span class="nm">${r.l === '초' ? '초등' : r.l === '중' ? '중학' : '고교'} ${r.i}학년</span>
      <span class="tr"><i class="lv-${r.l}" style="width:${(r.v / mx * 100).toFixed(1)}%"></i></span>
      <span class="val">${f(r.v)}</span></div>`;
  }).join('') + '</div>';
  box.querySelectorAll('.ov-hbar').forEach(b => {
    b.addEventListener('pointermove', ev => tip(ev, [[b.dataset.tip.split(' · ')[0] + ' (2026 공시)', b.dataset.tip.split(' · ')[1]]]));
    b.addEventListener('pointerleave', untip);
  });
  const h = document.getElementById('ov-s3-h');
  if (h) h.textContent = e1 < h3
    ? `고3 ${f(h3)}명 → 초1 ${f(e1)}명, 아래 학년으로 갈수록 가늘어집니다`
    : `${regionName()}은 초1(${f(e1)}명)이 고3(${f(h3)}명)보다 많습니다`;
  const side = document.getElementById('ov-cohort-side');
  if (side) side.innerHTML = `
    <div class="ov-mini"><span>초1 ÷ 고3</span><b>${h3 ? Math.round(e1 / h3 * 100) : '–'}%</b><p>지금 입학하는 아이는 졸업하는 아이의 ${h3 ? Math.round(e1 / h3 * 10) : '–'}/10</p></div>
    <div class="ov-mini"><span>2032년 중1이 될 아이</span><b>${f(e1)}명</b><p>지금 중1(${f(m1)}명)보다 ${f(m1 - e1)}명 적습니다 — 이미 태어나 학교에 다니는 아이라 «예측»이 아니라 «셈»입니다</p></div>
    <p class="ov-note">전학·유급·사립·특수학교 이동은 넣지 않았습니다(«그대로 머문다면»). 학년별 합은 특수학급 학생을 빼고 셉니다.
      <a href="#status" data-go-status>누가 올라오나 자세히 →</a></p>`;
  const go = side && side.querySelector('[data-go-status]');
  if (go) go.addEventListener('click', () => { if (typeof selectSgg === 'function') selectSgg(OV.sgg); if (typeof setStatusView === 'function') setStatusView('who'); });
}

/* ── ④ 추이 ─────────────────────────────────────────────────────────── */
/* 그림의 가로는 «놓일 칸의 실제 폭»으로 잡습니다. viewBox 를 고정하면 넓은 화면에서
   글자까지 함께 커져 그림 하나가 화면을 다 차지합니다. 숨은 화면이면 1000 으로. */
function boxW(id, min){ const b = document.getElementById(id); return Math.max(min || 560, Math.round((b && b.clientWidth) || 1000)); }
function renderTrend(){
  const s = OV.sgg, W = boxW('ov-trend'), H = 320, PL = 52, PR = 16, PT = 18, PB = 30;
  const pts = []; for (let y = Y0; y <= Y1; y++) pts.push({ y, ...lv(s, y), t: tot(s, y), k: regionTotalStudents(s, y).kind });
  const mxRaw = Math.max(...pts.map(p => p.t || 0));
  const step = mxRaw > 200000 ? 100000 : mxRaw > 40000 ? 20000 : mxRaw > 10000 ? 5000 : mxRaw > 4000 ? 1000 : 500;
  const mx = Math.ceil(mxRaw / step) * step;
  const X = y => PL + (y - Y0) / (Y1 - Y0) * (W - PL - PR);
  const Yv = v => H - PB - v / mx * (H - PT - PB);
  const layers = [['초'],['초','중'],['초','중','고']];
  const cum = (p, ks) => ks.reduce((a, k) => a + (p[k] || 0), 0);
  const area = (ks, prev) => {
    const top = pts.map(p => [X(p.y), Yv(cum(p, ks))]);
    const bot = pts.slice().reverse().map(p => [X(p.y), Yv(prev ? cum(p, prev) : 0)]);
    return 'M' + top.concat(bot).map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L') + 'Z';
  };
  const line = ks => 'M' + pts.map(p => X(p.y).toFixed(1) + ' ' + Yv(cum(p, ks)).toFixed(1)).join('L');
  const ticks = []; for (let v = 0; v <= mx; v += step) ticks.push(v);
  const box = document.getElementById('ov-trend'); if (!box) return;
  const cur = pts.find(p => p.y === OV.year);
  box.innerHTML = `
    <div class="ov-trend-lg">${['고','중','초'].map(l => `<span><i class="sw lv-${l}"></i>${l === '초' ? '초등' : l === '중' ? '중학' : '고교'}</span>`).join('')}
      <span class="pj-lg"><i></i>2027~ 전망</span></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(regionName())} 초·중·고 학생 수 2016~2036 — 2016년 ${f(pts[0].t)}명, 2026년 ${f(tot(s, YN))}명, 2036년 ${f(pts[pts.length - 1].t)}명">
      <rect class="pj" x="${X(YN + 0.5)}" y="${PT}" width="${X(Y1) - X(YN + 0.5)}" height="${H - PT - PB}"/>
      ${ticks.map(v => `<line class="gd" x1="${PL}" x2="${W - PR}" y1="${Yv(v)}" y2="${Yv(v)}"/><text class="ax" x="${PL - 8}" y="${Yv(v) + 4}" text-anchor="end">${v >= 10000 ? (v / 10000) + '만' : f(v)}</text>`).join('')}
      ${[2016, 2021, 2026, 2031, 2036].map(y => `<text class="ax${y === YN ? ' now' : ''}" x="${X(y)}" y="${H - 10}" text-anchor="middle">${y}${y === YN ? ' 현재' : ''}</text>`).join('')}
      ${layers.map((ks, i) => `<path class="ar lv-${ks[ks.length - 1]}" d="${area(ks, i ? layers[i - 1] : null)}"/>`).join('')}
      ${layers.map(ks => `<path class="ln lv-${ks[ks.length - 1]}" d="${line(ks)}"/>`).join('')}
      <line class="nowl" x1="${X(YN)}" x2="${X(YN)}" y1="${PT}" y2="${H - PB}"/>
      ${cur ? `<line class="sel" x1="${X(cur.y)}" x2="${X(cur.y)}" y1="${PT}" y2="${H - PB}"/><circle class="seld" cx="${X(cur.y)}" cy="${Yv(cur.t)}" r="5"/>` : ''}
      <text class="endlb" x="${X(Y0) + 4}" y="${Yv(pts[0].t) - 8}">${f(pts[0].t)}명</text>
      <text class="endlb" x="${X(Y1) - 4}" y="${Yv(pts[pts.length - 1].t) - 8}" text-anchor="end">${f(pts[pts.length - 1].t)}명</text>
      <line class="xh" id="ov-xh" x1="0" x2="0" y1="${PT}" y2="${H - PB}" visibility="hidden"/>
      <rect class="hit" x="${PL}" y="${PT}" width="${W - PL - PR}" height="${H - PT - PB}" tabindex="0" aria-label="연도별 값 읽기 — 화살표 키로 옮깁니다"/>
    </svg>`;
  const svg = box.querySelector('svg'), hit = box.querySelector('.hit'), xh = box.querySelector('#ov-xh');
  let kbY = OV.year;
  const show = (y, ev) => {
    const p = pts.find(q => q.y === y); if (!p) return;
    xh.setAttribute('x1', X(y)); xh.setAttribute('x2', X(y)); xh.setAttribute('visibility', 'visible');
    const rowsArr = [[`${y}년 초·중·고 (${kindWord(p.k)})`, f(p.t) + '명'],
      ['고교', f(p.고) + '명', 'var(--ov-고)'], ['중학', f(p.중) + '명', 'var(--ov-중)'], ['초등', f(p.초) + '명', 'var(--ov-초)']];
    if (ev) tip(ev, rowsArr); else { const r = svg.getBoundingClientRect(); tip({ clientX: r.left + X(y) / W * r.width, clientY: r.top + 20 }, rowsArr); }
  };
  const yAt = ev => { const r = svg.getBoundingClientRect(); const x = (ev.clientX - r.left) / r.width * W; return Math.max(Y0, Math.min(Y1, Math.round(Y0 + (x - PL) / (W - PL - PR) * (Y1 - Y0)))); };
  hit.addEventListener('pointermove', ev => show(yAt(ev), ev));
  hit.addEventListener('pointerleave', () => { xh.setAttribute('visibility', 'hidden'); untip(); });
  hit.addEventListener('click', ev => setYear(yAt(ev)));
  hit.addEventListener('keydown', ev => {
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') { ev.preventDefault(); kbY = Math.max(Y0, Math.min(Y1, kbY + (ev.key === 'ArrowRight' ? 1 : -1))); show(kbY); }
    if (ev.key === 'Enter') setYear(kbY);
  });
  hit.addEventListener('blur', () => { xh.setAttribute('visibility', 'hidden'); untip(); });

  /* 감소가 가장 가파른 5년 — 학교급마다 */
  const phases = ['초','중','고'].map(l => {
    let best = null;
    for (let a = YN; a <= Y1 - 5; a++) {
      const va = regionStudents(s, l, a).v, vb = regionStudents(s, l, a + 5).v;
      if (!va || vb == null) continue;
      const d = (vb / va - 1) * 100;
      if (!best || d < best.d) best = { l, a, b: a + 5, d, va, vb };
    }
    return best;
  }).filter(Boolean);
  const ordered = phases.slice().sort((p, q) => p.a - q.a);
  const wave = ordered.length === 3 && ordered.map(p => p.l).join('') === '초중고';
  const h = document.getElementById('ov-s4-h');
  const d10 = (tot(s, Y1) / tot(s, YN) - 1) * 100, dPast = (tot(s, YN) / tot(s, Y0) - 1) * 100;
  if (h) h.textContent = wave
    ? `감소의 물결이 초등 → 중학 → 고교로 올라갑니다 (지난 10년 ${pct1(dPast)}, 앞으로 10년 ${pct1(d10)})`
    : `지난 10년 ${pct1(dPast)}, 앞으로 10년 ${pct1(d10)} — 가장 가파른 구간은 ${ordered[0] ? `${ordered[0].l === '초' ? '초등' : ordered[0].l === '중' ? '중학' : '고교'} ${ordered[0].a}~${ordered[0].b}년` : '–'}`;
  const ph = document.getElementById('ov-phases');
  const NM = { 초:'초등', 중:'중학', 고:'고교' };
  if (ph) ph.innerHTML = ordered.map((p, i) => `
    <div class="ov-phase lv-${p.l}">
      <p class="t"><i class="sw lv-${p.l}"></i>${i + 1}차 · ${NM[p.l]} ${p.a}~${p.b}년 <em>${pct1(p.d)}</em></p>
      <p>${NM[p.l]} 학생이 5년 사이 ${f(p.va)}명에서 ${f(p.vb)}명으로 줄어드는, 이 학교급에서 가장 가파른 구간입니다.
        ${p.l === '초' ? '입학생 감소가 그대로 학교 규모로 옮겨 가는 때입니다.' : p.l === '중' ? '초등에서 줄어든 학년이 중학교로 올라오는 때입니다.' : '중학교에서 줄어든 학년이 고교로 올라오는 때입니다.'}</p>
    </div>`).join('');
}

/* ── ⑤ 시군 비교 ────────────────────────────────────────────────────── */
function renderBars(){
  const R = rows();
  const key = { drop: r => -r.next, size: r => r.now, small: r => r.small }[OV.sort];
  const fmtV = { drop: r => pct1(r.next), size: r => f(r.now) + '명', small: r => r.small.toFixed(0) + '%' }[OV.sort];
  R.sort((a, b) => key(b) - key(a));
  const W = boxW('ov-bars', 520), H = 260, PL = 10, PR = 10, PT = 22, PB = 34;
  const mx = Math.max(...R.map(key)) || 1;
  const bw = (W - PL - PR) / R.length, barW = Math.min(24, bw - 6);
  const box = document.getElementById('ov-bars'); if (!box) return;
  const top = R[0], sel = OV.sgg;
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="22개 시군 ${esc({ drop:'2036년까지 감소율', size:'2026 학생 수', small:'적정규모 미달 비율' }[OV.sort])} 막대">
    <line class="gd" x1="${PL}" x2="${W - PR}" y1="${H - PB}" y2="${H - PB}"/>
    ${R.map((r, i) => {
      const v = key(r), h = Math.max(2, v / mx * (H - PT - PB)), x = PL + i * bw + (bw - barW) / 2, y = H - PB - h;
      const isSel = sel === r.s, lab = isSel || i === 0 || i === R.length - 1;
      return `<g class="ov-b${isSel ? ' sel' : ''}${r.type === '군' ? ' gun' : ''}" data-sgg="${esc(r.s)}" tabindex="0" role="button" aria-pressed="${isSel}" aria-label="${esc(r.s)} ${esc(fmtV(r))}">
        <rect class="hitb" x="${PL + i * bw}" y="${PT - 16}" width="${bw}" height="${H - PT - PB + 16}"/>
        <path class="bar" d="M${x} ${H - PB}V${y + 4}q0 -4 4 -4h${barW - 8}q4 0 4 4V${H - PB}Z"/>
        ${lab ? `<text class="bv" x="${x + barW / 2}" y="${y - 5}" text-anchor="middle">${esc(fmtV(r))}</text>` : ''}
        <text class="bx" x="${x + barW / 2}" y="${H - PB + 15}" text-anchor="middle">${esc(r.s)}</text>
      </g>`;
    }).join('')}
  </svg>`;
  box.querySelectorAll('.ov-b').forEach(g => {
    const k = g.getAttribute('data-sgg'), r = R.find(x => x.s === k);
    const pick = () => select(OV.sgg === k ? null : k);
    g.addEventListener('click', pick);
    g.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } });
    g.addEventListener('pointermove', ev => tip(ev, [[`${k} (${r.type})`, fmtV(r)], ['2026 → 2036', `${f(r.now)} → ${f(r.end)}명`], ['적정규모 미달', `${r.under}/${r.schools}곳`]]));
    g.addEventListener('pointerleave', untip);
  });
  document.querySelectorAll('#ov-s5 [data-sort]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sort === OV.sort)));
  const h = document.getElementById('ov-s5-h');
  const gun = R.filter(r => r.type === '군'), si = R.filter(r => r.type === '시');
  const avg = a => a.reduce((x, r) => x + r.next, 0) / a.length;
  if (h) h.textContent = OV.sort === 'drop'
    ? `2036년까지 ${top.s}(${pct1(top.next)})부터 — 군 지역 평균 ${pct1(avg(gun))}, 시 지역 평균 ${pct1(avg(si))}`
    : OV.sort === 'size'
      ? `포항·구미 두 곳이 ${Math.round((R[0].now + R[1].now) / R.reduce((a, r) => a + r.now, 0) * 100)}% — 학생은 몇 곳에 몰려 있습니다`
      : `${top.s}은 학교 ${top.schools}곳 가운데 ${top.under}곳(${top.small.toFixed(0)}%)이 적정규모 참고선 아래입니다`;

  /* 오른쪽 — 학교 규모 구성(고른 지역) */
  const st = schoolStats(OV.sgg), T = st.total || 1;
  const parts = [['appropriate','적정규모 참고선 이상', st.by.appropriate], ['small','소규모', st.by.small], ['minimum','최소규모(15명 이하)', st.by.minimum]];
  const sz = document.getElementById('ov-size');
  if (sz) sz.innerHTML = `
    <p class="ov-num">학교 규모 구성 · ${esc(regionName())}</p>
    <h3>${st.total}곳 가운데 <em>${st.under}곳(${(st.under / T * 100).toFixed(0)}%)</em>이 참고선 아래</h3>
    <div class="ov-100" role="img" aria-label="${parts.map(p => `${p[1]} ${p[2]}곳`).join(', ')}">
      ${parts.map(p => `<span class="seg ${p[0]}" style="flex:${p[2] / T}"></span>`).join('')}</div>
    <ul class="ov-100-lg">${parts.map(p => `<li><i class="sw sz-${p[0]}"></i><span>${esc(p[1])}</span><b>${p[2]}곳</b><em>${(p[2] / T * 100).toFixed(1)}%</em></li>`).join('')}</ul>
    <div class="ov-mini"><span>문 닫은 학교(누적)</span><b>${f(closedOf(OV.sgg))}곳</b>
      <p>${OV.sgg ? '지방교육재정알리미 폐교정보' : `1990년대에만 ${f(decadeClosed(1990))}곳 — 지금이 처음이 아닙니다`}</p></div>
    <p class="ov-note">참고선 — 동 60명 이상·읍면 30명 이상이면 적정규모, 15명 이하 최소규모, 그 사이 소규모. 통폐합을 정하는 기준이 아닙니다.</p>`;
}

/* ── 고르기·연도 ────────────────────────────────────────────────────── */
function select(s){
  OV.sgg = s || null;
  const sel = document.getElementById('ov-region'); if (sel) sel.value = OV.sgg || '';
  renderAll();
}
function setYear(y){
  OV.year = Math.max(Y0, Math.min(Y1, Math.round(y)));
  document.querySelectorAll('#ov-years [data-y]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.y === OV.year)));
  const r = document.getElementById('ov-year'); if (r) r.value = OV.year;
  renderMap(); renderPanel(); renderKpis(); renderTrendMarker();
}
/* 연도만 바뀌면 추이 그림은 표시선만 옮깁니다 — 자동 재생 중 깜빡이지 않게 */
function renderTrendMarker(){ renderTrend(); }
function stop(){ if (OV.timer) { clearInterval(OV.timer); OV.timer = null; } const b = document.getElementById('ov-play'); if (b) { b.setAttribute('aria-pressed', 'false'); b.querySelector('.ic').textContent = '▶'; b.querySelector('.lb').textContent = '자동 재생'; } }
function play(){
  if (OV.timer) return stop();
  if (OV.year >= Y1) setYear(Y0);
  const b = document.getElementById('ov-play');
  if (b) { b.setAttribute('aria-pressed', 'true'); b.querySelector('.ic').textContent = '❚❚'; b.querySelector('.lb').textContent = '멈춤'; }
  OV.timer = setInterval(() => { if (OV.year >= Y1) return stop(); setYear(OV.year + 1); }, 650);
}

function renderAll(){ renderMap(); renderPanel(); renderKpis(); renderCohortScene(); renderTrend(); renderBars(); }

function wire(){
  document.querySelectorAll('#ov-years [data-y]').forEach(b => b.addEventListener('click', () => { stop(); setYear(+b.dataset.y); }));
  const r = document.getElementById('ov-year'); if (r) r.addEventListener('input', () => { stop(); setYear(+r.value); });
  const p = document.getElementById('ov-play'); if (p) p.addEventListener('click', play);
  const sel = document.getElementById('ov-region'); if (sel) sel.addEventListener('change', () => select(sel.value));
  document.querySelectorAll('#ov-s1 [data-metric]').forEach(b => b.addEventListener('click', () => { OV.metric = b.dataset.metric; renderMap(); }));
  document.querySelectorAll('#ov-s5 [data-sort]').forEach(b => b.addEventListener('click', () => { OV.sort = b.dataset.sort; renderBars(); }));
  /* 장면 점 — 지금 보고 있는 장면에 불을 켭니다 */
  const dots = root.querySelectorAll('.ov-dots a');
  dots.forEach(a => a.addEventListener('click', ev => {
    ev.preventDefault();
    const t = document.getElementById(a.dataset.dot);
    if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) dots.forEach(a => a.classList.toggle('on', a.dataset.dot === e.target.id));
    }), { rootMargin: '-40% 0px -55% 0px' });
    SCENES.forEach(([id]) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }
  /* 다른 화면으로 가면 자동 재생을 멈추고, 돌아오면 폭을 다시 잽니다(숨어 있던 동안 폭은 0) */
  window.addEventListener('hashchange', () => {
    if ((location.hash || '').slice(1) !== 'overview') stop();
    else setTimeout(() => { renderTrend(); renderBars(); }, 0);
  });
  let rz = null;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { renderTrend(); renderBars(); }, 150); });
}

/* ── Excel · 인쇄 — 본체의 currentViewExport·printScopeText 가 부릅니다 ── */
window.overviewExportSheets = function(){
  const R = rows().sort((a, b) => EXPORT_SIGUNGU_ORDER.indexOf(a.s) - EXPORT_SIGUNGU_ORDER.indexOf(b.s));
  const years = []; for (let y = Y0; y <= Y1; y++) years.push(y);
  const g = cohortGrades(OV.sgg);
  return [
    { name:'시군별', title:`22개 시군 — 학생 수·변화·학교 규모 (고른 해 ${OV.year}년)`,
      rows:[['시군','구분','2016 학생','2026 학생(공시)','2036 학생(전망)',`${OV.year} 학생`,'2016→2026 변화(%)','2026→2036 변화(%)','학교 수(2026)','적정규모 미달','미달 비율(%)','폐교 누적']]
        .concat(R.map(r => [r.s, r.type, r.first, r.now, r.end, r.y, +((r.now / r.first - 1) * 100).toFixed(1), +r.next.toFixed(1), r.schools, r.under, +r.small.toFixed(1), r.closed])),
      note:'학생 수는 초·중·고 합. 2016~2025 EDSS 실적, 2026 학교알리미 공시, 2027~ 코호트 진급법 전망(도 전체를 굴려 시군 몫으로 나눔). 적정규모 참고선: 동 60명·읍면 30명.' },
    { name:'연도별', title:`${regionName()} 연도별 초·중·고 학생 수`,
      rows:[['연도','값의 성격','초','중','고','계']].concat(years.map(y => { const L = lv(OV.sgg, y); return [y, regionTotalStudents(OV.sgg, y).kind, L.초, L.중, L.고, tot(OV.sgg, y)]; })) },
    { name:'학년별', title:`${regionName()} 학년별 학생 수 (2026 공시)`,
      rows:[['학교급','1학년','2학년','3학년','4학년','5학년','6학년']].concat(['초','중','고'].map(l => [l].concat(g[l] || []))),
      note:'학교알리미는 학년별 인원을 일반학급 기준으로 냅니다(특수학급 학생 제외).' }
  ];
};
window.overviewScopeText = function(){
  return `${regionName()} · ${OV.year}년 · 지도 잣대: ${METRICS[OV.metric].label}`;
};

/* ── 시작 ───────────────────────────────────────────────────────────── */
try {
  skeleton(); wire(); renderAll();
} catch (e) {
  root.innerHTML = '<div class="card"><b>한눈에 보기를 그리지 못했습니다.</b><br><span class="ov-note">' + esc(e.message) + '</span></div>';
  if (window.console) console.error(e);
}
})();
