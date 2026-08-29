import { strict as assert } from 'node:assert';
import { validateBackendFoundation } from '../backend/scripts/check.mjs';
import { onRequestGet } from '../functions/api/data-status.js';

let pass = 0;
const check = async (name, fn) => {
  await fn();
  pass += 1;
  console.log(`OK ${name}`);
};

await check('데이터 목록·파일·D1 스키마가 서로 맞는다', async () => {
  assert.deepEqual(validateBackendFoundation().errors, []);
});

await check('상태 API가 키 값을 노출하지 않고 설정 여부만 돌려준다', async () => {
  const secret = 'do-not-expose-this-secret';
  const response = await onRequestGet({ env: { GEMINI_API_KEY: secret } });
  assert.equal(response.status, 200);
  const text = await response.text();
  const body = JSON.parse(text);
  assert.equal(body.ok, true);
  assert.ok(body.datasets.length >= 10);
  assert.equal(body.services.find(s => s.id === 'gemini').configured, true);
  assert.equal(body.services.find(s => s.id === 'sgis').configured, false);
  assert.equal(body.services.find(s => s.id === 'edss').configurationState, 'pending_approval');
  assert.equal(text.includes(secret), false);
});

console.log(`통과 ${pass}개`);
