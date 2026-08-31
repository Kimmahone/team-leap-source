/* ==========================================================================
   EDSS 7개 API 에서 경북 학교의 여러 해치 학생·학급을 받아 대시보드에 심습니다

   이 스크립트가 있어야 대시보드의 **가장 큰 구멍**이 메워집니다.
   지금 화면의 2016~2036 학생수 곡선은 2016·2026·2036 세 점을 이은
   **직선**입니다. 실적은 2026 한 해뿐입니다. 여러 해치가 들어오면

     · 직선이 실적으로 바뀌고
     · 시군별 감소율이 「가정」에서 「지난 10년의 실측」으로 바뀌고
     · 코호트 진급법이 성립하고 (g학년이 이듬해 g+1학년으로 몇 % 올라가는가)
     · 백테스트가 가능해집니다 (2016 으로 2026 을 맞혀 보는 것)

   ── 인증키 ───────────────────────────────────────────────────────────
   API 마다 키가 다릅니다. 한 칸에 여러 키를 합쳐 넣지 않습니다.
   GitHub Actions 의 Repository Secret 에서 API 별로 하나씩 읽습니다.
   이 파일에도, 로그에도, 커밋에도 키는 남지 않습니다 (redact 로 가립니다).

   ── 요청주소 ─────────────────────────────────────────────────────────
   `edss-endpoints.json` 에 있습니다. **코드에는 주소를 박지 않았습니다.**
   주소를 모르는 API 는 조용히 건너뛰지 않고 「주소가 없다」고 말합니다.

   ── 쓰는 법 ──────────────────────────────────────────────────────────
     node "open api/bake-edss.mjs" --probe          한 번씩만 불러 응답 모양을 봅니다
     node "open api/bake-edss.mjs" --dry            다 받되 파일은 고치지 않습니다
     node "open api/bake-edss.mjs"                  받아서 대시보드에 심습니다
     node "open api/bake-edss.mjs" --from=2016 --to=2026
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CONFIG_FILE = path.join(HERE, 'edss-endpoints.json');
const DATA_DIR    = path.join(HERE, 'data');
const PROBE_FILE  = path.join(DATA_DIR, 'edss-probe.json');
const SERIES_FILE = path.join(DATA_DIR, 'edss-series.json');
const TARGET      = path.join(ROOT, '06. 실행계획(1)/prototype/index.html');

/* ══ 1. 인증키를 로그에서 가립니다 ═══════════════════════════════════════
   오류 메시지에 요청 URL 이 통째로 실려 나오는 일이 흔합니다. 그 URL 에는
   serviceKey 가 붙어 있습니다. GitHub Actions 로그는 저장소를 볼 수 있는
   사람이면 누구나 읽습니다. 그래서 **내보내는 모든 글자**를 한 번 거릅니다. */
