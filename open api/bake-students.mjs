/* ==========================================================================
   학년별 학생수·학급수를 받아 대시보드에 심습니다 — D2

   `bake-coords.mjs` 와 짝입니다. 그쪽은 **어디에 있는가**(위경도), 이쪽은
   **몇 명인가**(학년별 학생·학급)를 받습니다. 같은 API, 같은 인증키, 다른 apiType.

     apiType=0   학교기본정보        → 이름 · 주소 · 위경도
     apiType=09  학년별·학급별 학생수 → COL_S1~S8 · COL_C1~C8 · 교원수

   한 번에 다 나옵니다:
     COL_S1~S6  학년별 학생수 (초 6학년 / 중·고 3학년)
     COL_C1~C6  학년별 학급수
     COL_S7·C7  특수학급          COL_S8·C8  순회학급
     COL_S_SUM  학생수 계 (특수·순회 포함)   COL_C_SUM  학급수 계
     TEACH_CNT  교사수            LCTN_SC_CODE·ADRCD_CD  소재지 (D4)

   **이 자료가 있어야 코호트 진급법이 성립합니다.** 학교급 총계만으로는
   「g학년 → g+1학년」을 셀 수 없습니다.

   연도를 바꿔 여러 해를 받으면 진급률이 나오고, 백테스트도 됩니다
   (2016 을 기준으로 2026 을 예측해 실적과 견주는 것).
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* 이 자료를 쓰는 곳.
   앱 A·C 는 「어디에 있는가」만 필요하고 「몇 명인가」는 쓰지 않습니다.
   **앱 E 는 둘 다 필요합니다** — 「20분 안에 있는 여섯 학급 이하 학교」를
   고르려면 학급 수를 알아야 하기 때문입니다.
   쓰는 곳이 더 생기면 여기에 더하세요 — 한 곳만 고치면 나머지가 조용히 낡습니다. */
const TARGETS = [
  '06. 실행계획(1)/prototype',
  '08. 실행계획(3)/apps/e-together'
].map(d => path.resolve(HERE, '../' + d + '/index.html'));

/* --- 깃발 먼저 거릅니다 ---------------------------------------------------
   인자 없이도 도는 스크립트라, 모르는 깃발을 「그냥 실행」으로 받으면
   --help 를 쳤는데 66번 요청이 나갑니다 (마스터 함정 14번). */
const ARGV = process.argv.slice(2);
const FLAGS = ARGV.filter(a => a.startsWith('--'));
const KNOWN = ['--curl', '--year', '--dry', '--help', '-h'];
const bad = FLAGS.filter(f => !KNOWN.includes(f.split('=')[0]));
if (ARGV.includes('--help') || ARGV.includes('-h') || bad.length) {
  if (bad.length) console.error('모르는 깃발: ' + bad.join(' ') + '\n');
  console.log('쓰는 법: node bake-students.mjs [인증키] [--year=2026] [--curl] [--dry]');
  console.log('  인증키를 생략하면 같은 폴더의 인증키.txt 를 읽습니다.');
  console.log('  --year  공시년도 (기본 2026). 여러 해를 받으려면 연도를 바꿔 다시 돌리세요.');
  console.log('  --curl  사내망 인증서 문제로 https 요청이 막힐 때.');
  console.log('  --dry   받기만 하고 파일은 고치지 않습니다. 먼저 이걸로 확인하세요.');
  console.log('  고치는 곳: ' + TARGETS.map(t => path.basename(path.dirname(t))).join(' · '));
  process.exit(bad.length ? 1 : 0);
}

const ARG = ARGV[0] && !ARGV[0].startsWith('--') ? ARGV[0] : null;
const USE_CURL = ARGV.includes('--curl');
const DRY = ARGV.includes('--dry');
const YEAR = (ARGV.find(a => a.startsWith('--year=')) || '--year=2026').split('=')[1];
if (!/^\d{4}$/.test(YEAR)) { console.error('연도가 이상합니다: ' + YEAR); process.exit(1); }

