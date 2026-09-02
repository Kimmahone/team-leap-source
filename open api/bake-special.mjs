/* ==========================================================================
   학교알리미 → 대시보드에 **특수학교**를 심습니다

   ★ 〔2026. 8. 12.〕 여기 있던 특수학교 10곳은 **이름만 진짜**였습니다.
     학생·학급·교원 수는 지어낸 값이었고, 좌표는 그 시군의 **중심점**이라
     지도에서 열 곳이 전부 시군 한가운데 찍혀 있었습니다.
     실제로 받아 보니 안동영명학교는 학생 **225명·40학급·교원 67명**인데
     지어낸 값은 110명·18학급·35명이었습니다.

   어디서 받나 — 이미 쓰고 있던 API 입니다
     `schulKndCode=05` 가 특수학교입니다. `bake-coords.mjs` 의 KND 표에
     `'05': 's'` 로 **이미 적혀 있었는데** 대시보드가 쓰지 않고 있었습니다.
       apiType=0   학교기본정보 — 이름·주소
       apiType=09  학년별 학생·학급 — COL_S_SUM(학생 계) · COL_C_SUM(학급 계) · TEACH_CNT

     특수학교는 초·중·고 과정을 한 학교에서 함께 운영해서 학년이 18칸까지
     있습니다(COL_S1~S18). 그래서 학년별로 쪼개지 않고 **계**를 씁니다.

   좌표
     이 API 가 `LTTUD`·`LGTUD` 로 **위경도를 그대로 줍니다.**
     초·중·고 917곳과 같은 출처이므로 그것을 씁니다 — 주소를 옮긴 값보다
     출처가 분명합니다. 혹시 빠진 곳만 카카오로 주소를 옮기고,
     그래도 없으면 **비워 둡니다.** 지어내지 않습니다.

   ★ 코드 05 에는 특수학교만 있는 것이 아닙니다
     「각종학교」가 섞여 있습니다. 실제로 **한동글로벌학교**(한동대 부설,
     학생 422명·18학급)가 함께 나옵니다. 그런데 **둘을 가르는 필드가 없습니다** —
     학교코드·설립유형·과정 어느 것도 다르지 않습니다.
     그래서 **이름을 적어 두고 뺍니다.** 문턱값으로 조용히 거르지 않는 까닭은
     나중에 누구도 그 판단을 되짚을 수 없기 때문입니다.
     새로운 각종학교가 들어오면 스스로 **알아채고 알립니다**(아래 SUSPECT).

   쓰는 법
     node "open api/bake-special.mjs"          인증키.txt 에서 열쇠를 읽습니다
     node "open api/bake-special.mjs" --dry    받기만 하고 파일은 안 고칩니다
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeGeocoder, inGyeongbuk } from './kakao-geocode.mjs';
import { fetchWithTimeout } from './net.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KEYFILE = path.resolve(HERE, '인증키.txt');
const TARGET = path.resolve(HERE, '../06. 실행계획(1)/prototype/index.html');

const ARGV = process.argv.slice(2);
const DRY = ARGV.includes('--dry');
const YEAR = (ARGV.find(a => a.startsWith('--year=')) || '--year=2026').split('=')[1];

if (ARGV.includes('--help') || ARGV.includes('-h')) {
  console.log('쓰는 법: node bake-special.mjs [--year=2026] [--dry]');
  console.log('  고치는 곳: ' + path.relative(path.resolve(HERE, '..'), TARGET));
  process.exit(0);
}

/* bake-coords.mjs · bake-kinder.mjs 와 같은 표입니다.
   포항은 남구(47111)·북구(47113)로 나뉘어 있고 우리 화면은 「포항」 하나입니다. */
const SGG = {
  47111: 'pohang',   47113: 'pohang',   47130: 'gyeongju',  47150: 'gimcheon',
  47170: 'andong',   47190: 'gumi',     47210: 'yeongju',   47230: 'yeongcheon',
  47250: 'sangju',   47280: 'mungyeong', 47290: 'gyeongsan', 47730: 'uiseong',
  47750: 'cheongsong', 47760: 'yeongyang', 47770: 'yeongdeok', 47820: 'cheongdo',
  47830: 'goryeong', 47840: 'seongju',  47850: 'chilgok',   47900: 'yecheon',
  47920: 'bonghwa',  47930: 'uljin',    47940: 'ulleung'
};

function schoolinfoKey() {
  if (process.env.SCHOOLINFO_API_KEY) return process.env.SCHOOLINFO_API_KEY;
  let raw;
  try { raw = fs.readFileSync(KEYFILE, 'utf8'); }
  catch (e) { console.error('✗ 인증키.txt 를 읽지 못했습니다: ' + KEYFILE); process.exit(1); }
  /* 학교알리미 열쇠는 «맨 처음» 것입니다. 유치원·카카오 열쇠와 생김새가 같으므로
     그 낱말이 적힌 줄은 건너뜁니다. */
  const line = raw.split('\n')
    .filter(l => !l.trim().startsWith('#'))
    .find(l => /[0-9a-fA-F]{32}/.test(l) && !/유치원|카카오/.test(l));
  const hit = (line || '').match(/[0-9a-fA-F]{32}/);
  if (!hit) { console.error('✗ 인증키.txt 에서 학교알리미 열쇠를 찾지 못했습니다.'); process.exit(1); }
  return hit[0];
}

