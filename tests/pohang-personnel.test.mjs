import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={};
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../06. 실행계획(1)/prototype/assets/school-context.js',import.meta.url),'utf8'),context);
const {personnel,render}=context.LeapSchoolContext;
const school={name:'흥해서부초등학교',s:'포항',lv:'초',fondKind:'공립'};
test('Pohang grades distinguish professions and attached kindergartens',()=>{
  const p=personnel(school);
  assert.equal(p.general,4);assert.equal(p.health,2);assert.equal(p.specialist,2);
  assert.equal(personnel({...school,name:'흥해서부초등학교병설유치원',lv:'유'}).general,4);
  assert.equal(personnel({...school,name:'유강유치원',lv:'유'}).general,3);
  assert.equal(personnel({...school,name:'포항장량유치원',lv:'유'}).general,4);
});
test('no inferred grades for unsupported schools',()=>{
  for(const patch of [{s:'문경'},{lv:'중'},{lv:'고'},{fondKind:'사립'},{name:'없는초등학교'},{name:'죽장초등학교상옥분교장'}]){
    assert.equal(personnel({...school,...patch}),null);
    assert.equal(render({...school,...patch}),'');
  }
});
test('2027 personnel criteria do not follow the student year slider',()=>{
  const html=render({...school,year:2016});
  assert.match(html,/2027학년도 기준/);assert.match(html,/학생 수 연도와 별개/);
  assert.doesNotMatch(html,/2027학년도 안|배정|통학구역|중학교 연계/);
  assert.match(render({...school,name:'포항대흥초등학교'}),/2028학년도부터 2급지/);
});
test('all 67 named elementary schools have all three grades',()=>{
  const schools=JSON.parse(fs.readFileSync(new URL('../06. 실행계획(1)/prototype/schools.json',import.meta.url)));
  const matches=schools.filter(s=>s.s==='포항'&&s.lv==='초').map(s=>personnel({s:s.s,lv:s.lv,name:s.n})).filter(Boolean);
  assert.equal(matches.length,67);
  for(const p of matches)for(const key of ['general','health','specialist'])assert.ok(p[key]>=1&&p[key]<=5);
});
test('compact popup remains short while detail contains role criteria',()=>{
  assert.match(render(school,true),/일반 4급지/);
  assert.doesNotMatch(render(school,true),/<details>/);
  assert.match(render(school),/보건 2급지/);
});
