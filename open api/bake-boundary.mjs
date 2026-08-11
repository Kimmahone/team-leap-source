#!/usr/bin/env node
/* 시군 경계 굽기 — 행정경계 GeoJSON → 앱 안의 SVG path
   ---------------------------------------------------------------------------
   지금까지 지도는 **점**이었습니다. 시군 한 곳이 원 하나였습니다.
   이 스크립트는 진짜 경계선을 넣습니다. 넣는 방식은 좌표를 굽는 것과 같습니다 —
   **만드는 사람이 한 번 받고, 앱은 인터넷을 안 씁니다.**

   쓰는 법
     node bake-boundary.mjs <행정경계 GeoJSON 경로>
     node bake-boundary.mjs ~/Downloads/skorea-municipalities-2018-geo.json

   결과
     open api/data/gyeongbuk-boundary.json   ← 시군 이름 → SVG path 문자열
     화면에 붙여 넣을 준비가 된 형태입니다. 앱에 심는 것은 별도 단계입니다.

   어디서 받나
     같은 폴더의 「지도 경계 굽는 법.md」 참고.
     지금 쓰고 있는 것은 통계청 SGIS 자료(공공누리 제1유형)를 옮겨 둔 것입니다.

   외부 라이브러리를 쓰지 않습니다
     mapshaper 도 turf 도 없이 노드 기본만으로 합니다. 하는 일은 세 가지뿐입니다 —
     **고르고, 점을 줄이고, 화면 좌표로 옮기기.** 원칙 1번과 같은 정신입니다.
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* ── 무엇을 고를 것인가 ───────────────────────────────────────────────
   자료마다 시도 코드가 다릅니다. 통계청(SGIS) 계열은 경북이 **37**,
   행정안전부·국토부 계열은 **47** 입니다. 둘 다 받습니다.

   군위군은 **뺍니다.** 2023. 7. 1. 로 대구광역시로 넘어갔습니다.
   2018년 자료에는 아직 경북으로 들어 있어서, 그냥 두면 지도에만 남는
   시군이 하나 생깁니다 (학교 목록에는 없습니다).                            */
const SIDO_PREFIX = ['37', '47'];
const DROP = ['군위'];

/* 포항시는 자료에 **남구·북구로 쪼개져** 있습니다. 학교 목록은 「포항」 하나이므로
   두 도형을 한 이름 아래 모읍니다 (경계선은 그대로 둡니다 — 구 경계가 보이는 편이
   실제에 가깝고, 지우려면 위상 연산이 필요해 코드가 몇 배로 늘어납니다). */
const MERGE = [
  [/^포항시.*$/, '포항'],        // 「포항시남구」·「포항시북구」 → 둘 다 「포항」
  [/^(.+?)(시|군)$/, '$1']       // 「안동시」 → 「안동」. 학교 목록의 표기에 맞춥니다.
];

/* 울릉군은 본토에서 멀어 **축척이 다릅니다.** 따로 굽습니다 (지금 점 지도와 같은 처리). */
const APART = '울릉';

/* ── 점 줄이기 (Douglas-Peucker) ──────────────────────────────────────
   원본은 1미터 단위입니다. 화면에서는 300픽셀에 경북 전체를 그립니다.
   그 정밀도는 **파일만 무겁게 하고 화면에는 보이지 않습니다.**            */
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  let maxD = 0, idx = 0;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay;
  const den = dx * dx + dy * dy;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    // 선분까지의 수직 거리. den 이 0 이면 두 끝점이 같은 자리라 그냥 점 사이 거리입니다.
    const d = den === 0
      ? Math.hypot(px - ax, py - ay)
      : Math.abs(dy * px - dx * py + bx * ay - by * ax) / Math.sqrt(den);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= tol) return [pts[0], pts[pts.length - 1]];
  return simplify(pts.slice(0, idx + 1), tol).slice(0, -1)
    .concat(simplify(pts.slice(idx), tol));
}

/* ── 들어오기 ─────────────────────────────────────────────────────── */
const src = process.argv[2];
if (!src) {
  console.error('쓰는 법: node bake-boundary.mjs <행정경계 GeoJSON 경로>');
  console.error('어디서 받는지는 같은 폴더의 「지도 경계 굽는 법.md」 를 보세요.');
  process.exit(1);
}
if (!fs.existsSync(src)) { console.error('✗ 파일이 없습니다: ' + src); process.exit(1); }