const KEYFILE = path.resolve(HERE, '인증키.txt');
function keyFromFile() {
  try {
    const hit = fs.readFileSync(KEYFILE, 'utf8')
      .split('\n').filter(l => l.trim() && !l.trim().startsWith('#'))
      .join('\n').match(/[0-9a-f]{32}/i);
    return hit ? hit[0] : null;
  } catch (e) { return null; }
}
const KEY = ARG || keyFromFile();
if (!KEY) {
  console.error('인증키가 없습니다.');
  console.error('  · ' + KEYFILE + ' 에 32자리 키를 한 줄 넣어 두거나');
  console.error('  · node bake-students.mjs <학교알리미 인증키> 로 주세요.');
  process.exit(1);
}
if (!ARG) console.log('인증키: 인증키.txt (…' + KEY.slice(-6) + ')');
console.log('공시년도: ' + YEAR + (DRY ? '  · 확인만 하고 파일은 고치지 않습니다' : ''));

/* 시군구 코드 — bake-coords.mjs 와 **같은 표**입니다. 둘이 어긋나면 안 됩니다.
   군위군(47720)은 2023년 7월 1일 대구로 넘어가 없습니다. 포항은 남·북구가 따로입니다. */
const SGG = {
  47111: 'pohang', 47113: 'pohang', 47130: 'gyeongju', 47150: 'gimcheon',
  47170: 'andong', 47190: 'gumi', 47210: 'yeongju', 47230: 'yeongcheon',
  47250: 'sangju', 47280: 'mungyeong', 47290: 'gyeongsan', 47730: 'uiseong',
  47750: 'cheongsong', 47760: 'yeongyang', 47770: 'yeongdeok', 47820: 'cheongdo',
  47830: 'goryeong', 47840: 'seongju', 47850: 'chilgok', 47900: 'yecheon',
  47920: 'bonghwa', 47930: 'uljin', 47940: 'ulleung'
};
const KND = { '02': 'e', '03': 'm', '04': 'h', '05': 's' };   // 초 · 중 · 고
const GRADES = { e: 6, m: 3, h: 3 };

/* --- 같은 학교를 다르게 부르는 곳 ----------------------------------------
   같은 포털인데 공시 항목마다 학교 이름이 다릅니다.

     apiType=0  (학교기본정보)   청송여자고등학교
     apiType=09 (학년별 학생수)  청송여자종합고등학교

   앱 목록은 apiType=0 으로 구웠으므로 이름으로는 이어지지 않습니다.
   이름이 아니라 **학교코드(SCHUL_CODE)** 로 이으면 이런 일이 없지만,
   그러려면 SCHOOL_RAW 에 코드를 넣어야 하고 네 곳의 자료 모양이 다 바뀝니다.
   지금은 아는 것만 여기 적어 둡니다. 새로 나오면 이 표에 한 줄 더하세요.

   ※ 못 붙인 학교는 화면에 이름이 그대로 찍힙니다. 조용히 넘어가지 않습니다. */
const ALIAS = {
  '청송여자종합고등학교': '청송여자고등학교'
};

async function once(url) {
  if (USE_CURL) return JSON.parse(execFileSync('curl', ['-s', '--max-time', '60', url], { encoding: 'utf8' }));
  const res = await fetch(url);
  return res.json();
}
/* 한 번 실패했다고 그 시군을 통째로 버리지 않습니다. 세 번까지 다시 물어봅니다. */
async function get(url) {
  let last;
  for (let i = 0; i < 3; i++) {
    try { return await once(url); } catch (e) { last = e; await new Promise(r => setTimeout(r, 1500)); }
  }
  throw last;
}

const n = v => (v == null || v === '' ? 0 : Math.round(+v) || 0);

const found = new Map();        // "andong|m|안동중학교" → 기록
let calls = 0, rows = 0, failed = 0;

