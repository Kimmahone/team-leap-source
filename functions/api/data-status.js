import { CATALOG_VERSION, DATASETS, SERVICES } from '../shared/data-catalog.js';

export async function onRequestGet(context) {
  const env = context?.env || {};
  /* ★ 〔2026. 9. 6.〕 여기가 «없는 곳»을 보고 있었습니다.
     이 함수는 Cloudflare Pages 의 환경변수만 볼 수 있습니다. 그런데
     학교알리미·KOSIS·유치원알리미·EDSS 열쇠는 **GitHub Actions 시크릿**에
     있습니다 — 자료를 굽는 것은 Actions 이고, 구운 결과만 사이트로 나갑니다.
     그런데도 「not_configured(미설정)」이라고 답해서, 밖에서 보면 자동 갱신이
     꺼져 있는 것처럼 보였습니다. 실제로는 9월 5일에도 정상으로 돌았습니다.

     그래서 «런타임에 쓰는 것»만 배포 환경에서 확인하고, 수집용은
     여기서 알 수 없다고 그대로 말합니다. 모르는 것을 「없다」로 적지 않습니다. */
  const services = SERVICES.map(service => {
    const pendingApproval = Boolean(service.pendingApproval);
    const runtime = Boolean(service.runtime);
    let configured, configurationState;
    if (pendingApproval) {
      configured = false;
      configurationState = 'pending_approval';
    } else if (!runtime) {
      // 수집은 GitHub Actions 가 합니다. 이 함수는 그 시크릿을 볼 수 없습니다.
      configured = null;
      configurationState = 'managed_in_actions';
    } else {
      configured = service.env.every(name => typeof env[name] === 'string' && env[name].trim().length > 0);
      configurationState = configured ? 'configured' : 'not_configured';
    }
    return {
      id: service.id,
      name: service.name,
      use: runtime ? 'runtime' : 'scheduled_ingest',
      configured,
      configurationState,
      keyLocation: runtime ? 'cloudflare_pages_env' : 'github_actions_secrets',
      requiredVariables: service.env,
      optionalVariables: service.optionalEnv || []
    };
  });

  const body = {
    ok: true,
    catalogVersion: CATALOG_VERSION,
    generatedAt: new Date().toISOString(),
    datasets: DATASETS.map(({ id, name, provider, referenceDate, refresh, status }) => ({
      id, name, provider, referenceDate, refresh, status
    })),
    services
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}
