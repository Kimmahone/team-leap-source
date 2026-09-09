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

/* 경상북도 한가운데를 UTM-K 로 잘라 달라고 합니다. 작게(64×64) 물어봅니다 —
   되는지만 보면 되므로 남의 서버에 큰 그림을 시키지 않습니다. */
const BBOX_5179 = '1050000,1750000,1200000,1900000';

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

  const tries = [
    { 이름: 'WMS · EPSG:5179 · 위성', srs: 'EPSG:5179', layers: 'Satellite' },
    { 이름: 'WMS · EPSG:5179 · 배경',  srs: 'EPSG:5179', layers: 'Base' },
    { 이름: 'WMS · EPSG:3857 · 위성', srs: 'EPSG:3857', layers: 'Satellite',
      bbox: '13800000,4200000,14400000,4600000' }
  ];

  const out = [];
  for (const t of tries) {
    const u = new URL('https://api.vworld.kr/req/wms');
    u.searchParams.set('SERVICE', 'WMS');
    u.searchParams.set('REQUEST', 'GetMap');
    u.searchParams.set('VERSION', '1.1.1');
    u.searchParams.set('LAYERS', t.layers);
    u.searchParams.set('STYLES', '');
    u.searchParams.set('FORMAT', 'image/jpeg');
    u.searchParams.set('SRS', t.srs);
    u.searchParams.set('BBOX', t.bbox || BBOX_5179);
    u.searchParams.set('WIDTH', '64');
    u.searchParams.set('HEIGHT', '64');
    u.searchParams.set('KEY', key);
    u.searchParams.set('DOMAIN', new URL(context.request.url).origin);

    let r, body = '';
    try {
      r = await fetch(u.toString(), { signal: AbortSignal.timeout(10000) });
      const ct = r.headers.get('content-type') || '';
      /* 그림이 오면 된 것입니다. 글이 오면 «왜 안 되는지»가 그 안에 있습니다. */
      if (!ct.startsWith('image/')) body = (await r.text()).slice(0, 300);
      out.push({
        무엇: t.이름,
        상태: r.status,
        형식: ct,
        됨: r.ok && ct.startsWith('image/'),
        답: body || undefined
      });
    } catch (e) {
      out.push({ 무엇: t.이름, 됨: false, 오류: String(e && e.message || e).slice(0, 120) });
    }
  }

  const good = out.find(x => x.됨 && /5179/.test(x.무엇));
  return json({
    ok: !!good,
    결론: good
      ? '브이월드가 EPSG:5179 로 그려 줍니다 — 지금 지도에 그대로 얹을 수 있습니다.'
      : '브이월드가 EPSG:5179 로는 답하지 않았습니다. 아래 답을 보고 다음 길을 정합니다.',
    시도: out
  });
}

export async function onRequest(context) {
  if (context?.request?.method === 'GET') return onRequestGet(context);
  return json({ ok: false, reason: 'method' }, 405);
}
