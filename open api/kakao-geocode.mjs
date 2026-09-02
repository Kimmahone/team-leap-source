/* ==========================================================================
   주소 → 좌표 (카카오 로컬)

   왜 필요한가
     유치원알리미와 학교알리미의 «학교기본정보»는 **주소만** 줍니다.
     (초·중·고 917곳은 `apiType=0` 이 위경도를 함께 주어서 필요 없었습니다.
      유치원 614곳과 특수학교는 그렇지 않습니다.)
     지도는 「어디에 있는가」를 말하는 그림이라 좌표가 없으면 점을 찍을 수 없고,
     **없는 좌표를 지어내면 그림이 거짓말을 합니다** (마스터 함정 55번 — 예전에
     `Math.random()` 으로 채워서 울릉군 유치원이 본토에 찍혀 있었습니다).

   ★ 받은 것을 **캐시에 적어 둡니다**
     `data/geocode-cache.json` 에 「주소 → 좌표」를 쌓습니다. 다시 구울 때
     이미 아는 주소는 묻지 않습니다. 614곳을 매번 물어보는 것은 낭비이고,
     무엇보다 **다시 구울 때마다 결과가 달라지면 안 됩니다.**

   ★ 못 찾으면 **비워 둡니다**
     가까운 아무 데나 찍지 않습니다. 좌표가 없는 곳은 `lat:null` 로 남고,
     지도는 그런 곳을 그리지 않습니다. 몇 곳을 못 찾았는지는 화면에 찍습니다.

   쓰는 법 (다른 굽기 스크립트에서)
     import { makeGeocoder } from './kakao-geocode.mjs';
     const geo = makeGeocoder();
     const hit = await geo.lookup('경상북도 울릉군 남양1길 42-27');   // {lat, lon} | null
     geo.save();                                                      // 캐시 적기
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchRetry } from './net.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KEYFILE = path.resolve(HERE, '인증키.txt');
const CACHE = path.resolve(HERE, 'data/geocode-cache.json');

/* 카카오 REST 열쇠는 32자리 16진수라 학교알리미 열쇠와 생김새가 같습니다.
   그래서 「카카오」가 적힌 줄을 먼저 찾습니다 — 그 주석을 지우지 마세요. */
export function kakaoKey() {
  let raw;
  try { raw = fs.readFileSync(KEYFILE, 'utf8'); }
  catch (e) {
    throw new Error('인증키.txt 를 읽지 못했습니다: ' + KEYFILE);
  }
  const line = raw.split('\n').find(l => /카카오/.test(l) && !l.trim().startsWith('#') && /[0-9a-fA-F]{32}/.test(l))
            || raw.split('\n').find(l => /카카오/i.test(l) && /[0-9a-fA-F]{32}/.test(l));
  const hit = (line || '').match(/[0-9a-fA-F]{32}/);
  if (!hit) {
    throw new Error('인증키.txt 에서 카카오 REST 열쇠를 찾지 못했습니다.\n' +
      '  「카카오REST: <열쇠>」 처럼 한 줄 적어 주세요.');
  }
  return hit[0];
}

/* 주소를 다듬습니다 — 카카오는 「경상북도」보다 「경북」을, 괄호·층수 표기를 싫어합니다 */
function tidy(addr) {
  return String(addr || '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function shorten(addr) {
  /* 번지 뒤에 붙은 건물명·동호수를 떼면 찾히는 경우가 많습니다 */
  const m = tidy(addr).match(/^(.*?\d+(-\d+)?)\s/);
  return m ? m[1] : tidy(addr);
}

export function makeGeocoder(opts = {}) {
  const key = opts.key || kakaoKey();
  const delayMs = opts.delayMs ?? 60;      // 카카오 초당 한도를 넉넉히 비켜 갑니다

  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) { cache = {}; }

  let asked = 0, fromCache = 0, missed = 0;

  async function ask(query) {
    const url = 'https://dapi.kakao.com/v2/local/search/address.json?query=' + encodeURIComponent(query);
    const res = await fetchRetry(url, { headers: { Authorization: 'KakaoAK ' + key } });
    if (res.status === 401 || res.status === 403) {
      const body = await res.text();
      throw new Error('카카오 열쇠가 거부됐습니다 (' + res.status + '): ' + body.slice(0, 160) +
        '\n  카카오 developers → 내 애플리케이션 → 제품 설정 → 카카오맵 활성화를 확인하세요.');
    }
    if (!res.ok) return null;
    const j = await res.json();
    const doc = (j.documents || [])[0];
    if (!doc) return null;
    /* x = 경도, y = 위도 입니다 (뒤집으면 학교가 바다로 갑니다) */
    const lon = parseFloat(doc.x), lat = parseFloat(doc.y);
    if (!isFinite(lat) || !isFinite(lon)) return null;
    return { lat, lon };
  }

  return {
    async lookup(addr) {
      const q = tidy(addr);
      if (!q) return null;
      if (Object.prototype.hasOwnProperty.call(cache, q)) { fromCache++; return cache[q]; }

      let hit = await ask(q);
      if (!hit) {
        /* 도로명이 안 잡히면 번지까지만 잘라 다시 물어봅니다 */
        const s = shorten(q);
        if (s && s !== q) { await new Promise(r => setTimeout(r, delayMs)); hit = await ask(s); }
      }
      asked++;
      if (!hit) missed++;
      cache[q] = hit;                       // 못 찾은 것도 적어 둡니다 (또 묻지 않게)
      await new Promise(r => setTimeout(r, delayMs));
      return hit;
    },
    stats() { return { asked, fromCache, missed }; },
    save() {
      fs.mkdirSync(path.dirname(CACHE), { recursive: true });
      const sorted = {};
      Object.keys(cache).sort().forEach(k => { sorted[k] = cache[k]; });
      fs.writeFileSync(CACHE, JSON.stringify(sorted, null, 1) + '\n', 'utf8');
    }
  };
}

/* 경북 밖으로 튄 좌표를 걸러 냅니다.
   지오코더가 같은 이름의 다른 지역을 집어 주는 일이 실제로 있습니다. */
export function inGyeongbuk(lat, lon) {
  return lat > 35.0 && lat < 37.6 && lon > 127.8 && lon < 131.3;
}
