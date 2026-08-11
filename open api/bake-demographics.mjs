/* ==========================================================================
   읍·면·동 단위 주민등록 인구 및 세대 현황을 받아 대시보드 및 앱 E에 심습니다
   행정안전부_도로명별 주민등록 인구 및 세대현황 API (data.go.kr) 활용

   apiType/Service: 1741000/rnPpltnHhStus/selectRnPpltnHhStus

   주요 수집 항목:
     - 시·도명 (ctpvNm) 및 시·군·구명 (sggNm)
     - 읍·면·동 / 도로명 단위 총 인구수, 세대수, 남/여 인구수
     - 경북 22개 시·군 (포항 남·북구 포함 23개 행정구역) 300여 읍·면·동 정밀 매핑

   사용법:
     node bake-demographics.mjs [인증키] [--statsYm=202601] [--curl] [--dry]
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const TARGETS = [
  '06. 실행계획(1)/prototype',
  '08. 실행계획(3)/apps/e-together'
].map(d => path.resolve(HERE, '../' + d + '/index.html'));

const ARGV = process.argv.slice(2);
const FLAGS = ARGV.filter(a => a.startsWith('--'));
const KNOWN = ['--curl', '--statsYm', '--dry', '--help', '-h'];
const bad = FLAGS.filter(f => !KNOWN.includes(f.split('=')[0]));
if (ARGV.includes('--help') || ARGV.includes('-h') || bad.length) {
  if (bad.length) console.error('모르는 깃발: ' + bad.join(' ') + '\n');
  console.log('쓰는 법: node bake-demographics.mjs [인증키] [--statsYm=202601] [--curl] [--dry]');
  console.log('  인증키를 생략하면 같은 폴더의 인증키.txt 에서 행안부 키를 읽습니다.');
  console.log('  --statsYm  통계년월 (기본 202601). YYYYMM 형식.');
  console.log('  --curl     사내망 인증서 문제로 https 요청이 막힐 때.');
  console.log('  --dry      받기만 하고 파일은 고치지 않습니다.');
  console.log('  고치는 곳: ' + TARGETS.map(t => path.basename(path.dirname(t))).join(' · '));
  process.exit(bad.length ? 1 : 0);
}

const ARG = ARGV[0] && !ARGV[0].startsWith('--') ? ARGV[0] : null;
const USE_CURL = ARGV.includes('--curl');
const DRY = ARGV.includes('--dry');
const STATS_YM = (ARGV.find(a => a.startsWith('--statsYm=')) || '--statsYm=202401').split('=')[1];

if (!/^\d{6}$/.test(STATS_YM)) { console.error('통계년월(statsYm) 형식이 이상합니다: ' + STATS_YM); process.exit(1); }

const KEYFILE = path.resolve(HERE, '인증키.txt');
function keyFromFile() {
  try {
    const lines = fs.readFileSync(KEYFILE, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (trimmed.length > 40 || trimmed.includes('%')) {
        return trimmed;
      }
    }
    return null;
  } catch (e) { return null; }
}

const KEY = ARG || keyFromFile();
if (!KEY) {
  console.error('행정안전부 API 인증키가 없습니다.');
  console.error('  · ' + KEYFILE + ' 에 키를 넣거나');
  console.error('  · node bake-demographics.mjs <인증키> 로 주세요.');
  process.exit(1);
}

console.log('행안부 인구 API 키: …' + KEY.slice(-8));
console.log('통계년월: ' + STATS_YM + (DRY ? '  · 확인만 하고 파일은 고치지 않습니다' : ''));

const SGG = {
  47111: '포항시 남구', 47113: '포항시 북구', 47130: '경주시', 47150: '김천시',
  47170: '안동시', 47190: '구미시', 47210: '영주시', 47230: '영천시',
  47250: '상주시', 47280: '문경시', 47290: '경산시', 47730: '의성군',
  47750: '청송군', 47760: '영양군', 47770: '영덕군', 47820: '청도군',
  47830: '고령군', 47840: '성주군', 47850: '칠곡군', 47900: '예천군',
  47920: '봉화군', 47930: '울진군', 47940: '울릉군'
};

async function fetchOnce(url) {
  if (USE_CURL) {
    const out = execFileSync('curl', ['-s', '-k', '--max-time', '60', url], { encoding: 'utf8' });
    return JSON.parse(out);
  }
  const res = await fetch(url);
  return res.json();
}

async function get(url) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try { return await fetchOnce(url); }
    catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 1500)); }
  }
  throw lastErr;
}

const n = v => (v == null || v === '' ? 0 : Math.round(+v) || 0);

const demographics = new Map(); // "sggName|dongName" -> { pop, households, male, female }
let calls = 0, rows = 0, failed = 0;

for (const [sggCode, sggName] of Object.entries(SGG)) {
  const url = `https://apis.data.go.kr/1741000/rnPpltnHhStus/selectRnPpltnHhStus?serviceKey=${KEY}&pageNo=1&numOfRows=100&type=json&statsYm=${STATS_YM}&sigunguCd=${sggCode}`;
  let data;
  try {
    data = await get(url);
    calls++;
  } catch (e) {
    failed++;
    console.error(`  ✗ ${sggName}(${sggCode}) 요청 실패: ${String(e).slice(0, 60)}`);
    continue;
  }

  const items = data?.Response?.items?.item || data?.items || [];
  const list = Array.isArray(items) ? items : [items].filter(Boolean);
  for (const item of list) {
    const dong = item.emdNm || item.rnNm || item.roadNm || '기타';
    const pop = n(item.totPpltnCnt || item.pop);
    const hh = n(item.hhCnt || item.households);
    const male = n(item.mPpltnCnt || item.male);
    const female = n(item.fPpltnCnt || item.female);

    const key = `${sggName}|${dong}`;
    if (!demographics.has(key)) {
      demographics.set(key, { pop, hh, male, female });
    } else {
      const cur = demographics.get(key);
      cur.pop += pop; cur.hh += hh; cur.male += male; cur.female += female;
    }
    rows++;
  }

  await new Promise(r => setTimeout(r, 100));
}

console.log(`✓ ${calls}개 시·군 구역 조회 완료 (${rows}개 도로/동 수집됨, 실패 ${failed}건)`);
const totalPop = [...demographics.values()].reduce((acc, d) => acc + d.pop, 0);
console.log(`  경북 수집 인구 총계: ${totalPop.toLocaleString('ko-KR')}명 (${demographics.size}개 읍면동/구역)`);

if (DRY) {
  console.log('DRY 깃발로 인해 파일 심기를 수행하지 않고 종료합니다.');
  process.exit(0);
}

// ── 심기 (Update targets) ──────────────────────────────────────────────
let updatedCount = 0;
for (const targetPath of TARGETS) {
  if (!fs.existsSync(targetPath)) {
    console.warn(`  ⚠ 대상 파일 없음: ${targetPath}`);
    continue;
  }

  let content = fs.readFileSync(targetPath, 'utf8');

  // DEMO_RAW 블록이 없으면 추가, 있으면 갱신
  const formattedObj = JSON.stringify(Object.fromEntries(demographics));
  const snippet = `window.DEMO_RAW = ${formattedObj};`;

  if (content.includes('window.DEMO_RAW =')) {
    content = content.replace(/window\.DEMO_RAW\s*=\s*\{.*?\};/s, snippet);
  } else {
    // </head> 바로 전에 삽입
    content = content.replace('</head>', `<script>\n${snippet}\n</script>\n</head>`);
  }

  fs.writeFileSync(targetPath, content, 'utf8');
  updatedCount++;
  console.log(`  ✓ ${path.basename(path.dirname(targetPath))} 에 DEMO_RAW 사전 굽기 완료`);
}

console.log(`전체 ${updatedCount}개 파일 갱신 완료.`);
