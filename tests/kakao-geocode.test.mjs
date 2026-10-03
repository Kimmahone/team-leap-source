/* 「카카오 열쇠가 없어도 정기 갱신이 멈추지 않는가」를 봅니다.

   ★ 〔2026. 10. 2.〕 분기 정기 갱신에서 유치원 한 곳(화천초병설유치원)이 공식
     좌표 없이 왔습니다. 그 주소는 캐시에 이미 있었는데도, 지오코더가 만들어지는
     순간 인증키.txt 부터 찾다가 Actions 에서 갱신 전체가 멈췄습니다.
     여기서는 열쇠가 «없는» 상태를 일부러 만들어 놓고 돌려 봅니다.
     카카오에는 실제로 묻지 않습니다. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeGeocoder, kakaoKey, inGyeongbuk } from '../open api/kakao-geocode.mjs';

let pass = 0, fail = 0;
const check = (name, ok) => { if (ok) pass++; else { fail++; console.error('✗ ' + name); } };

delete process.env.KAKAO_REST_API_KEY;        // 이 검사는 «열쇠 없음»에서 출발합니다

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'geocode-test-'));
const cacheFile = path.join(tmp, 'geocode-cache.json');
const KNOWN = '경상북도 울릉군 남양1길 42-27';
const UNKNOWN = '경상북도 어딘가 없는길 1';
fs.writeFileSync(cacheFile, JSON.stringify({ [KNOWN]: { lat: 37.47, lon: 130.86 } }));

const noKey = () => { throw new Error('인증키.txt 를 읽지 못했습니다'); };

/* ① 캐시로 답할 수 있으면 열쇠를 찾지도 않습니다. */
{
  let keyAsked = 0;
  const geo = makeGeocoder({ cacheFile, getKey: () => { keyAsked++; return noKey(); }, say: () => {} });
  const hit = await geo.lookup(KNOWN);
  check('캐시에 있는 주소는 열쇠 없이 돌려준다', hit && hit.lat === 37.47 && hit.lon === 130.86);
  check('캐시로 답할 때는 열쇠를 찾지 않는다', keyAsked === 0);
}

/* ② 열쇠가 없고 캐시에도 없으면 멈추지 않고 비워 둡니다. 경고는 한 번만. */
{
  const said = [];
  const geo = makeGeocoder({ cacheFile, getKey: noKey, say: m => said.push(m) });
  let threw = false, a = 'x', b = 'x';
  try { a = await geo.lookup(UNKNOWN); b = await geo.lookup(UNKNOWN + '-2'); } catch (e) { threw = true; }
  check('열쇠가 없어도 멈추지 않는다', !threw);
  check('찾지 못한 주소는 null 로 비워 둔다 (지어내지 않는다)', a === null && b === null);
  check('비워 둔 수를 센다', geo.stats().skipped === 2 && geo.stats().asked === 0);
  check('열쇠가 없다는 경고는 한 번만', said.length === 1 && /카카오 열쇠가 없어/.test(said[0]));

  /* ③ 열쇠가 없어서 못 물은 것은 「못 찾음」이 아닙니다. 캐시에 적으면
        열쇠가 생긴 다음에도 영영 다시 묻지 않게 됩니다. */
  geo.save();
  const saved = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  check('열쇠 없이 비운 주소는 캐시에 적지 않는다', !(UNKNOWN in saved) && (KNOWN in saved));
}

/* ④ Actions 에는 인증키.txt 가 없으므로 환경변수를 먼저 봅니다. */
{
  const nowhere = path.join(tmp, '없는-인증키.txt');
  process.env.KAKAO_REST_API_KEY = ' 0123456789abcdef0123456789abcdef ';
  check('환경변수 KAKAO_REST_API_KEY 를 먼저 쓴다', kakaoKey(nowhere) === '0123456789abcdef0123456789abcdef');
  delete process.env.KAKAO_REST_API_KEY;
  let threw = false;
  try { kakaoKey(nowhere); } catch (e) { threw = /인증키\.txt/.test(e.message); }
  check('환경변수도 파일도 없으면 kakaoKey 는 까닭을 말하며 멈춘다', threw);
}

/* ⑤ 이번에 멈춘 바로 그 유치원 — 저장소의 실제 캐시만으로 좌표가 나와야 합니다. */
{
  const geo = makeGeocoder({ getKey: noKey, say: () => {} });
  const hit = await geo.lookup('경상북도 경주시 건천읍 경주역세권3로 60');
  check('화천초병설유치원 주소는 열쇠 없이 캐시로 경북 안 좌표가 나온다',
    hit && inGyeongbuk(hit.lat, hit.lon));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`✓  통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