for (const sgg of Object.keys(SGG)) {
  for (const knd of Object.keys(KND)) {
    const url = 'https://www.schoolinfo.go.kr/openApi.do?apiKey=' + encodeURIComponent(KEY) +
      '&apiType=09&sidoCode=47&sggCode=' + sgg + '&schulKndCode=' + knd + '&pbanYr=' + YEAR;
    let j;
    try { j = await get(url); }
    catch (e) { console.error('  못 받음 ' + sgg + '/' + knd + ' — ' + String(e).slice(0, 70)); failed++; continue; }
    calls++;
    if (j.resultCode !== 'success') {
      console.error('  ' + sgg + '/' + knd + ' → ' + (j.resultMsg || JSON.stringify(j).slice(0, 80)));
      if (String(j.resultMsg || '').includes('apiKey')) {
        console.error('\n인증키가 받아들여지지 않았습니다. 학교알리미(schoolinfo.go.kr) 키가 맞는지 확인해 주세요.');
        console.error('교육정보 개방 포털(open.neis.go.kr) 키와 생김새가 같습니다 — README 를 보세요.');
        process.exit(2);
      }
      failed++;
      continue;
    }
    for (const s of j.list || []) {
      if (s.PBAN_EXCP_YN === 'Y') continue;            // 공시 제외 학교
      const g = GRADES[KND[knd]];
      const stu = [], cls = [];
      for (let i = 1; i <= g; i++) { stu.push(n(s['COL_S' + i])); cls.push(n(s['COL_C' + i])); }
      const nm = ALIAS[s.SCHUL_NM] || s.SCHUL_NM;
      found.set(SGG[sgg] + '|' + KND[knd] + '|' + nm, {
        stu, cls,
        spedS: n(s.COL_S7), spedC: n(s.COL_C7),
        tourS: n(s.COL_S8), tourC: n(s.COL_C8),
        sumS: n(s.COL_S_SUM), sumC: n(s.COL_C_SUM),
        teach: n(s.TEACH_CNT),
        lctn: s.LCTN_SC_CODE || '', adrcd: s.ADRCD_CD || '',
        branch: s.BNHH_YN === 'Y'
      });
      rows++;
    }
    await new Promise(r => setTimeout(r, 120));   // 남의 서버입니다. 천천히 부릅니다.
  }
}

console.log(calls + '번 물어 ' + rows + '곳을 받았습니다.' + (failed ? '  (실패 ' + failed + '번)' : ''));
if (!rows) { console.error('한 곳도 받지 못했습니다. 그만둡니다.'); process.exit(3); }

/* --- 받은 값이 스스로 맞는지 먼저 봅니다 ---------------------------------
   합계만 맞으면 틀린 것이 안 보입니다 (마스터 함정 12번).
   API 가 준 학년별 값을 더한 것이 API 가 준 계와 같은지 확인합니다. */
let mismatch = 0;
for (const [k, r] of found) {
  const s = r.stu.reduce((a, v) => a + v, 0) + r.spedS + r.tourS;
  const c = r.cls.reduce((a, v) => a + v, 0) + r.spedC + r.tourC;
  if (s !== r.sumS || c !== r.sumC) {
    if (mismatch < 5) console.log('  ⚠ 학년별 합과 계가 다름: ' + k +
      ' 학생 ' + s + '/' + r.sumS + ' 학급 ' + c + '/' + r.sumC);
    mismatch++;
  }
}
console.log(mismatch ? '  학년별 합 ≠ 계 인 학교 ' + mismatch + '곳' : '  학년별 합 = 계  (전부 일치)');

const totalStu = [...found.values()].reduce((a, r) => a + r.sumS, 0);
const byKind = { e: 0, m: 0, h: 0 };
for (const [k, r] of found) byKind[k.split('|')[1]] += r.sumS;
console.log('  학생수 계 ' + totalStu.toLocaleString('ko-KR') +
  '  (초 ' + byKind.e.toLocaleString('ko-KR') +
  ' · 중 ' + byKind.m.toLocaleString('ko-KR') +
  ' · 고 ' + byKind.h.toLocaleString('ko-KR') + ')');

/* --- 심기 -----------------------------------------------------------------
   앱 안의 SCHOOL_RAW 를 그대로 따라갑니다. 학교 이름이 열쇠입니다.
   적는 방식: 이름|급|학년별학생(,)|학년별학급(,)|특수학생,특수학급|교사수 */
