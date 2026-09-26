/* ==========================================================================
   학령인구 감소 대응 주간 브리프 〔로컬 실험 · 2026. 9. 26.〕
   ──────────────────────────────────────────────────────────────────────────
   요청 — 「단순 기사를 끌어오는 수준이 아니라 심도 있는 브리프」
   (예: numbers.coroke.net — 숫자 하나 · 그래프 한 장 · 짧은 해설 · 출처)

   이 화면은 news-pipeline/build-weekly-brief.mjs 가 만든 assets/brief/*.json 을
   «그리기만» 합니다. 글과 숫자는 만드는 쪽에서 이미 검증을 통과했습니다
   (근거 기사 없는 문장·근거 없는 숫자는 싣지 않음). 여기서는 새 숫자를 만들지
   않습니다 — 그림의 값도 JSON 에 코드가 센 값이 그대로 들어 있습니다.

   ★ 같은 출처에서 받아 옵니다(fetch). 배포본 CSP 의 connect-src 'self' 안입니다.
   ★ 기사 본문은 싣지 않습니다 — 제목·매체·날짜·원문 링크만 (저작권).
   ========================================================================== */
(function(){
'use strict';
const root = document.getElementById('br-root');
if (!root) return;
const esc = v => String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const fmt = n => (n == null || !isFinite(n)) ? '–' : Number(n).toLocaleString('ko-KR');
const BASE = 'assets/brief/';
const B = { index: null, issue: null, byId: {} };

function md(d){ const p = String(d || '').split('-'); return p.length === 3 ? `${+p[1]}. ${+p[2]}.` : d; }

/* 근거 기사 — 매체·날짜 칩. 제목은 풍선으로, 누르면 원문(새 창) */
function cites(ids){
  const list = (ids || []).map(id => B.byId[id]).filter(Boolean);
  if (!list.length) return '';
  return `<span class="br-cites"><span class="lb">근거</span>${list.map(a =>
    `<a class="br-cite" href="${esc(a.link)}" target="_blank" rel="noopener" title="${esc(a.title)}">${esc(a.outlet || '기사')}<em>${md(a.date)}</em></a>`).join('')}</span>`;
}
function factChips(facts){
  if (!facts || !facts.length) return '';
  return `<div class="br-facts">${facts.map(f => `<span class="br-fact" title="${esc(f.src || '')}"><em>${esc(f.label)}</em><b>${esc(fmtVal(f.value, f.unit))}</b></span>`).join('')}</div>`;
}
function fmtVal(v, unit){
  if (unit === '%') return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + '%';
  return fmt(v) + (unit || '');
}

/* ── 그림 — 값은 JSON 에 든 그대로. 막대 ≤24px·끝 4px 둥글게·값은 끝에 ── */
function chartHtml(c){
  if (!c || !c.rows || !c.rows.length) return '';
  const rows = c.rows, mx = Math.max(...rows.map(r => r.value || 0)) || 1;
  /* 값 표기 — %는 소수 한 자리, «2016년 = 100» 같은 지수도 소수 한 자리, 나머지는 천 단위 쉼표 */
  const isIndex = !!(c.unit && c.unit.indexOf('=') > 0);
  const valTxt = r => (r.prefix || '') + (c.unit === '%' ? (+r.value).toFixed(1) + '%' : isIndex ? (+r.value).toFixed(1) : fmt(r.value));
  let svg = '';
  if (c.type === 'line') {
    /* 카드 폭(약 300px)에 맞춘 캔버스 — 크게 그려 줄이면 글자가 5~6px 로 작아집니다 */
    const W = 320, H = 170, PL = 6, PR = 6, PT = 24, PB = 22;
    const X = i => PL + i / (rows.length - 1) * (W - PL - PR), Y = v => H - PB - v / mx * (H - PT - PB);
    const iNow = rows.findIndex(r => r.hl);
    const path = rows.map((r, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(r.value).toFixed(1)).join('');
    const first = rows[0], last = rows[rows.length - 1];
    svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.caption)}">
      ${iNow >= 0 ? `<rect class="pj" x="${X(iNow)}" y="${PT - 10}" width="${X(rows.length - 1) - X(iNow)}" height="${H - PT - PB + 10}"/>` : ''}
      <line class="bl" x1="${PL}" x2="${W - PR}" y1="${H - PB}" y2="${H - PB}"/>
      <path class="ln" d="${path}"/>
      ${iNow >= 0 ? `<circle class="dt" cx="${X(iNow)}" cy="${Y(rows[iNow].value)}" r="4.5"/><text class="v" x="${X(iNow)}" y="${Y(rows[iNow].value) - 10}" text-anchor="middle">${fmt(rows[iNow].value)}</text>` : ''}
      <text class="v" x="${X(0)}" y="${Y(first.value) - 9}">${fmt(first.value)}</text>
      <text class="v" x="${X(rows.length - 1)}" y="${Y(last.value) - 9}" text-anchor="end">${fmt(last.value)}</text>
      <text class="x" x="${X(0)}" y="${H - 6}">${esc(first.label)}</text>
      ${iNow >= 0 ? `<text class="x" x="${X(iNow)}" y="${H - 6}" text-anchor="middle">${esc(rows[iNow].label)} 현재</text>` : ''}
      <text class="x" x="${X(rows.length - 1)}" y="${H - 6}" text-anchor="end">${esc(last.label)}</text>
    </svg>`;
  } else if (rows.length <= 3 || rows.length > 5 || rows.some(r => String(r.label).length > 7)) {
    /* 가로 막대 — 이름이 길거나, 둘·셋이거나, 여섯 개가 넘을 때.
       카드 폭(약 300px)에 세로 막대 여덟 개를 세우면 값 글자가 서로 겹칩니다(눈으로 확인). */
    svg = `<div class="br-hb" role="list" aria-label="${esc(c.caption)}">` + rows.map(r =>
      `<div class="r${r.hl ? ' hl' : ''}" role="listitem"><span class="n">${esc(r.label)}</span>
        <span class="t"><i style="width:${Math.max(1.5, r.value / mx * 100).toFixed(1)}%"></i></span><b>${esc(valTxt(r))}</b></div>`).join('') + '</div>';
  } else {
    /* 세로 막대는 HTML 로 — 칸이 좁아져도 글자는 제 크기를 지킵니다 */
    svg = `<div class="br-cols" role="list" aria-label="${esc(c.caption)}: ${esc(rows.map(r => r.label + ' ' + valTxt(r)).join(', '))}">` + rows.map(r =>
      `<div class="c${r.hl ? ' hl' : ''}" role="listitem"><b>${esc(valTxt(r))}</b><span class="b"><i style="height:${Math.max(2, r.value / mx * 100).toFixed(1)}%"></i></span><span class="x">${esc(r.label)}</span></div>`).join('') + '</div>';
  }
  return `<figure class="br-chart"><figcaption><b>${esc(c.caption)}</b>${c.unit && c.unit.indexOf('=') > 0 ? ` · ${esc(c.unit)}` : ''}</figcaption>${svg}
    ${c.note ? `<p class="br-chart-note">${esc(c.note)}</p>` : ''}<p class="br-chart-src">자료: ${esc(c.source || '')}</p></figure>`;
}

/* ── 한 호 그리기 ─────────────────────────────────────────────────────── */
function render(){
  const I = B.issue; if (!I) return;
  B.byId = {}; (I.articles || []).forEach(a => { B.byId[a.id] = a; });
  const gen = I.generator || {};
  const genCls = gen.kind === 'ai' ? 'ai' : gen.kind === 'draft' ? 'draft' : 'rule';
  const s = I.stats || {};
  const opts = (B.index.issues || []).map(x => `<option value="${esc(x.id)}"${x.id === I.id ? ' selected' : ''}>제${x.no}호 · ${esc(x.period)}</option>`).join('');
  root.innerHTML = `
  <article class="br-paper">
    <header class="br-head">
      <div class="br-top">
        <p class="br-kicker"><span class="dot"></span>학령인구 감소 대응 주간 브리프 · <b>제${I.no}호</b></p>
        <div class="br-tools no-print">
          <label><span class="sr-only">지난 호</span><select id="br-pick">${opts}</select></label>
          <button type="button" class="br-btn" id="br-print">인쇄 · PDF</button>
        </div>
      </div>
      <h1 id="br-title">${esc(I.title)}</h1>
      <p class="br-meta">${esc(I.period)} · 기사 ${fmt(s.articles)}건 (경북 ${fmt(s.gyeongbuk)} · 다른 시·도 ${fmt(s.otherSido)}${s.national ? ` · 전국 ${fmt(s.national)}` : ''}${(s.articles - s.gyeongbuk - s.otherSido - (s.national || 0)) > 0 ? ` · 그 밖 ${fmt(s.articles - s.gyeongbuk - s.otherSido - (s.national || 0))}` : ''}) · 인용 ${fmt((I.checks || {}).citedArticles)}건
        <span class="br-badge ${genCls}">${esc(gen.label || '')}</span><span class="br-badge st">${esc(I.status || '')}</span></p>
    </header>

    <section class="br-lead-card">
      <p class="br-lead">${esc(I.lead)}</p>
      ${I.takeaways && I.takeaways.length ? `<ol class="br-takes">${I.takeaways.map(t => `<li>${esc(t)}</li>`).join('')}</ol>` : ''}
      ${cites(I.leadArticles)}
    </section>

    ${(I.numbers || []).length ? `<section class="br-sec" aria-labelledby="br-h-num">
      <h2 id="br-h-num"><span class="no">1</span>숫자로 읽는 이번 주</h2>
      <p class="br-sec-lede">기사의 쟁점을 우리 자료의 숫자 하나로 받칩니다. 그림의 값은 대시보드와 같은 셈입니다.</p>
      <div class="br-nums">${I.numbers.map(n => `
        <div class="br-num">
          <p class="k">${esc(n.topic || '')}</p>
          <h3>${esc(n.headline)}</h3>
          <p class="sub">${esc(n.sub || '')}</p>
          ${chartHtml(n.chart)}
          ${n.body ? `<p class="body">${esc(n.body)}</p>` : ''}
          ${cites(n.articles)}
        </div>`).join('')}</div>
    </section>` : ''}

    ${(I.issues || []).length ? `<section class="br-sec" aria-labelledby="br-h-iss">
      <h2 id="br-h-iss"><span class="no">2</span>깊이 읽기</h2>
      ${I.issues.map((it, i) => `
        <div class="br-issue">
          <p class="k">${esc(it.kicker || '')}</p>
          <h3><span class="ix">${i + 1}</span>${esc(it.title)}</h3>
          <div class="br-issue-grid">
            <div><p class="lb">무슨 일이</p><p>${esc(it.what)}</p></div>
            <div><p class="lb">왜 중요한가</p><p>${esc(it.why)}</p></div>
          </div>
          ${it.facts && it.facts.length ? `<p class="lb gb">경북 자료로 보면</p>${factChips(it.facts)}` : ''}
          ${it.ask && it.ask.length ? `<div class="br-ask"><p class="lb">경북이 물을 것</p><ul>${it.ask.map(q => `<li>${esc(q)}</li>`).join('')}</ul></div>` : ''}
          ${cites(it.articles)}
        </div>`).join('')}
    </section>` : ''}

    ${(I.regions || []).length ? `<section class="br-sec" aria-labelledby="br-h-reg">
      <h2 id="br-h-reg"><span class="no">3</span>다른 시·도는 지금</h2>
      <p class="br-sec-lede">다른 교육청·지자체의 정책을 경북 자료와 나란히 놓았습니다.</p>
      <div class="br-regions">${I.regions.map(r => `
        <div class="br-region">
          <p class="rg">${esc(r.region)}</p>
          <div class="bd">
            <h3>${esc(r.what)}</h3>
            ${r.detail ? `<p>${esc(r.detail)}</p>` : ''}
            ${r.compare ? `<p class="cmp"><b>경북과 견주면</b> ${esc(r.compare)}</p>` : ''}
            ${factChips(r.facts)}
            ${cites(r.articles)}
          </div>
        </div>`).join('')}</div>
    </section>` : ''}

    ${(I.factchecks || []).length ? `<section class="br-sec" aria-labelledby="br-h-fc">
      <h2 id="br-h-fc"><span class="no">4</span>기사 수치 맞춰 보기</h2>
      <p class="br-sec-lede">기사가 든 경북 숫자를 우리 자료로 되짚었습니다. 판정은 프로그램이 합니다(차이 2% 안 «맞음», 10% 안 «비슷함»).</p>
      ${I.factchecks.map(c => {
        const a = B.byId[c.article] || {};
        const v = c.verdict === '맞음' ? 'ok' : c.verdict === '비슷함' ? 'mid' : 'bad';
        return `<div class="br-fc">
          <blockquote>「${esc(c.claim)}」 <cite>— ${esc(a.outlet || c.outlet || '')} ${md(a.date)}</cite></blockquote>
          <div class="br-fc-vs">
            <div><span>기사</span><b>${fmt(c.articleValue)}</b></div>
            <div class="vs" aria-hidden="true">↔</div>
            <div><span>우리 자료</span><b>${fmt(c.ours)}</b><em>${esc(c.oursLabel)}</em></div>
            <p class="verdict ${v}">${esc(c.verdict)}${c.gapPct != null ? ` · 차이 ${c.gapPct > 0 ? '+' : c.gapPct < 0 ? '−' : ''}${Math.abs(c.gapPct)}%` : ''}</p>
          </div>
          ${c.excluded && c.excluded.length ? `<p class="ex">뺀 학교: ${c.excluded.map(x => `${esc(x.name)}(${fmt(x.stu)}명)`).join(', ')}</p>` : ''}
          ${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}
          ${cites([c.article])}
        </div>`; }).join('')}
    </section>` : ''}

    ${(I.watch || []).length ? `<section class="br-sec" aria-labelledby="br-h-w">
      <h2 id="br-h-w"><span class="no">${(I.factchecks || []).length ? 5 : 4}</span>다음 주에 볼 것</h2>
      <ul class="br-watch">${I.watch.map(w => typeof w === 'string' ? `<li>${esc(w)}</li>` : `<li>${esc(w.text)} ${cites(w.articles)}</li>`).join('')}</ul>
    </section>` : ''}

    <section class="br-sec br-all" aria-labelledby="br-h-all">
      <h2 id="br-h-all">이번 주 기사 ${fmt(s.articles)}건</h2>
      <div class="br-stat">
        <div class="br-topics">${(s.topics || []).map(t => {
          const mx = Math.max(...(s.topics || []).map(x => Math.max(x.n, x.prev || 0))) || 1;
          return `<div class="r"><span class="n">${esc(t.topic)}</span><span class="t"><i style="width:${(t.n / mx * 100).toFixed(1)}%"></i><s style="left:${((t.prev || 0) / mx * 100).toFixed(1)}%" title="지난주 ${t.prev || 0}건"></s></span><b>${t.n}</b><em>${t.prev != null ? '지난주 ' + t.prev : ''}</em></div>`; }).join('')}
          <p class="br-note">막대는 이번 주, 세로 눈금은 지난주입니다. 대학·해외 기사는 목록에만 둡니다.</p></div>
        <div class="br-regs">${(s.regions || []).map(r => `<span class="br-rg">${esc(r.region)} <b>${r.n}</b></span>`).join('')}</div>
      </div>
      ${groupedList(I)}
      <p class="br-note"><a href="#news">주간 뉴스 클리핑에서 날마다 모인 기사 전체 보기 →</a></p>
    </section>

    <footer class="br-method">
      <h2>이 브리프를 만드는 법</h2>
      <ol>
        <li><b>모으기</b> — 날마다 07:37 네이버 뉴스 검색(학령인구·소규모학교·폐교·교육혁신선도지역 등)</li>
        <li><b>나누기</b> — 월요일 새벽, 지난주(월~일) 기사를 지역(경북·다른 시·도·전국)과 주제로 나눕니다</li>
        <li><b>초안</b> — AI 가 기사 제목·요약과 대시보드 자료만 보고 씁니다. AI 열쇠가 없으면 규칙 초안을 만듭니다</li>
        <li><b>검증</b> — 문장마다 근거 기사가 있는지, 숫자가 기사나 대시보드 자료에 있는지 프로그램이 대조합니다. 맞지 않는 문장은 싣지 않습니다</li>
        <li><b>검토</b> — 담당자가 읽고 «검토 완료»로 바꿉니다. 그 전까지는 «검토 전»이 붙습니다</li>
      </ol>
      ${I.method ? `<p>${esc(I.method)}</p>` : ''}
      ${(I.checks && I.checks.dropped && I.checks.dropped.length) ? `<details><summary>검증에서 뺀 항목 ${I.checks.dropped.length}개</summary><ul>${I.checks.dropped.map(d => `<li>${esc(d)}</li>`).join('')}</ul></details>` : ''}
      <p class="br-note">기사 본문은 저장·재배포하지 않습니다. 제목·매체·날짜·원문 링크와 검색 API 요약만 씁니다. 만든 때 ${esc(String(I.builtAt || '').slice(0, 16).replace('T', ' '))}(UTC)</p>
    </footer>
    ${refsHtml(I)}
  </article>`;
  const pick = document.getElementById('br-pick');
  if (pick) pick.addEventListener('change', () => load(pick.value));
  const pr = document.getElementById('br-print');
  if (pr) pr.addEventListener('click', () => {
    const b = document.getElementById('print-current');
    if (b) b.click(); else if (window.print) window.print();
  });
}
/* 종이에서는 칩을 누를 수 없습니다. 인용한 기사를 «매체 · 날짜 · 제목 · 주소»로
   부록에 모아 둡니다 — 화면에서는 보이지 않고 인쇄할 때만 나옵니다. */
function refsHtml(I){
  const list = (I.articles || []).filter(a => a.cited).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!list.length) return '';
  return `<section class="br-refs print-only" aria-hidden="true">
    <h2>부록 · 근거 기사 ${list.length}건</h2>
    <ol>${list.map(a => `<li><b>${esc(a.outlet)}</b> · ${md(a.date)} · ${esc(a.title)}<span class="u">${esc(a.link)}</span></li>`).join('')}</ol>
  </section>`;
}
function groupedList(I){
  const g = {};
  (I.articles || []).forEach(a => { (g[a.topic] = g[a.topic] || []).push(a); });
  const order = ((I.stats || {}).topics || []).map(t => t.topic);
  const keys = Object.keys(g).sort((a, b) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)));
  return `<div class="br-list">${keys.map((k, i) => `
    <details${i === 0 ? ' open' : ''}><summary>${esc(k)} <b>${g[k].length}</b></summary><ul>
      ${g[k].map(a => `<li${a.cited ? ' class="cited"' : ''}><span class="d">${md(a.date)}</span><span class="rg">${esc(a.region)}</span>
        <a href="${esc(a.link)}" target="_blank" rel="noopener">${esc(a.title)}</a><span class="o">${esc(a.outlet)}</span>${a.cited ? '<span class="c" title="이 브리프가 근거로 쓴 기사">인용</span>' : ''}</li>`).join('')}
    </ul></details>`).join('')}</div>`;
}

/* ── 한눈에 보기의 «이번 주» 칸 ───────────────────────────────────────── */
function renderTeaser(){
  const box = document.getElementById('ov-brief-teaser');
  if (!box || !B.index || !(B.index.issues || []).length) return;
  const x = B.index.issues[0];
  box.innerHTML = `
    <div class="br-teaser">
      <div class="l">
        <p class="k">제${x.no}호 · ${esc(x.period)} · <span class="br-badge ${x.generator && x.generator.kind === 'rule' ? 'rule' : 'draft'}">${esc((x.generator || {}).label || '')}</span></p>
        <h3>${esc(x.title)}</h3>
        <p>${esc(x.lead)}</p>
        <a class="ov-btn" href="#brief">브리프 읽기 →</a>
      </div>
      <ol class="r">${(x.numbers || []).map(h => `<li>${esc(h)}</li>`).join('')}</ol>
    </div>`;
}

/* ── 불러오기 ─────────────────────────────────────────────────────────── */
function fail(e){
  const local = location.protocol === 'file:';
  root.innerHTML = `<div class="card"><b>주간 브리프를 불러오지 못했습니다.</b>
    <p class="ov-note">${local ? '파일을 바로 열면(file://) 브라우저가 자료 파일 읽기를 막습니다. 「로컬 실험 열어보기.command」로 열어 주세요.' : esc(e && e.message)}</p></div>`;
  const t = document.getElementById('ov-brief-teaser');
  if (t) t.innerHTML = '<p class="ov-note">주간 브리프를 불러오지 못했습니다.</p>';
}
function load(id){
  return fetch(BASE + encodeURIComponent(id) + '.json', { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error(id + ' ' + r.status); return r.json(); })
    .then(d => { B.issue = d; render(); })
    .catch(fail);
}
fetch(BASE + 'index.json', { cache: 'no-cache' })
  .then(r => { if (!r.ok) throw new Error('index ' + r.status); return r.json(); })
  .then(d => {
    B.index = d;
    renderTeaser();
    if (!(d.issues || []).length) { root.innerHTML = '<div class="card">아직 발행된 브리프가 없습니다.</div>'; return; }
    return load(d.issues[0].id);
  })
  .catch(fail);

/* ── Excel · 인쇄 — 본체의 currentViewExport·printScopeText 가 부릅니다 ── */
window.briefExportSheets = function(){
  const I = B.issue; if (!I) return [{ name:'주간브리프', title:'주간 브리프', rows:[['불러온 호가 없습니다']] }];
  const src = ids => (ids || []).map(id => B.byId[id]).filter(Boolean).map(a => `${a.outlet} ${a.date}`).join('; ');
  return [
    { name:'요약', title:`제${I.no}호 ${I.period} — ${I.title}`,
      rows:[['항목','내용']].concat([['요약', I.lead]], (I.takeaways || []).map((t, i) => ['핵심 ' + (i + 1), t]), [['생성', (I.generator || {}).label], ['상태', I.status]]) },
    { name:'숫자', title:'숫자로 읽는 이번 주',
      rows:[['주제','제목','보충','해설','그림','근거 기사']].concat((I.numbers || []).map(n => [n.topic, n.headline, n.sub, n.body, n.chart ? n.chart.caption : '', src(n.articles)])) },
    { name:'깊이읽기', title:'깊이 읽기',
      rows:[['주제','제목','무슨 일이','왜 중요한가','경북이 물을 것','근거 기사']].concat((I.issues || []).map(it => [it.kicker, it.title, it.what, it.why, (it.ask || []).join(' / '), src(it.articles)])) },
    { name:'다른시도', title:'다른 시·도는 지금',
      rows:[['시·도','정책','내용','경북과 견주면','근거 기사']].concat((I.regions || []).map(r => [r.region, r.what, r.detail, r.compare, src(r.articles)])) },
    { name:'기사목록', title:`이번 주 기사 ${(I.articles || []).length}건`,
      rows:[['날짜','지역','주제','매체','제목','인용','원문 링크']].concat((I.articles || []).map(a => [a.date, a.region, a.topic, a.outlet, a.title, a.cited ? '인용' : '', a.link])),
      note:'기사 본문은 싣지 않습니다. 제목·매체·날짜·원문 링크만 담았습니다.' }
  ];
};
window.briefScopeText = function(){
  const I = B.issue; return I ? `제${I.no}호 · ${I.period} · ${(I.generator || {}).label || ''} · ${I.status || ''}` : '주간 브리프';
};
})();
