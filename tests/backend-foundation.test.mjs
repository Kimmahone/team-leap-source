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
  /* 〔2026. 9. 6.〕 EDSS 일곱 API 가 모두 승인되었습니다. 그리고 수집용 열쇠는
     Cloudflare 가 아니라 GitHub Actions 시크릿에 있으므로, 이 함수가 볼 수 있는
     곳에는 없습니다. 「없다(not_configured)」가 아니라 「여기서는 모른다」로 답합니다. */
  const edss = body.services.find(s => s.id === 'edss');
  assert.equal(edss.configurationState, 'managed_in_actions');
  assert.equal(edss.configured, null);
  assert.equal(edss.keyLocation, 'github_actions_secrets');
  /* 런타임에 쓰는 것만 배포 환경에서 확인합니다 */
  assert.equal(body.services.find(s => s.id === 'gemini').keyLocation, 'cloudflare_pages_env');
  assert.equal(body.services.find(s => s.id === 'kosis').configurationState, 'managed_in_actions');
  assert.equal(text.includes(secret), false);
});

console.log(`통과 ${pass}개`);
