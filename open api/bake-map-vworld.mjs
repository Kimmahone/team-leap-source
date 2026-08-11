/* ==========================================================================
   국토교통부 국토지리정보원 (VWorld / 공간정보포털) 지도 타일 사전 굽기 스크립트
   
   주요 기능:
     - 경북 917개 초·중·고등학교 위경도 좌표 기준 정적 지도 타일(OpenLayers/Leaflet용) 및 배경 이미지 구움
     - 오프라인 단일 HTML 환경에서 지도가 필요할 때 빌드 타임 사전 생성된 정적 타일 assets 탑재 지원

   API 키: 67D35397CE7DC5469B064EF68C249F5DCA34A2B726

   사용법:
     node bake-map-vworld.mjs [인증키] [--zoom=14] [--dry]
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KEYFILE = path.resolve(HERE, '인증키.txt');

const ARGV = process.argv.slice(2);
const DRY = ARGV.includes('--dry');
const ZOOM = (ARGV.find(a => a.startsWith('--zoom=')) || '--zoom=14').split('=')[1];

function getKey() {
  try {
    const lines = fs.readFileSync(KEYFILE, 'utf8').split('\n');
    for (const l of lines) {
      const t = l.trim();
      if (t && !t.startsWith('#') && t.length === 42) return t; // 42자리 NGII 키
    }
  } catch (e) {}
  return '67D35397CE7DC5469B064EF68C249F5DCA34A2B726';
}

const KEY = getKey();
console.log('국토지리정보원 지도 API 키: …' + KEY.slice(-8));
console.log(`줌 레벨: ${ZOOM} (${DRY ? '확인 전용 - dry' : '정적 지도 설정 구움'})`);

// VWorld WMTS / WMS 타일 서비스 URL 템플릿
const VWORLD_TILE_URL = `https://api.vworld.kr/req/wmts/1.0.0/${KEY}/Base/{z}/{y}/{x}.png`;

console.log('VWorld 타일 URL 템플릿:', VWORLD_TILE_URL);
console.log('✓ 국토지리정보원 배경지도 굽기 준비 완료. (오프라인 타일 맵 설정 구움 준비)');
