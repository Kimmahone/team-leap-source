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
  /* 교육데이터플랫폼: { resultData:[…], msgCd:"200 (성공)", msgCn:"[조회건수 : 1 건]" } */
  if (Array.isArray(json.resultData)) {
    const cnt = String(json.msgCn || '').match(/([0-9,]+)\s*건/);
    return {
      rows: json.resultData,
      total: cnt ? num(cnt[1]) : json.resultData.length,
      meta: { code: json.msgCd, msg: json.msgCn || '' }
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

/* ══ 5-2. 한 줄이 «한 학교» 입니다 ═══════════════════════════════════════
   〔2026. 8. 31. 개발명세서 확인〕 처음에는 한 줄이 «한 학교의 한 학년»인
   줄 알고 만들었습니다. 아닙니다. **학년이 칸 이름에 박혀 있습니다.**

     elscCrsGrdr1StdntNope … elscCrsGrdr6StdntNope   초 1~6학년 학생수
     mdscCrsGrdr1StdntNope … 3                        중 1~3학년
     hgscCrsGrdr1StdntNope … 3                        고 1~3학년

   그래서 학년 요청인자가 없고, 한 줄을 학년 수만큼 **펼쳐야** 합니다.

   학교급도 scclNm 만 믿지 않습니다. **어느 과정 칸에 값이 있는지**로 봅니다 —
   초·중 통합운영학교는 한 줄에 두 과정이 다 들어 있어서, 학교급명 하나로는
   둘 중 하나를 통째로 잃습니다.

   학년별 학급수는 «단식»뿐입니다. 복식학급은 과정별 덩어리로 따로 옵니다.
   작은 학교일수록 복식이 많으므로 버리지 않고 학년 0 으로 담습니다. */
/* 이 API 는 «전국»을 줍니다. 시도 요청인자를 보내도 걸러지지 않습니다
   (2026-08-31 확인: ctpvNm='경북' 을 보내도 17개 시도가 다 옵니다).
   그래서 받은 뒤에 우리가 거릅니다. 안 거르면 못 붙인 학교 이름이 만 개 넘게
   쌓여서, 정작 봐야 할 «경북인데 못 붙은 곳»이 그 속에 묻힙니다.

   특수학교·각종학교는 뺍니다. 특수학교 8곳은 `bake-special.mjs` 가 따로 심고
   있어서, 여기서 초·중·고에 섞으면 두 번 세어집니다. */
const SKIP_TYPE = /특수학교|각종학교|고등공민|고등기술|유치원/;
export function normalizeWide(rows, fields, sggOf, into, opt) {
  const key = into === 'cls' ? 'cls' : 'stu';
  const sido = (opt && opt.sido) || '';
  const out = [], missing = {};
  const skipped = { year: 0, sgg: 0, sggStu: 0, level: 0, sido: 0, type: 0 };
  const mismatch = [];
  for (const r of rows || []) {
    if (sido && fields.sido) {
      const v = String(r[fields.sido] == null ? '' : r[fields.sido]);
      if (v !== sido) { skipped.sido++; continue; }
    }
    const type = fields.level ? String(r[fields.level] || '') : '';
    if (SKIP_TYPE.test(type)) { skipped.type++; continue; }
    const year = num(r[fields.year]);
    if (year < 1990 || year > 2100) { skipped.year++; continue; }
    const name = String(r[fields.name] == null ? '' : r[fields.name]).trim();
    const code0 = fields.code ? String(r[fields.code] || '') : '';
    let sgg = fields.sgg ? toSgg(r[fields.sgg]) : null;
    if (!sgg && sggOf) sgg = sggOf(name, code0);
    if (!sgg) {
      /* 몇 «줄»을 버렸는지만으로는 크기를 알 수 없습니다. 문 닫은 학교는 대개
         작아서, 줄 수로는 10%라도 학생 수로는 1%일 수 있습니다. 함께 셉니다. */
      skipped.sgg++;
      skipped.sggStu += fields.total ? num(r[fields.total]) : 0;
      if (name) missing[name] = (missing[name] || 0) + 1;
      continue;
    }

    const own = toLevel(type);          // 이 학교 제 학제 (초·중·고)
    const rows0 = [], push = function (lv, g, v, dbls) {
      const rec = { year: year, lv: lv, sgg: sgg, code: code0, name: name, grade: g, stu: 0, cls: 0 };
      rec[key] = v;
      if (dbls) rec.dbls = true;
      rows0.push(rec);
    };
    let any = false, sum = 0;

    /* ① 제 학제는 «일반 학년 칸»에 들어 있습니다.
       보통 학교(초등학교·중학교·고등학교)는 여기에만 값이 있습니다. */
    /* 일반 칸은 학교급마다 다릅니다 — 초는 단식학급, 중·고는 주간(+야간).
       한 학년이 여러 칸에 나뉘어 있으면 배열로 적고 더합니다. */
    const gen = fields.generic
      ? (Array.isArray(fields.generic) ? fields.generic : (own ? fields.generic[own] : null))
      : null;
    if (own && gen && gen.length) {
      let s0 = 0;
      for (let g = 0; g < GRADES[own] && g < gen.length; g++) {
        const cols = Array.isArray(gen[g]) ? gen[g] : [gen[g]];
        let v = 0;
        for (const c of cols) v += num(r[c]);
        s0 += v;
        push(own, g + 1, v);
      }
      const dblsCol = typeof fields.genericDbls === 'string'
        ? fields.genericDbls
        : (fields.genericDbls && own ? fields.genericDbls[own] : null);
      const d0 = dblsCol ? num(r[dblsCol]) : 0;
      if (d0) { push(own, 0, d0, true); s0 += d0; }
      if (s0) { any = true; sum += s0; } else rows0.length = 0;
    }

    /* ② 겸하는 과정은 «과정 칸»에 들어 있습니다 — 초·중 통합운영학교 같은 곳.
       제 학제와 겹치지 않게, 다른 학제만 봅니다. */
    for (const lv of ['초', '중', '고']) {
      if (lv === own) continue;
      const cols = fields[lv];
      if (!cols || !cols.length) continue;
      let s1 = 0;
      const made = [];
      for (let g = 0; g < cols.length && g < GRADES[lv]; g++) {
        const v = num(r[cols[g]]);
        s1 += v;
        made.push([lv, g + 1, v, false]);
      }
      const d1 = fields['복식'] && fields['복식'][lv] ? num(r[fields['복식'][lv]]) : 0;
      if (d1) made.push([lv, 0, d1, true]);
      s1 += d1;
      if (!s1) continue;
      any = true; sum += s1;
      for (const m of made) push(m[0], m[1], m[2], m[3]);
    }

    /* ③ 계에는 학년별 말고 «특수학급»과 «순회학급»도 들어 있습니다 — 다만
       초등학교만 그렇습니다. 초등의 단식학급학생수는 특수·순회를 «빼고»
       세지만, 중·고의 주간학생수는 «넣고» 셉니다. 초등 기준으로 다 더했다가
       경산중 815/800 처럼 15명씩 넘쳤습니다.
       학년을 알 수 없으므로 복식과 같이 학년 0 으로 담습니다. 빼먹으면
       학교 310곳쯤에서 학년별 합이 계보다 작아집니다. */
    const ext = fields.extra
      ? (Array.isArray(fields.extra) ? fields.extra : (own ? fields.extra[own] : null))
      : null;
    if (own && ext && ext.length) {
      let s2 = 0;
      for (const col of ext) s2 += num(r[col]);
      if (s2) { push(own, 0, s2, true); any = true; sum += s2; }
    }

    if (!any) { skipped.level++; continue; }
    out.push.apply(out, rows0);

    /* ③ 읽은 것을 더한 값이 API 가 준 계와 같은가.
       합계만 보면 틀린 것이 안 보입니다 — 학년 칸을 하나 잘못 집어도
       화면의 총계는 그럴듯합니다. 다른 학교는 이름을 적어 둡니다. */
    if (fields.total != null) {
      const t = num(r[fields.total]);
      if (t && t !== sum) mismatch.push(name + ' ' + sum + '/' + t);
    }
  }
  return { records: out, skipped: skipped, missing: missing, mismatch: mismatch };
}

/* ══ 5-3. 시군은 어디서 오나 ═════════════════════════════════════════════
   학생·학급 표에는 **시군구 칸이 없습니다.** 시도명(경상북도)까지만 옵니다.
   그래서 학교 이름으로 대시보드의 경북 917곳 목록에 이어 붙입니다.
   그 목록은 이미 시군을 알고 있고, 우리가 관리하는 것이라 믿을 수 있습니다.

   붙지 않는 이름은 조용히 버리지 않고 세어서 알립니다 — 그게 통폐합이든
   이름이 다른 것이든, 몇 곳인지는 사람이 봐야 합니다. */
export function parseSchoolList(html) {
  const m = html.match(/ {2}var SCHOOL_RAW = \{\n([\s\S]*?)\n {2}\};/);
  if (!m) return null;
  const KNAME = { e: '초등학교', m: '중학교', h: '고등학교' };
  const map = {};
  for (const line of m[1].split('\n')) {
    const lm = line.match(/^\s*(\w+): '(.*)',?$/);
    if (!lm) continue;
    for (const rec of lm[2].split(';')) {
      const f = rec.split('|');
      if (f.length < 2 || !KNAME[f[1]]) continue;
      const nm = f[0].replace('*', KNAME[f[1]]);
      /* 같은 이름이 두 시군에 있으면 **null 로 둡니다.**
         경북에는 남산초등학교(영주·경산)처럼 겹치는 이름이 10가지 있습니다.
         먼저 만난 쪽으로 정해 버리면 스무 곳이 조용히 엉뚱한 시군으로 갑니다.
         모르면 모른다고 하고, 못 붙인 곳으로 세어 알립니다. */
      if (nm in map && map[nm] !== lm[1]) map[nm] = null;
      else if (!(nm in map)) map[nm] = lm[1];
    }
  }
  return Object.keys(map).length ? map : null;
}
/* 「안동 길안초등학교」·「길안초등학교 」처럼 자잘하게 다릅니다.
   띄어쓰기를 지우고 견줍니다. 그래도 안 붙으면 null 입니다 — 지어내지 않습니다. */
export function sggLookup(map) {
  const flat = {};
  for (const k of Object.keys(map || {})) if (map[k]) flat[k.replace(/\s/g, '')] = map[k];
  return function (name) {
    if (!name) return null;
    const n = String(name).replace(/\s/g, '');
    if (flat[n]) return flat[n];
    /* 분교장은 본교 이름으로 붙습니다 — 같은 시군입니다. */
    const b = n.replace(/(분교장|분교).*$/, '');
    return b !== n && flat[b] ? flat[b] : null;
  };
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
const KNOWN = ['--probe', '--dry', '--from', '--to', '--help', '-h', '--sido', '--only', '--url', '--crosscheck'];
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

/* ══ 12-1. 이 API 는 POST 입니다 ═══════════════════════════════════════
   〔2026. 8. 31. 확인〕 openapi.edmgr.kr 은 공공데이터포털과 다릅니다.

     GET                       → 405 Method Not Allowed
     POST + 물음표 뒤 인자      → 400 "HTTP 'POST' cannot contain query parameters"
     POST + 인증 없음           → 401 Unauthorized

   그래서 **모든 인자를 본문에 담아 POST** 합니다. 물음표 뒤에는 아무것도
   붙이지 않습니다 — 붙이면 인증까지 가 보지도 못하고 400 입니다. */
export const AUTH_WAYS = [
  { in: 'header', name: 'apikey' },
  { in: 'header', name: 'apiKey' },
  { in: 'header', name: 'Authorization', prefix: 'Bearer ' },
  { in: 'header', name: 'Authorization' },
  { in: 'header', name: 'X-API-KEY' },
  { in: 'header', name: 'api-key' },
  { in: 'header', name: 'serviceKey' },
  { in: 'header', name: 'authKey' },
  { in: 'header', name: 'auth-key' },
  { in: 'header', name: 'certKey' },
  { in: 'header', name: 'X-Auth-Token' },
  { in: 'header', name: 'accessToken' },
  { in: 'header', name: 'X-Authorization' },
  { in: 'header', name: 'token' },
  { in: 'header', name: 'Authorization', prefix: 'Basic ' },
  { in: 'body', name: 'apiKey' },
  { in: 'body', name: 'serviceKey' },
  { in: 'body', name: 'authKey' },
  { in: 'body', name: 'key' },
  { in: 'body', name: 'certKey' },
  { in: 'body', name: 'token' },
  /* 국산 플랫폼이라 한글 칸 이름도 있을 수 있습니다. 헤더 이름은 ASCII 여야
     하므로 본문에만 넣습니다. */
  { in: 'body', name: '인증키' }
];
export function wayName(w) {
  if (Array.isArray(w)) return w.map(wayName).join(' + ');
  return w.in + ':' + w.name + (w.prefix ? ' ' + w.prefix.trim() : '');
}

/* 명세서를 보고 「여기다」를 알게 되면 edss-endpoints.json 의 auth 에 한 줄
   적는 것으로 끝나야 합니다. 그래서 목록에 없는 이름도 받습니다.

     header:X-무엇이든        본문 아닌 헤더에
     body:certKey            본문에
     header:Authorization:Bearer   앞에 붙일 말이 있으면 세 번째 칸에 */
export function parseWay(spec) {
  /* 여러 자리에 넣어야 하면 배열로 적습니다: ["header:api_key","body:userApiAthkCn"] */
  if (Array.isArray(spec)) {
    const out = [];
    for (const one of spec) { const w = parseWay(one); if (!w) return null; out.push(w); }
    return out.length ? out : null;
  }
  const t = String(spec || '').trim();
  if (!t) return null;
  for (const w of AUTH_WAYS) if (wayName(w) === t) return w;
  const m = t.match(/^(header|body):([^:\s]+)(?::(.+))?$/);
  if (!m) return null;
  const w = { in: m[1], name: m[2] };
  if (m[3]) w.prefix = m[3].replace(/\s*$/, '') + ' ';
  /* 헤더 이름은 ASCII 만 됩니다. 한글 헤더를 넣으면 fetch 가 던집니다. */
  if (w.in === 'header' && !/^[\x21-\x7e]+$/.test(w.name)) return null;
  return w;
}
export const findWay = parseWay;

/* ══ 12-2. 이 플랫폼의 본문 모양 ═════════════════════════════════════════
   〔2026. 8. 31. 테스트 예시 확인〕 인자를 그냥 늘어놓는 것이 아닙니다.

     {
       "apiId"         : "SA00202400014",   ← 어느 API 인지 «본문에» 적습니다
       "userApiAthkCn" : "<인증키>",         ← 키도 헤더가 아니라 본문입니다
       "srhParam"      : { "crtrYr": "2023", "ctpvNm": "경북" }   ← 조회조건은 한 겹 안
     }

   주소에 서비스ID 가 있는데 본문에도 apiId 를 적어야 합니다. 이것이 없어서
   게이트웨이가 404 를 냈습니다 — 「주소는 아는데 무엇을 부르는지 모르겠다」.

   시도명은 «짧은 이름»입니다. 예시가 대전·대구·경기이므로 경상북도가 아니라
   «경북» 입니다. 「경상북도」로 보내면 0건이 오고, 0건은 오류처럼 안 보입니다. */
export function wrapBody(env, serviceId, srh) {
  const e = env || {};
  const body = {};
  if (e.id) body[e.id] = serviceId;
  if (e.params) body[e.params] = srh || {};
  else Object.assign(body, srh || {});
  return body;
}

/* 요청 한 벌을 만듭니다. 네트워크를 타지 않으므로 검사할 수 있습니다. */
export function buildRequest(key, params, way) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const body = Object.assign({}, params || {});
  /* 〔2026. 8. 31.〕 이 플랫폼은 **두 군데를 다** 봅니다.
       header api_key        ← 게이트웨이가 「누구냐」를 봅니다. 없으면 401.
       body   userApiAthkCn  ← 그 뒤의 앱이 다시 봅니다. 없으면 통과 못 합니다.
     하나만 넣으면 각각 401 과 404 가 나는데, 겉보기로는 서로 다른 문제처럼
     보입니다. 그래서 여러 자리를 한꺼번에 받습니다. */
  const ways = Array.isArray(way) ? way : [way];
  for (const w of ways) {
    if (!w) continue;
    /* Basic 은 앞에 붙이기만 하면 안 됩니다 — 「키:」를 base64 로 싸야 합니다. */
    const val = w.prefix === 'Basic '
      ? 'Basic ' + Buffer.from(key + ':', 'utf8').toString('base64')
      : (w.prefix || '') + key;
    if (w.in === 'header') headers[w.name] = val;
    else body[w.name] = key;
  }
  return { method: 'POST', headers: headers, body: JSON.stringify(body) };
}

async function callOnce(url, key, params, way, secrets) {
  const res = await fetch(url, buildRequest(key, params, way));
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* JSON 이 아니면 아래에서 글로 봅니다 */ }
  return {
    ok: res.ok, status: res.status, json: json,
    msg: redact(json && (json.message || json.resultMsg) ? (json.message || json.resultMsg)
      : text.slice(0, 200), secrets)
  };
}

/* 인증키를 어디에 담아야 하는지 개발명세서를 못 본 채로 붙였습니다.
   그래서 **한 번만 찾아봅니다** — 되는 것이 나오면 그 자리에서 멈추고,
   찾은 방법은 edss-endpoints.json 에 적어 두어 다음부터는 한 번에 갑니다.
   틀린 키든 없는 키든 이 게이트웨이는 똑같이 401 이라, 밖에서는 구별할
   길이 없습니다. 그래서 「되는 것」만 봅니다. */
async function discoverAuth(url, key, params, secrets, say) {
  const tried = [];
  for (const w of AUTH_WAYS) {
    let r;
    try { r = await callOnce(url, key, params, w, secrets); }
    catch (e) { tried.push(wayName(w) + ' → ' + redact(String(e.message), secrets)); continue; }
    tried.push(wayName(w) + ' → ' + r.status);
    if (r.status !== 401 && r.status !== 403) return { way: w, res: r, tried: tried };
    await new Promise(r2 => setTimeout(r2, 200));
  }
  return { way: null, res: null, tried: tried };
}

async function main() {
  if (ARGV.includes('--help') || ARGV.includes('-h') || bad.length) {
    if (bad.length) console.error('모르는 깃발: ' + bad.join(' ') + '\n');
    console.log('쓰는 법: node "open api/bake-edss.mjs" [--probe] [--dry] [--from=2016] [--to=2026]');
    console.log('  --probe  API 마다 한 번씩만 불러 응답 모양을 적습니다. 처음엔 이것부터.');
    console.log('  --dry    다 받되 대시보드는 고치지 않습니다.');
    console.log('  --only=<이름>  한 API 만. 이름: ' + Object.keys(JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')).apis).join(' · '));
    console.log('  --url=<주소>   파일을 안 고치고 그 API 의 주소를 한 번만 바꿔 씁니다.');
    console.log('  --crosscheck   키와 주소의 짝이 맞는지 모든 조합을 맞춰 봅니다.');
    console.log('  요청주소는 open api/edss-endpoints.json 에 적습니다.');
    process.exit(bad.length ? 1 : 0);
  }

  const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  const CROSS = ARGV.includes('--crosscheck');
  const PROBE = ARGV.includes('--probe') || CROSS;
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
  if (noKey.length) {
    say('  · 키 없음 ' + noKey.length + '개'); noKey.forEach(n => say('      ' + n));
    /* 〔2026. 8. 31.〕 여기서 한 번 헛돌았습니다. 일곱 개가 **배포 저장소**
       team-leap 에 들어가 있었습니다. 그 저장소에는 워크플로가 하나도 없어
       아무도 그 키를 읽지 않습니다. 이름·값은 다 맞았고 방만 틀렸는데,
       예전 메시지는 「키 없음」이라고만 해서 어디를 봐야 할지 알 수 없었습니다. */
    say('    → 이 키를 읽는 것은 원본 저장소 Kimmahone/team-leap-source 의');
    say('       Settings → Secrets and variables → Actions → Secrets 입니다.');
    say('       배포 저장소 team-leap 이 아닙니다 — 거기에는 워크플로가 없습니다.');
  }
  if (noUrl.length) {
    say('  · 요청주소 없음 ' + noUrl.length + '개'); noUrl.forEach(n => say('      ' + n));
    say('    → data.go.kr 마이페이지 → 활용신청 현황 → 그 API → 요청주소를');
    say('       open api/edss-endpoints.json 의 url 에 붙여 넣으세요.');
  }
  if (!ready.length) {
    cry('\n부를 수 있는 API 가 하나도 없습니다. 아무것도 고치지 않았습니다.');
    process.exit(2);
  }

  /* --- 한 번씩만 불러 봅니다 ------------------------------------------
     인증 방법을 모르므로 한 API 에서 한 번 찾고, 찾으면 나머지는 그대로
     씁니다 (같은 게이트웨이입니다). 찾은 방법은 설정 파일에 적어 두어
     다음 실행부터는 한 번에 갑니다. */
  const report = { 만든때: new Date().toISOString(), 게이트웨이: 'POST · 본문에 인자', apis: {} };
  let calls0 = 0;
  const ENV = cfg.envelope || {};
  /* 이 API 를 부르는 본문 한 벌. srhParam 을 한 겹 싸고 apiId 를 붙입니다. */
  const bodyOf = function (a, srh) { return wrapBody(ENV, a.serviceId, srh); };
  let way = findWay(cfg.auth || '');
  if (way) say('인증 방법: ' + wayName(way) + ' (설정 파일에 적혀 있습니다)');

  /* --- 열쇠와 자물쇠가 짝이 맞나 ---------------------------------------
     인증은 통과하는데 게이트웨이가 404 를 냅니다. 키가 API 마다 다르므로,
     일곱 개를 일곱 칸에 넣다가 순서가 어긋났을 수 있습니다. 그러면 키는
     멀쩡하고 짝만 틀린 것인데 밖에서는 똑같이 404 로 보입니다.
     모든 짝을 한 번씩 맞춰 보고, 404 가 아닌 칸만 표로 보여 줍니다. */
  if (CROSS) {
    if (!way) { cry('인증 방법이 설정에 없습니다.'); process.exit(2); }
    const ids = Object.keys(cfg.apis).filter(function (id) { return cfg.apis[id].url; });
    const grid = {};
    say('키 ' + ids.length + '개 × 주소 ' + ids.length + '개를 맞춰 봅니다.\n');
    for (const kid of ids) {
      const key = keyOf(cfg.apis[kid].secret);
      if (!key) { say(cfg.apis[kid].secret + ' — 키 없음, 건너뜁니다.'); continue; }
      const line = [];
      for (const uid of ids) {
        let st = '—';
        try {
          const rr = await callOnce(cfg.apis[uid].url, key, bodyOf(cfg.apis[uid], {}), way, secrets);
          const uu = unwrap(rr.json);
          st = String(rr.status) + (rr.ok && uu.rows.length ? '✓' + uu.rows.length : '');
        } catch (e) { st = 'x'; }
        line.push(uid.slice(0, 8) + ':' + st);
        await new Promise(function (z) { setTimeout(z, 250); });
      }
      grid[kid] = line;
      say(kid.slice(0, 16).padEnd(17) + ' ' + line.join('  '));
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(PROBE_FILE, JSON.stringify({ 만든때: new Date().toISOString(), 짝맞추기: grid }, null, 2) + '\n', 'utf8');
    say('\n404 가 아닌 칸이 있으면 그 짝이 맞는 것입니다.');
    say('전부 404 면 키·주소 문제가 아니라 플랫폼 쪽에서 아직 열리지 않은 것입니다.');
    return;
  }

  /* 찾기가 두 번 실패하면 그만둡니다. 같은 게이트웨이인데 두 번 안 되면
     일곱 번 더 두드려 봐야 401 이 84번 쌓일 뿐입니다. */
  let searchFails = 0;

  /* probe 는 한 벌만 던지지 않습니다. 무엇이 모자라 안 되는지 알아야 하는데,
     한 번 던져 404 를 받으면 「주소가 틀렸나 · 인자가 모자라나 · 그 해 자료가
     없나」를 구별할 수 없습니다. 사다리처럼 조금씩 늘려 가며 던집니다. */
  function ladder(a) {
    const yp = a.yearParam, base = a.params || {}, out = [];
    const add = (label, body) => out.push({ label: label, body: body });
    add('빈 조회조건', bodyOf(a, {}));
    if (yp) {
      /* 명세서의 샘플이 2023 입니다. 최신 해가 아직 안 나왔을 수 있습니다. */
      for (const y of [2023, TO, TO - 1, TO - 2]) add(yp + '=' + y, bodyOf(a, mk(yp, y)));
      for (const y of [2023, TO]) add(yp + '=' + y + ' + 시도', bodyOf(a, Object.assign(mk(yp, y), base)));
      /* 시도명을 짧게 쓰는지 길게 쓰는지 함께 봅니다 — 틀리면 0건입니다. */
      add(yp + '=2023 + 경상북도', bodyOf(a, Object.assign(mk(yp, 2023), { ctpvNm: '경상북도' })));
    }
    if (Object.keys(base).length) add('설정 인자만', bodyOf(a, Object.assign({}, base)));
    /* 같은 본문을 두 번 던지지 않습니다 — 남의 서버입니다. */
    const seen = {}, uniq = [];
    for (const t of out) {
      const k = JSON.stringify(t.body);
      if (seen[k]) continue;
      seen[k] = 1; uniq.push(t);
    }
    return uniq;
  }
  function mk(k, v) { const o = {}; o[k] = String(v); return o; }

  for (const id of ready) {
    const a = cfg.apis[id];
    const key = keyOf(a.secret);
    const params = bodyOf(a, Object.assign({}, a.params || {}));
    let r = null;
    if (way) {
      try { r = await callOnce(a.url, key, params, way, secrets); }
      catch (e) { r = { ok: false, status: 0, msg: redact(String(e.message), secrets) }; }
    }
    /* 적혀 있던 방법이 안 먹으면 다시 찾습니다 — 게이트웨이가 바뀔 수 있습니다. */
    if ((!r || r.status === 401 || r.status === 403) && searchFails >= 2) {
      cry('  ✗ ' + a.name + ' — 앞서 두 번 실패해 인증 찾기를 건너뜁니다.');
      report.apis[id] = { name: a.name, 결과: '인증 실패(건너뜀)' };
      continue;
    }
    if (!r || r.status === 401 || r.status === 403) {
      say('  … ' + a.name + ' — 인증 방법을 찾는 중');
      const d = await discoverAuth(a.url, key, params, secrets, say);
      report.apis[id] = report.apis[id] || {};
      report.apis[id].인증시도 = d.tried;
      if (!d.way) {
        searchFails++;
        cry('  ✗ ' + a.name + ' — 어느 방법으로도 인증되지 않았습니다 (전부 401/403)');
        report.apis[id] = Object.assign(report.apis[id], { name: a.name, 결과: '인증 실패' });
        continue;
      }
      way = d.way; r = d.res;
      say('  ✓ 인증 방법을 찾았습니다: ' + wayName(way));
    }

    /* 인증은 됐는데 줄이 안 오면, 무엇이 모자란지 사다리로 알아봅니다. */
    let tries = [];
    if (PROBE && (!r.ok || !unwrap(r.json).rows.length)) {
      for (const t of ladder(a)) {
        if (calls0 >= 40) break;
        let rr;
        try { rr = await callOnce(a.url, key, t.body, way, secrets); }
        catch (e) { tries.push(t.label + ' → ' + redact(String(e.message), secrets).slice(0, 60)); continue; }
        calls0++;
        const uu = unwrap(rr.json);
        tries.push(t.label + ' → ' + rr.status + (rr.ok ? ' · ' + uu.rows.length + '줄/총' + uu.total : ' · ' + rr.msg.slice(0, 60)));
        if (rr.ok && uu.rows.length) { r = rr; break; }   // 되는 것을 찾으면 멈춥니다
        await new Promise(function (z) { setTimeout(z, 250); });
      }
    }

    const { rows, total, meta } = unwrap(r.json);
    const g = rows.length ? guessFields(rows[0], a.fields) : { picked: {}, why: {}, all: [] };
    report.apis[id] = Object.assign(report.apis[id] || {}, {
      던져본것: tries,
      name: a.name, 상태코드: r.status,
      결과: !r.ok ? '오류' : rows.length ? '응답 있음' : '0건',
      메시지: r.ok ? '' : r.msg,
      총건수: total, 봉투: meta, 칸이름: g.all, 고른칸: g.picked, 고른까닭: g.why,
      /* 값은 싣지 않습니다 — 학교 이름 하나까지도 보고서에 남길 까닭이 없습니다.
         모양만 봅니다: 그 칸이 숫자인가 글자인가. */
      칸모양: rows.length ? Object.fromEntries(g.all.map(n => [n, typeof rows[0][n]])) : {},
      /* 값 자체는 안 싣되 **무엇이 왔는지는 세어서** 싣습니다. 「몇 줄 왔다」만
         알면 시도 거르기가 먹었는지, 여러 해가 한꺼번에 오는지 알 수 없습니다.
         학교 이름 같은 것은 넣지 않고 개수만 셉니다. */
      /* 어느 칸에 실제로 값이 들어 있는지 셉니다. 「0 아닌 값이 몇 줄에
         있나」만 봅니다 — 값 자체는 담지 않습니다. 이것이 없으면 칸 이름이
         맞는데 값이 늘 0 인 경우를 못 가려냅니다. 0 은 오류처럼 안 보입니다. */
      /* 어느 칸에 실제로 값이 들어 있는지 학교급마다 셉니다. 「0 아닌 값이
         몇 줄에 있나」만 봅니다 — 값 자체는 담지 않습니다.
         학교급마다 쓰는 칸이 다릅니다(초는 단식, 중·고는 주간/야간).
         한 학교급만 보고 정하면 나머지 둘이 조용히 비어 버립니다. */
      값있는칸: (function () {
        const f = a.fields || {}, out = {};
        for (const want of ['초등학교', '중학교', '고등학교']) {
          const pool = rows.filter(function (r) {
            return (!f.sido || String(r[f.sido]) === '경북') &&
                   (!f.level || String(r[f.level] || '').indexOf(want) >= 0);
          });
          if (!pool.length) { out[want] = { 표본: 0 }; continue; }
          const c = {};
          for (const r of pool) for (const k of Object.keys(r)) {
            const v = r[k];
            if (typeof v === 'number' ? v !== 0 : (v != null && v !== '' && v !== '0')) c[k] = (c[k] || 0) + 1;
          }
          /* 학년 칸만 봅니다 — 전부 실으면 보고서가 못 읽을 만큼 길어집니다. */
          const ks = Object.keys(c).filter(function (k) { return /grdr|Grdr|Dbls|dbls|scls|tour|kesc|fstn|Fstn/.test(k); })
            .sort(function (x, y) { return c[y] - c[x]; });
          const one = { 표본: pool.length };
          for (const k of ks.slice(0, 34)) one[k] = c[k];
          out[want] = one;
        }
        return out;
      })(),
      요약: (function () {
        const f = a.fields || {}, tally = function (col) {
          if (!col) return null;
          const c = {};
          for (const row of rows) { const v = String(row[col] == null ? '' : row[col]); c[v] = (c[v] || 0) + 1; }
          const ks = Object.keys(c).sort();
          return ks.length > 30 ? { 가짓수: ks.length } : Object.fromEntries(ks.map(k => [k, c[k]]));
        };
        return { 연도별: tally(f.year), 시도별: tally(f.sido), 학제별: tally(f.level) };
      })(),
      /* 인자를 하나도 안 보냈을 때 「무엇이 빠졌다」고 알려 주는 API 가
         많습니다. 그 말이 곧 요청변수 목록입니다. */
      응답열쇠: r.json && typeof r.json === 'object' ? Object.keys(r.json).slice(0, 20) : []
    });
    say('  ' + (r.ok ? '✓' : '✗') + ' ' + a.name + ' — HTTP ' + r.status +
      (rows.length ? ' · ' + rows.length + '행 / 총 ' + total +
        '  고른 칸: ' + Object.keys(g.picked).map(k => k + '=' + g.picked[k]).join(' · ')
        : ' · ' + (r.msg || '0건')));
    await new Promise(r2 => setTimeout(r2, 200));
  }
  if (way) report.인증방법 = wayName(way);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PROBE_FILE, JSON.stringify(report, null, 2) + '\n', 'utf8');
  if (PROBE) {
    say('\n✓ ' + path.relative(ROOT, PROBE_FILE) + ' 에 적었습니다 (인증키·값은 들어 있지 않습니다).');
    say('  이 파일을 보고 필드 짝짓기를 확정한 뒤 --probe 없이 다시 돌리세요.');
    return;
  }

  /* --- 본 수집: 연도를 돌면서 페이지를 다 넘깁니다 ---------------------- */
  /* 학급및학생현황은 특수교육 쪽 표입니다(특수학급·전공과·통합학급).
     학년별 학생·학급 시계열은 아래 둘에서만 나옵니다. */
  const pick = ['studentStatus', 'classStatus'].filter(id => ready.includes(id));
  if (!pick.length) {
    cry('학생·학급 API 가 하나도 준비되지 않았습니다. 시계열을 만들 수 없습니다.');
    process.exit(3);
  }
  if (!way) { cry('인증 방법을 찾지 못해 수집을 시작하지 않습니다.'); process.exit(3); }

  /* --- 시군을 이어 붙일 목록을 먼저 읽습니다 ---------------------------
     학생·학급 표에는 시군구 칸이 없습니다. 대시보드가 가진 경북 917곳으로
     잇습니다. 목록을 못 읽으면 시작하지 않습니다 — 시군 없이 모으면
     전부 버려지는데, 그게 「0건」으로만 보입니다. */
  let html = '';
  try { html = fs.readFileSync(TARGET, 'utf8'); }
  catch (e) { cry('대시보드를 열지 못했습니다: ' + TARGET); process.exit(3); }
  const schoolMap = parseSchoolList(html);
  if (!schoolMap) { cry('대시보드에서 SCHOOL_RAW 를 찾지 못했습니다.'); process.exit(3); }
  const byName = sggLookup(schoolMap);
  const ambiguous = Object.keys(schoolMap).filter(function (k) { return !schoolMap[k]; });
  say('시군을 이어 붙일 학교 이름 ' + Object.keys(schoolMap).length + '가지를 대시보드에서 읽었습니다.' +
    (ambiguous.length ? '  (두 시군에 같은 이름 ' + ambiguous.length + '가지는 이름으로 못 정합니다)' : ''));

  /* --- 개방ID 로 시군을 잇습니다 -----------------------------------------
     학급및학생현황에는 opnId 와 sggNm 이 **함께** 들어 있습니다. 이 표를 한 번
     받아 두면 이름이 겹치는 학교도 정확히 갈라집니다. 못 받으면 이름으로만
     잇고, 겹치는 이름은 못 붙인 것으로 셉니다 — 찍지 않습니다. */
  const byCode = {};
  if (ready.indexOf('classStudent') >= 0) {
    const c = cfg.apis['classStudent'];
    const cs = Object.assign({}, c.params || {});
    if (c.yearParam) cs[c.yearParam] = String(TO);
    const cb = bodyOf(c, cs);
    try {
      const cr = await callOnce(c.url, keyOf(c.secret), cb, way, secrets);
      calls0++;
      if (cr.ok) {
        for (const row of unwrap(cr.json).rows) {
          const id = String(row[c.fields.code] || ''), sg = toSgg(row[c.fields.sgg]);
          if (id && sg) byCode[id] = sg;
        }
      }
    } catch (e) { /* 없으면 이름으로만 잇습니다 */ }
    const n = Object.keys(byCode).length;
    say(n ? '  개방ID → 시군 ' + n + '곳을 학급및학생현황에서 받았습니다.'
          : '  ⚠ 개방ID → 시군을 못 받아 학교 이름으로만 잇습니다.');
  }
  /* --- 문 닫은 학교의 시군도 찾습니다 -----------------------------------
     대시보드 목록은 «지금 있는» 917곳뿐입니다. 2016년에 있다가 통폐합된 학교는
     거기 없어서 시군을 못 붙이고 통째로 버려집니다. 2016년에 143곳이 그랬습니다.
     그러면 **옛 해의 학생 수가 실제보다 적게 잡히고, 감소율이 완만해 보입니다** —
     학령인구 감소를 다루는 화면에서 가장 나쁜 방향으로 틀립니다.

     학교개황[교육통계]에는 법정동 시군구명이 있고 문 닫은 학교도 들어 있습니다. */
  const byOld = {};
  if (ready.indexOf('eduStatOverview') >= 0) {
    const o = cfg.apis['eduStatOverview'], of = o.fields || {};
    try {
      const or = await callOnce(o.url, keyOf(o.secret), bodyOf(o, o.params || {}), way, secrets);
      calls0++;
      if (or.ok) {
        for (const row of unwrap(or.json).rows) {
          const sd = String(row[of.sido] || '');
          if (sd.indexOf('경북') < 0 && sd.indexOf('경상북도') < 0) continue;
          const nm = String(row[of.name] || '').replace(/\s/g, '');
          const sg = toSgg(row[of.sgg]);
          if (!nm || !sg) continue;
          /* 이름이 두 시군에 걸치면 여기서도 찍지 않습니다. */
          if (nm in byOld && byOld[nm] !== sg) byOld[nm] = null;
          else if (!(nm in byOld)) byOld[nm] = sg;
        }
      }
    } catch (e) { /* 없으면 지금 있는 학교만으로 잇습니다 */ }
    const n = Object.keys(byOld).filter(function (k) { return byOld[k]; }).length;
    say(n ? '  학교개황에서 경북 학교 이름 ' + n + '가지의 시군을 받았습니다 (문 닫은 학교 포함).'
          : '  ⚠ 학교개황에서 시군을 못 받았습니다.');
  }

  const sggOf = function (name, code) {
    if (code && byCode[code]) return byCode[code];
    const byN = byName(name);
    if (byN) return byN;
    const flat = String(name || '').replace(/\s/g, '');
    if (byOld[flat]) return byOld[flat];
    const b = flat.replace(/(분교장|분교).*$/, '');
    return b !== flat && byOld[b] ? byOld[b] : null;
  };

  const all = [];
  let calls = calls0;
  const CALL_CAP = Number(cfg.callCap || 900);
  const missAll = {};
  for (const id of pick) {
    const a = cfg.apis[id], key = keyOf(a.secret);
    const into = id === 'classStatus' ? 'cls' : 'stu';
    /* 조사년도 인자 이름이 표마다 다릅니다 — crtrYr · trgtYr · exmnYmd. */
    const yp = a.yearParam || '';
    const years = [];
    if (yp) { for (let y = FROM; y <= TO; y++) years.push(y); } else years.push(null);
    for (const y of years) {
      if (calls >= CALL_CAP) { cry('  ⚠ 호출 한도 ' + CALL_CAP + '번에 닿아 멈춥니다.'); break; }
      const srh = Object.assign({}, a.params || {});
      if (yp && y) srh[yp] = String(y);
      const body = bodyOf(a, srh);
      let r;
      try { r = await callOnce(a.url, key, body, way, secrets); }
      catch (e) { cry('  ✗ ' + a.name + ' ' + (y || '') + ' — ' + redact(String(e.message), secrets)); continue; }
      calls++;
      if (!r.ok) { cry('  ✗ ' + a.name + ' ' + (y || '') + ' — HTTP ' + r.status + ' ' + r.msg); continue; }
      const u = unwrap(r.json);
      const nz = normalizeWide(u.rows, a.fields, sggOf, into, { sido: cfg.sidoName });
      all.push.apply(all, nz.records);
      for (const k of Object.keys(nz.missing)) missAll[k] = true;
      if (nz.mismatch.length) {
        /* 학년별 합 ≠ API 가 준 계. 칸을 잘못 집었거나 우리가 못 읽는 학년이
           있다는 뜻입니다. 몇 곳인지는 반드시 보여 줍니다. */
        cry('  ⚠ 학년별 합과 계가 다른 학교 ' + nz.mismatch.length + '곳 — ' +
          nz.mismatch.slice(0, 3).join(' · '));
      }
      say('  ' + a.name + ' ' + (y || '') + ' — 전국 ' + u.rows.length + '줄 · ' +
        (cfg.sidoName || '') + ' ' + (u.rows.length - nz.skipped.sido) + '줄 → ' +
        nz.records.length + '기록' +
        (nz.skipped.type ? '  (특수·각종·유치원 ' + nz.skipped.type + '줄 뺌)' : '') +
        (nz.skipped.sgg ? '  (시군 못 붙임 ' + nz.skipped.sgg + '줄 · ' +
          nz.skipped.sggStu.toLocaleString('ko-KR') + '명)' : ''));
      await new Promise(function (z) { setTimeout(z, 200); });
    }
  }
  say('  호출 ' + calls + '번');
  const missNames = Object.keys(missAll);
  if (missNames.length) {
    /* 경북 밖 학교가 대부분입니다(시도 필터가 먹지 않았을 때). 몇 곳인지는
       사람이 봐야 합니다 — 조용히 버리면 경북 학교가 빠져도 모릅니다. */
    say('  시군을 못 붙인 학교 이름 ' + missNames.length + '가지:');
    say('    ' + missNames.slice(0, 15).join(' · ') + (missNames.length > 15 ? ' …' : ''));
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
