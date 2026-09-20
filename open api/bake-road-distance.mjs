/* ==========================================================================
   직선거리 → 실제 도로 거리·시간 (카카오모빌리티 길찾기)

   왜 필요한가
     대시보드는 여태 두 점 사이를 자로 잰 **직선거리**를 썼습니다. 경북은
     산이 많아 그 값이 실제와 크게 어긋납니다. 직접 재 보니 이렇습니다.

       영양읍 → 안동영명학교   직선 36km  →  도로 63km (1.73배) · 1시간 6분
       봉화읍 → 안동영명학교   직선 36km  →  도로 57km (1.59배) · 1시간 3분
       울진읍 → 안동영명학교   직선 75km  → 도로 104km (1.39배) · 1시간 40분

     숫자가 정확해지는 것보다 **이야기가 달라지는 것**이 큽니다. 「36km」는
     멀다는 느낌만 주지만 「편도 1시간 6분」은 통학이 되는지 안 되는지를
     바로 말해 줍니다.

   ★ 화면에서 부르지 않고 **미리 구워 둡니다**
     키가 브라우저로 나가지 않고, 사람이 많이 들어와도 호출이 늘지 않습니다.
     하루 10만 건이 무료인데 우리가 쓰는 것은 아래 두 묶음뿐입니다.

       ① 시군 22곳 → 가장 가까운 특수학교        (spedAccess 가 쓰는 값)
       ② 학교 → 같은 학교급 가장 가까운 3곳      (지도의 「가까운 학교」 선)

     ②는 학교가 1,539곳이라 다 재면 4,600건입니다. 한도의 5% 이내입니다.

   ★ 받은 것을 **캐시에 적어 둡니다**
     `data/road-cache.json` 에 「출발,도착 → {km, min}」 를 쌓습니다.
     다시 구울 때 이미 아는 짝은 묻지 않습니다. geocode-cache.json 과 같은
     생각입니다 — **다시 구울 때마다 결과가 달라지면 안 됩니다.**

   ★ 길이 없으면 **없다고 적습니다**
     울릉은 육로가 없어 길찾기가 실패합니다. 그럴 때 직선거리로 슬쩍
     메우지 않습니다. `null` 로 두면 화면이 「육로 없음」이라 적습니다.
     여기서 지어내면 「배로 가야 하는 곳」이 「차로 갈 수 있는 곳」이 됩니다.

   쓰는 법
     node "open api/bake-road-distance.mjs"         인증키.txt 에서 열쇠를 읽습니다
     node "open api/bake-road-distance.mjs" --dry   받기만 하고 파일은 안 고칩니다
     node "open api/bake-road-distance.mjs" --sped  시군→특수학교만 (빠른 확인)
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.resolve(HERE, '../06. 실행계획(1)/prototype/index.html');
const CACHE = path.resolve(HERE, 'data/road-cache.json');
const ARGV = process.argv.slice(2);
const DRY = ARGV.includes('--dry');
const SPED_ONLY = ARGV.includes('--sped');

/* ── 열쇠 ── 카카오 로컬(주소→좌표)과 **같은 REST 키**를 씁니다.
   길찾기는 따로 신청할 것이 없습니다 — 같은 키로 바로 열립니다. */
function readKey() {
  const raw = fs.readFileSync(path.resolve(HERE, '인증키.txt'), 'utf8');
  const line = raw.split('\n').find(l => /카카오/.test(l) && !l.trim().startsWith('#') && /[0-9a-fA-F]{32}/.test(l))
            || raw.split('\n').find(l => /카카오/i.test(l) && /[0-9a-fA-F]{32}/.test(l));
  const hit = (line || '').match(/[0-9a-fA-F]{32}/);
  if (!hit) throw new Error('인증키.txt 에서 카카오 REST 열쇠를 찾지 못했습니다.');
  return hit[0];
}

const KEY = process.env.KAKAO_REST_KEY || readKey();