const gj = JSON.parse(fs.readFileSync(src, 'utf8'));
if (!gj.features) { console.error('✗ GeoJSON FeatureCollection 이 아닙니다.'); process.exit(1); }

/* 속성 칸 이름이 자료마다 다릅니다 (name · SIG_KOR_NM · sigungu_nm …).
   있는 것 중에 한글이 든 칸을 씁니다. */
const pick = (p, keys) => { for (const k of keys) if (p[k] != null) return String(p[k]); return ''; };
const NAME_KEYS = ['name', 'SIG_KOR_NM', 'sigungu_nm', 'SIGUNGU_NM', 'adm_nm', 'NAME'];
const CODE_KEYS = ['code', 'SIG_CD', 'sigungu_cd', 'SIGUNGU_CD', 'adm_cd', 'CODE'];

const groups = new Map();                 // 이름 → 링(폴리곤) 목록
let seen = 0;
for (const f of gj.features) {
  const p = f.properties || {};
  const code = pick(p, CODE_KEYS);
  if (!SIDO_PREFIX.some(s => code.startsWith(s))) continue;

  let name = pick(p, NAME_KEYS);
  for (const [re, to] of MERGE) if (re.test(name)) { name = name.replace(re, to); break; }
  if (DROP.includes(name)) continue;
  seen++;

  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates]
              : g.type === 'MultiPolygon' ? g.coordinates : [];
  const rings = groups.get(name) || [];
  // 각 폴리곤의 **바깥 링만** 씁니다. 구멍(내부 링)은 시군 경계에서 거의 없고,
  // 있어도 300픽셀 지도에서는 보이지 않습니다.
  for (const poly of polys) if (poly[0] && poly[0].length > 3) rings.push(poly[0]);
  groups.set(name, rings);
}

if (!groups.size) {
  console.error('✗ 경상북도 시군을 하나도 못 찾았습니다.');
  console.error('  속성 칸을 확인하세요. 첫 항목의 properties:');
  console.error('  ' + JSON.stringify((gj.features[0] || {}).properties));
  process.exit(1);
}

/* ── 다듬기 ───────────────────────────────────────────────────────── */
const TOL = 0.0016;        // 도(degree) 단위. 경북 폭이 약 1.5도이므로 대략 1/900.
const MIN_PTS = 6;         // 이보다 점이 적게 남으면 섬이 아니라 잡티입니다.

function ringArea(r) {     // 신발끈 공식. 부호는 버리고 크기만 씁니다.
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
}

const shaped = new Map();
for (const [name, rings] of groups) {
  const big = ringArea(Math.max(...rings.map(r => ringArea(r))) === 0 ? rings[0]
              : rings.reduce((a, b) => ringArea(a) >= ringArea(b) ? a : b));
  const kept = rings
    // 가장 큰 섬의 1/400 보다 작은 조각은 버립니다. 화면에서 한 점도 안 됩니다.
    .filter(r => ringArea(r) >= big / 400)
    .map(r => simplify(r, TOL))
    .filter(r => r.length >= MIN_PTS);
  if (kept.length) shaped.set(name, kept);
}

/* ── 담기 ─────────────────────────────────────────────────────────────
   **화면 좌표로 미리 옮기지 않습니다.** 위경도 그대로 담습니다.
   네 곳의 지도가 저마다 다른 크기·다른 범위를 쓰기 때문입니다
   (대시보드는 620×470, 앱 C 는 해안선까지 그리고, 시군 상세는 한 시군만 확대합니다).
   미리 옮겨 두면 그중 한 곳에만 맞고 나머지는 어긋납니다.

   대신 **차이값으로 접습니다.**
     첫 점만 1/10000도 단위 정수로 적고, 그다음부터는 앞 점과의 차이만 적습니다.
     경계선의 이웃한 두 점은 아주 가까워서 차이는 대개 한두 자리입니다.
     같은 자료가 3분의 1 크기가 됩니다.

     "1287361 368864 12 -4 7 -9 …"   ← 첫 두 개는 절대값, 그다음은 차이
     링(섬)이 여럿이면 `|` 로 나눕니다.                                      */
