/* ==========================================================================
   유치원알리미(e-childschoolinfo.moe.go.kr) → 대시보드에 유치원을 심습니다

   ★ 〔2026. 8. 12.〕 이 스크립트는 통째로 다시 썼습니다. 예전 판은 —

     ① **좌표를 지어냈습니다.**  `35.8 + Math.random()`
        경북을 덮는 네모 안 아무 데나 찍었습니다. 시군과 상관이 없어서
        울릉군 유치원이 본토에 있었습니다. 지도는 「어디에 있는가」를 말하는
        그림입니다. 난수로 채우면 그림이 거짓말을 합니다.

     ② **원아 수도 지어냈습니다.**  `Math.floor(Math.random()*30)+10`
        그런데 이 API 는 `ppcnt3·ppcnt4·ppcnt5·mixppcnt·shppcnt` 로
        **실제 원아 수를 줍니다.** 받아 놓고 버린 뒤 난수를 넣고 있었습니다.

     ③ **학급 수를 절반만 셌습니다.**  `clcnt3+clcnt4+clcnt5 || 1`
        병설유치원은 대부분 **혼합학급**이라 그 셋이 다 0 입니다. 그래서
        전부 `|| 1` 로 떨어졌습니다. `mixclcnt`(혼합)·`shclcnt`(특수)가 빠져
        있었습니다.

     ④ **덧붙이기만 하고 지우지 않았습니다.** SCHOOLS 배열 끝에 밀어 넣기만 해서
        두 번 돌리자 614곳이 **1,228곳**이 됐습니다. 같은 유치원이 좌표만
        다르게 두 번씩 들어가 있었습니다.

     ⑤ **인증키가 코드에 박혀 있었습니다.** 이 프로젝트의 약속은
        「열쇠는 인증키.txt 에만」입니다.

   지금 판이 지키는 것 — **없는 것을 지어내지 않습니다.**
   좌표는 유치원알리미 신규 기본현황(`basicInfo2.do`)의 공식 위·경도를 우선하고,
   공식 좌표가 없는 주소만 카카오 로컬로 보완합니다. 둘 다 없으면 비워 둡니다.
   지도는 좌표가 없는 곳을 그리지 않고, 몇 곳을 못 찾았는지 화면에 찍습니다.

   쓰는 법
     node "open api/bake-kinder.mjs"            인증키.txt 에서 열쇠를 읽습니다
     node "open api/bake-kinder.mjs" [인증키]
     node "open api/bake-kinder.mjs" --dry      받기만 하고 파일은 안 고칩니다
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeGeocoder, inGyeongbuk } from './kakao-geocode.mjs';
import { fetchRetry, exitFor } from './net.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KEYFILE = path.resolve(HERE, '인증키.txt');
const ENVFILE = path.resolve(HERE, '../.dev.vars');
const TARGET = path.resolve(HERE, '../06. 실행계획(1)/prototype/index.html');

const ARGV = process.argv.slice(2);
const DRY = ARGV.includes('--dry');
const ARG = ARGV.find(a => !a.startsWith('--')) || null;

if (ARGV.includes('--help') || ARGV.includes('-h')) {
  console.log('쓰는 법: node bake-kinder.mjs [인증키] [--dry]');
  console.log('  인증키를 생략하면 같은 폴더의 인증키.txt 에서 유치원알리미 열쇠를 읽습니다.');
  console.log('  고치는 곳: ' + path.relative(path.resolve(HERE, '..'), TARGET));
  process.exit(0);
}

/* 경북 시군 코드 — bake-coords.mjs 와 같은 표입니다.
   포항은 남구(47111)·북구(47113)로 나뉘어 있고 우리 화면은 「포항」 하나입니다. */
const SGG = {
  47111: 'pohang',   47113: 'pohang',   47130: 'gyeongju',  47150: 'gimcheon',
  47170: 'andong',   47190: 'gumi',     47210: 'yeongju',   47230: 'yeongcheon',
  47250: 'sangju',   47280: 'mungyeong', 47290: 'gyeongsan', 47730: 'uiseong',
  47750: 'cheongsong', 47760: 'yeongyang', 47770: 'yeongdeok', 47820: 'cheongdo',
  47830: 'goryeong', 47840: 'seongju',  47850: 'chilgok',   47900: 'yecheon',
  47920: 'bonghwa',  47930: 'uljin',    47940: 'ulleung'
};

