import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG_VERSION, DATASETS, SERVICES } from '../../functions/shared/data-catalog.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

export function validateBackendFoundation() {
  const errors = [];
  const ids = new Set();
  const allowedStatus = new Set([
    'active',
    'partial',
    'planned',
    'waiting_internal_data',
    'needs_source_verification',
    'out_of_scope',
    'reference_only'
  ]);

  if (!/^\d{4}-\d{2}-\d{2}\.\d+$/.test(CATALOG_VERSION)) {
    errors.push(`목록 버전 형식 오류: ${CATALOG_VERSION}`);
  }

  for (const dataset of DATASETS) {
    if (!dataset.id || !dataset.name || !dataset.provider || !dataset.refresh || !dataset.status) {
      errors.push(`필수 항목 누락: ${dataset.id || '(ID 없음)'}`);
    }
    if (ids.has(dataset.id)) errors.push(`중복 데이터 ID: ${dataset.id}`);
    ids.add(dataset.id);
    if (!allowedStatus.has(dataset.status)) errors.push(`허용되지 않은 상태: ${dataset.id}/${dataset.status}`);
    for (const field of ['script', 'artifact']) {
      if (dataset[field] && !fs.existsSync(path.join(root, dataset[field]))) {
        errors.push(`파일 없음: ${dataset.id}.${field} = ${dataset[field]}`);
      }
    }
  }

  for (const service of SERVICES) {
    /* 〔2026. 9. 6.〕 예전에는 env 가 비면 «승인 대기»일 때만 봐줬습니다.
       EDSS 승인이 나면서 그 예외가 사라졌는데, EDSS 는 일곱 API 가운데
       어느 것이 오느냐에 따라 열쇠 이름이 달라 optionalEnv 에만 적혀 있습니다.
       그래서 「어느 쪽에든 이름이 하나는 있어야 한다」로 넓힙니다 —
       이름을 아예 안 적는 것만 막으면 됩니다. */
    const names = [...(service.env || []), ...(service.optionalEnv || [])];
    if (!names.length && !service.pendingApproval) errors.push(`환경변수 이름 없음: ${service.id}`);
    for (const name of names) {
      if (!/^[A-Z][A-Z0-9_]+$/.test(name)) errors.push(`환경변수 이름 형식 오류: ${name}`);
    }
  }

  const migration = fs.readFileSync(path.join(root, 'backend/migrations/0001_initial.sql'), 'utf8');
  for (const table of ['data_source', 'ingest_run', 'school', 'school_stat_year', 'population_projection', 'data_quality_issue', 'dataset_version']) {
    if (!migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) errors.push(`D1 테이블 정의 없음: ${table}`);
  }

  return { errors, datasetCount: DATASETS.length, serviceCount: SERVICES.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateBackendFoundation();
  if (result.errors.length) {
    result.errors.forEach(error => console.error(`FAIL ${error}`));
    process.exit(1);
  }
  console.log(`OK 데이터 ${result.datasetCount}종 · 서비스 ${result.serviceCount}종 · D1 스키마 점검 완료`);
}
