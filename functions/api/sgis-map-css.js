const CSS_URL = 'https://sgisapi.mods.go.kr/maps/sop.css';

const headers = {
  'Content-Type': 'text/css; charset=utf-8',
  'Cache-Control': 'public, max-age=86400',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
};

function empty(status=200){
  return new Response('/* SGIS 지도 스타일을 불러오지 못했습니다. */', {status, headers});
}

export async function onRequestGet(){
  let upstream;
  /* 스타일은 바뀔 일이 드뭅니다 — Cloudflare 가장자리에서 하루 캐시, 늦으면 3초에서 끊습니다 */
  try{ upstream=await fetch(CSS_URL, {headers:{Accept:'text/css,*/*;q=0.8'}, cf:{cacheTtl:86400, cacheEverything:true}, signal:AbortSignal.timeout(3000)}); }
  catch(_e){ return empty(); }
  if(!upstream.ok) return empty();
  const css=(await upstream.text()).replace(/url\(\/\//g, 'url(https://');
  return new Response(css, {status:200, headers});
}

export async function onRequest(context){
  if(context?.request?.method==='GET') return onRequestGet(context);
  return empty(405);
}