export function redact(text, secrets) {
  let s = String(text);
  for (const k of secrets || []) {
    if (!k || k.length < 8) continue;
    s = s.split(k).join('***');
    s = s.split(encodeURIComponent(k)).join('***');
  }
  /* 키를 모르고 흘러도 막습니다 — 「…Key=」 뒤의 긴 토막은 무조건 가립니다. */
  return s.replace(/([?&](?:serviceKey|apiKey|authKey|key|KEY)=)[^&\s"']{8,}/gi, '$1***');
}

/* ══ 2. 봉투를 벗깁니다 ═══════════════════════════════════════════════════
   공공 API 는 같은 자료를 서너 가지 봉투에 담아 줍니다. 어느 것이 오든
   행 배열과 총건수를 꺼냅니다. 봉투를 못 알아보면 **빈 배열이 아니라**
   무엇이 왔는지 적어 돌려줍니다 — 조용한 0건이 가장 나쁩니다. */
export function unwrap(json) {
  const none = (meta) => ({ rows: [], total: 0, meta: meta || {} });
  if (Array.isArray(json)) return { rows: json, total: json.length, meta: {} };
  if (!json || typeof json !== 'object') return none({ shape: typeof json });

  const r = json.response || json.Response;
  if (r && r.body) {
    const b = r.body;
    let it = b.items != null ? b.items : b.item;
    if (it && !Array.isArray(it) && it.item != null) it = it.item;
    const rows = it == null || it === '' ? [] : (Array.isArray(it) ? it : [it]);
    const h = r.header || {};
    return {
      rows,
      total: Number(b.totalCount) || rows.length,
      meta: { code: h.resultCode, msg: h.resultMsg || '', perPage: Number(b.numOfRows) || rows.length, page: Number(b.pageNo) || 1 }
    };
  }
  if (Array.isArray(json.data)) {
    return {
      rows: json.data, total: Number(json.totalCount) || json.data.length,
      meta: { perPage: Number(json.perPage) || json.data.length, page: Number(json.page) || 1 }
    };
  }
  if (Array.isArray(json.list)) {
    return { rows: json.list, total: Number(json.totalCount) || json.list.length, meta: { code: json.resultCode, msg: json.resultMsg || '' } };
  }
  for (const k of ['items', 'result', 'rows', 'record', 'RESULT', 'body']) {
    if (Array.isArray(json[k])) return { rows: json[k], total: json[k].length, meta: {} };
  }
  /* 나이스 방식: { "표이름": [ {head:…}, {row:[…]} ] } — 깊이 3까지 훑어
     객체가 든 가장 긴 배열을 찾습니다. */
  let best = null;
  const walk = (v, depth) => {
    if (depth > 3 || !v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      const objs = v.filter(x => x && typeof x === 'object' && !Array.isArray(x));
      if (objs.length && (!best || objs.length > best.length)) best = objs;
      v.forEach(x => walk(x, depth + 1));
      return;
    }
    Object.keys(v).forEach(k => walk(v[k], depth + 1));
  };
  walk(json, 0);
  if (best && best.length) return { rows: best, total: best.length, meta: { guessed: true } };
  return none({ topKeys: Object.keys(json).slice(0, 12) });
}

/* ══ 3. 필드 이름을 스스로 고릅니다 ══════════════════════════════════════
   승인 문서를 보기 전에도 돌아야 합니다. 이름을 보고 짐작하되, **짐작했다는
   사실을 감추지 않습니다** — probe 가 고른 이유와 후보를 함께 적어 냅니다.
   틀렸으면 edss-endpoints.json 의 fields 에 실제 이름을 박아 고정하세요. */
const HINTS = {
  year:     [/^(SVY_?)?YY$/, /^(SVY_?)?YR$/, /조사.?연도/, /기준.?연도/, /^BASE_?YY?$/, /^STD_?YY$/, /YEAR/, /연도/],
  code:     [/SCHUL_?CODE$/, /^SCH[LU]?_?CD$/, /학교.?코드/, /기관.?코드/, /INST_?CD/, /ORG_?CD/, /SCHUL_?CD/],
  name:     [/SCHUL_?NM$/, /^SCH[LU]?_?NM$/, /학교.?명/, /기관.?명/, /INST_?NM/],
  level:    [/KND.*NM/, /학교.?급/, /^KND/, /SCHUL_?SE/, /CRSE.*NM/, /과정.?구분/, /LEVEL/],
  sido:     [/시도.?명/, /SIDO_?NM/, /CTPRVN/, /LCTN_?SC/, /시도/],
  sgg:      [/시군구.?명/, /시군.?명/, /SGG_?NM/, /ADRCD_?NM/, /ADMST.*NM/, /시군/, /SGG/, /ADRCD/],
  grade:    [/^GRADE$/, /^GRD$/, /학년/, /^AY$/, /GRADE_?SE/, /GRD_?SE/],
  students: [/^학생.?수$/, /^STUD?_?CNT$/, /^STDNT_?CNT$/, /학생.?수.?계/, /STUD.*(SUM|TOT)/, /학생/, /STUD/, /STDNT/],
  classes:  [/^학급.?수$/, /^CLAS{1,2}_?CNT$/, /^CLSS_?CNT$/, /학급.?수.?계/, /CLAS{1,2}.*(SUM|TOT)/, /학급/, /CLAS/, /CLSS/],
  lat:      [/^위도$/, /^LAT/, /^Y_?CRD/, /YDNTS/, /위도/],
  lon:      [/^경도$/, /^LO?N[GT]?$/, /^X_?CRD/, /XCRD/, /경도/]
};
/* 이런 낱말이 든 칸은 「학생수·학급수」로 뽑지 않습니다. 특수학급 학생수를
   전체 학생수로 잘못 집으면 합계가 조용히 1/20 이 됩니다. */
const NOT_COUNT = /(특수|장애|다문화|외국|탈북|유학|중도|편입|전입|전출|중단|유예|교원|교사|직원|남|여|MALE|FEMAL|TCHR|TEACH|STAFF)/;

export function guessFields(row, override) {
  const names = Object.keys(row || {});
  const picked = {}, why = {};
  for (const want of Object.keys(HINTS)) {
    if (override && override[want]) {
      picked[want] = override[want];
      why[want] = '고정값(edss-endpoints.json)';
      continue;
    }
    let bestName = null, bestRank = Infinity;
    for (const nm of names) {
      if ((want === 'students' || want === 'classes') && NOT_COUNT.test(nm)) continue;
      const flat = nm.toUpperCase().replace(/\s/g, '');
      for (let i = 0; i < HINTS[want].length; i++) {
        if (!HINTS[want][i].test(flat) && !HINTS[want][i].test(nm)) continue;
        /* 같은 등수면 짧은 이름을 고릅니다 — 짧을수록 곁가지가 아닙니다. */
        if (i < bestRank || (i === bestRank && bestName && nm.length < bestName.length)) {
          bestRank = i; bestName = nm;
        }
        break;
      }
    }
    if (bestName) { picked[want] = bestName; why[want] = HINTS[want][bestRank].source; }
  }
  return { picked, why, all: names };
}

/* ══ 4. 값 다듬기 ════════════════════════════════════════════════════════ */
export const LV = { 초: '초', 중: '중', 고: '고' };
export function toLevel(v) {
  const s = String(v == null ? '' : v);
  if (/초등|^초$|elem|^02$|^2$/i.test(s)) return '초';
  if (/중학|^중$|midd|^03$|^3$/i.test(s)) return '중';
  /* 「고등학교」와 「고등공민학교」는 다릅니다. 각종학교·특수학교는 뺍니다. */
  if (/고등학교|^고$|high|^04$|^4$/i.test(s) && !/공민|기술|각종/.test(s)) return '고';
  return null;
}
export const num = (v) => {
  if (v == null || v === '' || v === '-') return 0;
  const n = Number(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
};
export const GRADES = { 초: 6, 중: 3, 고: 3 };

/* 시군 이름을 대시보드가 쓰는 알파벳 키로 바꿉니다.
   `bake-students.mjs`·`bake-coords.mjs` 와 **같은 22곳**이어야 합니다. */
export const SGG_BY_NAME = {
  포항: 'pohang', 경주: 'gyeongju', 김천: 'gimcheon', 안동: 'andong', 구미: 'gumi',
  영주: 'yeongju', 영천: 'yeongcheon', 상주: 'sangju', 문경: 'mungyeong', 경산: 'gyeongsan',
  의성: 'uiseong', 청송: 'cheongsong', 영양: 'yeongyang', 영덕: 'yeongdeok', 청도: 'cheongdo',
  고령: 'goryeong', 성주: 'seongju', 칠곡: 'chilgok', 예천: 'yecheon', 봉화: 'bonghwa',
  울진: 'uljin', 울릉: 'ulleung'
};
export const SGG_BY_CODE = {
  47111: 'pohang', 47113: 'pohang', 47130: 'gyeongju', 47150: 'gimcheon',
  47170: 'andong', 47190: 'gumi', 47210: 'yeongju', 47230: 'yeongcheon',
  47250: 'sangju', 47280: 'mungyeong', 47290: 'gyeongsan', 47730: 'uiseong',
  47750: 'cheongsong', 47760: 'yeongyang', 47770: 'yeongdeok', 47820: 'cheongdo',
  47830: 'goryeong', 47840: 'seongju', 47850: 'chilgok', 47900: 'yecheon',
  47920: 'bonghwa', 47930: 'uljin', 47940: 'ulleung'
};
export function toSgg(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (SGG_BY_CODE[s]) return SGG_BY_CODE[s];
  /* 「포항시 남구」·「포항시남구」·「경상북도 포항시」 어느 쪽이 와도 붙습니다.
     ※ 군위는 2023. 7. 1. 대구로 넘어갔습니다. 옛 연도 자료에는 남아 있으므로
        일부러 표에 넣지 않아 null 로 떨어뜨립니다 — 경북 합계가 흔들립니다. */
  for (const nm of Object.keys(SGG_BY_NAME)) if (s.indexOf(nm) >= 0) return SGG_BY_NAME[nm];
  return null;
}

/* ══ 5. 행 → 기록 ═══════════════════════════════════════════════════════ */
export function normalizeRows(rows, fields) {
  const out = [], skipped = { level: 0, sgg: 0, year: 0 };
  for (const r of rows || []) {
    const year = num(r[fields.year]);
    if (year < 1990 || year > 2100) { skipped.year++; continue; }
    const lv = toLevel(r[fields.level] != null ? r[fields.level] : r[fields.name]);
    if (!lv) { skipped.level++; continue; }
    const sgg = toSgg(fields.sgg ? r[fields.sgg] : null);
    if (!sgg) { skipped.sgg++; continue; }
    const g = fields.grade ? num(r[fields.grade]) : 0;
    out.push({
      year, lv, sgg,
      code: fields.code ? String(r[fields.code] || '') : '',
      name: fields.name ? String(r[fields.name] || '') : '',
      grade: g >= 1 && g <= GRADES[lv] ? g : 0,
      stu: fields.students ? num(r[fields.students]) : 0,
      cls: fields.classes ? num(r[fields.classes]) : 0
    });
  }
  return { records: out, skipped };
}

/* ══ 6. 모으기 ═══════════════════════════════════════════════════════════
   학교·학년 단위를 시군×학교급×연도로 접습니다. 대시보드가 필요한 것은
   여기까지입니다 — 학교별 여러 해치를 화면에 넣으면 400KB 가 됩니다.
   학교별 원자료는 `data/edss-series.json` 에 따로 둡니다 (백테스트용). */
export function aggregate(records) {
  const years = new Set(), out = {};
  const grade = {};      // grade[lv][year] = [g1…gN]
  const schools = {};    // schools[year][sgg][lv] = Set(학교)
  for (const r of records) {
    years.add(r.year);
    out[r.year] ||= {};
    out[r.year][r.sgg] ||= {};
    const cell = (out[r.year][r.sgg][r.lv] ||= { stu: 0, cls: 0, sch: 0 });
    cell.stu += r.stu; cell.cls += r.cls;
    schools[r.year] ||= {}; schools[r.year][r.sgg] ||= {};
    (schools[r.year][r.sgg][r.lv] ||= new Set()).add(r.code || r.name);
    if (r.grade) {
      grade[r.lv] ||= {};
      const g = (grade[r.lv][r.year] ||= new Array(GRADES[r.lv]).fill(0));
      g[r.grade - 1] += r.stu;
    }
  }
  for (const y of Object.keys(schools))
    for (const s of Object.keys(schools[y]))
      for (const lv of Object.keys(schools[y][s]))
        out[y][s][lv].sch = schools[y][s][lv].size;
  return { years: [...years].sort((a, b) => a - b), byYear: out, grade };
}

/* ══ 7. 시군×학교급 연평균 감소율 — 「가정」을 「실측」으로 ═══════════════
   지금 화면은 군 0.062 · 시 0.033 이라는 **지어낸 수**를 씁니다.
   여러 해치가 들어오면 그 자리에 이 값이 들어갑니다.
   CAGR = (끝/처음)^(1/해수) - 1. 늘어난 곳은 음수가 나오고, 그대로 씁니다
   (구미·경산은 실제로 늘어난 해가 있습니다 — 0 으로 깎으면 거짓이 됩니다). */
export function declineRates(agg) {
  const out = {};
  const ys = agg.years;
  if (ys.length < 2) return out;
  const first = ys[0], last = ys[ys.length - 1], span = last - first;
  for (const sgg of Object.keys(agg.byYear[last] || {})) {
    for (const lv of Object.keys(agg.byYear[last][sgg])) {
      const a = agg.byYear[first] && agg.byYear[first][sgg] && agg.byYear[first][sgg][lv];
      const b = agg.byYear[last][sgg][lv];
      if (!a || !a.stu || !b || !b.stu) continue;
      const r = 1 - Math.pow(b.stu / a.stu, 1 / span);
      out[sgg] ||= {};
      /* 소수 다섯째 자리까지. 그 아래는 학생 한 명도 못 바꿉니다. */
      out[sgg][lv] = Math.round(r * 1e5) / 1e5;
    }
  }
  return out;
}

/* ══ 8. 코호트 진급률 ════════════════════════════════════════════════════
   g학년이 이듬해 g+1학년으로 몇 명이 되는가. 1을 넘으면 전입이 많은 것이고
   (구미·경산), 1보다 작으면 전출입니다. 여러 해의 중앙값을 씁니다 —
   평균은 한 해의 통폐합에 통째로 끌려갑니다. */
export function cohortRates(grade) {
  const med = (a) => {
    if (!a.length) return null;
    const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const out = {};
  for (const lv of Object.keys(grade)) {
    const ys = Object.keys(grade[lv]).map(Number).sort((a, b) => a - b);
    const n = GRADES[lv];
    const rates = [];
    for (let g = 0; g < n - 1; g++) {
      const list = [];
      for (const y of ys) {
        const a = grade[lv][y], b = grade[lv][y + 1];
        if (!a || !b || !a[g] || !b[g + 1]) continue;
        const r = b[g + 1] / a[g];
        if (r > 0.5 && r < 1.6) list.push(r);   // 통폐합으로 튄 해는 뺍니다
      }
      const m = med(list);
      rates.push(m == null ? 1 : Math.round(m * 1e4) / 1e4);
    }
    out[lv] = rates;
  }
  /* 학교급을 건너가는 자리 — 초6 → 중1, 중3 → 고1.
     경북은 고등학교 진학에서 대구·수도권으로 빠져나갑니다. 그 값이 여기 잡힙니다. */
  const cross = (from, to) => {
    if (!grade[from] || !grade[to]) return null;
    const list = [];
    for (const y of Object.keys(grade[from]).map(Number)) {
      const a = grade[from][y], b = grade[to][y + 1];
      if (!a || !b) continue;
      const last = a[GRADES[from] - 1];
      if (!last || !b[0]) continue;
      const r = b[0] / last;
      if (r > 0.4 && r < 1.8) list.push(r);
    }
    const m = med(list);
    return m == null ? null : Math.round(m * 1e4) / 1e4;
  };
  out.cross = { 초중: cross('초', '중'), 중고: cross('중', '고') };
  return out;
}

/* ══ 8-2. 취학률 — 6년 전 출생아가 초1이 되는 비율 ═══════════════════════
   초등학교 1학년만은 진급이 아니라 **새로 들어오는** 학년입니다. 그 수는
   6년 전 출생아에서 나옵니다. 경북은 대구·수도권으로 빠져나가므로 1:1 이
   아니고, 그 비율은 지난 해들에서 잽니다 (중앙값 — 한 해의 통폐합에 안 끌리게).
   출생아는 `kosis-summary.json` 에 이미 있습니다. */
export function entryRate(grade, births) {
  if (!grade || !grade['초'] || !births) return null;
  const list = [];
  for (const y of Object.keys(grade['초']).map(Number)) {
    const b = births[y - 6], g1 = grade['초'][y] && grade['초'][y][0];
    if (!b || !g1) continue;
    const r = g1 / b;
    if (r > 0.4 && r < 1.6) list.push(r);
  }
  if (!list.length) return null;
  const s = list.sort((a, b) => a - b), m = s.length >> 1;
  const med = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  return Math.round(med * 1e4) / 1e4;
}

/* ══ 9. 앞날 — 코호트를 굴립니다 ════════════════════════════════════════
   `births` 는 6년 전 출생아 수 → 초1. 이미 `kosis-summary.json` 에 있습니다.
   출생아를 못 주면 초1은 마지막 해의 초1을 그대로 두고 굴립니다(보수적). */
export function projectCohort(lastGrades, rates, toYear, fromYear, births) {
  const out = {}; let cur = JSON.parse(JSON.stringify(lastGrades));
  for (let y = fromYear + 1; y <= toYear; y++) {
    const nxt = {};
    for (const lv of ['초', '중', '고']) {
      if (!cur[lv]) continue;
      const n = GRADES[lv], v = new Array(n).fill(0), R = (rates[lv] || []);
      for (let g = 1; g < n; g++) v[g] = Math.round(cur[lv][g - 1] * (R[g - 1] || 1));
      if (lv === '초') {
        const b = births && births[y - 6];
        /* 출생아 × 취학률. 취학률을 못 재면 마지막 1학년을 그대로 둡니다(보수적). */
        v[0] = (b && rates.entry) ? Math.round(b * rates.entry) : cur['초'][0];
      } else {
        const from = lv === '중' ? '초' : '중';
        const r = (rates.cross || {})[lv === '중' ? '초중' : '중고'];
        v[0] = cur[from] ? Math.round(cur[from][GRADES[from] - 1] * (r || 1)) : cur[lv][0];
      }
      nxt[lv] = v;
    }
    out[y] = nxt; cur = nxt;
  }
  return out;
}

/* ══ 10. 백테스트 — 「맞기는 하나」 ══════════════════════════════════════
   첫 해로 마지막 해를 맞혀 보고 몇 % 틀렸는지 적습니다. 이 수를 화면에
   적어야 보는 사람이 전망을 얼마나 믿을지 스스로 정할 수 있습니다. */
export function backtest(grade, rates, births) {
  const lvs = Object.keys(grade).filter(l => GRADES[l]);
  if (!lvs.length) return null;
  const ys = Object.keys(grade[lvs[0]]).map(Number).sort((a, b) => a - b);
  if (ys.length < 3) return null;
  const from = ys[0], to = ys[ys.length - 1];
  const start = {}; lvs.forEach(l => { if (grade[l][from]) start[l] = grade[l][from]; });
  const pred = projectCohort(start, rates, to, from, births)[to] || {};
  const out = { from, to, byLevel: {} };
  let se = 0, sa = 0;
  for (const lv of lvs) {
    const a = (grade[lv][to] || []).reduce((x, v) => x + v, 0);
    const p = (pred[lv] || []).reduce((x, v) => x + v, 0);
    if (!a) continue;
    out.byLevel[lv] = { 실적: a, 예측: p, 오차율: Math.round((p - a) / a * 1000) / 10 };
    se += Math.abs(p - a); sa += a;
  }
  out.오차율 = sa ? Math.round(se / sa * 1000) / 10 : null;
  return out;
}

/* ══ 11. 대시보드에 심을 덩어리 ═════════════════════════════════════════
   연도 배열 하나를 기준으로 값은 전부 같은 길이의 배열입니다.
   키를 해마다 되풀이하지 않으므로 22시군 × 3급 × 11년이 10KB 안에 듭니다. */
export function toBlock(agg, rates, cohort, back, meta, births) {
  const ys = agg.years;
  const total = {}, sgg = {}, grade = {};
  for (const lv of ['초', '중', '고']) {
    total[lv] = ys.map(y => {
      let s = 0; const Y = agg.byYear[y] || {};
      for (const k of Object.keys(Y)) if (Y[k][lv]) s += Y[k][lv].stu;
      return s;
    });
    if (agg.grade[lv]) grade[lv] = ys.map(y => agg.grade[lv][y] || null);
  }
  for (const k of Object.keys(SGG_BY_NAME).map(n => SGG_BY_NAME[n])) {
    const cell = {};
    for (const lv of ['초', '중', '고']) {
      const s = ys.map(y => ((agg.byYear[y] || {})[k] || {})[lv] ? agg.byYear[y][k][lv].stu : null);
      const c = ys.map(y => ((agg.byYear[y] || {})[k] || {})[lv] ? agg.byYear[y][k][lv].cls : null);
      if (s.some(v => v != null)) cell[lv] = { s, c };
    }
    if (Object.keys(cell).length) sgg[k] = cell;
  }
  const J = (o) => JSON.stringify(o);
  return [
    '  /* ↓ `bake-edss.mjs` 가 심습니다. 손으로 고치지 마세요 — 다음 수집 때 덮어씁니다. */',
    '  var EDSS_META  = ' + J(meta) + ';',
    '  var EDSS_YEARS = ' + J(ys) + ';',
    '  var EDSS_TOTAL = ' + J(total) + ';',
    '  var EDSS_SGG   = ' + J(sgg) + ';',
    '  var EDSS_GRADE = ' + J(grade) + ';',
    '  var EDSS_RATE  = ' + J(rates) + ';',
    '  var EDSS_COHORT = ' + J(cohort) + ';',
    '  var EDSS_BACKTEST = ' + J(back) + ';',
    /* 앞으로 6년치 초1을 굴리는 데 필요한 만큼만 싣습니다 — 전부 넣을 까닭이 없습니다. */
    '  var EDSS_BIRTH = ' + J(births ? Object.fromEntries(
      Object.keys(births).map(Number).filter(y => y >= ys[ys.length - 1] - 6).sort()
        .map(y => [y, Math.round(births[y])])) : {}) + ';'
  ].join('\n') + '\n';
}

/* ══ 12. 여기부터는 네트워크 ════════════════════════════════════════════ */

const ARGV = process.argv.slice(2);
const KNOWN = ['--probe', '--dry', '--from', '--to', '--help', '-h', '--sido', '--only', '--url'];
const bad = ARGV.filter(a => a.startsWith('--')).filter(f => !KNOWN.includes(f.split('=')[0]));
const flag = (n, d) => { const h = ARGV.find(a => a.startsWith('--' + n + '=')); return h ? h.split('=')[1] : d; };

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

async function fetchPage(url, key, params, secrets) {
  const u = new URL(url);
  /* 두 이름을 다 붙입니다. 포털은 serviceKey, 몇몇 기관은 apiKey 를 봅니다.
     모르는 이름은 무시되므로 함께 보내도 탈이 없습니다. */
  u.searchParams.set('serviceKey', key);
  u.searchParams.set('apiKey', key);
  u.searchParams.set('type', 'json');
  u.searchParams.set('returnType', 'json');
  u.searchParams.set('dataType', 'JSON');
  for (const k of Object.keys(params || {})) u.searchParams.set(k, String(params[k]));
  const res = await fetch(u, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) throw new Error('HTTP ' + res.status + ' — ' + redact(text.slice(0, 200), secrets));
  try { return JSON.parse(text); }
  catch (e) {
    /* XML 이 왔다는 것은 대개 「등록되지 않은 서비스키」입니다. */
    const m = text.match(/<returnAuthMsg>([^<]*)<|<resultMsg>([^<]*)</);
    throw new Error('JSON 이 아닙니다 — ' + redact((m ? (m[1] || m[2]) : text.slice(0, 160)), secrets));
  }
}

async function main() {
  if (ARGV.includes('--help') || ARGV.includes('-h') || bad.length) {
    if (bad.length) console.error('모르는 깃발: ' + bad.join(' ') + '\n');
    console.log('쓰는 법: node "open api/bake-edss.mjs" [--probe] [--dry] [--from=2016] [--to=2026]');
    console.log('  --probe  API 마다 한 번씩만 불러 응답 모양을 적습니다. 처음엔 이것부터.');
    console.log('  --dry    다 받되 대시보드는 고치지 않습니다.');
    console.log('  --only=<이름>  한 API 만. 이름: ' + Object.keys(JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')).apis).join(' · '));
    console.log('  --url=<주소>   파일을 안 고치고 그 API 의 주소를 한 번만 바꿔 씁니다.');
    console.log('  요청주소는 open api/edss-endpoints.json 에 적습니다.');
    process.exit(bad.length ? 1 : 0);
  }

  const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  const PROBE = ARGV.includes('--probe');
  const DRY = ARGV.includes('--dry') || PROBE;
  const FROM = Number(flag('from', cfg.from || 2016));
  const TO = Number(flag('to', cfg.to || 2026));
  /* 파일을 고치지 않고 한 API 만 확인할 때 씁니다.
     --only=studentStatus --url=https://…  처럼 씁니다. 인증키는 그래도 Secret 에서 읽습니다. */
  const ONLY = flag('only', '');
  const URL1 = flag('url', '');
  if (ONLY && !cfg.apis[ONLY]) {
    console.error('그런 이름의 API 가 없습니다: ' + ONLY);
    console.error('쓸 수 있는 이름: ' + Object.keys(cfg.apis).join(' · '));
    process.exit(1);
  }
  if (URL1 && !ONLY) { console.error('--url 은 --only 와 함께 써야 합니다.'); process.exit(1); }
  if (ONLY) for (const id of Object.keys(cfg.apis)) if (id !== ONLY) delete cfg.apis[id];
  if (URL1) cfg.apis[ONLY].url = URL1;

  const local = loadDotEnv(path.join(ROOT, '.dev.vars'));
  const keyOf = (n) => process.env[n] || local[n] || '';
  const secrets = Object.keys(cfg.apis).map(k => keyOf(cfg.apis[k].secret)).filter(Boolean);
  const say = (s) => console.log(redact(s, secrets));
  const cry = (s) => console.error(redact(s, secrets));

  /* --- 무엇이 준비되었는지 먼저 세어 보여 줍니다 ------------------------ */
  const ready = [], noKey = [], noUrl = [];
  for (const id of Object.keys(cfg.apis)) {
    const a = cfg.apis[id];
    if (!keyOf(a.secret)) noKey.push(a.name + ' (' + a.secret + ')');
    else if (!a.url) noUrl.push(a.name);
    else ready.push(id);
  }
  say('EDSS ' + Object.keys(cfg.apis).length + '개 중 부를 수 있는 것 ' + ready.length + '개');
  if (noKey.length) { say('  · 키 없음 ' + noKey.length + '개'); noKey.forEach(n => say('      ' + n)); }
  if (noUrl.length) {
    say('  · 요청주소 없음 ' + noUrl.length + '개'); noUrl.forEach(n => say('      ' + n));
    say('    → data.go.kr 마이페이지 → 활용신청 현황 → 그 API → 요청주소를');
    say('       open api/edss-endpoints.json 의 url 에 붙여 넣으세요.');
  }
  if (!ready.length) {
    cry('\n부를 수 있는 API 가 하나도 없습니다. 아무것도 고치지 않았습니다.');
    process.exit(2);
  }

  /* --- probe: API 마다 한 번씩만 -------------------------------------- */
  const report = { 만든때: new Date().toISOString(), 기준연도: TO, apis: {} };
  const sample = {};
  for (const id of ready) {
    const a = cfg.apis[id];
    const key = keyOf(a.secret);
    const params = Object.assign({ pageNo: 1, numOfRows: PROBE ? 5 : 1000 }, a.params || {});
    let json;
    try { json = await fetchPage(a.url, key, params, secrets); }
    catch (e) {
      cry('  ✗ ' + a.name + ' — ' + e.message);
      report.apis[id] = { name: a.name, 결과: '실패', 까닭: redact(e.message, secrets) };
      continue;
    }
    const { rows, total, meta } = unwrap(json);
    const g = rows.length ? guessFields(rows[0], a.fields) : { picked: {}, why: {}, all: [] };
    sample[id] = { rows, fields: g.picked };
    report.apis[id] = {
      name: a.name, 결과: rows.length ? '응답 있음' : '0건',
      총건수: total, 봉투: meta, 칸이름: g.all, 고른칸: g.picked, 고른까닭: g.why,
      /* 값은 싣지 않습니다 — 학교 이름 하나까지도 보고서에 남길 까닭이 없습니다.
         모양만 봅니다: 그 칸이 숫자인가 글자인가. */
      칸모양: rows.length ? Object.fromEntries(g.all.map(n => [n, typeof rows[0][n]])) : {}
    };
    say('  ✓ ' + a.name + ' — ' + rows.length + '행 / 총 ' + total +
      (rows.length ? '  고른 칸: ' + Object.keys(g.picked).map(k => k + '=' + g.picked[k]).join(' · ') : ''));
    await new Promise(r => setTimeout(r, 200));
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (PROBE) {
    fs.writeFileSync(PROBE_FILE, JSON.stringify(report, null, 2) + '\n', 'utf8');
    say('\n✓ ' + path.relative(ROOT, PROBE_FILE) + ' 에 적었습니다 (인증키·값은 들어 있지 않습니다).');
    say('  이 파일을 보고 필드 짝짓기를 확정한 뒤 --probe 없이 다시 돌리세요.');
    return;
  }

  /* --- 본 수집: 연도를 돌면서 페이지를 다 넘깁니다 ---------------------- */
  const pick = ['classStudent', 'studentStatus', 'classStatus'].filter(id => ready.includes(id));
  if (!pick.length) {
    cry('학생·학급 API 가 하나도 준비되지 않았습니다. 시계열을 만들 수 없습니다.');
    process.exit(3);
  }
  const all = [];
  for (const id of pick) {
    const a = cfg.apis[id], key = keyOf(a.secret);
    for (let y = FROM; y <= TO; y++) {
      let page = 1, got = 0, total = null;
      for (;;) {
        const params = Object.assign({ pageNo: page, numOfRows: 1000, year: y, svyYy: y, yy: y },
          a.params || {});
        let json;
        try { json = await fetchPage(a.url, key, params, secrets); }
        catch (e) { cry('  ✗ ' + a.name + ' ' + y + '년 ' + page + '쪽 — ' + e.message); break; }
        const u = unwrap(json);
        if (total == null) total = u.total;
        if (!u.rows.length) break;
        const f = guessFields(u.rows[0], a.fields).picked;
        const { records } = normalizeRows(u.rows, f);
        /* 연도 칸이 없는 API 는 요청한 해로 채웁니다 */
        records.forEach(r => { if (!r.year) r.year = y; });
        all.push(...records);
        got += u.rows.length;
        if (got >= total || u.rows.length < 1000) break;
        page++;
        await new Promise(r => setTimeout(r, 150));
      }
      say('  ' + a.name + ' ' + y + '년 — ' + got + '행');
      await new Promise(r => setTimeout(r, 150));
    }
  }
  if (!all.length) { cry('한 행도 받지 못했습니다. 아무것도 고치지 않았습니다.'); process.exit(4); }

  const agg = aggregate(all);
  const rates = declineRates(agg);
  const cohort = cohortRates(agg.grade);
  let births = null;
  try {
    const k = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'kosis-summary.json'), 'utf8'));
    births = {};
    for (const b of k.births || []) births[Number(b.year)] = (births[Number(b.year)] || 0) + Number(b.value || 0);
  } catch (e) { /* 없으면 초1을 그대로 굴립니다 */ }
  cohort.entry = entryRate(agg.grade, births);
  const back = backtest(agg.grade, cohort, births);

  say('\n연도 ' + agg.years[0] + '~' + agg.years[agg.years.length - 1] + ' · ' + all.length + '행');
  for (const lv of ['초', '중', '고']) {
    const y = agg.years[agg.years.length - 1];
    let s = 0; const Y = agg.byYear[y] || {};
    for (const k of Object.keys(Y)) if (Y[k][lv]) s += Y[k][lv].stu;
    say('  ' + lv + ' ' + y + '년 ' + s.toLocaleString('ko-KR') + '명');
  }
  if (back) say('  백테스트 ' + back.from + '→' + back.to + ' 오차율 ' + back.오차율 + '%');

  /* --- 스스로 맞는지 봅니다. 합계만 보면 틀린 것이 안 보입니다 --------- */
  const lastY = agg.years[agg.years.length - 1];
  const sggCount = Object.keys(agg.byYear[lastY] || {}).length;
  if (sggCount < 20) cry('  ⚠ ' + lastY + '년에 시군이 ' + sggCount + '곳뿐입니다 (22곳이어야 합니다).');
  if (agg.years.length < 3) cry('  ⚠ 연도가 ' + agg.years.length + '개뿐이라 진급률을 못 냅니다.');

  const meta = {
    만든때: new Date().toISOString().slice(0, 10),
    출처: 'EDSS(교육통계) ' + pick.map(id => cfg.apis[id].name).join(' · '),
    연도: agg.years[0] + '~' + lastY,
    행수: all.length
  };
  if (DRY) {
    say('\n--dry 라 대시보드는 고치지 않았습니다.');
    say(JSON.stringify({ 연도: agg.years, 감소율_표본: Object.keys(rates).slice(0, 3).map(k => k + ':' + JSON.stringify(rates[k])), 진급률: cohort }, null, 2));
    return;
  }

  fs.writeFileSync(SERIES_FILE, JSON.stringify({ meta, records: all }, null, 0) + '\n', 'utf8');
  say('✓ ' + path.relative(ROOT, SERIES_FILE) + ' 저장 (' + all.length + '행)');

  let html = fs.readFileSync(TARGET, 'utf8');
  const block = toBlock(agg, rates, cohort, back, meta, births);
  const MARK = /  \/\* ↓ `bake-edss\.mjs` 가 심습니다[\s\S]*?var EDSS_BIRTH = .*?;\n/;
  if (MARK.test(html)) html = html.replace(MARK, block);
  else {
    const at = html.indexOf('  var STUDENT_RAW = {');
    if (at < 0) { cry('심을 자리를 찾지 못했습니다 (STUDENT_RAW).'); process.exit(5); }
    html = html.slice(0, at) + block + '\n' + html.slice(at);
  }
  fs.writeFileSync(TARGET, html, 'utf8');
  say('✓ ' + path.relative(ROOT, TARGET) + ' 에 ' + meta.연도 + ' 실적 시계열 반영');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('✗ ' + e.message); process.exit(1); });
}
