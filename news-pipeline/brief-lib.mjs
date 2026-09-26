/* 주간 브리프 — 셈과 검증 〔로컬 실험 · 2026. 9. 26.〕
   ────────────────────────────────────────────────────────────────────────
   build-weekly-brief.mjs 가 부르는 «순수한» 함수들입니다. 파일·네트워크를 만지지
   않으므로 검사(tests/weekly-brief.test.mjs)에서 그대로 부를 수 있습니다.

   요청은 「단순 기사를 끌어오는 수준이 아니라 심도 있는 브리프」였습니다.
   이 파일이 지키는 약속은 셋입니다.

     ① 문장마다 근거 기사가 있다   — 근거 없는 문장은 싣지 않습니다
     ② 숫자는 지어내지 않는다       — 기사 본문(검색 요약)이나 대시보드 자료에
                                       있는 숫자만 씁니다. 없는 숫자가 든 문장은 뺍니다
     ③ 그림의 숫자는 코드가 센다     — AI 는 «어떤 그림을 보일지»만 고르고,
                                       막대 길이와 값은 대시보드 자료에서 셉니다

   AI 가 쓴 초안(Gemini)과 사람이 쓴 초안(시범호) 모두 같은 검증을 통과해야
   화면에 올라갑니다. */

/* ── 날짜 — 한국시간으로 셉니다 ─────────────────────────────────────── */
const KST = 9 * 3600e3;
export function kstDate(pubDate) {
  const t = new Date(pubDate).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + KST).toISOString().slice(0, 10);
}
export function addDays(ymd, n) {
  const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/* 그 날이 든 주의 월요일 */
export function mondayOf(ymd) {
  const d = new Date(ymd + 'T00:00:00Z'); const wd = (d.getUTCDay() + 6) % 7;
  return addDays(ymd, -wd);
}
/* «지난주» — 오늘(한국시간)이 든 주의 바로 앞 월~일 */
export function lastCompleteWeek(now = Date.now()) {
  const today = new Date(now + KST).toISOString().slice(0, 10);
  const from = addDays(mondayOf(today), -7);
  return { from, to: addDays(from, 6) };
}
export function weekLabel(from, to) {
  const f = (s) => { const [, m, d] = s.split('-').map(Number); return `${m}. ${d}.`; };
  return `${f(from)}(월) ~ ${f(to)}(일)`;
}

/* ── 기사 다듬기 ────────────────────────────────────────────────────── */
const OUTLETS = {
  'news1.kr':'뉴스1','hankyung.com':'한국경제','kyeonggi.com':'경기일보','imaeil.com':'매일신문',
  'biz.chosun.com':'조선비즈','sedaily.com':'서울경제','ggilbo.com':'금강일보','kbmaeil.com':'경북매일',
  'kookje.co.kr':'국제신문','breaknews.com':'브레이크뉴스','segye.com':'세계일보','naeil.com':'내일신문',
  'news.tf.co.kr':'더팩트','asiae.co.kr':'아시아경제','agrinet.co.kr':'농민신문','newscj.com':'천지일보',
  'inews24.com':'아이뉴스24','kukinews.com':'쿠키뉴스','dkilbo.com':'대경일보','gndomin.com':'경남도민신문',
  'news.unn.net':'한국대학신문','ibabynews.com':'베이비뉴스','eroun.net':'이로운넷','idaegu.com':'대구신문',
  'newsprime.co.kr':'프라임경제','jbnews.com':'중부매일','news.ebs.co.kr':'EBS 뉴스','andongmbc.co.kr':'안동MBC',
  'kwnews.co.kr':'강원일보','hangyo.com':'한국교육신문','koreadaily.com':'미주중앙일보','kyongbuk.co.kr':'경북일보',
  'kgnews.co.kr':'경기신문','busan.com':'부산일보','ekn.kr':'에너지경제','chungnamilbo.co.kr':'충남일보',
  'jeollailbo.com':'전라일보','gjdream.com':'광주드림','kado.net':'강원도민일보','dt.co.kr':'디지털타임스',
  'hidomin.com':'경북도민일보','dynews.co.kr':'동양일보','headlinejeju.co.kr':'헤드라인제주','jibs.co.kr':'JIBS',
  'inews365.com':'충북일보','ksmnews.co.kr':'경상매일신문','goodmorningcc.com':'굿모닝충청','sjbnews.com':'새전북신문',
  'ccreview.co.kr':'충청리뷰','cctoday.co.kr':'충청투데이','gukjenews.com':'국제뉴스','jjan.kr':'전북일보',
  'ccdailynews.com':'충청일보','monthly.chosun.com':'월간조선','kbsm.net':'경북신문','asiatoday.co.kr':'아시아투데이',
  'tbs.seoul.kr':'TBS','jejumaeil.net':'제주매일','cstimes.com':'컨슈머타임스','hansbiz.co.kr':'한스경제',
  'sentv.co.kr':'서울경제TV','newsworks.co.kr':'뉴스웍스','cnbnews.com':'CNB뉴스','srn.hcn.co.kr':'HCN'
};
export function outletOf(link) {
  let host = '';
  try { host = new URL(link).hostname.replace(/^www\./, ''); } catch { return ''; }
  if (OUTLETS[host]) return OUTLETS[host];
  const k = Object.keys(OUTLETS).find((d) => host.endsWith('.' + d));
  return k ? OUTLETS[k] : host;   // 모르는 매체는 주소를 그대로 — 지어내지 않습니다
}
/* 기사 번호는 링크에서 셉니다. 같은 기사는 몇 번을 돌려도 같은 번호입니다. */
export function articleId(link) {
  let h = 2166136261;
  for (const ch of String(link)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return 'a' + (h >>> 0).toString(36);
}

/* ── 지역 ──────────────────────────────────────────────────────────────
   «다른 시·도는 지금»을 쓰려면 기사가 어느 시·도 이야기인지 알아야 합니다.
   흔한 낱말과 겹치는 이름(부여·음성·장수·진도·화성·남해·영광…)은 «○○군·시·
   교육지원청»처럼 뒤에 붙은 말이 있을 때만 셉니다. */
export const SIDO = ['서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경남','제주'];
const SIDO_RE = [
  ['서울', /서울(시|특별시|시교육청|시의회)?/], ['부산', /부산/], ['대구', /대구(?!경북)/], ['인천', /인천/],
  ['광주', /광주(광역시|시교육청|교육청)|광주(?!시)(?=[\s·,])/], ['대전', /대전(시|광역시|교육청|시교육청|시의회)|대전(?=[\s·,])/], ['울산', /울산/], ['세종', /세종(시|특별)/],
  ['경기', /경기(도|교육청|도교육청)?(?=[\s·,]|도)|경기 /], ['강원', /강원/], ['충북', /충북|충청북도/], ['충남', /충남|충청남도/],
  ['전북', /전북|전라북도/], ['전남', /전남|전라남도/], ['경남', /경남|경상남도/], ['제주', /제주/]
];
const COUNTY = {
  경기: '수원 성남 의정부 안양 부천 평택 동두천 안산 과천 남양주 오산 시흥 군포 의왕 하남 용인 파주 이천 안성 김포 포천 여주 연천 가평 양평',
  강원: '춘천 원주 강릉 태백 속초 삼척 홍천 횡성 영월 평창 정선 철원 화천 양구 양양',
  충북: '청주 충주 제천 옥천 증평 진천 괴산 단양',
  충남: '천안 보령 아산 서산 논산 계룡 당진 금산 서천 청양 홍성 태안',
  전북: '전주 군산 익산 정읍 남원 김제 진안 무주 임실 순창 고창 부안',
  전남: '목포 여수 순천 나주 광양 담양 곡성 구례 고흥 보성 화순 장흥 강진 해남 영암 무안 함평 완도 신안',
  경남: '창원 통영 사천 김해 밀양 거제 의령 함안 창녕 하동 산청 함양 합천'
};
/* 뒤에 시·군·교육지원청이 붙어야만 세는 이름 — 흔한 낱말과 겹칩니다
   (예산=budget · 거창한 · 고양이 · 완주하다 · 보은 · 동해 · 부여하다 …) */
const COUNTY_STRICT = { 경기: '화성 양주 구리 광주 고양 광명', 강원: '동해 인제', 충북: '음성 영동 보은', 충남: '부여 예산 공주',
  전북: '장수 완주', 전남: '진도 영광 장성', 경남: '진주 남해 고성 양산 거창' };
export const GB_SGG = ['포항','경주','김천','안동','구미','영주','영천','상주','문경','경산','의성','청송','영양','영덕','청도','고령','성주','칠곡','예천','봉화','울진','울릉'];
const GB_LOOSE = GB_SGG.filter((s) => s !== '상주' && s !== '고령' && s !== '영양');
const SUFFIX = '(?:시|군|교육지원청|교육청|시의회|군의회)';

export function regionsOf(text) {
  const t = String(text || '');
  const out = new Set();
  if (/경북|경상북도|대구경북/.test(t) || GB_LOOSE.some((s) => t.includes(s)) ||
      new RegExp(`(상주|고령|영양)${SUFFIX}`).test(t)) out.add('경북');
  for (const [nm, re] of SIDO_RE) if (re.test(t)) out.add(nm);
  for (const [sd, list] of Object.entries(COUNTY)) {
    if (list.split(' ').some((c) => t.includes(c))) out.add(sd);
  }
  for (const [sd, list] of Object.entries(COUNTY_STRICT)) {
    if (list.split(' ').some((c) => new RegExp(c + SUFFIX).test(t))) out.add(sd);
  }
  if (/대구경북|대구·경북/.test(t)) out.add('경북');
  return [...out];
}
/* 기사 하나의 «주된 지역» — 경북이 들어 있으면 경북, 아니면 첫 시·도, 없으면 전국·해외 */
export function primaryRegion(title, description) {
  const inTitle = regionsOf(title), all = regionsOf(title + ' ' + description);
  if (all.includes('경북') && (inTitle.includes('경북') || !inTitle.length)) return '경북';
  if (inTitle.length) return inTitle[0];
  if (all.length) return all[0];
  if (/뉴욕|미국|일본|중국|영국|독일|해외/.test(title)) return '해외';
  if (/교육부|행정안전부|행안부|정부|국회|교육감협의회|국무회의|전국/.test(title + ' ' + description)) return '전국';
  return '기타';
}

/* ── 주제 ── 앞에서부터 처음 걸리는 것이 «주된 주제»입니다 ── */
export const TOPICS = [
  ['폐교 활용',        /폐교[^.。]{0,40}(활용|재생|거점|변신|탈바꿈|재탄생|공간|센터|캠퍼스|시설)|폐교 ?활용|문(을)? 닫은 학교|떠난 교실/],
  ['교육재정·교부금',  /교부금|교육재정|재정 ?위기|재정 ?악화|가용재원/],
  ['교육혁신선도지역', /교육혁신 ?선도|선도지역|선도 지역|교육발전특구/],
  ['통폐합·적정규모',  /통폐합|통합 ?운영|이음학교|적정규모|분교|학교 ?통합|폐교·폐원|폐원|재배치/],
  ['작은학교 살리기',  /작은 ?학교|소규모 ?학교|농촌 ?(초등)?학교|(농촌|산촌|농산어촌|전북|전남|생태) ?유학|유학 ?(마을|센터|프로그램)|전학생/],
  ['대학 구조조정',    /대학|전문대|사관학교/],
  ['지역소멸·인구',    /지역소멸|인구감소|저출생|저출산|출생|이주배경|다문화/],
  ['교원·정원',        /교원|(교사|교원) ?정원|정원 ?(감축|축소|배정)|교사 ?수/],   // «생태치유정원» 같은 정원(garden)은 빼려고 앞말을 붙입니다
  ['통학·돌봄',        /통학|스쿨버스|돌봄|늘봄|기숙/]
];
export function topicsOf(text, title) {
  const t = String(text || '');
  const hit = TOPICS.filter(([, re]) => re.test(t)).map(([nm]) => nm);
  /* 제목이 대학·사관학교 이야기면 본문에 «통폐합»이 있어도 대학 기사입니다 */
  if (title && /대학|전문대|사관학교|사립대/.test(title)) return ['대학 구조조정'].concat(hit.filter((x) => x !== '대학 구조조정'));
  return hit.length ? hit : ['기타'];
}
/* 대학·사관학교만 다루는 기사는 초·중·고 학령인구 브리프의 본론에서 뺍니다(목록에는 남김) */
export function inScope(a) { return a.topic !== '대학 구조조정' && a.region !== '해외'; }

/* ── 같은 사건 묶기 — fetch-news.js 의 sameStory 와 같은 생각(낱말 겹침) ── */
function tokens(t) {
  return new Set(String(t).replace(/[^가-힣A-Za-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length >= 2));
}
export function similar(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let hit = 0; A.forEach((w) => { if (B.has(w)) hit++; });
  return hit / Math.min(A.size, B.size);
}

/* ── 한 주치 기사 ──────────────────────────────────────────────────── */
export function weekArticles(history, from, to) {
  const seen = new Set();
  return (history || []).map((n) => {
    const link = String(n.originallink || n.link || '');
    const date = kstDate(n.pubDate);
    const title = String(n.title || '').trim(), description = String(n.description || '').trim();
    const text = title + ' ' + description;
    const tps = topicsOf(text, title);
    return {
      id: articleId(link), title, description, link, date, outlet: outletOf(link),
      region: primaryRegion(title, description), regions: regionsOf(text),
      topic: tps[0], topics: tps
    };
  }).filter((a) => a.date && a.date >= from && a.date <= to && !seen.has(a.id) && seen.add(a.id))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function weekStats(arts, prevArts) {
  const by = (list, k) => list.reduce((o, a) => { o[a[k]] = (o[a[k]] || 0) + 1; return o; }, {});
  const topics = by(arts.filter(inScope), 'topic');
  const prevTopics = by((prevArts || []).filter(inScope), 'topic');
  const regions = by(arts, 'region');
  return {
    articles: arts.length,
    inScope: arts.filter(inScope).length,
    gyeongbuk: arts.filter((a) => a.region === '경북').length,
    otherSido: arts.filter((a) => SIDO.includes(a.region)).length,
    national: arts.filter((a) => a.region === '전국').length,
    prevArticles: prevArts ? prevArts.length : null,
    topics: Object.entries(topics).sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ topic: t, n, prev: prevTopics[t] || 0 })),
    regions: Object.entries(regions).sort((a, b) => b[1] - a[1]).map(([r, n]) => ({ region: r, n }))
  };
}

/* ── 대시보드 자료를 «이름표 붙은 값»으로 ─────────────────────────────
   AI 에게는 이 목록만 보여 줍니다. AI 가 쓰는 숫자는 이 목록이나 기사에
   있어야 하고, 칩·그림의 값은 코드가 이 목록에서 꺼냅니다. */
export function factsDigest(F) {
  const out = {};
  const put = (key, label, value, unit, src) => { if (value != null && Number.isFinite(value)) out[key] = { key, label, value, unit, src }; };
  const P = (y) => F.province.find((p) => p.year === y) || {};
  const S = F.source;
  [2016, 2021, 2025, 2026, 2031, 2036].forEach((y) => put(`students_${y}`, `경북 초·중·고 학생 ${y}년(${P(y).kind})`, P(y).total, '명', S.students));
  const LVN = { 초: '초등학생', 중: '중학생', 고: '고등학생' };
  ['초', '중', '고'].forEach((l) => [2016, 2026, 2036].forEach((y) => put(`${l}_${y}`, `경북 ${LVN[l]} ${y}년`, P(y)[l], '명', S.students)));
  const r1 = (a, b) => Math.round((b / a - 1) * 1000) / 10;
  put('students_change_2016_2026', '경북 학생 변화율 2016→2026', r1(P(2016).total, P(2026).total), '%', S.students);
  put('students_change_2026_2036', '경북 학생 변화율 2026→2036(전망)', r1(P(2026).total, P(2036).total), '%', S.students);
  const C = (y) => F.classes.find((c) => c.year === y) || {};
  if (F.classes.length) {
    const c0 = F.classes[0], c1 = F.classes[F.classes.length - 1];
    put(`classes_${c0.year}`, `경북 초·중·고 학급 ${c0.year}년`, c0.classes, '학급', S.classes);
    put(`classes_${c1.year}`, `경북 초·중·고 학급 ${c1.year}년`, c1.classes, '학급', S.classes);
    put('classes_change', `경북 학급 변화율 ${c0.year}→${c1.year}`, r1(c0.classes, c1.classes), '%', S.classes);
    put('students_change_edss', `경북 학생 변화율 ${c0.year}→${c1.year}(같은 자료)`, r1(c0.students, c1.students), '%', S.classes);
    put(`students_edss_${c1.year}`, `경북 초·중·고 학생 ${c1.year}년(EDSS)`, c1.students, '명', S.classes);
    put('students_per_class_2016', `학급당 학생 ${c0.year}년`, Math.round(c0.students / c0.classes * 10) / 10, '명', S.classes);
    put('students_per_class_last', `학급당 학생 ${c1.year}년`, Math.round(c1.students / c1.classes * 10) / 10, '명', S.classes);
  }
  const g = F.grades || {};
  put('grade_e1_2026', '초1 학생(2026 공시)', (g.초 || [])[0], '명', S.grades);
  put('grade_e6_2026', '초6 학생(2026 공시)', (g.초 || [])[5], '명', S.grades);
  put('grade_m1_2026', '중1 학생(2026 공시)', (g.중 || [])[0], '명', S.grades);
  put('grade_h3_2026', '고3 학생(2026 공시)', (g.고 || [])[2], '명', S.grades);
  if ((g.초 || [])[0] && (g.고 || [])[2]) put('grade_e1_per_h3', '초1 ÷ 고3', Math.round(g.초[0] / g.고[2] * 100), '%', S.grades);
  const sc = F.schools;
  put('schools_total', '경북 초·중·고 학교(2026 공시)', sc.total, '곳', '학교알리미 2026 공시');
  put('schools_under', '적정규모 참고선 미달 학교(동 60명·읍면 30명)', sc.bySize.small + sc.bySize.minimum, '곳', '학교알리미 2026 공시');
  put('schools_small', '소규모 학교', sc.bySize.small, '곳', '학교알리미 2026 공시');
  put('schools_minimum', '최소규모 학교(15명 이하)', sc.bySize.minimum, '곳', '학교알리미 2026 공시');
  put('schools_under_share', '적정규모 미달 비율', Math.round((sc.bySize.small + sc.bySize.minimum) / sc.total * 1000) / 10, '%', '학교알리미 2026 공시');
  const cl = F.closed;
  put('closed_total', '경북 폐교 누적', cl.total, '곳', S.closed);
  Object.entries(cl.byDecade || {}).forEach(([d, n]) => put(`closed_${d}`, `경북 폐교 ${d}`, n, '곳', S.closed));
  Object.entries(cl.byUse || {}).forEach(([u, n]) => put(`closed_use_${u}`, `경북 폐교 중 ${u}`, n, '곳', S.closed));
  if (cl.byUse && cl.byUse.매각 != null) put('closed_not_sold', '경북 폐교 중 매각하지 않은 곳', cl.total - cl.byUse.매각, '곳', S.closed);
  Object.entries(cl.unusedByDecade || {}).forEach(([d, n]) => put(`closed_unused_${d}`, `미활용 폐교 중 ${d}에 문 닫은 곳`, n, '곳', S.closed));
  Object.entries(cl.unusedBySig || {}).forEach(([g, n]) => put(`closed_unused_sgg_${g}`, `${g} 미활용 폐교`, n, '곳', S.closed));
  /* 대시보드가 쓰는 참고선 — 본체 schoolSizeOf 와 같은 값 */
  put('threshold_dong', '적정규모 참고선(동)', 60, '명', '대시보드 적정규모 참고선');
  put('threshold_myeon', '적정규모 참고선(읍면)', 30, '명', '대시보드 적정규모 참고선');
  put('threshold_minimum', '최소규모 참고선', 15, '명', '대시보드 적정규모 참고선');
  Object.entries(F.births || {}).forEach(([y, n]) => put(`births_${y}`, `경북 출생아 ${y}년`, n, '명', S.births));
  F.sigungu.forEach((r) => {
    put(`sgg_students_2026_${r.s}`, `${r.s} 학생 2026년`, r.students2026, '명', S.students);
    put(`sgg_students_2036_${r.s}`, `${r.s} 학생 2036년(전망)`, r.students2036, '명', S.students);
    put(`sgg_change_2026_2036_${r.s}`, `${r.s} 변화율 2026→2036`, r.change10yNext, '%', S.students);
    put(`sgg_change_2016_2026_${r.s}`, `${r.s} 변화율 2016→2026`, r.change10yPast, '%', S.students);
    put(`sgg_schools_${r.s}`, `${r.s} 초·중·고 학교`, r.schools, '곳', '학교알리미 2026 공시');
    put(`sgg_under_${r.s}`, `${r.s} 적정규모 미달 학교`, r.small, '곳', '학교알리미 2026 공시');
    put(`sgg_under_share_${r.s}`, `${r.s} 적정규모 미달 비율`, r.smallShare, '%', '학교알리미 2026 공시');
    put(`sgg_closed_${r.s}`, `${r.s} 폐교 누적`, (cl.bySig || {})[r.s], '곳', S.closed);
  });
  (F.myeonElementary || []).forEach((m) => {
    if (!m.schools) return;
    put(`myeon_elem_${m.s}`, `${m.s} 주소가 «면»인 초등학교 학생(2026 공시)`, m.students, '명', '학교알리미 2026 공시');
    put(`myeon_elem_schools_${m.s}`, `${m.s} 주소가 «면»인 초등학교 수`, m.schools, '곳', '학교알리미 2026 공시');
  });
  return out;
}

/* ── 그림 — 코드가 셉니다. AI 는 이름(metric)만 고릅니다 ─────────────── */
export const CHARTS = {
  students_vs_classes: (F) => {
    const a = F.classes[0], b = F.classes[F.classes.length - 1];
    return { type: 'bars', unit: `${a.year}년 = 100`, caption: `${a.year}→${b.year}년 경북 초·중·고`, source: F.source.classes, rows: [
      { label: `학생 ${fmt(a.students)}→${fmt(b.students)}명`, value: +(b.students / a.students * 100).toFixed(1) },
      { label: `학급 ${fmt(a.classes)}→${fmt(b.classes)}학급`, value: +(b.classes / a.classes * 100).toFixed(1), hl: true }
    ] };
  },
  closed_by_decade: (F) => ({ type: 'bars', unit: '곳', caption: '경북 폐교, 문 닫은 때', source: F.source.closed,
    rows: Object.entries(F.closed.byDecade || {}).map(([d, n]) => ({ label: d, value: n, hl: d === '1990년대' })) }),
  closed_unused_by_decade: (F) => ({ type: 'bars', unit: '곳', caption: `경북 미활용 폐교 ${fmt(Object.values(F.closed.unusedByDecade || {}).reduce((a, b) => a + b, 0))}곳, 문 닫은 때`, source: F.source.closed,
    rows: Object.entries(F.closed.unusedByDecade || {}).sort().map(([d, n]) => ({ label: d, value: n })) }),
  closed_by_use: (F) => ({ type: 'bars', unit: '곳', caption: `경북 폐교 ${fmt(F.closed.total)}곳은 지금`, source: F.source.closed,
    rows: ['매각', '대부', '자체활용', '미활용'].filter((u) => (F.closed.byUse || {})[u] != null)
      .map((u) => ({ label: u, value: F.closed.byUse[u], hl: u === '미활용' || u === '자체활용' })) }),
  province_trend: (F) => ({ type: 'line', unit: '명', caption: '경북 초·중·고 학생 2016~2036', source: F.source.students,
    rows: F.province.map((p) => ({ label: String(p.year), value: p.total, kind: p.kind, hl: p.year === 2026 })) }),
  births: (F) => ({ type: 'bars', unit: '명', caption: '경북 출생아 — 6년 뒤 초1', source: F.source.births,
    rows: Object.entries(F.births || {}).map(([y, n]) => ({ label: y, value: n, hl: y === '2020' })) }),
  sgg_change_top: (F) => ({ type: 'bars', unit: '%', caption: '2026→2036 감소율 상위 8개 시군', source: F.source.students,
    rows: F.sigungu.slice().sort((a, b) => a.change10yNext - b.change10yNext).slice(0, 8).map((r) => ({ label: r.s, value: Math.abs(r.change10yNext), prefix: '−' })) }),
  small_share_top: (F) => ({ type: 'bars', unit: '%', caption: '적정규모 미달 학교 비율 상위 8개 시군', source: '학교알리미 2026 공시',
    rows: F.sigungu.slice().sort((a, b) => b.smallShare - a.smallShare).slice(0, 8).map((r) => ({ label: r.s, value: r.smallShare })) }),
  cohort: (F) => ({ type: 'bars', unit: '명', caption: '학년별 학생(2026 공시)', source: F.source.grades,
    rows: ['초', '중', '고'].flatMap((l) => (F.grades[l] || []).map((v, i) => ({ label: `${l}${i + 1}`, value: v, hl: (l === '초' && i === 0) || (l === '고' && i === 2) }))) })
};
/* 시군 하나 — 'sgg:구미' */
export function chartFor(metric, F, opts) {
  if (CHARTS[metric]) return CHARTS[metric](F);
  const ex = new Set((opts && opts.exclude) || []);
  const m = String(metric || '').match(/^(sgg|myeon):(.+)$/);
  if (m && m[1] === 'sgg') {
    const r = F.sigungu.find((x) => x.s === m[2]); if (!r) return null;
    return { type: 'bars', unit: '명', caption: `${r.s} 초·중·고 학생`, source: F.source.students, rows: [
      { label: '2016 실적', value: r.students2016 }, { label: '2026 공시', value: r.students2026, hl: true }, { label: '2036 전망', value: r.students2036 }] };
  }
  if (m && m[1] === 'myeon') {
    const r = (F.myeonElementary || []).find((x) => x.s === m[2]); if (!r) return null;
    const kept = r.list.filter((s) => !ex.has(s.name));
    return { type: 'bars', unit: '명', caption: `${r.s} 면 지역 초등학교 ${kept.length}곳(2026 공시)`, source: '학교알리미 2026 공시',
      note: ex.size ? `주소는 «면»이지만 뺀 학교: ${[...ex].join(', ')}` : '',
      rows: kept.slice().sort((a, b) => b.stu - a.stu).map((s) => ({ label: s.name.replace(/초등학교$/, '초'), value: s.stu })) };
  }
  return null;
}
export function chartMetrics(F) {
  return Object.keys(CHARTS).concat(F.sigungu.map((r) => 'sgg:' + r.s), (F.myeonElementary || []).filter((m) => m.schools).map((m) => 'myeon:' + m.s));
}
function fmt(n) { return Math.round(n).toLocaleString('ko-KR'); }

/* ── 숫자 대조 ─────────────────────────────────────────────────────────
   글 속 숫자를 꺼내 «근거가 있는 숫자» 목록과 맞춰 봅니다.
   연도(1980~2040)와 한 자리 서수(1차·3곳·2학년)는 셈에서 뺍니다. */
export function numbersIn(text) {
  return (String(text || '').match(/\d[\d,]*(?:\.\d+)?/g) || [])
    .map((s) => parseFloat(s.replace(/,/g, '')))
    .filter((v) => Number.isFinite(v));
}
export function groundSet(digest, arts, extra) {
  const set = new Set();
  const add = (v) => {
    if (!Number.isFinite(v)) return;
    const a = Math.abs(v);
    [a, Math.round(a), Math.round(a * 10) / 10, Math.floor(a), Math.ceil(a)].forEach((x) => set.add(x));
    if (a >= 10000) { set.add(Math.round(a / 1000) / 10); set.add(Math.round(a / 10000 * 10) / 10); set.add(Math.round(a / 1000)); }
    if (a >= 1000) set.add(Math.round(a / 1000));
  };
  Object.values(digest).forEach((f) => add(f.value));
  (arts || []).forEach((a) => numbersIn(a.title + ' ' + a.description).forEach(add));
  (extra || []).forEach(add);
  return set;
}
export function ungrounded(text, set) {
  return numbersIn(text).filter((v) => !(v >= 1980 && v <= 2040 && Number.isInteger(v)) && !(Number.isInteger(v) && v <= 12) && !set.has(Math.abs(v)));
}

/* ── 검증 — AI 초안이든 사람 초안이든 같은 문을 지납니다 ────────────── */
/* 코드가 센 기사 건수(이번 주 N건 등)도 근거 있는 숫자입니다 */
export function statNumbers(stats) {
  if (!stats) return [];
  return [stats.articles, stats.inScope, stats.gyeongbuk, stats.otherSido, stats.national, stats.prevArticles]
    .concat(stats.topics.flatMap((t) => [t.n, t.prev]), stats.regions.map((r) => r.n)).filter((v) => v != null);
}
/* 그 주의 날짜(월·일)도 코드가 정한 숫자입니다 — «9. 14.~9. 20.» 이 우연히 기사에
   «14일»이 있어야만 통과하던 것을 막습니다(검사가 잡았습니다). */
function weekDayNumbers(from, to) {
  if (!from || !to) return [];
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) { const [, m, dd] = d.split('-').map(Number); out.push(m, dd); }
  return out;
}
export function validateDraft(draft, { arts, digest, F, stats, from, to }) {
  const ids = new Set(arts.map((a) => a.id));
  /* 코드가 대조해 낸 값(수치 맞춰 보기의 «우리 값»)도 근거 있는 숫자입니다 */
  const fcVals = (draft && draft.factchecks || []).flatMap((c) => {
    try { const r = resolveFactcheck(c, { digest, F, arts }); return [r.ours, r.ours != null && r.articleValue ? Math.abs(r.ours - r.articleValue) : null]; }
    catch { return []; }
  }).filter((v) => v != null);
  const G = groundSet(digest, arts, statNumbers(stats).concat(fcVals, weekDayNumbers(from, to)));
  const errors = [], dropped = [];
  const metrics = new Set(chartMetrics(F));
  const needSrc = (where, list) => {
    const bad = (list || []).filter((id) => !ids.has(id));
    if (!list || !list.length) errors.push(`${where}: 근거 기사가 없습니다`);
    if (bad.length) errors.push(`${where}: 이번 주 기사에 없는 번호 ${bad.join(', ')}`);
  };
  const checkNums = (where, ...texts) => {
    const bad = texts.flatMap((t) => ungrounded(t, G));
    if (bad.length) errors.push(`${where}: 근거를 찾지 못한 숫자 ${[...new Set(bad)].join(', ')}`);
  };
  if (!draft || typeof draft !== 'object') return { ok: false, errors: ['초안이 비었습니다'], dropped };
  if (!draft.title) errors.push('제목이 없습니다');
  checkNums('제목', draft.title);
  if (!draft.lead) errors.push('요약(lead)이 없습니다');
  checkNums('요약', draft.lead, ...(draft.takeaways || []));
  needSrc('요약', draft.leadArticles);
  (draft.numbers || []).forEach((n, i) => {
    const w = `숫자 ${i + 1}`;
    if (!metrics.has(n.metric)) { errors.push(`${w}: 모르는 그림 이름 ${n.metric}`); return; }
    needSrc(w, n.articles);
    /* 그 카드의 그림에 그려지는 값은 그 카드 글에서 써도 됩니다(코드가 센 값) */
    const c = chartFor(n.metric, F, { exclude: n.exclude }) || { rows: [] };
    const G2 = new Set(G); c.rows.forEach((r) => { [r.value, Math.round(r.value), Math.round(r.value * 10) / 10].forEach((x) => G2.add(Math.abs(x))); });
    const total = c.rows.reduce((a, r) => a + (r.value || 0), 0); G2.add(total); G2.add(c.rows.length);
    const bad = [n.headline, n.sub, n.body].flatMap((t) => ungrounded(t, G2));
    if (bad.length) errors.push(`${w}: 근거를 찾지 못한 숫자 ${[...new Set(bad)].join(', ')}`);
  });
  (draft.issues || []).forEach((it, i) => {
    const w = `이슈 ${i + 1}`;
    needSrc(w, it.articles); checkNums(w, it.title, it.what, it.why, ...(it.ask || []));
    (it.facts || []).forEach((k) => { if (!digest[k]) errors.push(`${w}: 모르는 자료 이름 ${k}`); });
  });
  (draft.regions || []).forEach((r, i) => {
    const w = `다른 시·도 ${i + 1}`;
    if (!SIDO.includes(r.region)) errors.push(`${w}: 시·도 이름이 아닙니다 (${r.region})`);
    needSrc(w, r.articles); checkNums(w, r.what, r.detail, r.compare);
    (r.facts || []).forEach((k) => { if (!digest[k]) errors.push(`${w}: 모르는 자료 이름 ${k}`); });
  });
  (draft.factchecks || []).forEach((c, i) => {
    const w = `수치 맞춰 보기 ${i + 1}`;
    needSrc(w, [c.article]);
    if (!digest[c.fact] && !String(c.fact || '').startsWith('myeon_elem_')) errors.push(`${w}: 모르는 자료 이름 ${c.fact}`);
    const a = arts.find((x) => x.id === c.article);
    if (a && !numbersIn(a.title + ' ' + a.description).includes(Number(c.articleValue))) errors.push(`${w}: 기사에 ${c.articleValue} 이(가) 없습니다`);
    /* 설명에는 코드가 대조해 낸 값(우리 값·차이·학교별 학생)을 써도 됩니다 */
    const r = resolveFactcheck(c, { digest, F, arts });
    const G3 = new Set(G); [r.ours, r.gapPct, r.ours != null ? Math.abs(r.ours - r.articleValue) : null].concat(r.excluded.map((x) => x.stu))
      .concat(((F.myeonElementary || []).find((m) => 'myeon_elem_' + m.s === c.fact) || { list: [] }).list.map((x) => x.stu))
      .forEach((x) => { if (x != null) G3.add(Math.abs(x)); });
    const bad = ungrounded(c.note, G3);
    if (bad.length) errors.push(`${w}: 근거를 찾지 못한 숫자 ${[...new Set(bad)].join(', ')}`);
  });
  (draft.watch || []).forEach((t, i) => {
    checkNums(`다음 주 ${i + 1}`, typeof t === 'string' ? t : t.text);
    if (t && typeof t === 'object' && t.articles) needSrc(`다음 주 ${i + 1}`, t.articles);
  });
  return { ok: errors.length === 0, errors, dropped };
}

