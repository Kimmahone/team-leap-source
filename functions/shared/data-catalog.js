/*
 * 공개 대시보드와 향후 데이터 백엔드가 함께 쓰는 데이터 목록입니다.
 * 인증키 값은 절대 적지 않고 Cloudflare 런타임 환경변수 이름만 적습니다.
 */
export const CATALOG_VERSION = '2026-08-27.1';

export const DATASETS = [
  {
    id: 'D1', name: '학령인구·인구전망', provider: 'KOSIS',
    referenceDate: '2026', refresh: '연 1회 및 KOSIS 개정 시', status: 'active',
    script: 'open api/bake-kosis.mjs', artifact: 'open api/data/kosis-summary.json',
    tableIds: ['DT_1B81A23', 'DT_1B04006', 'INH_PB0001_2022_37', 'DT_1B26002']
  },
  {
    id: 'D2', name: '학교별·학년별 학생 및 학급', provider: '학교알리미',
    referenceDate: '2026 공시', refresh: '연 1회 공시 후', status: 'active',
    script: 'open api/bake-students.mjs', artifact: '06. 실행계획(1)/prototype/index.html'
  },
  {
    id: 'D3', name: '학교 기본정보·주소·좌표', provider: '학교알리미·유치원알리미',
    referenceDate: '2026-08-26 수집', refresh: '분기 1회 또는 개폐교 발생 시', status: 'active',
    script: 'open api/bake-coords.mjs', artifact: 'open api/data/geocode-cache.json'
  },
  {
    id: 'D4', name: '학교 시설·안전·운영 여건', provider: '학교알리미·경북교육청',
    referenceDate: null, refresh: '연 1회', status: 'planned',
    script: null, artifact: null
  },
  {
    id: 'D5', name: '교원 현황', provider: '학교알리미·유치원알리미',
    referenceDate: '2026 공시(유치원 제외)', refresh: '연 1회 공시 후', status: 'partial',
    script: 'open api/bake-students.mjs', artifact: '06. 실행계획(1)/prototype/index.html'
  },
  {
    id: 'D6', name: '적정규모학교·통폐합 검토 내부자료', provider: '경상북도교육청',
    referenceDate: null, refresh: '내부 계획 수립 시', status: 'waiting_internal_data',
    script: null, artifact: null
  },
  {
    id: 'D7', name: '인구감소지역 지정 근거', provider: '행정안전부',
    referenceDate: null, refresh: '고시 개정 시', status: 'needs_source_verification',
    script: null, artifact: null
  },
  {
    id: 'D8', name: '다문화·특수교육 지표', provider: '경상북도교육청·교육통계',
    referenceDate: null, refresh: '연 1회', status: 'waiting_internal_data',
    script: null, artifact: null
  },
  {
    id: 'D9', name: '학령인구·학교정책 뉴스', provider: '네이버 뉴스 검색 API',
    referenceDate: '매주 자동 갱신', refresh: '매주 월요일', status: 'active',
    script: 'fetch-news.js', artifact: 'news-history.json'
  },
  {
    id: 'D10', name: '유치원 기본현황·원아·학급', provider: '유치원알리미',
    referenceDate: '2023-2차~2026-1차 기관별 최신 공시', refresh: '공시 차수별', status: 'active',
    script: 'open api/bake-kinder.mjs', artifact: '06. 실행계획(1)/prototype/index.html'
  }
];

export const SERVICES = [
  { id: 'gemini', name: 'Gemini 정책 검토', env: ['GEMINI_API_KEY'], runtime: true },
  { id: 'sgis', name: 'SGIS 실제 위치 지도', env: ['SGIS_CONSUMER_KEY', 'SGIS_CONSUMER_SECRET'], runtime: true },
  { id: 'schoolinfo', name: '학교알리미 갱신', env: ['SCHOOLINFO_API_KEY'], runtime: false },
  { id: 'kosis', name: 'KOSIS 갱신', env: ['KOSIS_API_KEY'], runtime: false },
  { id: 'kinder', name: '유치원알리미 갱신', env: ['KINDER_API_KEY'], runtime: false }
];
