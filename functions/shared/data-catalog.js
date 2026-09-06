/*
 * 공개 대시보드와 향후 데이터 백엔드가 함께 쓰는 데이터 목록입니다.
 * 인증키 값은 절대 적지 않고 Cloudflare 런타임 환경변수 이름만 적습니다.
 */
export const CATALOG_VERSION = '2026-09-06.1';

export const DATASETS = [
  {
    id: 'D1', name: '학령인구·인구전망', provider: 'KOSIS',
    referenceDate: '2016~2025 실적·2026~2036 장래인구', refresh: '월 1회 개정 여부 확인·공식 개정 시 반영', status: 'active',
    script: 'open api/bake-kosis.mjs', artifact: 'open api/data/kosis-summary.json',
    tableIds: ['DT_1B81A23', 'DT_1B04006', 'INH_PB0001_2022_37', 'DT_1B26002']
  },
  {
    id: 'D2', name: '학교별·학년별 학생 및 학급', provider: '학교알리미',
    referenceDate: '2026 공시', refresh: '연 1회 새 공시 확인·개폐교 발생 시 추가 점검', status: 'active',
    script: 'open api/bake-students.mjs', artifact: '06. 실행계획(1)/prototype/index.html'
  },
  {
    id: 'D3', name: '학교 기본정보·주소·좌표', provider: '학교알리미·유치원알리미',
    referenceDate: '2026-08-26 수집', refresh: '분기 1회·개폐교 또는 주소 변경 시', status: 'active',
    script: 'open api/bake-coords.mjs', artifact: 'open api/data/geocode-cache.json'
  },
  {
    id: 'D4', name: '학교 시설·안전·운영 여건', provider: '학교알리미',
    referenceDate: null, refresh: '현재 핵심 범위에서 제외', status: 'out_of_scope',
    script: null, artifact: null
  },
  {
    id: 'D5', name: '교원 현황', provider: '학교알리미·유치원알리미',
    referenceDate: '2026 공시(유치원 제외)', refresh: '연 1회 새 공시 확인', status: 'partial',
    script: 'open api/bake-students.mjs', artifact: '06. 실행계획(1)/prototype/index.html'
  },
  {
    id: 'D6', name: '부서별 정책·사업 실적', provider: '경상북도교육청',
    referenceDate: null, refresh: '현재 공개 대시보드 범위에서 제외', status: 'out_of_scope',
    script: null, artifact: null
  },
  {
    id: 'D7', name: '인구감소지역 지정 근거', provider: '행정안전부',
    referenceDate: '행정안전부 공개 지정자료', refresh: '공식 지정 변경 시', status: 'reference_only',
    script: null, artifact: null
  },
  {
    /* 〔2026. 9. 6.〕 「다문화 미확보」로 남아 있었습니다. 9월 3일에
       교육통계연보(2025. 4. 1.) 13,158명을 심어 화면에 표까지 나가고 있는데
       이 목록만 예전 말을 하고 있었습니다. 밖에서 이 API 로 우리 상태를
       판단하면 틀린 답을 얻습니다. 도 단위까지만이라 status 는 partial 그대로입니다 —
       시군·학년별이 오면 full 로 올립니다. */
    id: 'D8', name: '다문화·특수교육 공개 지표', provider: '국립특수교육원·교육통계연보·학교알리미',
    referenceDate: '특수교육 배치유형 2026. 4. 1. · 다문화 2025. 4. 1. · 특수학급 2026 공시',
    refresh: '연 1회 공개 통계 확인', status: 'partial',
    script: null, artifact: null
  },
  {
    id: 'D9', name: '학령인구 감소 관련 뉴스', provider: '네이버 뉴스 검색 API',
    referenceDate: '매주 자동 갱신', refresh: '매주 월요일', status: 'active',
    script: 'fetch-news.js', artifact: 'news-history.json'
  },
  {
    id: 'D10', name: '유치원 기본현황·원아·학급', provider: '유치원알리미',
    referenceDate: '2023-2차~2026-1차 기관별 최신 공시', refresh: '분기 1회 새 공시 확인·공시 차수 변경 시 반영', status: 'active',
    script: 'open api/bake-kinder.mjs', artifact: '06. 실행계획(1)/prototype/index.html'
  },
  {
    /* 〔2026. 9. 6.〕 9월 3일에 폐교 750곳을 심었는데 이 목록에는 항목이 없었습니다. */
    id: 'D11', name: '폐교 재산·활용 현황', provider: '지방교육재정알리미',
    referenceDate: '2026년 기준 750곳', refresh: '연 1회 공개 자료 확인', status: 'partial',
    script: 'open api/bake-closed-schools.mjs', artifact: '06. 실행계획(1)/prototype/index.html'
  }
];

export const SERVICES = [
  { id: 'gemini', name: 'AI 변화 읽기 도우미', env: ['GEMINI_API_KEY'], runtime: true },
  {
    id: 'sgis', name: 'SGIS 실제 위치 지도', env: ['SGIS_CONSUMER_KEY'],
    optionalEnv: ['SGIS_CONSUMER_SECRET'], runtime: true
  },
  { id: 'schoolinfo', name: '학교알리미 갱신', env: ['SCHOOLINFO_API_KEY'], runtime: false },
  {
    id: 'edss', name: 'EDSS 학교 기준·학생·학급 보완 API',
    // 〔2026. 9. 6.〕 신청한 7개 API 가 **모두 승인**되었습니다.
    // 8월 31일부터 실제로 굽고 있고(EDSS_META.만든때 = 2026-09-05),
    // 화면도 「가정한 감소율」에서 「실측 감소율」로 넘어갔습니다.
    // 그런데 이 목록만 계속 「승인 대기」라고 말하고 있었습니다.
    // 열쇠는 GitHub Actions 시크릿에 있습니다 — 배포 환경에는 필요 없습니다.
    env: [],
    optionalEnv: [
      'EDSS_SCHOOL_ATTRIBUTE_API_KEY',
      'EDSS_CLASS_STUDENT_API_KEY',
      'EDSS_STUDENT_STATUS_API_KEY',
      'EDSS_CLASS_STATUS_API_KEY',
      'EDSS_SCHOOL_LOCATION_API_KEY',
      'EDSS_SCHOOL_OVERVIEW_API_KEY',
      'EDSS_EDU_STAT_SCHOOL_OVERVIEW_API_KEY'
    ],
    runtime: false
  },
  { id: 'kosis', name: 'KOSIS 갱신', env: ['KOSIS_API_KEY'], runtime: false },
  { id: 'kinder', name: '유치원알리미 갱신', env: ['KINDER_API_KEY'], runtime: false }
];
