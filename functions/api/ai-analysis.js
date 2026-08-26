const MODEL = 'gemini-3.7-flash';
const MAX_PROMPT = 12000;
const SYSTEM_PROMPT = '당신은 경상북도 교육정책 분석 보조자입니다. 제공된 집계값만 분석하고 숫자를 만들지 마세요. 실적과 모의 예측을 명확히 구분하고, 한계·추가 확인자료·정책 검토 질문을 한국어 제목과 글머리표로 간결하게 제시하세요. 개인자료를 요구하지 마세요.';

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
};

function json(body, status=200){
  return new Response(JSON.stringify(body), {status, headers});
}

export async function onRequestPost(context){
  const request=context.request;
  const origin=request.headers.get('Origin');
  if(origin && origin !== new URL(request.url).origin) return json({error:'허용되지 않은 요청입니다.'},403);
  if(!context.env.GEMINI_API_KEY) return json({error:'서버에 Gemini 보안 키가 설정되지 않았습니다.'},503);

  let body;
  try{ body=await request.json(); }
  catch(_e){ return json({error:'요청 형식이 올바르지 않습니다.'},400); }
  const prompt=typeof body.prompt==='string' ? body.prompt.trim() : '';
  if(!prompt || prompt.length>MAX_PROMPT) return json({error:`분석 자료는 1~${MAX_PROMPT}자여야 합니다.`},400);

  let upstream;
  try{
    upstream=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-goog-api-key':context.env.GEMINI_API_KEY},
      signal:AbortSignal.timeout(45000),
      body:JSON.stringify({
        model:MODEL,
        system_instruction:SYSTEM_PROMPT,
        input:prompt,
        generation_config:{thinking_level:'low',max_output_tokens:1200}
      })
    });
  }catch(error){
    return json({error:error?.name==='TimeoutError'?'Gemini 응답 시간이 초과되었습니다. 잠시 후 다시 시도하세요.':'Gemini 연결에 실패했습니다.'},error?.name==='TimeoutError'?504:502);
  }
  if(!upstream.ok){
    const retry=upstream.status===429;
    let upstreamError={};
    try{ upstreamError=await upstream.json(); }catch(_e){}
    const reason=String(upstreamError?.error?.status || (retry ? 'RESOURCE_EXHAUSTED' : `G${upstream.status}`));
    return json({
      error:retry
        ? 'Gemini 무료 사용량 한도에 도달했습니다. 잠시 후 다시 시도하고 Google AI Studio의 사용량을 확인하세요.'
        :`Gemini가 요청을 거절했습니다. 운영 코드: G${upstream.status}`,
      upstreamStatus:upstream.status,
      reason
    },upstream.status===429?429:502);
  }
  const data=await upstream.json();
  const text=(typeof data.output_text==='string' ? data.output_text : (data.steps||[])
    .filter(step=>step.type==='model_output')
    .flatMap(step=>step.content||[])
    .filter(item=>item.type==='text')
    .map(item=>item.text||'')
    .join('')).trim();
  return text ? json({text,model:MODEL}) : json({error:'Gemini가 분석문을 반환하지 않았습니다.'},502);
}

export async function onRequest(context){
  if(context?.request?.method==='POST') return onRequestPost(context);
  return json({error:'POST 요청만 허용합니다.'},405);
}
