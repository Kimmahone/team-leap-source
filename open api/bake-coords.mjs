#!/usr/bin/env node
/* 학교 좌표 굽기 — 학교알리미 「학교기본정보」 → 앱 C 안에 심기
   ---------------------------------------------------------------------------
   앱 C(지역 탐방 디지털 스토리북)는 경상북도 학교 918곳을 파일 안에 담고 있습니다.
   이름과 주소는 교육정보 개방 포털(NEIS)에서 받아 이미 들어 있습니다.
   빠진 것은 **위도·경도** 하나입니다. 그것만 학교알리미가 줍니다.

   이 스크립트는 학교알리미에서 좌표를 받아 앱 파일 안의 목록에 붙입니다.
   받은 뒤에는 다시 인터넷을 쓰지 않습니다. 앱은 여전히 파일 하나로 끝납니다.

   쓰는 법
     node bake-coords.mjs                     ← 인증키.txt 를 읽습니다 (보통 이것)
     node bake-coords.mjs <학교알리미 인증키>   ← 다른 키로 한 번 돌릴 때

   인증키 받는 곳
     https://www.schoolinfo.go.kr → OPENAPI → 로그인(소셜) → 마이페이지
     ※ 교육정보 개방 포털(open.neis.go.kr) 키와 다릅니다. 그쪽에는 좌표가 없습니다.
     받은 키는 같은 폴더의 **인증키.txt** 에 두면 인자 없이도 돌아갑니다.
     그 파일은 배포 대상이 아닙니다 — 학교에 나가는 것은 apps/ 폴더뿐입니다.

   회사·학교 망에서 인증서를 가로채면 https 요청이 막힐 수 있습니다.
   그때는 --curl 을 붙이면 curl 로 받습니다.
     node bake-coords.mjs <키> --curl
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { fetchWithTimeout, sawAnyResponse } from './net.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* 같은 목록을 **네 곳**이 함께 씁니다. **한 곳만 고치면 나머지가 조용히 낡습니다.**
   (앱 C 를 위해 구운 좌표가 앱 A 를 가능하게 했고, 앱 E 는 그것으로 이웃을 정합니다.
    2026. 8. 3. 대시보드가 넷째로 들어왔습니다 — 시군 지도와 학교 마커에 씁니다.) */
const APPS = [
  '08. 실행계획(3)/apps/c-storybook',   // 우리 학교 자리를 지도에 찍습니다
  '08. 실행계획(3)/apps/a-circuit',     // 학교 사이 이동 시간을 어림합니다
  '08. 실행계획(3)/apps/e-together',    // 어느 학교가 이웃인지를 정합니다
  '06. 실행계획(1)/prototype'           // 대시보드 — 시군 지도·학교 마커
].map(d => path.resolve(HERE, '../' + d + '/index.html'));

/* 인증키는 같은 폴더의 인증키.txt 에서 읽습니다. 매번 손으로 붙여 넣지 않게 하려는 것입니다.
   인자로 주면 그것이 이깁니다. 주석(#)과 빈 줄은 건너뜁니다. */
const KEYFILE = path.resolve(HERE, '인증키.txt');
function keyFromFile() {
  try {
    const hit = fs.readFileSync(KEYFILE, 'utf8')
      .split('\n').filter(l => l.trim() && !l.trim().startsWith('#'))
      .join('\n').match(/[0-9a-f]{32}/i);
    return hit ? hit[0] : null;
  } catch (e) { return null; }
}

/* 인자 없이도 도는 스크립트가 되었으니, 모르는 깃발을 「그냥 실행」으로 받으면 안 됩니다.
   --help 를 쳤는데 66번 요청이 나가면 곤란합니다. */
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('쓰는 법: node bake-coords.mjs [인증키] [--curl]');
  console.log('  인증키를 생략하면 같은 폴더의 인증키.txt 를 읽습니다.');
  console.log('  --curl 은 사내망 인증서 문제로 https 요청이 막힐 때 씁니다.');
  console.log('  고치는 앱: a-circuit · c-storybook · e-together (같은 목록을 함께 씁니다)');
  process.exit(0);
}

const ARG = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const KEY = ARG || process.env.SCHOOLINFO_API_KEY || keyFromFile();
const USE_CURL = process.argv.includes('--curl');
if (!KEY) {
  console.error('인증키가 없습니다.');
  console.error('  · ' + KEYFILE + ' 에 32자리 키를 한 줄 넣어 두거나');
  console.error('  · node bake-coords.mjs <학교알리미 인증키> [--curl] 로 주세요.');
  process.exit(1);
}
if (!ARG) console.log('인증키: ' + (process.env.SCHOOLINFO_API_KEY ? '환경변수' : '인증키.txt') + ' (…' + KEY.slice(-6) + ')');

/* 시군구 코드 — open api/시도시군구코드.xlsx 의 경상북도(47) 부분.
   군위군(47720)은 2023년 7월 1일 대구로 넘어가 여기 없습니다.
   포항은 남구·북구가 따로 있어 코드가 둘입니다. */
