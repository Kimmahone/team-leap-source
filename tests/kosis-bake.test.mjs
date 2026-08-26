import {aggregateSchoolAge,AGE_CODES} from '../open api/bake-kosis.mjs';

let pass=0,fail=0;
const check=(name,ok)=>{if(ok)pass++;else{fail++;console.error('✗ '+name);}};
const rows=[];
for(let age=6;age<=18;age++) rows.push({PRD_DE:'2026',C3_NM:`${age}세`,DT:'1000'});
const out=aggregateSchoolAge(rows);
check('6~18세 코드 13개',AGE_CODES.length===13);
check('초등 6개 연령 합산',out['2026'].초===6);
check('중등 3개 연령 합산',out['2026'].중===3);
check('고등 4개 연령 합산',out['2026'].고===4);
check('숫자가 아닌 값 제외',Object.keys(aggregateSchoolAge([{PRD_DE:'x',C2_NM:'6세',DT:'1'}])).length===0);
console.log(`✓  통과 ${pass} · 실패 ${fail}`);
process.exit(fail?1:0);
