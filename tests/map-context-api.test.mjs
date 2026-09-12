import { strict as assert } from 'node:assert';
import { onRequest as routeRequest, onRequestPost as routePost } from '../functions/api/route-access.js';
import { onRequest as populationRequest, onRequestGet as populationGet } from '../functions/api/sgis-school-age.js';

let pass = 0;
async function check(name, work) {
  await work();
  pass += 1;
  console.log(`OK ${name}`);
}

const origin = 'https://example.test';
function post(body, requestOrigin = origin) {
  return new Request(`${origin}/api/route-access`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Origin: requestOrigin },
    body: JSON.stringify(body)
  });
}

await check('통학 API는 POST만 받고 다른 출처를 막는다', async () => {
  assert.equal((await routeRequest({ request: new Request(`${origin}/api/route-access`), env: {} })).status, 405);
  assert.equal((await routePost({ request: post({ action: 'isochrone' }, 'https://evil.test'), env: { ORS_API_KEY: 'secret' } })).status, 403);
});

await check('통학 키가 없으면 설정 필요 상태를 돌려준다', async () => {
  const response = await routePost({ request: post({ action: 'isochrone', profile: 'driving-car', coordinates: [[128.5, 36.5]], ranges: [1800] }), env: {} });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).reason, 'not_configured');
});

const realFetch = globalThis.fetch;
await check('도달권은 ORS에 키를 헤더로만 보내고 60분 이하로 제한한다', async () => {
  let called = '', options = {};
  globalThis.fetch = async (url, init) => {
    called = String(url); options = init;
    return new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const response = await routePost({
    request: post({ action: 'isochrone', profile: 'driving-car', coordinates: [[128.5, 36.5]], ranges: [900, 1800, 3600] }),
    env: { ORS_API_KEY: 'server-only-route-key' }
  });
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(called, /\/v2\/isochrones\/driving-car$/);
  assert.equal(options.headers.Authorization, 'server-only-route-key');
  assert.deepEqual(JSON.parse(options.body).range, [900, 1800, 3600]);
  assert.equal(body.includes('server-only-route-key'), false);
});

await check('경로 요청은 두 좌표와 자동차·도보만 허용한다', async () => {
  globalThis.fetch = async (_url, _init) => new Response(JSON.stringify({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[128.5, 36.5], [128.6, 36.6]] }, properties: { summary: { distance: 15000, duration: 1800 } } }]
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  const good = await routePost({ request: post({ action: 'directions', profile: 'foot-walking', coordinates: [[128.5, 36.5], [128.6, 36.6]] }), env: { ORS_API_KEY: 'secret' } });
  assert.equal(good.status, 200);
  const bad = await routePost({ request: post({ action: 'directions', profile: 'cycling-regular', coordinates: [[128.5, 36.5], [128.6, 36.6]] }), env: { ORS_API_KEY: 'secret' } });
  assert.equal(bad.status, 400);
});

await check('SGIS 인구 API는 GET만 받고 두 인증값을 요구한다', async () => {
  const request = new Request(`${origin}/api/sgis-school-age`);
  assert.equal((await populationRequest({ request: new Request(request.url, { method: 'POST' }), env: {} })).status, 405);
  assert.equal((await populationGet({ request, env: { SGIS_CONSUMER_KEY: 'id' } })).status, 503);
});

await check('SGIS 5~19세는 공식 5세 구간 세 개를 합치고 인증값을 노출하지 않는다', async () => {
  const ages = [];
  globalThis.fetch = async url => {
    const value = new URL(String(url));
    if (value.pathname.endsWith('/authentication.json')) {
      assert.equal(value.searchParams.get('consumer_key'), 'server-only-id');
      assert.equal(value.searchParams.get('consumer_secret'), 'server-only-secret');
      return new Response(JSON.stringify({ errCd: 0, result: { accessToken: 'short-token' } }), { status: 200 });
    }
    ages.push(value.searchParams.get('age_type'));
    assert.equal(value.searchParams.get('adm_cd'), '37');
    assert.equal(value.searchParams.get('low_search'), '1');
    const amount = { '02': 10, '03': 20, '04': 30 }[value.searchParams.get('age_type')];
    return new Response(JSON.stringify({ errCd: 0, result: [
      { adm_cd: '37', adm_nm: '경상북도', population: String(amount * 100) },
      { adm_cd: '37011', adm_nm: '경상북도 포항시 남구', population: String(amount) },
      { adm_cd: '37012', adm_nm: '경상북도 포항시 북구', population: String(amount / 2) },
      { adm_cd: '37310', adm_nm: '경상북도 군위군', population: String(amount * 10) },
      { adm_cd: '37920', adm_nm: '경상북도 울릉군', population: String(amount / 10) }
    ] }), { status: 200 });
  };
  const response = await populationGet({
    request: new Request(`${origin}/api/sgis-school-age?year=2022&band=05_19`),
    env: { SGIS_CONSUMER_KEY: 'server-only-id', SGIS_CONSUMER_SECRET: 'server-only-secret' }
  });
  const text = await response.text(), body = JSON.parse(text);
  assert.equal(response.status, 200);
  assert.deepEqual(ages.sort(), ['02', '03', '04']);
  assert.equal(body.rows.find(row => row.region === '포항').population, 90);
  assert.equal(body.rows.find(row => row.region === '울릉').population, 6);
  assert.equal(body.rows.some(row => row.region === '군위'), false);
  assert.equal(body.total, 96);
  assert.equal(body.approximate, true);
  assert.equal(text.includes('server-only-id'), false);
  assert.equal(text.includes('server-only-secret'), false);
  assert.equal(text.includes('short-token'), false);
});

globalThis.fetch = realFetch;
console.log(`통과 ${pass}개`);
