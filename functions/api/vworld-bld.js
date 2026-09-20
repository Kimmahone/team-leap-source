/* 브이월드 «건물»을 중계해 봅니다 — 실험 〔2026. 9. 20.〕

   OSM(OpenFreeMap) 건물은 경북에 너무 성깁니다. 구미 신도시 한 화면에 29개,
   서울 강남은 1,304개였습니다. 아파트가 안 보이는 까닭입니다.

   브이월드 `lt_c_bldginfo` 에는 height(실측 높이)와 grnd_flr(지상 층수)이
   들어 있고 전국이 채워져 있습니다. 다만 WFS 응답에 CORS 헤더가 없어
   브라우저에서 바로 못 받습니다.

   vworld-key.js 에 「Workers 가 브이월드를 중계하지 못한다」고 적혀 있지만
   그것은 «타일(이미지)» 이야기입니다. WFS 는 평범한 JSON 이라 다를 수 있어
   한 번 재 봅니다. 되면 드론뷰가 실제 건물을 세우고, 안 되면 이 파일은
   지웁니다.

   부르는 법: GET /api/vworld-bld?bbox=minLon,minLat,maxLon,maxLat
*/
const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=86400',
  'X-Content-Type-Options': 'nosniff'
};
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers });

export async function onRequestGet({ request, env }) {
  const key = env.VWORLD_API_KEY;
  if (!key) return json({ ok: false, why: 'no-key' }, 503);
  const bbox = new URL(request.url).searchParams.get('bbox') || '';
  if (!/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/.test(bbox)) return json({ ok: false, why: 'bad-bbox' }, 400);
  const u = 'https://api.vworld.kr/req/wfs?SERVICE=WFS&REQUEST=GetFeature'
    + '&TYPENAME=lt_c_bldginfo&SRSNAME=EPSG:4326&OUTPUT=application/json'
    + '&MAXFEATURES=1000&BBOX=' + encodeURIComponent(bbox)
    + '&KEY=' + encodeURIComponent(key);
  try {
    const r = await fetch(u, { cf: { cacheTtl: 86400 } });
    if (!r.ok) return json({ ok: false, why: 'upstream-' + r.status }, 502);
    const t = await r.text();
    if (t[0] !== '{') return json({ ok: false, why: 'not-json', head: t.slice(0, 120) }, 502);
    const d = JSON.parse(t);
    /* 화면이 쓰는 것만 남깁니다 — 높이와 도형. 나머지는 버립니다(용량). */
    const feats = (d.features || []).map(f => {
      const p = f.properties || {};
      const h = Number(p.height) || (Number(p.grnd_flr) || 1) * 3.3;
      return { type: 'Feature', properties: { h: Math.round(h * 10) / 10 }, geometry: f.geometry };
    });
    return json({ type: 'FeatureCollection', features: feats });
  } catch (e) {
    return json({ ok: false, why: 'fetch-failed', msg: String(e && e.message || e) }, 502);
  }
}
