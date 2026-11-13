import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
const dir=dirname(fileURLToPath(import.meta.url));
const html=readFileSync(resolve(dir,'index.html'),'utf8');
const {apps}=JSON.parse(html.match(/id="apps-data">([\s\S]*?)<\/script>/)[1]);
test('catalog has unique IDs and matching exhibition counts',()=>{
 assert.equal(apps.length,36); assert.equal(new Set(apps.map(a=>a.id)).size,36);
 assert.equal(apps.filter(a=>a.featured).length,16);
 assert.deepEqual(['data','class','work'].map(k=>apps.filter(a=>a.kind===k).length),[2,16,18]);
});
test('every app has a local preview and valid destination',()=>{
 for(const a of apps){assert.ok(a.previewAlt);assert.ok(existsSync(resolve(dir,a.preview)),a.id);assert.ok(['analyze','members','tools'].includes(a.group));const u=new URL(a.href,'https://team-leap.pages.dev/apps/store/');assert.equal(u.protocol,'https:');if(!a.href.startsWith('http'))assert.ok(existsSync(resolve(dir,a.href)),a.id);}
});
test('approved additions and dashboard primary / archive links are retained',()=>{
 for(const id of ['school-future','dokdo-coloring','cart-to-approval','eduprompt-nexus','mosaic','bg-remover','kahoot-maker','edutech-hub','dojang-gongbang','lesson-plan-maker'])assert.ok(apps.find(a=>a.id===id),id);
 const dashboard=apps.find(a=>a.id==='dashboard');assert.equal(dashboard.url,'https://population.gbeai.net/');assert.ok(dashboard.links.some(x=>x.url==='https://team-leap.pages.dev/dashboard/'));
});