/* ★ 섬은 길찾기에 묻지 않습니다 〔2026. 9. 20.〕
   울릉 중심 → 포항명도학교를 물었더니 «260km · 4시간»이 result_code 0 으로
   돌아왔습니다. 출발점이 육지로 끌려간 것도 아니었습니다(좌표 그대로).
   바다 위를 직선으로 이은 값을 길이라고 내어 준 것입니다.

   그대로 쓰면 「배로 가야 하는 곳」이 「차로 4시간이면 가는 곳」이 됩니다.
   그 한 줄이 정책 판단을 바꿉니다. API 가 성공이라 답해도 우리가 압니다 —
   울릉은 섬입니다. 묻지 않고 null 로 둡니다.
   (화면은 이미 `island` 를 알고 있어 「육로 없음」이라 적습니다.) */
const ISLANDS = new Set(['울릉']);

/* ── 캐시 ───────────────────────────────────────────────────────────────── */
let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { cache = {}; }
let asked = 0, hitCache = 0, failed = 0;

const keyOf = (a, b) => `${a.lon.toFixed(5)},${a.lat.toFixed(5)}>${b.lon.toFixed(5)},${b.lat.toFixed(5)}`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * 두 점 사이 «길을 따라간» 거리와 시간.
 * 길이 없으면 null 을 돌려줍니다 — 직선으로 메우지 않습니다.
 */
