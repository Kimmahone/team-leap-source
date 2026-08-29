import { CATALOG_VERSION, DATASETS, SERVICES } from '../shared/data-catalog.js';

export async function onRequestGet(context) {
  const env = context?.env || {};
  const services = SERVICES.map(service => {
    const pendingApproval = Boolean(service.pendingApproval);
    const configured = !pendingApproval && service.env.every(name => typeof env[name] === 'string' && env[name].trim().length > 0);
    return {
      id: service.id,
      name: service.name,
      use: service.runtime ? 'runtime' : 'scheduled_ingest',
      configured,
      configurationState: pendingApproval ? 'pending_approval' : (configured ? 'configured' : 'not_configured'),
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
