/* 개교년도를 굽습니다 — 학교알리미 apiType=0 의 `FOND_YMD` 〔2026. 9. 10.〕

   ★ 이 값도 «받아 놓고 버리고 있었습니다.**
     `bake-coords.mjs` 가 같은 응답(apiType=0)에서 LTTUD·LGTUD 만 꺼내 쓰고,
     같은 줄에 들어 있던 FOND_YMD·FOND_SC_CODE 는 그냥 흘려보냈습니다.
     EDSS 학교별 시계열과 같은 자리입니다 — 새로 신청할 API 가 없습니다.

   왜 개교년도가 학령인구 화면에 필요한가
     · 1960~70년대에 세운 학교가 많은 시군은 그 세대가 빠져나간 뒤의 모습입니다.
     · 2010년대에 세운 학교는 신도시·택지의 신호입니다(예천 도청신도시).
     한 학교의 «나이»는 그 지역이 어느 국면에 있는지를 한 줄로 말해 줍니다.

   내는 것
     대시보드 안의 `var SCHOOL_FOUNDED = { ... };`
     적는 방식: 이름|급|개교년도|설립구분   (STUDENT_RAW 와 같은 키 모양)

   쓰는 법
     node bake-founded.mjs                     ← 인증키.txt 를 읽습니다
     node bake-founded.mjs <학교알리미 인증키>
     node bake-founded.mjs --dry               ← 받기만 하고 파일은 고치지 않습니다
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KEYFILE = path.join(HERE, '인증키.txt');
const TARGET = path.join(HERE, '..', '06. 실행계획(1)', 'prototype', 'index.html');
const DRY = process.argv.includes('--dry');

function keyFromFile() {
  try { return fs.readFileSync(KEYFILE, 'utf8').trim().split(/\s+/)[0] || null; }
  catch (_e) { return null; }
}
const ARG = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const KEY = ARG || process.env.SCHOOLINFO_API_KEY || keyFromFile();
if (!KEY) {
  console.error('인증키가 없습니다. 인증키.txt 에 넣거나 인자로 주세요.');
  process.exit(1);
}

/* bake-coords.mjs 와 «같은 표»입니다. 둘이 어긋나면 좌표는 있고 개교년도는
   없는 학교가 조용히 생깁니다. 고칠 때는 두 파일을 함께 고쳐야 합니다. */
const SGG = {
  47111: 'pohang', 47113: 'pohang', 47130: 'gyeongju', 47150: 'gimcheon',
  47170: 'andong', 47190: 'gumi', 47210: 'yeongju', 47230: 'yeongcheon',
  47250: 'sangju', 47280: 'mungyeong', 47290: 'gyeongsan', 47730: 'uiseong',
  47750: 'cheongsong', 47760: 'yeongyang', 47770: 'yeongdeok', 47820: 'cheongdo',
  47830: 'goryeong', 47840: 'seongju', 47850: 'chilgok', 47900: 'yecheon',
  47920: 'bonghwa', 47930: 'uljin', 47940: 'ulleung'
};
const KND = { '02': 'e', '03': 'm', '04': 'h' };

async function get(url) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 60000);
      const res = await fetch(url, { signal: c.signal });
      clearTimeout(t);
      return await res.json();
    } catch (e) { last = e; await new Promise(r => setTimeout(r, 1500)); }
  }
  throw last;
}

/* 「19530131」 → 1953. 날짜가 비었거나 모양이 다르면 «비웁니다».
   0 이나 오늘 날짜로 채우지 않습니다 — 모르는 것은 모르는 것입니다. */
export function foundedYear(v) {
  const m = String(v == null ? '' : v).trim().match(/^(\d{4})/);
  if (!m) return null;
  const y = Number(m[1]);
  return (y >= 1890 && y <= new Date().getFullYear()) ? y : null;
}

/* SCHOOL_RAW 를 훑어 심을 덩어리를 만듭니다 — bake-students.mjs 와 같은 방식입니다.
   목록의 차례와 이름을 그대로 따르므로 화면은 같은 키로 잇습니다. */
