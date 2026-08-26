import {onRequestGet,onRequest} from '../functions/api/sgis-map.js';
import {onRequestGet as onCssGet} from '../functions/api/sgis-map-css.js';

let pass=0, fail=0;
const check=(name,ok)=>{ if(ok){pass++;}else{fail++;console.error('✗ '+name);} };
const request=new Request('https://example.test/api/sgis-map');

check('POST 차단', (await onRequest({request:new Request(request.url,{method:'POST'}),env:{}})).status===405);
const missing=await onRequestGet({request,env:{}});
check('서비스 ID 미설정 시 안전한 대체 스크립트', missing.status===200 && (await missing.text()).includes('ready:false'));

const realFetch=globalThis.fetch;
let called='';
globalThis.fetch=async url=>{
  called=String(url);
  return new Response(`var protocol="https:";if(location.protocol == 'http:'){protocol="http:";}document.writeln('<link rel="stylesheet" href="'+protocol+'//sgisapi.mods.go.kr/maps/sop.css">');window.sop={map:function(){}};`, {status:200});
};
const ok=await onRequestGet({request,env:{SGIS_CONSUMER_KEY:'server-only-id'}});
const body=await ok.text();
check('SGIS 공식 호스트 호출', called.startsWith('https://sgisapi.mods.go.kr/OpenAPI3/auth/javascriptAuth?'));
check('서비스 ID는 응답에서 제거', !body.includes('server-only-id'));
check('정상 스크립트와 준비 상태 반환', ok.status===200 && body.includes('window.sop=') && body.includes('ready:true'));
check('SGIS 하위 자원은 HTTPS로 고정', !body.includes('protocol="http:"'));
check('상류 document.writeln CSS 제거', !body.includes('document.writeln'));

globalThis.fetch=async ()=>new Response('.pin{background:url(//sgisapi.mods.go.kr/maps/images/a.png)}',{status:200});
const css=await onCssGet();
const cssBody=await css.text();
check('SGIS CSS 중계 및 HTTPS 고정', css.status===200 && cssBody.includes('url(https://sgisapi.mods.go.kr/'));

globalThis.fetch=async ()=>new Response('server-only-id',{status:200});
const leaked=await onRequestGet({request,env:{SGIS_CONSUMER_KEY:'server-only-id'}});
check('상류 응답에 ID가 포함되면 차단', !(await leaked.text()).includes('server-only-id'));
globalThis.fetch=realFetch;

console.log(`✓  통과 ${pass} · 실패 ${fail}`);
process.exit(fail?1:0);
