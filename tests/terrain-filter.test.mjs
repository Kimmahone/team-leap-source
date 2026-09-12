import assert from 'node:assert/strict';
import {test} from 'node:test';
import filter from '../06. 실행계획(1)/prototype/assets/terrain-filter.js';
const {condition}=filter;
const w=160,mpp=8;
function field(fn){return Float64Array.from({length:w*w},(_,i)=>fn(i%w,Math.floor(i/w)));}
function error(a,b){let sum=0,n=0;for(let y=30;y<w-30;y++)for(let x=30;x<w-30;x++){sum+=(a[y*w+x]-b[y*w+x])**2;n++;}return Math.sqrt(sum/n);}
test('flat ground and a planar slope retain their absolute altitude',()=>{
 for(const source of [field(()=>123.5),field((x,y)=>80+x*.3+y*.2)])assert.ok(error(source,condition(source,w,w,mpp))<1e-7);
});
test('small undulations on a plain are suppressed without flattening its overall slope',()=>{
 const plane=field((x,y)=>80+x*.08+y*.03),noisy=field((x,y)=>plane[y*w+x]+4*Math.sin(x*.7)*Math.cos(y*.6));
 assert.ok(error(condition(noisy,w,w,mpp),plane)<error(noisy,plane)*.1);
});
test('high-relief mountain ridge and summit stay unchanged',()=>{
 const mountain=field((x,y)=>100+650*Math.exp(-((x-80)**2+(y-80)**2)/1300));
 const filtered=condition(mountain,w,w,mpp);
 assert.ok(Math.abs(filtered[80*w+80]-mountain[80*w+80])<1);
 assert.ok(error(filtered,mountain)<1);
});
test('a sufficient neighbour halo produces identical heights across tile boundaries',()=>{
 const source=field((x,y)=>60+.15*x+5*Math.sin(x*.3)*Math.cos(y*.2)),full=condition(source,w,w,mpp);
 const start=45,size=70,part=new Float64Array(size*w);
 for(let y=0;y<w;y++)for(let x=0;x<size;x++)part[y*size+x]=source[y*w+x+start];
 const filtered=condition(part,size,w,mpp);
 for(let y=30;y<w-30;y++)for(let x=26;x<size-26;x++)assert.ok(Math.abs(filtered[y*size+x]-full[y*w+x+start])<1e-7);
});