const SGG = {
  47111: 'pohang', 47113: 'pohang', 47130: 'gyeongju', 47150: 'gimcheon',
  47170: 'andong', 47190: 'gumi', 47210: 'yeongju', 47230: 'yeongcheon',
  47250: 'sangju', 47280: 'mungyeong', 47290: 'gyeongsan', 47730: 'uiseong',
  47750: 'cheongsong', 47760: 'yeongyang', 47770: 'yeongdeok', 47820: 'cheongdo',
  47830: 'goryeong', 47840: 'seongju', 47850: 'chilgok', 47900: 'yecheon',
  47920: 'bonghwa', 47930: 'uljin', 47940: 'ulleung'
};
const KND = { '02': 'e', '03': 'm', '04': 'h', '05': 's' };   // 초 · 중 · 고

async function once(url) {
  if (USE_CURL) return JSON.parse(execFileSync('curl', ['-s', '--max-time', '60', url], { encoding: 'utf8' }));
  const res = await fetchWithTimeout(url);
  return res.json();
}

/* 한 번 실패했다고 그 시군 학교들의 좌표를 통째로 버리면 안 됩니다.
   세 번까지 다시 물어보고, 그래도 안 되면 이미 앱에 있던 좌표를 그대로 둡니다. */
async function get(url) {
  let last;
  for (let i = 0; i < 3; i++) {
    try { return await once(url); } catch (e) { last = e; await new Promise(r => setTimeout(r, 1500)); }
  }
  throw last;
}

const found = new Map();      // "andong|e|안동초등학교" → [위도, 경도]
let calls = 0, rows = 0;

for (const sgg of Object.keys(SGG)) {
  for (const knd of Object.keys(KND)) {
    const url = 'https://www.schoolinfo.go.kr/openApi.do?apiKey=' + encodeURIComponent(KEY) +
      '&apiType=0&sidoCode=47&sggCode=' + sgg + '&schulKndCode=' + knd;
    let j;
    try { j = await get(url); } catch (e) { console.error('  못 받음', sgg, knd, String(e).slice(0, 80)); continue; }
    calls++;
    if (j.resultCode !== 'success') {
      console.error('  ' + sgg + '/' + knd + ' → ' + (j.resultMsg || JSON.stringify(j).slice(0, 80)));
      if (String(j.resultMsg || '').includes('apiKey')) {
        console.error('\n인증키가 받아들여지지 않았습니다. 학교알리미(schoolinfo.go.kr) 키가 맞는지 확인해 주세요.');
        process.exit(2);
      }
      continue;
    }
    for (const s of j.list || []) {
      if (s.CLOSE_YN === 'Y' || s.ABSCH_YN === 'Y') continue;    // 폐교는 빼고
      if (s.LTTUD == null || s.LGTUD == null) continue;
      found.set(SGG[sgg] + '|' + KND[knd] + '|' + s.SCHUL_NM, [+s.LTTUD, +s.LGTUD]);
      rows++;
    }
    await new Promise(r => setTimeout(r, 120));   // 남의 서버입니다. 천천히 부릅니다.
  }
}
console.log(calls + '번 물어 ' + rows + '곳의 좌표를 받았습니다.');
if (!rows) { console.error('좌표를 하나도 받지 못했습니다. 그만둡니다.'); process.exit(sawAnyResponse() ? 3 : 75); }

/* 앱 안의 목록에 붙인다 — 이름|급|주소[|위도|경도] */
const KNAME = { e: '초등학교', m: '중학교', h: '고등학교' };

let hit = 0, kept = 0, miss = 0;
const missed = [];

for (const APP of APPS) {
hit = 0; kept = 0; miss = 0; missed.length = 0;
let html = fs.readFileSync(APP, 'utf8');
const m = html.match(/(  var SCHOOL_RAW = \{\n)([\s\S]*?)(\n  \};\n)/);
if (!m) { console.error('앱에서 SCHOOL_RAW 를 찾지 못했습니다: ' + APP); process.exit(4); }

const body = m[2].split('\n').map(line => {
  const lm = line.match(/^(\s*)(\w+): '(.*)'(,?)$/);
  if (!lm) return line;
  const [, pad, rc, blob, comma] = lm;
  const out = blob.split(';').map(rec => {
    const f = rec.split('|');
    const full = f[0].replace('*', KNAME[f[1]]);
    const c = found.get(rc + '|' + f[1] + '|' + full);
    if (!c) {
      // 이번에 못 받았다고 이미 있던 좌표를 지우지 않습니다.
      if (f[3] && f[4]) { kept++; return rec; }
      miss++; missed.push(full);
      return f.slice(0, 3).join('|');
    }
    hit++;
    return f.slice(0, 3).join('|') + '|' + c[0].toFixed(4) + '|' + c[1].toFixed(4);
  }).join(';');
  return pad + rc + ": '" + out + "'" + comma;
}).join('\n');

html = html.slice(0, m.index) + m[1] + body + m[3] + html.slice(m.index + m[0].length);
fs.writeFileSync(APP, html);

console.log('\n' + path.basename(path.dirname(APP)) +
  ' — 붙인 학교 ' + hit + '곳 · 이미 있던 것을 지킨 학교 ' + kept + '곳 · 아직 없는 학교 ' + miss + '곳');
if (miss) console.log('  못 붙인 곳 (이름이 다를 수 있습니다):\n    ' + missed.slice(0, 20).join('\n    '));
}

console.log('\n' + APPS.length + '곳을 고쳤습니다. 네 곳이 같은 목록을 씁니다.');
console.log('점검: cd "08. 실행계획(3)/apps" && for d in a-circuit c-storybook e-together; do (cd $d && node test.js | tail -1); done');