async function road(a, b) {
  const k = keyOf(a, b);
  if (k in cache) { hitCache++; return cache[k]; }
  const url = 'https://apis-navi.kakaomobility.com/v1/directions'
    + `?origin=${a.lon},${a.lat}&destination=${b.lon},${b.lat}&priority=RECOMMEND`;
  for (let tries = 0; tries < 3; tries++) {
    try {
      asked++;
      const r = await fetch(url, { headers: { Authorization: 'KakaoAK ' + KEY } });
      if (r.status === 429) { await sleep(1200 * (tries + 1)); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      const rt = d.routes && d.routes[0];
      /* result_code 0 이 아니면 «길이 없다»는 뜻입니다(울릉 등). 실패가 아닙니다. */
      const val = (rt && rt.result_code === 0 && rt.summary)
        ? { km: +(rt.summary.distance / 1000).toFixed(1), min: Math.round(rt.summary.duration / 60) }
        : null;
      cache[k] = val;
      return val;
    } catch (e) {
      if (tries === 2) { failed++; console.error('  ✗ ' + k + ' — ' + e.message); return undefined; }
      await sleep(700 * (tries + 1));
    }
  }
  return undefined;
}

/* ── 대시보드에서 학교·시군을 읽어 옵니다 ──────────────────────────────────
   따로 목록을 두면 두 곳이 어긋납니다. 심는 파일에서 그대로 읽습니다. */
function readFromDashboard() {
  const html = fs.readFileSync(TARGET, 'utf8');
  const grab = name => {
    /* `const SIGUNGU =` 뒤에 줄바꿈이 오는 것도 있어 «= 다음 첫 [» 를 찾습니다.
       `const X = [` 만 찾았더니 SIGUNGU 를 놓쳤습니다. */
    const m = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*\\[`).exec(html);
    if (!m) throw new Error(`${name} 을 찾지 못했습니다.`);
    const i = m.index;
    let d = 0, st = html.indexOf('[', i), j = st;
    for (; j < html.length; j++) {
      if (html[j] === '[') d++;
      else if (html[j] === ']') { d--; if (!d) break; }
    }
    return html.slice(st, j + 1);
  };
  /* SIGUNGU 는 배열 리터럴이 아니라 REGION_GEO 에서 만들어집니다.
     시군 중심 좌표는 REGION_GEO 의 lon·lat 이 그대로 그 값입니다. */
  const code = `const KINDERGARTENS=${grab('KINDERGARTENS')};`
             + `const SPECIAL_SCHOOLS=${grab('SPECIAL_SCHOOLS')};`
             + `const SCHOOLS=${grab('SCHOOLS')};`
             + `const REGION_GEO=${grab('REGION_GEO')};`
             + `const SIGUNGU=REGION_GEO.map(r=>({name:r.n,s:r.s,rc:r.c,lon:r.lon,lat:r.lat}));`
             + `({SCHOOLS,SIGUNGU,SPECIAL_SCHOOLS})`;
  // eslint-disable-next-line no-eval
  const out = eval(code);

  /* ★ 초·중·고 917곳은 «배열에 없습니다» 〔2026. 9. 20.〕
     SCHOOLS 는 유치원과 특수학교만 담은 리터럴이고, 초·중·고는 화면이 뜰 때
     SCHOOL_RAW 를 풀어서 밀어 넣습니다. 그것을 모르고 구웠더니 622곳만
     잡혔습니다. 같은 방식으로 여기서도 풉니다.
       기록 꼴:  이름*|급|주소|위도|경도     (`*` 자리에 「초등학교」 따위가 들어갑니다) */
  const rawTxt = (() => {
    const m = /var SCHOOL_RAW = \{/.exec(html);
    if (!m) throw new Error('SCHOOL_RAW 를 찾지 못했습니다.');
    let d = 0, st = html.indexOf('{', m.index), j = st;
    for (; j < html.length; j++) {
      if (html[j] === '{') d++;
      else if (html[j] === '}') { d--; if (!d) break; }
    }
    return html.slice(st, j + 1);
  })();
  // eslint-disable-next-line no-eval
  const RAW = eval('(' + rawTxt + ')');
  const FULL = { e: '초등학교', m: '중학교', h: '고등학교' };
  const KIND = { e: '초', m: '중', h: '고' };
  const byCode = {}; out.SIGUNGU.forEach(sg => { byCode[sg.rc] = sg; });
  for (const rc of Object.keys(RAW)) {
    const sg = byCode[rc];
    for (const rec of String(RAW[rc]).split(';')) {
      if (!rec.trim()) continue;
      const f = rec.split('|');
      out.SCHOOLS.push({
        name: f[0].replace('*', FULL[f[1]]), lv: KIND[f[1]], s: sg ? sg.s : '',
        lat: f[3] ? +f[3] : null, lon: f[4] ? +f[4] : null
      });
    }
  }
  return out;
}

function fmtMin(m) {
  if (m == null) return '—';
  return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;
}

async function main() {
  console.log('인증키: 인증키.txt (…' + KEY.slice(-6) + ')');
  const { SCHOOLS, SIGUNGU, SPECIAL_SCHOOLS } = readFromDashboard();
  const sped = SPECIAL_SCHOOLS.filter(s => s.lat && s.lon);
  console.log(`읽음 — 학교 ${SCHOOLS.length}곳 · 시군 ${SIGUNGU.length}곳 · 특수학교 ${sped.length}곳\n`);

  /* ① 시군 → 가장 가까운 특수학교. «직선으로 가장 가까운 곳»이 아니라
     길로도 가장 가까운 곳을 찾아야 하므로 특수학교 여덟 곳을 다 재고 고릅니다.
     22 × 8 = 176 건. */
  console.log('① 시군 → 특수학교 (22 × ' + sped.length + ')');
  const spedOut = {};
  for (const sg of SIGUNGU) {
    if (ISLANDS.has(sg.s)) {
      spedOut[sg.s] = null;
      console.log(`   ${sg.s.padEnd(4)} 육로 없음 (섬 — 묻지 않습니다)`);
      continue;
    }
    let best = null;
    for (const s of sped) {
      const v = await road({ lat: sg.lat, lon: sg.lon }, { lat: s.lat, lon: s.lon });
      if (v && (!best || v.km < best.km)) best = { ...v, at: s.name };
    }
    spedOut[sg.s] = best;
    console.log(`   ${sg.s.padEnd(4)} ${best ? `${String(best.km).padStart(6)}km · ${fmtMin(best.min).padStart(9)} · ${best.at}` : '육로 없음'}`);
  }

  /* ② 학교 → 같은 학교급 가장 가까운 3곳.
     길찾기를 1,539 × 전부 돌릴 수는 없으므로, 직선으로 가까운 6곳을 뽑아
     그 여섯만 길로 재고 상위 3곳을 남깁니다. 산을 돌아가는 바람에 순서가
     바뀌는 일은 그 여섯 안에서 거의 다 잡힙니다. */
  const nearOut = {};
  if (!SPED_ONLY) {
    const hav = (a, b, c, d) => {
      const R = 6371, r = x => x * Math.PI / 180;
      const x = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
      return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
    };
    const pool = SCHOOLS.filter(s => s.lat != null && s.lon != null);
    console.log(`\n② 학교 → 같은 급 가까운 3곳 (${pool.length}곳 × 6 후보)`);
    let n = 0;
    for (const sc of pool) {
      /* ★ 바다를 건너는 짝은 묻지 않습니다 〔2026. 9. 21.〕
         울릉중학교는 섬에 같은 급 학교가 하나뿐이라 본토 학교가 후보로 올라왔고,
         길찾기가 「214km · 3시간 32분」을 성공으로 돌려주었습니다. 시군 단위에서
         겪은 것과 같은 일입니다 — 바다 위를 이은 값입니다.
         섬과 뭍은 짝지우지 않습니다. 남는 것이 없으면 그대로 비워 두고,
         화면이 「바다 건너」라고 적습니다. */
      const onIsland = ISLANDS.has(sc.s);
      const cands = pool
        .filter(x => x !== sc && x.lv === sc.lv && ISLANDS.has(x.s) === onIsland)
        .map(x => ({ x, d: hav(sc.lat, sc.lon, x.lat, x.lon) }))
        .sort((a, b) => a.d - b.d).slice(0, 6);
      const got = [];
      for (const c of cands) {
        const v = await road({ lat: sc.lat, lon: sc.lon }, { lat: c.x.lat, lon: c.x.lon });
        if (v) got.push({ name: c.x.name, km: v.km, min: v.min });
      }
      got.sort((a, b) => a.km - b.km);
      if (got.length) nearOut[sc.name] = got.slice(0, 3);
      if (++n % 100 === 0) {
        console.log(`   ${n}/${pool.length}곳 (물어봄 ${asked} · 캐시 ${hitCache})`);
        fs.mkdirSync(path.dirname(CACHE), { recursive: true });
        fs.writeFileSync(CACHE, JSON.stringify(cache), 'utf8');
      }
    }
  }

  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(cache), 'utf8');
  console.log(`\n물어봄 ${asked} · 캐시에서 ${hitCache} · 실패 ${failed}`);

  if (DRY) { console.log('\n--dry 라 파일은 고치지 않았습니다.'); return; }

  const stamp = new Date().toISOString().slice(0, 10);
  const meta = { 만든때: stamp, 출처: '카카오모빌리티 길찾기 API', 기준: '승용차·평시·권장 경로' };
  const block = 'var ROAD_META = ' + JSON.stringify(meta) + ';\n'
    + '  var ROAD_SPED = ' + JSON.stringify(spedOut) + ';\n'
    + '  var ROAD_NEAR = ' + JSON.stringify(nearOut) + ';';
  let html = fs.readFileSync(TARGET, 'utf8');
  const re = /var ROAD_META = [\s\S]*?var ROAD_NEAR = [\s\S]*?;/;
  if (re.test(html)) html = html.replace(re, block);
  else {
    const anchor = '  var EDSS_META  = ';
    const i = html.indexOf(anchor);
    if (i < 0) { console.error('✗ 심을 자리를 찾지 못했습니다.'); process.exit(1); }
    html = html.slice(0, i) + '  ' + block + '\n' + html.slice(i);
  }
  fs.writeFileSync(TARGET, html, 'utf8');
  const spedOk = Object.values(spedOut).filter(Boolean).length;
  console.log(`\n✓ 심었습니다 — 시군 ${spedOk}/${SIGUNGU.length}곳 · 학교 ${Object.keys(nearOut).length}곳`);
  console.log('  이어서: cd "06. 실행계획(1)/prototype" && node test.js');
}

main().catch(e => { console.error('✗ ' + e.message); process.exit(1); });
