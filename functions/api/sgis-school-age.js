const AUTH_URL = 'https://sgisapi.kostat.go.kr/OpenAPI3/auth/authentication.json';
const POPULATION_URL = 'https://sgisapi.kostat.go.kr/OpenAPI3/stats/searchpopulation.json';
const YEARS = new Set(Array.from({ length: 8 }, (_value, index) => 2015 + index));
const BANDS = {
  '00_04': { codes: ['01'], label: '0~4세' },
  '05_09': { codes: ['02'], label: '5~9세' },
  '10_14': { codes: ['03'], label: '10~14세' },
  '15_19': { codes: ['04'], label: '15~19세' },
  '05_19': { codes: ['02', '03', '04'], label: '5~19세 합계(학령기 근사)', approximate: true }
};
const CURRENT_REGIONS = [
  '포항', '경주', '김천', '안동', '구미', '영주', '영천', '상주', '문경', '경산',
  '의성', '청송', '영양', '영덕', '청도', '고령', '성주', '칠곡', '예천', '봉화',
  '울진', '울릉'
];
const CURRENT_REGION_SET = new Set(CURRENT_REGIONS);

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'public, max-age=3600, s-maxage=86400',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function safeName(raw) {
  return String(raw || '')
    .replace(/^경상북도\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function currentRegion(raw, admCd) {
  const name = safeName(raw).replace(/\s+/g, '');
  /* SGIS가 포항시를 남구·북구로 나눠 돌려주는 연도도 현재 지도에서는
     포항 한 곳으로 합친다. 2023년 대구로 편입한 군위는 현재 22개 시군에서 뺀다. */
  if (name.includes('군위')) return null;
  if (name.includes('포항') || String(admCd || '').startsWith('3701')) return '포항';
  return CURRENT_REGIONS.find(region => name.includes(region)) || null;
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  let data = {};
  try { data = await response.json(); } catch (_error) {}
  return { response, data };
}

export async function onRequestGet(context) {
  const env = context?.env || {};
  const key = String(env.SGIS_CONSUMER_KEY || '').trim();
  const secret = String(env.SGIS_CONSUMER_SECRET || '').trim();
  if (!key || !secret) {
    return json({
      ok: false,
      reason: 'not_configured',
      error: '서버에 SGIS_CONSUMER_KEY와 SGIS_CONSUMER_SECRET이 모두 필요합니다.'
    }, 503);
  }

  const requestUrl = new URL(context.request.url);
  const year = Number(requestUrl.searchParams.get('year') || 2022);
  const bandId = requestUrl.searchParams.get('band') || '05_19';
  const band = BANDS[bandId];
  if (!YEARS.has(year) || !band) {
    return json({ ok: false, error: '연도는 2015~2022년, 연령은 제공된 5세 단위 구간에서 선택해 주세요.' }, 400);
  }

  let token;
  try {
    const auth = new URL(AUTH_URL);
    auth.searchParams.set('consumer_key', key);
    auth.searchParams.set('consumer_secret', secret);
    const { response, data } = await fetchJson(auth);
    token = response.ok ? data?.result?.accessToken : null;
    if (!token) return json({ ok: false, error: 'SGIS 인증을 받지 못했습니다.', upstreamStatus: response.status }, 502);
  } catch (error) {
    return json({ ok: false, error: error?.name === 'TimeoutError' ? 'SGIS 인증 시간이 초과되었습니다.' : 'SGIS에 연결하지 못했습니다.' }, error?.name === 'TimeoutError' ? 504 : 502);
  }

  const rows = new Map();
  try {
    const results = await Promise.all(band.codes.map(async ageType => {
      const url = new URL(POPULATION_URL);
      url.searchParams.set('accessToken', token);
      url.searchParams.set('year', String(year));
      url.searchParams.set('gender', '0');
      url.searchParams.set('adm_cd', '37');
      url.searchParams.set('low_search', '1');
      url.searchParams.set('age_type', ageType);
      return fetchJson(url);
    }));

    for (const { response, data } of results) {
      if (!response.ok || String(data?.errCd ?? '0') !== '0' || !Array.isArray(data?.result)) {
        return json({ ok: false, error: 'SGIS 연령별 인구 자료를 받지 못했습니다.', upstreamStatus: response.status }, 502);
      }
      for (const item of data.result) {
        const admCd = String(item.adm_cd || '');
        const region = currentRegion(item.adm_nm, admCd);
        const population = Number(item.population);
        // 도 전체 행과 현재 경북 22개 시군 밖의 과거 행정구역은 합계에 넣지 않는다.
        if (!admCd.startsWith('37') || admCd.length <= 2 || !region || !CURRENT_REGION_SET.has(region) || !Number.isFinite(population)) continue;
        const current = rows.get(region) || {
          admCd,
          admName: safeName(item.adm_nm),
          region,
          population: 0
        };
        current.population += population;
        rows.set(region, current);
      }
    }
  } catch (error) {
    return json({ ok: false, error: error?.name === 'TimeoutError' ? 'SGIS 조회 시간이 초과되었습니다.' : 'SGIS에 연결하지 못했습니다.' }, error?.name === 'TimeoutError' ? 504 : 502);
  }

  const values = CURRENT_REGIONS.map(region => rows.get(region)).filter(Boolean);
  return json({
    ok: true,
    year,
    band: bandId,
    bandLabel: band.label,
    approximate: Boolean(band.approximate),
    total: values.reduce((sum, item) => sum + item.population, 0),
    rows: values,
    source: '통계청 SGIS 인구주택총조사 인구통계 조건검색',
    basis: '현재 경상북도 22개 시군(군위 제외) · 5세 단위 연령구간',
    limitation: band.approximate
      ? '5~19세 합계는 학령기 인구를 가늠하기 위한 근사치이며 재학생 수가 아닙니다.'
      : '주민등록인구나 학교 재학생 수가 아닌 SGIS 인구주택총조사 기준입니다.'
  });
}

export async function onRequest(context) {
  if (context?.request?.method === 'GET') return onRequestGet(context);
  return json({ ok: false, error: 'GET 요청만 허용합니다.' }, 405);
}