export function toFoundedBlock(html, found) {
  const m = String(html || '').match(/ {2}var SCHOOL_RAW = \{\n([\s\S]*?)\n {2}\};/);
  if (!m) return null;
  const KNAME = { e: '초등학교', m: '중학교', h: '고등학교' };
  const lines = [];
  let hit = 0, miss = 0;
  const missed = [];
  for (const line of m[1].split('\n')) {
    const lm = line.match(/^(\s*)(\w+): '(.*)'(,?)$/);
    if (!lm) continue;
    const recs = [];
    for (const rec of lm[3].split(';')) {
      const f = rec.split('|');
      if (f.length < 2 || !KNAME[f[1]]) continue;
      const full = f[0].replace('*', KNAME[f[1]]);
      const got = found.get(lm[2] + '|' + f[1] + '|' + full);
      if (!got || got.year == null) { miss++; missed.push(full); continue; }
      hit++;
      recs.push([f[0], f[1], got.year, got.kind || ''].join('|'));
    }
    lines.push(lm[1] + lm[2] + ": '" + recs.join(';') + "'");
  }
  return {
    block: '  var SCHOOL_FOUNDED = {\n' + lines.join(',\n') + '\n  };\n',
    hit, miss, missed
  };
}

async function main() {
  const found = new Map();
  let calls = 0, rows = 0;
  for (const sgg of Object.keys(SGG)) {
    for (const knd of Object.keys(KND)) {
      const url = 'https://www.schoolinfo.go.kr/openApi.do?apiKey=' + encodeURIComponent(KEY) +
        '&apiType=0&sidoCode=47&sggCode=' + sgg + '&schulKndCode=' + knd;
      let j;
      try { j = await get(url); } catch (e) { console.error('  못 받음', sgg, knd); continue; }
      calls++;
      if (j.resultCode !== 'success') {
        console.error('  ' + sgg + '/' + knd + ' → ' + (j.resultMsg || '').slice(0, 60));
        if (String(j.resultMsg || '').includes('apiKey')) process.exit(2);
        continue;
      }
      for (const s of j.list || []) {
        if (s.CLOSE_YN === 'Y' || s.ABSCH_YN === 'Y') continue;
        const y = foundedYear(s.FOND_YMD);
        if (y == null) continue;
        found.set(SGG[sgg] + '|' + KND[knd] + '|' + s.SCHUL_NM,
          { year: y, kind: String(s.FOND_SC_CODE || '').trim() });
        rows++;
      }
      await new Promise(r => setTimeout(r, 120));
    }
  }
  console.log(calls + '번 물어 ' + rows + '곳의 개교년도를 받았습니다.');
  if (!rows) { console.error('하나도 받지 못했습니다. 그만둡니다.'); process.exit(3); }

  const html = fs.readFileSync(TARGET, 'utf8');
  const out = toFoundedBlock(html, found);
  if (!out) { console.error('SCHOOL_RAW 를 찾지 못했습니다.'); process.exit(5); }

  const total = out.hit + out.miss;
  const rate = total ? out.hit / total : 0;
  console.log('붙인 학교 ' + out.hit + '곳 · 못 붙인 학교 ' + out.miss + '곳 (' + (rate * 100).toFixed(1) + '%)');
  if (out.miss) console.log('  못 붙인 곳: ' + out.missed.slice(0, 10).join(', ') +
    (out.missed.length > 10 ? ' 외 ' + (out.missed.length - 10) + '곳' : ''));

  /* ★ 덜 붙으면 멈춥니다. 절반만 붙어도 화면은 조용히 그려지고, 사람은
     「어떤 학교는 개교년도가 없네」로만 느낍니다 — 원인을 찾을 수 없습니다. */
  if (total && rate < 0.9) {
    console.error('✗ ' + (rate * 100).toFixed(1) + '% 만 붙었습니다. 심지 않고 멈춥니다.');
    process.exit(6);
  }
  if (DRY) { console.log('--dry 라 파일은 고치지 않았습니다.'); return; }

  const MARK = / {2}var SCHOOL_FOUNDED = \{\n[\s\S]*?\n {2}\};\n/;
  let next;
  if (MARK.test(html)) next = html.replace(MARK, out.block);
  else {
    const at = html.indexOf('  var STUDENT_RAW = {');
    if (at < 0) { console.error('심을 자리를 찾지 못했습니다 (STUDENT_RAW).'); process.exit(5); }
    next = html.slice(0, at) + out.block + '\n' + html.slice(at);
  }
  fs.writeFileSync(TARGET, next, 'utf8');
  console.log('✓ 대시보드에 개교년도 ' + out.hit + '곳을 심었습니다.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('✗ ' + e.message); process.exit(1); });
}
