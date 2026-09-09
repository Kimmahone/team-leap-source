/* 브이월드가 «우리 지도의 좌표계»로 영상을 주는지 물어보는 자리 〔2026. 9. 10.〕

   왜 이런 것이 필요한가 —
     SGIS 지도는 UTM-K(EPSG:5179) 위에서 돕니다. `sop.LatLng` 이 위경도를
     받는 즉시 UTM-K 로 투영해 버리므로, 마커·거리·경계가 전부 그 좌표계에
     묶여 있습니다. 반면 브이월드 위성 «타일»은 웹 메르카토르(EPSG:3857)입니다.
     그대로 얹으면 영상과 학교 위치가 어긋납니다.

     빠져나갈 길은 하나입니다 — 브이월드 **WMS** 가 `SRS=EPSG:5179` 로
     그려 주면, 서버가 우리 좌표계로 잘라 보내 주므로 그대로 얹힙니다.

   그런데 그것은 **키가 있어야만 확인됩니다.** 키를 사람 손으로 옮겨 적게 하는
   대신, 서버가 대신 물어보고 «되더라 / 안 되더라»만 돌려줍니다.
   키는 Cloudflare 밖으로 나가지 않습니다.

   부르는 법:  GET /api/vworld-probe
*/

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers });

/* ★ 〔2026. 9. 10.〕 처음 물어볼 때 두 가지를 틀렸습니다.
     · VERSION=1.1.1 로 물었는데 브이월드는 **1.3.0 만** 받습니다
       (「유효한 파라미터 값의 범위 : [1.3.0]」)
     · 1.3.0 에서는 인자 이름이 SRS 가 아니라 **CRS** 입니다

   키 없이 물어보아 확인했습니다 — 1.3.0 · CRS=EPSG:5179 로 물으면
   좌표계 검사를 통과하고 「key 가 없다」까지 갑니다. 즉 **브이월드는
   우리 지도의 좌표계로 그려 줄 수 있습니다.**

   남은 것은 BBOX 의 «축 차례»입니다. WMS 1.3.0 은 좌표계가 선언한 차례를
   따르는데, EPSG:5179 는 X 를 북쪽으로 잡는 정의가 섞여 있어 둘 다 물어보고
   **그림이 오는 쪽**을 씁니다. 짐작하지 않고 서버에 물어봅니다. */
const GB = { minx: 1050000, miny: 1750000, maxx: 1200000, maxy: 1900000 };

function tryList(origin) {
  return [
    { 이름: 'WMS 1.3.0 · EPSG:5179 · 위성 · BBOX(동,북)',
      crs: 'EPSG:5179', layers: 'Satellite',
      bbox: `${GB.minx},${GB.miny},${GB.maxx},${GB.maxy}` },
    { 이름: 'WMS 1.3.0 · EPSG:5179 · 위성 · BBOX(북,동)',
      crs: 'EPSG:5179', layers: 'Satellite',
      bbox: `${GB.miny},${GB.minx},${GB.maxy},${GB.maxx}` },
    { 이름: 'WMS 1.3.0 · EPSG:5179 · 배경 · BBOX(북,동)',
      crs: 'EPSG:5179', layers: 'Base',
      bbox: `${GB.miny},${GB.minx},${GB.maxy},${GB.maxx}` },
    { 이름: 'WMS 1.3.0 · EPSG:3857 · 위성 (견줌용)',
      crs: 'EPSG:3857', layers: 'Satellite',
      bbox: '13800000,4200000,14400000,4600000' }
  ];
}

export async function onRequestGet(context) {
  const key = String(context?.env?.VWORLD_API_KEY || '').trim();
  if (!key) {
    return json({
      ok: false,
      reason: 'no_key',
      말: 'Cloudflare Pages 환경변수에 VWORLD_API_KEY 가 없습니다.',
      다음: 'team-leap-source / team-leap 두 프로젝트의 프로덕션·미리보기 양쪽에 넣어 주세요.'
    });
  }

  const origin = new URL(context.request.url).origin;
  const out = [];
  for (const t of tryList(origin)) {
    const u = new URL('https://api.vworld.kr/req/wms');
    u.searchParams.set('SERVICE', 'WMS');
    u.searchParams.set('REQUEST', 'GetMap');
    u.searchParams.set('VERSION', '1.3.0');
    u.searchParams.set('LAYERS', t.layers);
    u.searchParams.set('STYLES', '');
    u.searchParams.set('FORMAT', 'image/jpeg');
    u.searchParams.set('CRS', t.crs);
    u.searchParams.set('BBOX', t.bbox);
    u.searchParams.set('WIDTH', '64');
    u.searchParams.set('HEIGHT', '64');
    u.searchParams.set('key', key);
    u.searchParams.set('domain', origin);

    let body = '';
    try {
      const r = await fetch(u.toString(), { signal: AbortSignal.timeout(12000) });
      const ct = r.headers.get('content-type') || '';
      if (!ct.startsWith('image/')) body = (await r.text()).slice(0, 260);
      out.push({
        무엇: t.이름, 상태: r.status, 형식: ct,
        됨: r.ok && ct.startsWith('image/'),
        답: body ? body.replace(/\s+/g, ' ').trim() : undefined
      });
    } catch (e) {
      out.push({ 무엇: t.이름, 됨: false, 오류: String((e && e.message) || e).slice(0, 140) });
    }
  }

  const good = out.find(x => x.됨 && x.무엇.indexOf('5179') >= 0);
  return json({
    ok: !!good,
    결론: good
      ? '브이월드가 EPSG:5179 로 그려 줍니다 — 지금 지도에 그대로 얹을 수 있습니다. 쓸 축 차례: ' + good.무엇
      : '아직 그림이 오지 않았습니다. 아래 «답»에 까닭이 적혀 있습니다.',
    도메인: origin,
    시도: out
  });
}

export async function onRequest(context) {
  if (context?.request?.method === 'GET') return onRequestGet(context);
  return json({ ok: false, reason: 'method' }, 405);
}
