const ORS_BASE = 'https://api.openrouteservice.org/v2';
const PROFILES = new Set(['driving-car', 'foot-walking']);
const MAX_RANGES = 3;

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

function coordinate(value) {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const lon = Number(value[0]), lat = Number(value[1]);
  /* 이 기능은 경북 통학 여건용입니다. 세계 임의 좌표를 대리 호출하는 공개
     프록시가 되지 않도록 대한민국 주변 범위로 한정합니다. */
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < 124 || lon > 132 || lat < 33 || lat > 39) return null;
  return [lon, lat];
}

function cleanRanges(values) {
  if (!Array.isArray(values) || !values.length || values.length > MAX_RANGES) return null;
  const ranges = [...new Set(values.map(Number))].sort((a, b) => a - b);
  if (!ranges.length || ranges.some(value => !Number.isInteger(value) || value < 300 || value > 3600)) return null;
  return ranges;
}

async function readUpstream(upstream) {
  let data = {};
  try { data = await upstream.json(); } catch (_error) {}
  if (!upstream.ok) {
    return {
      ok: false,
      status: upstream.status,
      body: {
        ok: false,
        error: upstream.status === 429
          ? '통학 경로 서비스의 사용량 한도에 도달했습니다. 잠시 후 다시 시도하세요.'
          : '통학 경로 서비스가 요청을 처리하지 못했습니다.',
        upstreamStatus: upstream.status
      }
    };
  }
  return { ok: true, data };
}

export async function onRequestPost(context) {
  const request = context.request;
  if (!sameOrigin(request)) return json({ ok: false, error: '허용되지 않은 요청입니다.' }, 403);

  const apiKey = String(context?.env?.ORS_API_KEY || '').trim();
  if (!apiKey) {
    return json({
      ok: false,
      reason: 'not_configured',
      error: '서버에 통학 경로용 ORS_API_KEY가 설정되지 않았습니다.'
    }, 503);
  }

  let body;
  try { body = await request.json(); }
  catch (_error) { return json({ ok: false, error: '요청 형식이 올바르지 않습니다.' }, 400); }

  const action = body?.action;
  const profile = PROFILES.has(body?.profile) ? body.profile : null;
  if (!profile) return json({ ok: false, error: '이동수단은 자동차 또는 도보만 선택할 수 있습니다.' }, 400);

  let path, payload;
  if (action === 'isochrone') {
    const start = coordinate(body?.coordinates?.[0]);
    const ranges = cleanRanges(body?.ranges);
    if (!start || !ranges) return json({ ok: false, error: '출발 좌표와 5~60분 도달시간을 확인해 주세요.' }, 400);
    path = `isochrones/${profile}`;
    payload = { locations: [start], range: ranges, range_type: 'time', location_type: 'start' };
  } else if (action === 'directions') {
    const points = Array.isArray(body?.coordinates) ? body.coordinates.map(coordinate) : [];
    if (points.length !== 2 || points.some(point => !point)) {
      return json({ ok: false, error: '출발지와 목적지 좌표 두 곳이 필요합니다.' }, 400);
    }
    path = `directions/${profile}/geojson`;
    payload = { coordinates: points, instructions: false, elevation: false };
  } else {
    return json({ ok: false, error: '지원하지 않는 경로 분석 방식입니다.' }, 400);
  }

  let upstream;
  try {
    upstream = await fetch(`${ORS_BASE}/${path}`, {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    return json({
      ok: false,
      error: error?.name === 'TimeoutError'
        ? '통학 경로 계산 시간이 초과되었습니다. 범위를 줄여 다시 시도하세요.'
        : '통학 경로 서비스에 연결하지 못했습니다.'
    }, error?.name === 'TimeoutError' ? 504 : 502);
  }

  const result = await readUpstream(upstream);
  if (!result.ok) return json(result.body, result.status === 429 ? 429 : 502);
  return json({
    ok: true,
    action,
    profile,
    geojson: result.data,
    basis: 'OpenRouteService 도로망 기반 예상 경로',
    limitation: '실제 통학차량 노선·교통상황·학생별 통학 기록이 아닙니다.'
  });
}

export async function onRequest(context) {
  if (context?.request?.method === 'POST') return onRequestPost(context);
  return json({ ok: false, error: 'POST 요청만 허용합니다.' }, 405);
}