function getKey() {
  if (ARG) return ARG;
  if (process.env.KINDER_API_KEY) return process.env.KINDER_API_KEY;
  try {
    const envLine = fs.readFileSync(ENVFILE, 'utf8').split(/\r?\n/).find(l => l.startsWith('KINDER_API_KEY='));
    if (envLine) return envLine.slice('KINDER_API_KEY='.length).trim();
  } catch (_e) { /* 예전 인증키.txt 방식으로 계속 진행 */ }
  let raw;
  try { raw = fs.readFileSync(KEYFILE, 'utf8'); }
  catch (e) {
    console.error('✗ 인증키.txt 를 읽지 못했습니다: ' + KEYFILE);
    console.error('  유치원알리미 열쇠를 그 파일에 한 줄로 넣거나, 인자로 주세요.');
    process.exit(1);
  }
  /* 유치원알리미 열쇠는 32자리 16진수입니다. 학교알리미 열쇠와 «생김새가 같으니»
     주석으로 어느 것인지 적어 두세요 — 이 스크립트는 「유치원」이 적힌 줄을 먼저 봅니다. */
  const lines = raw.split('\n');
  const marked = lines.find(l => /유치원/.test(l) && /[0-9a-fA-F]{32}/.test(l));
  const hit = (marked || lines.find(l => !l.trim().startsWith('#') && /[0-9a-fA-F]{32}/.test(l)) || '')
    .match(/[0-9a-fA-F]{32}/);
  if (!hit) {
    console.error('✗ 인증키.txt 에서 32자리 열쇠를 찾지 못했습니다.');
    console.error('  「유치원알리미: <열쇠>」 처럼 한 줄 적어 주세요.');
    process.exit(1);
  }
  return hit[0];
}

const KEY = getKey();
console.log('유치원알리미 열쇠: …' + KEY.slice(-6));

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

async function fetchSgg(endpoint, code, sig) {
  const url = `https://e-childschoolinfo.moe.go.kr/api/notice/${endpoint}.do?key=${KEY}&sidoCode=47&sggCode=${code}`;
  const res = await fetchRetry(url);
  if (!res.ok) throw new Error(`${sig}(${code}) — HTTP ${res.status}`);
  const data = await res.json();
  return {status:data.status, message:data.message || '', rows:Array.isArray(data.kinderInfo) ? data.kinderInfo : []};
}

function teacherCount(t) {
  if (!t) return 0;
  const modern = ['drcnt','adcnt','hdst_thcnt','asps_thcnt','gen_tcr_cnt',
    'shtm_gen_tcr_cnt','shtm_spn_gen_tcr_cnt','spy_tcr_cnt','shtm_spy_tcr_cnt',
    'shtm_spn_spy_tcr_cnt','hlt_tcr_cnt','shtm_hlt_tcr_cnt','shtm_spn_hlt_tcr_cnt',
    'ntr_tcr_cnt','shtm_ntr_tcr_cnt','shtm_spn_ntr_tcr_cnt','insr_cnt'];
  const modernTotal = modern.reduce((sum,k)=>sum+num(t[k]),0);
  if (modernTotal) return modernTotal;
  return ['drcnt','adcnt','hdst_thcnt','asps_thcnt','gnrl_thcnt','spcn_thcnt','ntcnt','ntrt_thcnt','shcnt_thcnt']
    .reduce((sum,k)=>sum+num(t[k]),0);
}