/* AI 초안은 틀린 항목만 떼어 내고 나머지를 살립니다(사람 초안은 통째로 고쳐 다시). */
export function pruneDraft(draft, ctx) {
  const d = JSON.parse(JSON.stringify(draft));
  const dropped = [];
  const keep = (arr, where) => (arr || []).filter((x, i) => {
    const probe = { title: 'x', lead: 'x', leadArticles: [ctx.arts[0] && ctx.arts[0].id], [where]: [x] };
    const v = validateDraft(probe, ctx);
    if (!v.ok) dropped.push(`${where}[${i}] — ${v.errors.join(' / ')}`);
    return v.ok;
  });
  d.numbers = keep(d.numbers, 'numbers');
  d.issues = keep(d.issues, 'issues');
  d.regions = keep(d.regions, 'regions');
  d.factchecks = keep(d.factchecks, 'factchecks');
  d.watch = keep(d.watch, 'watch');
  return { draft: d, dropped };
}

/* ── 수치 맞춰 보기 — 판정은 코드가 합니다 ──────────────────────────── */
export function resolveFactcheck(c, { digest, F, arts }) {
  let ours = null, label = '', excluded = [];
  if (String(c.fact).startsWith('myeon_elem_') && !String(c.fact).startsWith('myeon_elem_schools_')) {
    const s = c.fact.replace('myeon_elem_', '');
    const m = (F.myeonElementary || []).find((x) => x.s === s);
    if (m) {
      const ex = new Set(c.exclude || []);
      const kept = m.list.filter((x) => !ex.has(x.name));
      excluded = m.list.filter((x) => ex.has(x.name)).map((x) => ({ name: x.name, stu: x.stu }));
      ours = kept.reduce((a, x) => a + x.stu, 0);
      label = `${s} 면 지역 초등학교 ${kept.length}곳 학생(2026 공시)`;
    }
  } else if (digest[c.fact]) { ours = digest[c.fact].value; label = digest[c.fact].label; }
  const a = arts.find((x) => x.id === c.article);
  const av = Number(c.articleValue);
  const gap = (ours != null && av) ? (ours - av) / av * 100 : null;
  const verdict = gap == null ? '대조 불가' : Math.abs(gap) <= 2 ? '맞음' : Math.abs(gap) <= 10 ? '비슷함' : '차이 큼';
  return { claim: c.claim, article: c.article, outlet: a ? a.outlet : '', articleValue: av, ours, oursLabel: label,
    gapPct: gap == null ? null : Math.round(gap * 10) / 10, verdict, excluded, note: c.note || '' };
}