const U = 1e4;
function pack(rings) {
  return rings.map(r => {
    let x = Math.round(r[0][0] * U), y = Math.round(r[0][1] * U);
    const out = [x, y];
    for (let i = 1; i < r.length; i++) {
      const nx = Math.round(r[i][0] * U), ny = Math.round(r[i][1] * U);
      out.push(nx - x, ny - y);
      x = nx; y = ny;
    }
    return out.join(' ');
  }).join('|');
}

const mainland = [...shaped.keys()].filter(n => n !== APART).sort();
const order = mainland.concat(shaped.has(APART) ? [APART] : []);
const packed = {};
for (const n of order) packed[n] = pack(shaped.get(n));

/* 앱 안에 들어갈 조각. 한 줄에 시군 하나씩이라 어디가 바뀌었는지 눈으로 보입니다. */
const snippet =
  '/* 경상북도 시군 경계 — 통계청 SGIS 행정경계(공공누리 제1유형) 2018.\n' +
  '   군위군은 2023.7.1. 대구 편입으로 뺐습니다. 구운 날 ' + new Date().toISOString().slice(0, 10) + '.\n' +
  '   이 블록은 손으로 고치지 마세요 — `open api/bake-boundary.mjs` 가 통째로 갈아 끼웁니다.\n' +
  '   읽는 법은 같은 파일의 gbRings() 에 있습니다. */\n' +
  'var GB_POLY = {\n' +
  order.map(n => "  '" + n + "': '" + packed[n] + "'").join(',\n') +
  '\n};';

/* ── 심기 ─────────────────────────────────────────────────────────────
   좌표를 굽는 것과 같은 규칙입니다 — **한 곳만 고치면 나머지가 조용히 낡습니다.**  */
const TARGETS = [
  '06. 실행계획(1)/prototype/index.html',   // 대시보드 — 시군별 분포
  'index.html',                             // 메인 — 작은 지도
  '08. 실행계획(3)/apps/c-storybook/index.html',
  '08. 실행계획(3)/apps/e-together/index.html',
  '08. 실행계획(3)/apps/a-circuit/index.html'   // 순회교사 시간표 — 담당 학교 지도
];
const ROOT = path.join(HERE, '..');
/* 표시는 **줄 앞 공백을 빼고** 찾습니다. 네 파일의 들여쓰기가 제각각이라
   공백까지 맞추라고 하면 심을 자리를 못 찾고 조용히 넘어갑니다. */
const BEGIN = '/* === 시군 경계 (구운 자료) === */';
const END   = '/* === 시군 경계 끝 === */';

let planted = 0, missing = [];
for (const t of TARGETS) {
  const file = path.join(ROOT, t);
  if (!fs.existsSync(file)) { missing.push(t + ' (파일 없음)'); continue; }
  const s = fs.readFileSync(file, 'utf8');
  const i = s.indexOf(BEGIN), j = s.indexOf(END);
  if (i < 0 || j < 0) { missing.push(t + ' (심을 자리 표시가 없음)'); continue; }
  if (j < i) { missing.push(t + ' (끝 표시가 시작 표시보다 앞에 있음)'); continue; }
  // 그 파일이 쓰는 들여쓰기를 그대로 따릅니다.
  const ind = s.slice(s.lastIndexOf('\n', i) + 1, i);
  const body = snippet.split('\n').map(l => l ? ind + l : l).join('\n');
  fs.writeFileSync(file, s.slice(0, i) + BEGIN + '\n' + body + '\n' + ind + s.slice(j));
  planted++;
}

const bytes = Buffer.byteLength(snippet, 'utf8');
console.log('✓ 시군 ' + mainland.length + '곳' + (shaped.has(APART) ? ' + 울릉' : '') +
            '  (원본 항목 ' + seen + '개를 모았습니다)');
console.log('  점 ' + [...shaped.values()].flat().reduce((a, r) => a + r.length, 0) +
            '개 · 앱마다 ' + (bytes / 1024).toFixed(1) + 'KB');
console.log('  심은 곳 ' + planted + '/' + TARGETS.length);
if (missing.length) {
  console.log('\n⚠ 심지 못한 곳:');
  missing.forEach(m => console.log('  · ' + m));
  console.log('  파일 안에 아래 두 줄이 있어야 그 사이를 갈아 끼웁니다:');
  console.log('    ' + BEGIN);
  console.log('    ' + END);
}
process.exit(missing.length ? 1 : 0);