const KEY = schoolinfoKey();
console.log('학교알리미 열쇠: …' + KEY.slice(-6) + ' · 공시년도 ' + YEAR);

/* 화면이 쓰는 시군 이름은 **한글 약칭**입니다 (REGION_GEO 의 `s`).
   영문 코드(`c`)가 아닙니다 — 초·중·고 917곳도 `s: sg.s` 로 한글을 넣습니다.
   ★ 2026. 8. 12. 에 여기 영문 코드를 넣어 시군별 셈이 전부 0 이 된 적이 있습니다. */
const SIG_KO = {
  pohang:'포항', gyeongju:'경주', gimcheon:'김천', andong:'안동', gumi:'구미',
  yeongju:'영주', yeongcheon:'영천', sangju:'상주', mungyeong:'문경', gyeongsan:'경산',
  uiseong:'의성', cheongsong:'청송', yeongyang:'영양', yeongdeok:'영덕', cheongdo:'청도',
  goryeong:'고령', seongju:'성주', chilgok:'칠곡', yecheon:'예천', bonghwa:'봉화',
  uljin:'울진', ulleung:'울릉'
};

const num = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; };

/* ── 특수학교가 아닌 것 ────────────────────────────────────────────
   `schulKndCode=05` 는 「특수학교 및 각종학교」입니다. 아래는 각종학교라
   특수학교 통계에서 뺍니다. 뺀 까닭을 함께 적습니다 — 나중에 되짚을 수 있게. */
const NOT_SPECIAL = {
  '한동글로벌학교': '한동대학교 부설 각종학교(외국인학교 성격). 특수교육 대상 학교가 아닙니다.'
};

/* 특수학교는 법으로 학급당 인원이 적습니다(대개 4~7명).
   각종학교가 새로 섞여 들어오면 이 값이 확 뜁니다 — 그때 **조용히 넣지 않고 알립니다.** */
const SUSPECT_PER_CLASS = 12;

async function ask(url) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetchWithTimeout(url);
      return await res.json();
    } catch (e) { last = e; await new Promise(r => setTimeout(r, 1200)); }
  }
  throw last;
}

function api(type, sgg, extra = '') {
  return 'https://www.schoolinfo.go.kr/openApi.do?apiKey=' + encodeURIComponent(KEY) +
    '&apiType=' + type + '&sidoCode=47&sggCode=' + sgg + '&schulKndCode=05' + extra;
}