/* ── 규칙 초안 — AI 열쇠가 없을 때 ─────────────────────────────────────
   AI 없이도 «나열»보다는 한 걸음 나가도록, 주제마다 우리 자료 한 가지를
   붙이고 다른 시·도의 정책 기사를 따로 모읍니다. 문장은 틀에 끼운 것이라
   깊이는 AI 초안보다 얕습니다 — 화면에 «규칙 초안»이라고 밝힙니다. */
const TOPIC_PLAYBOOK = {
  '폐교 활용':        { metric: 'closed_by_use',       facts: ['closed_total', 'closed_use_미활용', 'closed_use_자체활용'], why: '문 닫은 학교를 어떻게 쓰느냐는 «학교가 사라진 뒤 마을에 무엇이 남느냐»의 문제입니다.', ask: '경북 폐교 가운데 아직 쓰임을 찾지 못한 곳은 어디이고, 이번 사례를 옮겨 올 수 있는가?' },
  '교육재정·교부금':  { metric: 'students_vs_classes', facts: ['students_change_edss', 'classes_change'], why: '학생 수로 재정을 나누면, 학생은 줄어도 학급·학교 운영비는 덜 줄어드는 지역이 먼저 부담을 집니다.', ask: '학생 수 대신 학급·학교 수를 반영하면 경북 몫은 어떻게 달라지는가?' },
  '교육혁신선도지역': { metric: 'small_share_top',     facts: ['schools_under', 'schools_under_share'], why: '지자체·교육청이 함께 내는 공모라, 어떤 학교 모델을 내세우느냐가 앞으로의 학교 배치를 정합니다.', ask: '경북 시군은 어떤 모델로 응모하며, 소규모 학교를 «통합»과 «거점» 가운데 어느 쪽으로 보는가?' },
  '통폐합·적정규모':  { metric: 'small_share_top',     facts: ['schools_under', 'schools_minimum'], why: '통폐합은 학부모 동의에서 막히는 일이 많아, 절차와 지원책이 결과를 가릅니다.', ask: '경북에서 다음에 통폐합 논의가 시작될 학교는 어디이고, 통학 대책은 준비되어 있는가?' },
  '작은학교 살리기':  { metric: 'small_share_top',     facts: ['schools_under_share', 'schools_small'], why: '작은 학교를 살리는 정책은 학생 유입이 실제로 일어나야 효과가 있습니다.', ask: '경북에서 학생 유입에 성공한 작은 학교는 어디이고, 그 조건은 무엇이었는가?' },
  '지역소멸·인구':    { metric: 'births',              facts: ['births_2025', 'grade_e1_2026'], why: '출생아 감소는 6년 뒤 초1 입학생으로 그대로 옵니다.', ask: '6년 뒤 입학생 규모를 시군별로 미리 알릴 수 있는가?' },
  '교원·정원':        { metric: 'students_vs_classes', facts: ['classes_change', 'students_per_class_last'], why: '교원 정원은 학생 수를 따라가지만, 학급은 그만큼 줄지 않습니다.', ask: '학급이 남는 동안 교원 정원이 먼저 줄면 어떤 학교가 부담을 지는가?' },
  '통학·돌봄':        { metric: 'myeon:구미',          facts: ['schools_under'], why: '학교가 멀어지면 통학과 돌봄이 학교 선택을 좌우합니다.', ask: '통폐합 뒤 통학 시간이 가장 길어지는 곳은 어디인가?' }
};
export function ruleDraft({ arts, stats, digest, F, from, to }) {
  const scope = arts.filter(inScope);
  const top = stats.topics.filter((t) => t.topic !== '기타').slice(0, 3);
  const pickArts = (topic, n) => scope.filter((a) => a.topic === topic).slice(0, n).map((a) => a.id);
  const issues = top.map((t) => {
    const pb = TOPIC_PLAYBOOK[t.topic] || {};
    const list = scope.filter((a) => a.topic === t.topic);
    const gb = list.filter((a) => a.region === '경북').length;
    return {
      kicker: t.topic,
      title: `${t.topic} — 이번 주 ${t.n}건${t.prev ? `(지난주 ${t.prev}건)` : ''}`,
      what: `이번 주 이 주제로 ${t.n}건이 나왔고, 그 가운데 경북 기사는 ${gb}건입니다. 대표 기사: 「${list[0].title}」.`,
      why: pb.why || '', ask: pb.ask ? [pb.ask] : [], facts: (pb.facts || []).filter((k) => digest[k]),
      articles: list.slice(0, 4).map((a) => a.id)
    };
  });
  const policy = /추진|지원|선정|계획|도입|협약|운영|개편|확대|신설|전환|조성|공모|육성|의무화|검토/;
  const bySido = {};
  scope.filter((a) => SIDO.includes(a.region) && policy.test(a.title + a.description)).forEach((a) => { (bySido[a.region] = bySido[a.region] || []).push(a); });
  const regions = Object.entries(bySido).sort((a, b) => b[1].length - a[1].length).slice(0, 6).map(([sd, list]) => ({
    region: sd, what: list[0].title, detail: list.length > 1 ? `같은 주 ${sd} 관련 기사 ${list.length}건` : '', compare: '', facts: [],
    articles: list.slice(0, 3).map((a) => a.id)
  }));
  const numbers = top.map((t) => (TOPIC_PLAYBOOK[t.topic] || {}).metric).filter(Boolean)
    .filter((m, i, a) => a.indexOf(m) === i).slice(0, 3).map((m) => {
      const t = top.find((x) => (TOPIC_PLAYBOOK[x.topic] || {}).metric === m);
      const c = chartFor(m, F);
      return { metric: m, topic: t.topic, headline: c.caption, sub: `이번 주 「${t.topic}」 기사 ${t.n}건과 함께 볼 자료`, body: '', articles: pickArts(t.topic, 2) };
    });
  const lead = `${weekLabel(from, to)} 학령인구 관련 기사는 ${stats.articles}건입니다` +
    (stats.prevArticles != null ? `(지난주 ${stats.prevArticles}건)` : '') +
    `. 가장 많이 다룬 주제는 「${top[0] ? top[0].topic : '–'}」이고, 경북 기사 ${stats.gyeongbuk}건·다른 시·도 기사 ${stats.otherSido}건입니다.`;
  return {
    title: top.length ? `이번 주는 「${top[0].topic}」 — ${top.map((t) => t.topic).slice(1).join('·')}` : '이번 주 학령인구 기사',
    lead, leadArticles: scope.slice(0, 3).map((a) => a.id),
    takeaways: top.map((t) => `${t.topic} ${t.n}건`), numbers, issues, regions, factchecks: [], watch: []
  };
}