async function main() {
  const rows = [];
  const failed = [];
  const teacherNotices = new Set();

  for (const [code, sig] of Object.entries(SGG)) {
    try {
      const basic = await fetchSgg('basicInfo2', code, sig);
      if (basic.status !== 'SUCCESS') throw new Error(`${sig}(${code}) — ${basic.status} ${basic.message}`);
      const list = basic.rows;
      const teachers = await fetchSgg('teachersInfo', code, sig);
      if (teachers.status !== 'SUCCESS' && teachers.message) teacherNotices.add(teachers.message);
      const teacherByCode = new Map(teachers.rows.map(t => [String(t.kindercode || ''), t]));
      const teacherByName = new Map(teachers.rows.map(t => [String(t.kindername || '').trim(), t]));
      for (const k of list) {
        /* 원아 수 = 3·4·5세 + 혼합반 + 특수학급. 학급 수도 같은 방식입니다.
           병설유치원은 대부분 혼합반이라 mix 를 빼면 0 이 됩니다 — 예전 판이 그랬습니다. */
        const stu = num(k.ppcnt3) + num(k.ppcnt4) + num(k.ppcnt5) + num(k.mixppcnt) + num(k.shppcnt);
        const cls = num(k.clcnt3) + num(k.clcnt4) + num(k.clcnt5) + num(k.mixclcnt) + num(k.shclcnt);
        /* ★ pbnttmng = 공시 시기 (20261 = 2026년 1차).
           **유치원마다 다릅니다.** 2026년 것이 82%지만 2023·2024·2025년 것도 섞여 있습니다.
           낡은 공시는 «지금 문 닫은 곳»이 그대로 남아 있을 수 있습니다 —
           실제로 포항양덕초등학교병설유치원은 2023년 2차 공시라 원아 5명으로 나오는데
           지금은 운영하지 않습니다. 그래서 이 값을 **화면까지 들고 갑니다.** */
        const teacher = teacherByCode.get(String(k.kindercode || '')) || teacherByName.get(String(k.kindername || '').trim());
        const officialLat = Number(k.lttdcdnt), officialLon = Number(k.lngtcdnt);
        rows.push({
          code: String(k.kindercode || '').trim(),
          name: String(k.kindername || '').trim(),
          s: sig,
          addr: String(k.addr || '').trim(),
          establish: String(k.establish || '').trim(),
          stu, cls,
          sped: num(k.shppcnt),
          teach: teacherCount(teacher),
          lat: Number.isFinite(officialLat) && Number.isFinite(officialLon) && inGyeongbuk(officialLat, officialLon) ? officialLat : null,
          lon: Number.isFinite(officialLat) && Number.isFinite(officialLon) && inGyeongbuk(officialLat, officialLon) ? officialLon : null,
          term: String(k.pbnttmng || '').trim()
        });
      }
      process.stdout.write(`  ${sig} ${list.length}곳\n`);
    } catch (e) {
      failed.push(e.message);
      process.stdout.write(`  ${sig} — 실패\n`);
    }
  }

  if (failed.length) {
    console.error('\n✗ 받지 못한 시군이 있습니다:');
    failed.forEach(f => console.error('  · ' + f));
    console.error('\n  일부만 심으면 시군 합계가 조용히 틀립니다. 아무것도 고치지 않았습니다.');
    process.exit(1);
  }
  if (teacherNotices.size) {
    console.log('\n⚠ 유치원 교직원 API 안내:');
    teacherNotices.forEach(message => console.log('  · ' + message));
    console.log('  제공이 재개될 때 같은 스크립트를 다시 실행하면 교원 수가 함께 반영됩니다.');
  }

  /* 같은 이름이 여러 번 나오는지 봅니다 — 병설유치원은 이름이 겹칠 수 있지만
     «주소까지» 같으면 같은 곳입니다. 예전 판이 두 번 구워 1,228곳이 된 자리입니다. */
  const seen = new Set();
  const unique = rows.filter(r => {
    const k = r.name + '|' + r.addr;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const dropped = rows.length - unique.length;

  /* 공시 시기가 몇 년치나 섞여 있는지 — 낡은 것이 있으면 반드시 알립니다 */
  const byTerm = {};
  unique.forEach(r => { byTerm[r.term] = (byTerm[r.term] || 0) + 1; });
  const terms = Object.keys(byTerm).sort();
  const newest = terms[terms.length - 1];
  const stale = unique.filter(r => r.term !== newest).length;

  const withStu = unique.filter(r => r.stu > 0).length;
  const withTeacher = unique.filter(r => r.teach > 0).length;
  console.log(`\n받은 유치원 ${rows.length}곳` + (dropped ? ` (같은 곳 ${dropped}곳 걸러 ${unique.length}곳)` : ''));
  console.log(`원아 수가 있는 곳 ${withStu}곳 · 원아 0명 ${unique.length - withStu}곳`);
  console.log(`총 원아 ${unique.reduce((a, r) => a + r.stu, 0).toLocaleString()}명 · 총 학급 ${unique.reduce((a, r) => a + r.cls, 0).toLocaleString()}개`);
  console.log(`교원 수 확보 ${withTeacher}곳 / ${unique.length}곳`);
  console.log('\n공시 시기 — 유치원마다 다릅니다:');
  terms.forEach(t => console.log(`  ${t || '(없음)'} : ${byTerm[t]}곳` + (t === newest ? '  ← 가장 최근' : '')));
  if (stale) {
    console.log(`\n⚠ ${stale}곳이 ${newest} 보다 낡은 공시입니다.`);
    console.log('  낡은 공시에는 «지금 문 닫은 곳»이 그대로 남아 있을 수 있습니다.');
    console.log('  화면에 공시 시기를 함께 적어 보는 사람이 판단할 수 있게 합니다.');
  }

  /* 신규 기본현황의 공식 좌표를 우선하고, 없는 곳만 주소 지오코딩으로 보완합니다. */
  const missingOfficial = unique.filter(r => r.lat == null);
  console.log(`\n유치원알리미 공식 좌표 ${unique.length - missingOfficial.length}곳 · 보완 필요 ${missingOfficial.length}곳`);
  const geo = missingOfficial.length ? makeGeocoder() : null;
  let outside = 0;
  for (const r of missingOfficial) {
    const hit = r.addr ? await geo.lookup(r.addr) : null;
    if (hit && inGyeongbuk(hit.lat, hit.lon)) { r.lat = hit.lat; r.lon = hit.lon; }
    else { r.lat = null; r.lon = null; if (hit) outside++; }
  }
  if (geo) geo.save();
  const st = geo ? geo.stats() : {asked:0,fromCache:0,missed:0};
  const located = unique.filter(r => r.lat != null).length;
  console.log(`  물어본 주소 ${st.asked}개 · 캐시에서 ${st.fromCache}개 · 못 찾음 ${st.missed}개` +
    (outside ? ` · 경북 밖이라 버림 ${outside}개` : ''));
  console.log(`  좌표를 얻은 곳 ${located} / ${unique.length}곳`);

  if (DRY) {
    console.log('\n— 확인만 (--dry). 파일을 고치지 않았습니다.');
    console.log(unique.slice(0, 3).map(r => `  ${r.name} · ${r.s} · 원아 ${r.stu} · 학급 ${r.cls} · ${r.lat ? r.lat.toFixed(4) + ',' + r.lon.toFixed(4) : '좌표 없음'}`).join('\n'));
    return;
  }

  const esc = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const literal = unique.map(r =>
    `{name:'${esc(r.name)}',lv:'유',s:'${SIG_KO[r.s] || r.s}',addr:'${esc(r.addr)}',` +
    `lat:${r.lat == null ? 'null' : r.lat.toFixed(6)},lon:${r.lon == null ? 'null' : r.lon.toFixed(6)},` +
    `stu:${r.stu},cls:${r.cls},sped:${r.sped},teach:${r.teach},term:'${esc(r.term)}',est:false}`
  ).join(',\n');

  let html = fs.readFileSync(TARGET, 'utf8');

  /* ★ **갈아 끼웁니다. 덧붙이지 않습니다.** 예전 판이 덧붙이기만 해서
     두 번 돌리자 두 배가 됐습니다. 여기서는 `const KINDERGARTENS = [ … ];`
     통째로 바꾸므로 몇 번을 돌려도 결과가 같습니다.
     특수학교는 **다른 배열**(SPECIAL_SCHOOLS)이라 서로 지우지 않습니다. */
  const re = /const KINDERGARTENS = \[[\s\S]*?\n?\];/;
  const block = 'const KINDERGARTENS = [\n' + literal + '\n];';

  if (re.test(html)) html = html.replace(re, block);
  else {
    console.error('✗ 대시보드에서 `const KINDERGARTENS = [` 자리를 찾지 못했습니다.');
    process.exit(1);
  }

  fs.writeFileSync(TARGET, html, 'utf8');
  console.log(`\n✓ ${path.relative(path.resolve(HERE, '..'), TARGET)} 에 ${unique.length}곳을 심었습니다.`);
  console.log('  이어서: cd "06. 실행계획(1)/prototype" && node test.js');
}

main().catch(e => { console.error('✗ ' + e.message); process.exit(exitFor(e)); });