async function main() {
  const rows = [];
  const failed = [];
  const excluded = [];

  for (const [code, sig] of Object.entries(SGG)) {
    let basic;
    try { basic = await ask(api('0', code)); }
    catch (e) { failed.push(`${sig} 기본정보 — ${String(e).slice(0, 60)}`); continue; }

    /* 「데이터가 존재하지 않습니다」는 실패가 아닙니다 — 그 시군에 특수학교가
       없다는 뜻입니다. 22개 시군 가운데 대부분이 그렇습니다. */
    if (basic.resultCode !== 'success') continue;

    let stuByName = {};
    try {
      const d2 = await ask(api('09', code, '&pbanYr=' + YEAR));
      if (d2.resultCode === 'success') {
        for (const x of d2.list || []) {
          stuByName[String(x.SCHUL_NM || '').trim()] = {
            stu: num(x.COL_S_SUM), cls: num(x.COL_C_SUM), teach: num(x.TEACH_CNT)
          };
        }
      }
    } catch (e) { /* 학생수가 없으면 아래에서 est:true 로 남습니다 */ }

    for (const x of basic.list || []) {
      const name = String(x.SCHUL_NM || '').trim();
      if (NOT_SPECIAL[name]) { excluded.push(`${name} — ${NOT_SPECIAL[name]}`); continue; }
      const d = stuByName[name];
      const lat = parseFloat(x.LTTUD), lon = parseFloat(x.LGTUD);
      rows.push({
        name, s: sig,
        addr: String(x.SCHUL_RDNMA || '').trim(),
        stu: d ? d.stu : 0,
        cls: d ? d.cls : 0,
        teach: d ? d.teach : 0,
        lat: isFinite(lat) ? lat : null,     // 이 API 가 주는 좌표를 그대로 씁니다
        lon: isFinite(lon) ? lon : null,
        est: !d                       // 실적을 못 받았으면 «추정»입니다
      });
    }
    console.log(`  ${sig} ${(basic.list || []).length}곳`);
  }

  if (failed.length) {
    console.error('\n✗ 받지 못한 시군이 있습니다:');
    failed.forEach(f => console.error('  · ' + f));
    console.error('  일부만 심으면 합계가 조용히 틀립니다. 아무것도 고치지 않았습니다.');
    process.exit(1);
  }

  if (rows.length === 0) {
    console.error('✗ 특수학교를 한 곳도 받지 못했습니다. 아무것도 고치지 않았습니다.');
    process.exit(1);
  }

  const seen = new Set();
  const unique = rows.filter(r => {
    const k = r.name + '|' + r.addr;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });

  const withReal = unique.filter(r => !r.est).length;
  console.log(`\n특수학교 ${unique.length}곳 · 학생수 실적을 받은 곳 ${withReal}곳`);
  console.log(`총 학생 ${unique.reduce((a, r) => a + r.stu, 0).toLocaleString()}명 · ` +
    `총 학급 ${unique.reduce((a, r) => a + r.cls, 0).toLocaleString()}개 · ` +
    `교원 ${unique.reduce((a, r) => a + r.teach, 0).toLocaleString()}명`);

  /* 좌표 — API 가 준 것을 먼저 쓰고, 빠진 곳만 주소를 옮깁니다 */
  const fromApi = unique.filter(r => r.lat != null && inGyeongbuk(r.lat, r.lon)).length;
  const need = unique.filter(r => !(r.lat != null && inGyeongbuk(r.lat, r.lon)));
  console.log(`\n좌표 — API 가 준 것 ${fromApi}곳` + (need.length ? ` · 주소를 옮겨야 하는 곳 ${need.length}곳` : ''));
  if (need.length) {
    const geo = makeGeocoder();
    for (const r of need) {
      const hit = r.addr ? await geo.lookup(r.addr) : null;
      if (hit && inGyeongbuk(hit.lat, hit.lon)) { r.lat = hit.lat; r.lon = hit.lon; }
      else { r.lat = null; r.lon = null; }
    }
    geo.save();
  }
  console.log(`  좌표를 얻은 곳 ${unique.filter(r => r.lat != null).length} / ${unique.length}곳`);

  if (excluded.length) {
    console.log('\n뺀 학교 (각종학교):');
    excluded.forEach(e => console.log('  · ' + e));
  }

  /* 새 각종학교가 섞여 들어왔는지 — 조용히 넣지 않고 알립니다 */
  const suspect = unique.filter(r => r.cls > 0 && (r.stu / r.cls) > SUSPECT_PER_CLASS);
  if (suspect.length) {
    console.log('\n⚠ 학급당 인원이 특수학교치고 많습니다 — 각종학교가 섞였는지 확인하세요:');
    suspect.forEach(r => console.log(`  · ${r.name} — 학생 ${r.stu} / ${r.cls}학급 = ${(r.stu / r.cls).toFixed(1)}명`));
    console.log('  각종학교라면 이 스크립트의 NOT_SPECIAL 에 이름과 까닭을 적어 주세요.');
  }

  if (DRY) {
    console.log('\n— 확인만 (--dry). 파일을 고치지 않았습니다.');
    unique.forEach(r => console.log(`  ${r.name} · ${r.s} · 학생 ${r.stu} · 학급 ${r.cls} · 교원 ${r.teach}` +
      (r.lat ? '' : ' · 좌표 없음')));
    return;
  }

  const esc = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const literal = unique.map(r =>
    `{name:'${esc(r.name)}',lv:'특수',s:'${SIG_KO[r.s] || r.s}',addr:'${esc(r.addr)}',` +
    `lat:${r.lat == null ? 'null' : r.lat.toFixed(6)},lon:${r.lon == null ? 'null' : r.lon.toFixed(6)},` +
    `stu:${r.stu},cls:${r.cls},sped:${r.stu},teach:${r.teach},est:${r.est}}`
  ).join(',\n');

  let html = fs.readFileSync(TARGET, 'utf8');

  /* ★ 갈아 끼웁니다. 덧붙이지 않습니다. 그리고 **유치원 배열은 건드리지 않습니다** —
     한 배열은 한 스크립트만 가집니다. 하나로 두면 나중에 돌린 쪽이 앞의 것을 지웁니다. */
  const re = /const SPECIAL_SCHOOLS = \[[\s\S]*?\n?\];/;
  const block = 'const SPECIAL_SCHOOLS = [\n' + literal + '\n];';
  if (!re.test(html)) {
    console.error('✗ 대시보드에서 `const SPECIAL_SCHOOLS = [` 자리를 찾지 못했습니다.');
    process.exit(1);
  }
  fs.writeFileSync(TARGET, html.replace(re, block), 'utf8');
  console.log(`\n✓ ${path.relative(path.resolve(HERE, '..'), TARGET)} 에 ${unique.length}곳을 심었습니다.`);
  console.log('  이어서: cd "06. 실행계획(1)/prototype" && node test.js');
}

main().catch(e => { console.error('✗ ' + e.message); process.exit(1); });