/* ── 한 호로 묶기 ──────────────────────────────────────────────────── */
export function assembleIssue({ draft, arts, stats, digest, F, from, to, generator, no, status, dropped }) {
  const used = new Set();
  const cite = (list) => (list || []).forEach((id) => used.add(id));
  const factChip = (k) => digest[k] ? { key: k, label: digest[k].label, value: digest[k].value, unit: digest[k].unit, src: digest[k].src } : null;
  cite(draft.leadArticles);
  const numbers = (draft.numbers || []).map((n) => { cite(n.articles); return { ...n, chart: chartFor(n.metric, F, { exclude: n.exclude }) }; });
  const issues = (draft.issues || []).map((it) => { cite(it.articles); return { ...it, facts: (it.facts || []).map(factChip).filter(Boolean) }; });
  const regions = (draft.regions || []).map((r) => { cite(r.articles); return { ...r, facts: (r.facts || []).map(factChip).filter(Boolean) }; });
  const factchecks = (draft.factchecks || []).map((c) => { cite([c.article]); return resolveFactcheck(c, { digest, F, arts }); });
  return {
    id: from, no, from, to, period: weekLabel(from, to),
    title: draft.title, lead: draft.lead, leadArticles: draft.leadArticles || [], takeaways: draft.takeaways || [],
    status, generator, builtAt: new Date().toISOString(),
    stats, numbers, issues, regions, factchecks, watch: draft.watch || [],
    articles: arts.map((a) => ({ id: a.id, title: a.title, outlet: a.outlet, date: a.date, link: a.link,
      region: a.region, topic: a.topic, cited: used.has(a.id), inScope: inScope(a) })),
    checks: { dropped: dropped || [], citedArticles: used.size }
  };
}
