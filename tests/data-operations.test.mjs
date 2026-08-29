import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DATASETS,SERVICES} from '../functions/shared/data-catalog.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=relative=>fs.readFileSync(path.join(ROOT,relative),'utf8');
const docs='06. 실행계획(1)/00. 운영문서';
let pass=0,fail=0;
const check=(name,ok)=>{if(ok){pass++;console.log('OK '+name);}else{fail++;console.error('FAIL '+name);}};

const requiredDocs=[
  'README.md','01_서비스_범위와_운영원칙.md','02_API키_갱신_매뉴얼.md',
  '03_데이터_기준연도와_오류관리.md','04_정기점검_체크리스트.md','05_자료요청_범위_정리.md',
  '06_EDSS_승인후_연결절차.md'
];
check('운영자가 먼저 읽을 문서 7종이 한 폴더에 있다',requiredDocs.every(name=>fs.existsSync(path.join(ROOT,docs,name))));

const index=read(`${docs}/README.md`);
check('운영문서 색인에 역할·자동화·상세문서가 연결된다',/데이터 운영/.test(index)&&/현재 자동화/.test(index)&&requiredDocs.slice(1).every(name=>index.includes(name)));

const workflow=read('.github/workflows/refresh-public-data.yml');
check('KOSIS 월간·학교와 유치원 분기 일정을 분리한다',workflow.includes("cron: '10 21 1 * *'")&&workflow.includes("cron: '40 21 1 1,4,7,10 *'"));
check('공시연도를 Actions Variable로 관리한다',workflow.includes("PUBLIC_DATA_YEAR: ${{ vars.PUBLIC_DATA_YEAR || '2026' }}"));
check('전체 검사 통과 뒤에만 데이터 변경을 커밋한다',workflow.indexOf('사이트 굽기.command')<workflow.indexOf('git commit -m'));

check('수집 스크립트가 GitHub Actions 환경변수를 읽는다',
  /process\.env\.SCHOOLINFO_API_KEY/.test(read('open api/bake-students.mjs'))&&
  /process\.env\.SCHOOLINFO_API_KEY/.test(read('open api/bake-coords.mjs'))&&
  /process\.env\.SCHOOLINFO_API_KEY/.test(read('open api/bake-special.mjs'))&&
  /process\.env\.KINDER_API_KEY/.test(read('open api/bake-kinder.mjs')));

check('EDSS 승인 대기와 API별 비밀변수 목록이 분리되어 있다',SERVICES.some(s=>s.id==='edss'&&s.pendingApproval&&s.env.length===0&&s.optionalEnv.includes('EDSS_SCHOOL_ATTRIBUTE_API_KEY')&&s.optionalEnv.includes('EDSS_STUDENT_STATUS_API_KEY')));
check('내부 정책·사업 자료를 핵심 데이터에서 제외한다',DATASETS.some(d=>d.id==='D6'&&d.status==='out_of_scope'));
check('이전 내부자료 요청 문서가 발송 금지로 표시된다',
  /발송하지 않음/.test(read('06. 실행계획(1)/경북교육청_내부자료_요청목록.md'))&&
  /발송 취소/.test(read('06. 실행계획(1)/경북교육청_자료요청_최종발송안.md')));

const apiManual=read(`${docs}/02_API키_갱신_매뉴얼.md`);
check('키 값이 아니라 환경변수와 오류 조치만 기록한다',/401·403/.test(apiManual)&&/429/.test(apiManual)&&/직전 정상 데이터 유지/.test(apiManual));

console.log(`통과 ${pass}개`);
process.exit(fail?1:0);
