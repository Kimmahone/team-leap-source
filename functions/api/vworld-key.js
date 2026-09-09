/* 브이월드 키를 «화면»에 내려 줍니다 〔2026. 9. 10.〕

   ★ 왜 중계하지 않고 키를 내려 주나 — 두 가지 까닭입니다.

   ① 중계가 안 됩니다. Cloudflare 함수가 브이월드에 그림을 달라고 하면
      502·520 이 돌아옵니다. 브이월드 응답이 비표준이기 때문입니다 —
          HTTP/1.1 200 200        ← 상태 문구가 「OK」가 아니라 「200」
          Connection: Upgrade     ← 평범한 응답에 붙을 헤더가 아님
      curl 과 브라우저는 너그럽게 넘어가지만 Workers 의 fetch 는 엄격해서
      이런 응답을 중계하지 않습니다. 같은 요청이 사람 컴퓨터에서는 200 입니다.

   ② 감출 까닭도 없습니다. 브이월드 키는 **도메인 제한** 방식입니다.
      등록한 도메인에서만 듣도록 되어 있어, 주소에 드러나는 것이 정상 사용법입니다.
      (학교알리미·EDSS 키와 성격이 다릅니다. 그쪽은 절대 내려 주면 안 됩니다.)

   그래서 이 함수는 «브이월드 키 하나»만 답합니다. 다른 키는 건드리지 않습니다.
   키가 없으면 없다고 답하고, 화면은 위성 지도 단추를 잠급니다.

   부르는 법:  GET /api/vworld-key
*/

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  /* 키가 바뀌면 곧바로 따라와야 합니다. 오래 물고 있지 않습니다. */
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

export async function onRequestGet(context) {
  /* 남의 화면이 우리 키로 지도를 그리지 못하게, 같은 출처에서 온 것만 답합니다.
     (도메인 제한이 이미 막고 있지만, 두 겹으로 둡니다.) */
  const origin = context.request.headers.get('Origin');
  const here = new URL(context.request.url).origin;
  if (origin && origin !== here) return json({ ok: false, reason: 'origin' }, 403);

  const key = String(context?.env?.VWORLD_API_KEY || '').trim();
  if (!key) {
    return json({
      ok: false,
      reason: 'no_key',
      말: 'VWORLD_API_KEY 가 이 배포에 없습니다. Cloudflare Pages 변수에 넣고 다시 배포해 주세요.'
    });
  }
  return json({ ok: true, key, domain: here });
}

export async function onRequest(context) {
  if (context?.request?.method === 'GET') return onRequestGet(context);
  return json({ ok: false, reason: 'method' }, 405);
}