const KNAME = { e: '초등학교', m: '중학교', h: '고등학교' };

for (const T of TARGETS) {
  let html;
  try { html = fs.readFileSync(T, 'utf8'); }
  catch (e) { console.error('파일을 열지 못했습니다: ' + T); continue; }

  const sm = html.match(/ {2}var SCHOOL_RAW = \{\n([\s\S]*?)\n {2}\};/);
  if (!sm) { console.error('SCHOOL_RAW 를 찾지 못했습니다: ' + T); continue; }

  let hit = 0, miss = 0;
  const missed = [];
  const lines = [];
  for (const line of sm[1].split('\n')) {
    const lm = line.match(/^(\s*)(\w+): '(.*)'(,?)$/);
    if (!lm) continue;
    const [, pad, rc, blob] = lm;
    const recs = [];
    for (const rec of blob.split(';')) {
      const f = rec.split('|');
      const full = f[0].replace('*', KNAME[f[1]]);
      const r = found.get(rc + '|' + f[1] + '|' + full);
      if (!r) { miss++; missed.push(full); continue; }
      hit++;
      recs.push([f[0], f[1], r.stu.join(','), r.cls.join(','),
                 r.spedS + ',' + r.spedC, r.teach].join('|'));
    }
    lines.push(pad + rc + ": '" + recs.join(';') + "'");
  }

  const block = '  var STUDENT_RAW = {\n' + lines.join(',\n') + '\n  };\n' +
    '  var STUDENT_YEAR = ' + YEAR + ';\n';

  console.log('\n' + path.basename(path.dirname(T)) +
    ' — 붙인 학교 ' + hit + '곳 · 못 붙인 학교 ' + miss + '곳');
  if (miss) {
    console.log('  못 붙인 곳 (이름이 다르거나 그 해에 공시가 없습니다):');
    console.log('    ' + missed.slice(0, 20).join('\n    '));
    if (missed.length > 20) console.log('    … 그리고 ' + (missed.length - 20) + '곳');
  }
  /* 앱에 있는데 API 에 없는 것뿐 아니라, API 에 있는데 앱에 없는 것도 봅니다.
     한쪽만 보면 새로 생긴 학교를 놓칩니다. */
  const inApp = new Set();
  for (const line of sm[1].split('\n')) {
    const lm = line.match(/^\s*(\w+): '(.*)',?$/);
    if (!lm) continue;
    for (const rec of lm[2].split(';')) {
      const f = rec.split('|');
      inApp.add(lm[1] + '|' + f[1] + '|' + f[0].replace('*', KNAME[f[1]]));
    }
  }
  const extra = [...found.keys()].filter(k => !inApp.has(k));
  if (extra.length) {
    console.log('  API 에는 있는데 앱 목록에 없는 학교 ' + extra.length + '곳:');
    console.log('    ' + extra.slice(0, 20).map(k => k.split('|')[2]).join('\n    '));
    console.log('  → bake-coords.mjs 를 먼저 돌려 목록을 새로 받는 것이 좋습니다.');
  }

  if (DRY) { console.log('  --dry 라 파일은 고치지 않았습니다.'); continue; }
  if (!hit) { console.error('  한 곳도 붙이지 못해 파일을 고치지 않습니다.'); continue; }

  const old = html.match(/ {2}var STUDENT_RAW = \{\n[\s\S]*?\n {2}\};\n( {2}var STUDENT_YEAR = \d+;\n)?/);
  if (old) {
    html = html.slice(0, old.index) + block + html.slice(old.index + old[0].length);
  } else {
    // SCHOOL_RAW 바로 뒤에 넣습니다 — 두 목록은 짝이므로 붙어 있어야 읽기 쉽습니다.
    const end = sm.index + sm[0].length;
    html = html.slice(0, end) + '\n\n' + block + html.slice(end);
  }
  fs.writeFileSync(T, html);
  console.log('  넣었습니다.');
}

if (!DRY) {
  console.log('\n점검: node verify 또는 브라우저로 prototype/index.html 을 열어 보세요.');
  console.log('다른 해도 받으려면: node bake-students.mjs --year=2025');
}
