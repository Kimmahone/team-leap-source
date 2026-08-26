const UPSTREAM = 'https://sgisapi.mods.go.kr/OpenAPI3/auth/javascriptAuth';

const headers = {
  'Content-Type': 'application/javascript; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
};

function unavailable(message, status=200){
  const safe = JSON.stringify(String(message || 'SGIS 온라인 지도를 사용할 수 없습니다.'));
  return new Response(`window.SGIS_MAP_STATUS={ready:false,message:${safe}};`, {status, headers});
}

export async function onRequestGet(context){
  const key = String(context?.env?.SGIS_CONSUMER_KEY || '').trim();
  if(!key) return unavailable('서버에 SGIS 서비스 ID가 설정되지 않았습니다.');

  let upstream;
  try{
    const url = new URL(UPSTREAM);
    url.searchParams.set('consumer_key', key);
    upstream = await fetch(url.toString(), {
      headers:{'Accept':'application/javascript,text/javascript,*/*;q=0.8'}
    });
  }catch(_e){
    return unavailable('SGIS 지도 서버에 연결하지 못했습니다.');
  }

  if(!upstream.ok) return unavailable(`SGIS 지도 서버 응답 오류(${upstream.status})`);
  const script = await upstream.text();
  if(!script || script.includes(key)){
    return unavailable(script.includes(key)
      ? 'SGIS 응답에 서비스 ID가 포함되어 안전하게 전달하지 않았습니다.'
      : 'SGIS 지도 스크립트가 비어 있습니다.');
  }

  /* SGIS 원본은 HTTP 로컬 개발 서버에서는 CSS까지 HTTP로 낮춥니다.
     운영 CSP는 HTTPS SGIS만 허용하므로 개발·운영 모두 HTTPS 자원을 쓰게 고정합니다. */
  const secureScript = script
    .replace(/if\s*\(\s*location\.protocol\s*==\s*['"]http:['"]\s*\)\s*\{\s*protocol\s*=\s*['"]http:['"];?\s*\}/, '')
    /* document.writeln 외부 CSS는 뒤 코드 실행을 오래 막을 수 있어 같은 출처 CSS 함수로 분리합니다. */
    .replace(/document\.writeln\([^;\n]*sop\.css[^;\n]*\);?\s*/, '');
  return new Response(`${secureScript}\nwindow.SGIS_MAP_STATUS={ready:true};`, {status:200, headers});
}

export async function onRequest(context){
  if(context?.request?.method === 'GET') return onRequestGet(context);
  return unavailable('GET 요청만 허용합니다.', 405);
}
