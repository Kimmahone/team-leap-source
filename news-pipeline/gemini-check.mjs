/* Gemini 점검 — 이 키로 쓸 수 있는 모델과, 지금 답하는 모델을 봅니다.
   키 값·응답 원문은 찍지 않습니다(공개 저장소의 실행 기록에 남기 때문).

     GEMINI_API_KEY=… node news-pipeline/gemini-check.mjs

   ★ 주간 브리프(build-weekly-brief.mjs)의 MODELS 를 고를 때 씁니다. */
const key = (process.env.GEMINI_API_KEY || '').trim();
if (!key) { console.log('GEMINI_API_KEY 없음'); process.exit(0); }
const H = { 'x-goog-api-key': key, 'Content-Type': 'application/json' };
const API = 'https://generativelanguage.googleapis.com/v1beta';

const list = await fetch(`${API}/models?pageSize=200`, { headers: H, signal: AbortSignal.timeout(30000) });
const data = await list.json().catch(() => ({}));
console.log(`모델 목록: HTTP ${list.status}`);
const names = (data.models || [])
  .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
  .map((m) => m.name.replace(/^models\//, ''));
console.log('generateContent 가능: ' + names.filter((n) => /gemini/.test(n)).join(' '));

const pick = [...new Set(['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-pro-latest',
  ...names.filter((n) => /^gemini-[\d.]+-(flash|flash-lite|pro)$/.test(n))])];
for (const model of pick) {
  const t = Date.now();
  try {
    const r = await fetch(`${API}/models/${model}:generateContent`, {
      method: 'POST', headers: H, signal: AbortSignal.timeout(60000),
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: '숫자 1 만 답하세요.' }] }], generationConfig: { maxOutputTokens: 16 } })
    });
    const j = await r.json().catch(() => ({}));
    console.log(`  ${model}: ${r.status}${r.ok ? '' : ' ' + ((j.error && j.error.message) || '').slice(0, 80)} (${Date.now() - t}ms)`);
  } catch (e) { console.log(`  ${model}: ${e.name}`); }
}
