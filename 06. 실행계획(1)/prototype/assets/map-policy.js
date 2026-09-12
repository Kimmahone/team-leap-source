/* Map policy tools: reuse school history and simulator calculations.
   No API credentials or new predictions are stored here. */
(() => {
  'use strict';
  const P = {
    mode:'normal',from:2016,to:2025,split:50,picks:[],second:null,installed:false,
    snapshot:[],scope:'',basis:'',simYear:null,panelOpen:false,
    valueMarks:{left:[],right:[]},valueTimers:{left:null,right:null}
  };
  const $ = id => document.getElementById(id);
  const esc = htmlEsc;
  const colors = {down:'#b84b32',fall:'#d18a26',steady:'#526e89',up:'#087f71',missing:'#929aa5'};
  const num = v => v == null ? '자료 없음' : fmt(v);
  function delta(a,b){return a==null||b==null?{value:null,pct:null}:{value:b-a,pct:a>0?100*(b-a)/a:null};}
  function color(d){return d.value==null?colors.missing:d.value>0?colors.up:d.pct<=-20?colors.down:d.pct<=-10?colors.fall:colors.steady;}
  function pair(sc){return [schoolStudentsAt(sc,P.from).v,schoolStudentsAt(sc,P.to).v];}
  /* 과거 비교는 두 연도 값이 모두 있는 학교만 보여 줍니다. 연결되지 않은 학교를
     「자료 없음」 마커로 채우면 변화가 아닌 것이 변화처럼 보입니다. */
  function comparisonPool(){return mvPool().filter(sc=>pair(sc).every(v=>v!=null));}
  function desc(sc){const [a,b]=pair(sc),d=delta(a,b);return `${P.from}년 ${num(a)}${a==null?'':'명'} → ${P.to}년 ${num(b)}${b==null?'':'명'} · ${d.value==null?'비교자료 없음':`${d.value>0?'+':''}${fmt(d.value)}명${d.pct==null?' (기준값 0명)':` (${d.pct.toFixed(1)}%)`}`}`;}
  function feature(sc,value,c){return {type:'Feature',geometry:{type:'Point',coordinates:[sc.lon,sc.lat]},properties:{key:schoolKey(sc),name:sc.name,value:value??0,missing:value==null?1:0,color:c,picked:P.picks.includes(schoolKey(sc))?1:0}};}
  /* 시군 모의값에는 학교별 미래 배치가 들어 있지 않습니다. 따라서 확대 화면의
     학교 값은 2026년 학생 수 비중대로 시군 모의 합계를 나눈 「참고 배분값」입니다.
     가장 큰 나머지부터 1명씩 더해 학교 값을 다시 합쳐도 시군 합계와 같게 합니다. */
  function scenarioSchoolRows(){
    const out=[];
    P.snapshot.forEach(region=>{
      const schools=SCHOOLS.filter(sc=>sc.s===region.label&&sc.lv===sim.level&&
        sc.lat!=null&&sc.lon!=null&&schoolStudentsAt(sc,2026).v!=null);
      if(!schools.length)return;
      const current=schools.map(sc=>Math.max(0,+schoolStudentsAt(sc,2026).v||0));
      const currentTotal=current.reduce((a,v)=>a+v,0);
      const target=Math.max(0,Math.round(+region.predStu||0));
      const raw=current.map(v=>currentTotal>0?target*v/currentTotal:target/schools.length);
      const allocated=raw.map(Math.floor);
      let remain=target-allocated.reduce((a,v)=>a+v,0);
      raw.map((v,i)=>({i,f:v-Math.floor(v)})).sort((a,b)=>b.f-a.f||a.i-b.i)
        .forEach(row=>{if(remain>0){allocated[row.i]++;remain--;}});
      schools.forEach((sc,i)=>out.push({
        key:schoolKey(sc),name:shortName(sc.name),fullName:sc.name,region:region.label,
        a:current[i],b:allocated[i],coords:[sc.lon,sc.lat],count:1,members:[sc],scenario:true
      }));
    });
    return out;
  }
  function data(right=false){
    if(P.mode==='scenario') return {type:'FeatureCollection',features:scenarioSchoolRows().map(row=>
      feature(row.members[0],right?row.b:row.a,right?'#b84b32':'#1b4fa0'))};
    return {type:'FeatureCollection',features:comparisonPool().map(sc=>{const [a,b]=pair(sc);return feature(sc,right?b:a,P.mode==='change'?color(delta(a,b)):right?'#087f71':'#1b4fa0');})};
  }
  function clearValueMarks(side){
    if(P.valueTimers[side])clearTimeout(P.valueTimers[side]);
    P.valueTimers[side]=null;
    (P.valueMarks[side]||[]).forEach(item=>(item.marker||item).remove());
    P.valueMarks[side]=[];
  }
  function shortName(name){
    return String(name||'').replace(/(초등학교|중학교|고등학교|유치원|학교)$/,'');
  }
  function boundsOf(rows){
    const lons=rows.map(r=>r.coords[0]),lats=rows.map(r=>r.coords[1]);
    return [[Math.min(...lons),Math.min(...lats)],[Math.max(...lons),Math.max(...lats)]];
  }
  function decorateRow(row,right=false){
    const d=delta(row.a,row.b);
    const value=P.mode==='change'?d.value:(right?row.b:row.a);
    const display=P.mode==='change'?`${d.value>0?'+':''}${fmt(d.value)}명`:`${fmt(value)}명`;
    const c=P.mode==='change'?color(d):(right?(row.scenario?'#b84b32':'#087f71'):'#1b4fa0');
    const range=`${P.mode==='scenario'?'2026':P.from}년 ${fmt(row.a)}명 → ${P.mode==='scenario'?P.simYear:P.to}년 ${P.mode==='scenario'?'참고 ':''}${fmt(row.b)}명`;
    return {...row,value,display,color:c,hoverText:`${row.fullName||row.name}\n${range}${row.count>1?` · ${fmt(row.count)}교 포함`:''}`};
  }
  function individualRows(){
    if(P.mode==='scenario')return scenarioSchoolRows();
    return comparisonPool().map(sc=>{const [a,b]=pair(sc);return {
      key:schoolKey(sc),name:shortName(sc.name),fullName:sc.name,region:sc.s,a,b,
      coords:[sc.lon,sc.lat],count:1,members:[sc],scenario:false
    };});
  }
  function regionRows(right=false){
    if(P.mode==='scenario'){
      const schools=scenarioSchoolRows(),by={};
      schools.forEach(row=>(by[row.region]||(by[row.region]=[])).push(row));
      return P.snapshot.map(region=>{
        const members=by[region.label]||[];if(!members.length)return null;
        const coords=[members.reduce((a,r)=>a+r.coords[0],0)/members.length,members.reduce((a,r)=>a+r.coords[1],0)/members.length];
        return decorateRow({name:`${region.label} · ${fmt(members.length)}교`,fullName:region.label,
          region:region.label,a:region.base.stu,b:region.predStu,coords,count:members.length,
          members:members.flatMap(r=>r.members),bounds:boundsOf(members),aggregate:true,scenario:true},right);
      }).filter(Boolean);
    }
    const by={};
    individualRows().forEach(row=>(by[row.region]||(by[row.region]=[])).push(row));
    return Object.values(by).map(members=>decorateRow({
      name:`${members[0].region} · ${fmt(members.length)}교`,fullName:members[0].region,region:members[0].region,
      a:members.reduce((a,r)=>a+r.a,0),b:members.reduce((a,r)=>a+r.b,0),
      coords:[members.reduce((a,r)=>a+r.coords[0],0)/members.length,members.reduce((a,r)=>a+r.coords[1],0)/members.length],
      count:members.length,members:members.flatMap(r=>r.members),bounds:boundsOf(members),aggregate:true,scenario:false
    },right));
  }
  /* 축소할 때 일부 학교를 잘라 버리지 않고 화면 좌표의 가까운 학교를 묶습니다.
     상자 하나의 「n교」는 그 n곳을 모두 대표하며 확대하면 더 작은 묶음과
     개별 학교로 풀립니다. 같은 좌표의 병설유치원도 하나의 묶음으로 읽힙니다. */
  function clusterRows(map,rows,right=false){
    const z=map.getZoom(),b=map.getBounds();
    const visible=rows.filter(row=>row.coords[0]>=b.getWest()&&row.coords[0]<=b.getEast()&&
      row.coords[1]>=b.getSouth()&&row.coords[1]<=b.getNorth());
    const size=z<10.6?[148,76]:z<12.4?[112,62]:z<14.2?[82,50]:[56,40];
    const groups={};
    visible.forEach(row=>{const p=map.project(row.coords),key=`${Math.floor(p.x/size[0])}|${Math.floor(p.y/size[1])}`;(groups[key]||(groups[key]=[])).push(row);});
    return Object.values(groups).map(members=>{
      if(members.length===1)return decorateRow(members[0],right);
      const all=members.flatMap(r=>r.members),a=members.reduce((sum,r)=>sum+r.a,0),c=members.reduce((sum,r)=>sum+r.b,0);
      return decorateRow({name:`${fmt(all.length)}교 묶음`,fullName:`${members[0].region} 학교 ${fmt(all.length)}곳`,
        region:members[0].region,a,b:c,coords:[members.reduce((sum,r)=>sum+r.coords[0],0)/members.length,
          members.reduce((sum,r)=>sum+r.coords[1],0)/members.length],count:all.length,members:all,
        bounds:boundsOf(members),aggregate:true,cluster:true,scenario:members[0].scenario},right);
    });
  }
  function valueRows(map,right=false){
    if(!map)return [];
    if(map.getZoom()<9.2)return regionRows(right);
    return clusterRows(map,individualRows(),right);
  }
  function boxesOverlap(a,b,gap=3){
    return !(a.right+gap<=b.left||a.left>=b.right+gap||a.bottom+gap<=b.top||a.top>=b.bottom+gap);
  }
  /* 이름표는 좌표를 바꾸지 않고 안쪽 상자만 비켜 그립니다. 앞 단계에서 학교를
     묶었으므로 충돌이 드물고, 남은 충돌도 숨기지 않아 포함 학교가 사라지지 않습니다. */
  function settleValueMarks(side,map){
    if(P.valueTimers[side])clearTimeout(P.valueTimers[side]);
    P.valueTimers[side]=setTimeout(()=>{
      const container=map?.getContainer?.();if(!container)return;
      const bounds=container.getBoundingClientRect(),kept=[];
      const items=(P.valueMarks[side]||[]).filter(x=>x.el?.isConnected)
        .sort((a,b)=>(b.priority||0)-(a.priority||0));
      items.forEach(item=>{item.el.hidden=false;item.el.style.transform='';});
      const shifts=[[0,0],[0,-38],[0,38],[-62,0],[62,0],[-62,-38],[62,-38],[-62,38],[62,38],
        [0,-76],[0,76],[-124,0],[124,0],[-124,-38],[124,-38],[-124,38],[124,38],
        [-62,-76],[62,-76],[-62,76],[62,76],[-124,-76],[124,-76],[-124,76],[124,76]];
      items.forEach(item=>{
        let placed=false;
        for(const [x,y] of shifts){
          item.el.style.transform=`translate(${x}px,${y}px)`;
          const r=item.el.getBoundingClientRect();
          const inside=r.left>=bounds.left+4&&r.right<=bounds.right-4&&r.top>=bounds.top+4&&r.bottom<=bounds.bottom-4;
          if(inside&&!kept.some(k=>boxesOverlap(r,k))){kept.push(r);placed=true;break;}
        }
        item.el.classList.toggle('is-crowded',!placed);
        if(!placed)item.el.style.transform='translate(0,0)';
      });
      P.valueTimers[side]=null;
    },40);
  }
  function renderValueMarks(map,right=false){
    const side=right?'right':'left';clearValueMarks(side);
    if(P.mode==='normal'||!map)return;
    valueRows(map,right).forEach(row=>{
      const wrap=document.createElement('div'),el=document.createElement('div');
      wrap.className='mp-value-wrap';el.className='mp-value-mark';
      if(row.cluster||row.count>1)el.classList.add('is-cluster');
      el.style.setProperty('--mp-color',row.color);
      el.innerHTML=`<b>${esc(row.name)}</b><span>${esc(row.display)}</span>`;
      el.setAttribute('aria-label',`${row.name} ${row.display}`);
      wrap.appendChild(el);
      if(!right&&(row.key||row.aggregate)){
        el.classList.add('is-action');el.tabIndex=0;el.setAttribute('role','button');
        const open=ev=>{ev.stopPropagation();
          if(row.aggregate){
            const bb=row.bounds,flat=bb&&bb[0][0]===bb[1][0]&&bb[0][1]===bb[1][1];
            if(flat)map.easeTo({center:row.coords,zoom:Math.min(16,map.getZoom()+2),duration:650});
            else if(bb)map.fitBounds(bb,{padding:90,maxZoom:15.5,duration:700});
            return;
          }
          const sc=findSchoolByKey(row.key);if(sc){selectSchool(sc);mvRenderDetail(true);}
        };
        el.addEventListener('click',open);
        el.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();open(ev);}});
      }
      const marker=new maplibregl.Marker({element:wrap,anchor:'bottom',offset:[0,-8]}).setLngLat(row.coords).addTo(map);
      P.valueMarks[side].push({marker,el,priority:(row.count||1)*1000000+Math.abs(row.value||0)});
    });
    settleValueMarks(side,map);
  }
  function totals(){
    if(P.mode==='scenario'){
      return [P.snapshot.reduce((a,r)=>a+r.base.stu,0),P.snapshot.reduce((a,r)=>a+r.predStu,0)];
    }
    return comparisonPool().reduce((sum,sc)=>{const [a,b]=pair(sc);sum[0]+=a;sum[1]+=b;return sum;},[0,0]);
  }
  function ensureLayer(map){
    if(map.getSource('mp-schools'))return;
    map.addSource('mp-schools',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    map.addLayer({id:'mp-schools',type:'circle',source:'mp-schools',paint:{
      /* 실제 표시는 네모 값 상자 하나로 통일합니다. 원형 레이어는 위치 판정용입니다. */
      'circle-radius':18,'circle-color':['get','color'],'circle-opacity':0,
      'circle-stroke-opacity':0,'circle-stroke-width':0
    }});
  }
  function updateLayer(map,right){
    if(!map?.getLayer('mv-bg'))return;
    ensureLayer(map);
    const layerData={type:'FeatureCollection',features:valueRows(map,right).map(row=>({
      type:'Feature',geometry:{type:'Point',coordinates:row.coords},properties:{key:row.name,name:row.name,
        schoolKey:row.key||'',value:row.value??0,missing:row.value==null?1:0,color:row.color,picked:0,
        aggregate:row.aggregate?1:0,count:row.count||1,display:row.display,hoverText:row.hoverText||''}
    }))};
    map.getSource('mp-schools').setData(layerData);
    map.setLayoutProperty('mp-schools','visibility',P.mode==='normal'?'none':'visible');
  }
  function syncSecond(){
    const m=MV.map,s=P.second;if(!m||!s)return;
    s.jumpTo({center:m.getCenter(),zoom:m.getZoom(),bearing:m.getBearing(),pitch:m.getPitch()});
    if(s.isStyleLoaded()){
      s.setLayoutProperty('mv-bound','visibility',MV.bound?'visible':'none');
      s.setLayoutProperty('mv-hills','visibility',MV.is3d?'visible':'none');
      if(typeof mvApplyTerrain==='function')mvApplyTerrain(s);
      ['mv-ruler','mv-near'].forEach(id=>{
        const source=m.getStyle().sources[id];if(source&&s.getSource(id))s.getSource(id).setData(source.data);
      });
    }
  }
  function second(){
    if(P.second)return;
    const style=JSON.parse(JSON.stringify(MV.map.getStyle()));
    style.layers=style.layers.filter(l=>!/^mp-/.test(l.id));
    delete style.sources['mp-schools'];
    P.second=new maplibregl.Map({container:'mp-second',style,center:MV.map.getCenter(),zoom:MV.map.getZoom(),interactive:false,attributionControl:false});
    P.second.on('load',()=>{syncSecond();updateLayer(P.second,true);renderValueMarks(P.second,true);});
    P.second.on('idle',()=>{if((P.mode==='compare'||P.mode==='scenario')&&!P.valueMarks.right.length)renderValueMarks(P.second,true);});
    P.second.on('error',()=>{$('mp-message').textContent='비교 배경 일부를 불러오지 못했습니다. 학교 자료와 출처를 확인해 주세요.';});
  }
  function clip(){
    $('mp-second').style.clipPath=`inset(0 0 0 ${P.split}%)`;
    $('mp-divider').style.left=P.split+'%';
  }
  function captureScenario(){
    renderSim();
    P.snapshot=simExportRows.filter(r=>!r.isTotal).map(r=>({...r,base:{...r.base},projection:{...r.projection}}));
    P.scope=aiInsightData.scope.region+' · '+aiInsightData.scope.schoolLevel;
    P.basis=currentBasisDescription();P.simYear=sim.year;
  }
  function render(){
    if(!P.installed)return;
    const compare=P.mode==='compare'||P.mode==='scenario';
    document.querySelector('.mv-map').classList.toggle('analysis-mode',P.mode!=='normal');
    $('mp-second').hidden=!compare;$('mp-swipe').hidden=!compare;$('mp-divider').hidden=!compare;
    $('mp-years').hidden=P.mode==='scenario'||P.mode==='normal';
    $('mp-scenario').hidden=P.mode!=='scenario';
    $('mp-mode').value=P.mode;
    ['mv-year','mv-stats','mv-legend','mv-list'].forEach(id=>{const c=$(id)?.closest('.mv-card');if(c)c.hidden=P.mode!=='normal';});
    $('mp-summary').hidden=P.mode==='normal';$('mp-legend').hidden=P.mode==='normal';$('mp-size-note').hidden=P.mode==='normal';
    const left=P.mode==='scenario'?'2026년 공시':`${P.from}년 실적`,right=P.mode==='scenario'?`${P.simYear}년 모의`:`${P.to}년 ${P.to===2026?'공시':'실적'}`;
    $('mp-left').textContent=left;$('mp-right').textContent=right;
    $('mp-caption').hidden=P.mode==='normal';
    const [a,b]=totals();
    const title=P.mode==='scenario'?`${P.scope} · 현재·미래 비교`:P.mode==='compare'?'과거·현재 비교':'학생 수 변화';
    $('mp-caption').innerHTML=P.mode==='change'
      ? `<span>${esc(title)} · ${P.from}년 → ${P.to}년</span><div class="mp-total"><b>연결 학교 합계</b><strong>${fmt(a)}명 → ${fmt(b)}명</strong></div>`
      : `<span>${esc(title)}</span><div class="mp-total-grid"><div><b>${esc(left)}</b><strong>${fmt(a)}명</strong></div><div><b>${esc(right)}</b><strong>${fmt(b)}명</strong></div></div>`;
    if(compare){second();P.second.resize();syncSecond();clip();}
    updateLayer(MV.map,false);if(P.second)updateLayer(P.second,true);
    renderValueMarks(MV.map,false);if(compare&&P.second)renderValueMarks(P.second,true);else clearValueMarks('right');
    const rows=mvPool(),matched=comparisonPool().length,excluded=rows.length-matched;
    const shown=valueRows(MV.map,false),represented=shown.reduce((sum,row)=>sum+(row.count||1),0);
    const shownAs=MV.map.getZoom()<9.2?`${shown.length}개 시군`:`${shown.length}개 값 상자`;
    $('mp-summary').innerHTML=P.mode==='scenario'?scenarioSummary():matched
      ? `비교 가능 <b>${fmt(matched)} / ${fmt(rows.length)}교</b><br>현재 화면 ${shownAs}에 ${fmt(represented)}교 포함<br>두 연도 값이 모두 있는 학교만 표시 · 미연결 ${fmt(excluded)}교 제외`
      : `<b>선택 조건에 비교 가능한 학교가 없습니다.</b><br>두 연도 값이 모두 연결된 학교만 지도에 표시합니다.`;
    $('mp-legend').innerHTML=P.mode==='change'?Object.entries({down:'20% 이상 감소',fall:'10~20% 감소',steady:'0~10% 미만 감소·유지',up:'증가'}).map(([k,v])=>`<span><i class="mp-key" style="background:${colors[k]}"></i>${v}</span>`).join(''):'<span><i class="mp-key" style="background:#1b4fa0"></i>기준</span><span><i class="mp-key" style="background:#087f71"></i>비교 실적</span><span><i class="mp-key" style="background:#b84b32"></i>모의</span>';
    $('mp-size-note').textContent=P.mode==='scenario'?'상자 수치: 축소 시 시군 합계, 확대 시 학교별 참고 배분값 · 시군 감소율을 2026년 학생 수에 비례 적용한 값이며 공식 학교별 예측이 아닙니다.':`상자 수치: ${P.mode==='change'?'두 연도 학생 수의 증감':P.from+'년 학생 수'+(compare?' / 오른쪽은 '+P.to+'년 학생 수':'')} · 축소 시 시군 합계, 확대 시 묶음과 학교별 수치로 바뀝니다.`;
    const toggle=$('mp-tools-toggle');
    if(toggle){toggle.classList.toggle('is-active',P.mode!=='normal');toggle.querySelector('.lb').textContent=P.mode==='normal'?'비교':P.mode==='change'?'학생 수 변화':P.mode==='compare'?'과거·현재':'현재·미래';}
  }
  function scenarioSummary(){
    const sum=(path)=>P.snapshot.reduce((a,r)=>a+path(r),0);
    const shown=valueRows(MV.map,false),represented=shown.reduce((a,r)=>a+(r.count||1),0);
    return `<b>${esc(P.basis)}</b><br>학생 ${fmt(sum(r=>r.base.stu))} → ${fmt(sum(r=>r.predStu))}명<br>학급 ${fmt(sum(r=>r.base.cls))} → ${fmt(sum(r=>r.projection.cls))}개<br>학교 ${fmt(sum(r=>r.base.sch))} → ${fmt(sum(r=>r.projection.sch))}교<br>현재 화면 ${shown.length}개 값 상자에 ${fmt(represented)}교 포함<br><small>시군별 합산 · 확대 시 학교별 참고 배분 · 공식 예측·학교 조정 계획이 아닙니다.</small>`;
  }
  function setMode(mode){
    P.mode=mode;
    if(mode==='scenario')captureScenario();
    render();
  }
  function pick(key){
    if(P.picks.includes(key))P.picks=P.picks.filter(k=>k!==key);
    else if(P.picks.length<5)P.picks.push(key);
    else {$('mp-message').textContent='학교 비교함은 최대 5곳입니다. 한 곳을 빼고 추가해 주세요.';return;}
    $('mp-message').textContent='';renderPicks();render();
  }
  function picked(){return P.picks.map(findSchoolByKey).filter(Boolean);}
  function renderPicks(){
    $('mp-picks').innerHTML=picked().map(sc=>`<div class="mp-selected"><span>${esc(sc.name)}</span><button class="chip" data-remove="${esc(schoolKey(sc))}" aria-label="${esc(sc.name)} 비교함에서 빼기">빼기</button></div>`).join('')||'<p class="mp-muted">학교를 누른 뒤 비교함에 담으세요. 최대 5곳까지 선택할 수 있습니다.</p>';
    $('mp-count').textContent=`학교 비교함 ${P.picks.length}/5`;
    $('mp-open-table').disabled=!P.picks.length;
    $('mp-picks').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>pick(b.dataset.remove));
  }
  function spark(sc){
    const ys=Array.from({length:11},(_,i)=>2016+i),vals=ys.map(y=>schoolStudentsAt(sc,y).v),max=Math.max(1,...vals.filter(v=>v!=null));
    const points=vals.map((v,i)=>v==null?null:[5+i*12,39-v/max*32]);let last=null,paths='';
    points.forEach(p=>{if(p&&last)paths+=`<path d="M${last.join(',')} L${p.join(',')}"/>`;last=p;});
    return `<svg class="mp-spark" viewBox="0 0 130 45" role="img" aria-label="${esc(sc.name)} 2016~2026 학생 수 추이"><g fill="none" stroke="#1b4fa0" stroke-width="2">${paths}</g>${points.filter(Boolean).map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="2" fill="#1b4fa0"/>`).join('')}</svg>`;
  }
  function table(){
    return `<table><thead><tr><th>학교</th><th>${P.from}년</th><th>${P.to}년</th><th>증감</th><th>2026 학급</th><th>2026 명/학급</th><th>2016~2026 추이</th></tr></thead><tbody>${picked().map(sc=>{const [a,b]=pair(sc),d=delta(a,b);return `<tr><th>${esc(sc.name)}</th><td>${num(a)}</td><td>${num(b)}</td><td>${d.value==null?'비교 불가':fmt(d.value)+'명'}</td><td>${num(sc.cls)}</td><td>${sc.stu!=null&&sc.cls>0?(sc.stu/sc.cls).toFixed(1):'–'}</td><td>${spark(sc)}</td></tr>`;}).join('')}</tbody></table>`;
  }
  function showTable(){
    $('mp-table').innerHTML=table();$('mp-dialog').showModal();
  }
  function exportCsv(){
    const rows=[['학교','시군','학교급',`${P.from} 학생`,`${P.to} 학생`,'증감','2026 학급','출처']];
    picked().forEach(sc=>{const [a,b]=pair(sc);rows.push([sc.name,sc.s,sc.lv,a??'',b??'',delta(a,b).value??'',sc.cls??'','EDSS 2016~2025 / 학교알리미 2026']);});
    const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""').replace(/^[=+@]/,"'$&")+'"').join(',')).join('\r\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='학교비교.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  function hover(e){
    $('mp-hover').hidden=true;
    if(P.mode==='normal'||MV.ruler)return;
    const right=(P.mode==='compare'||P.mode==='scenario')&&e.point.x>MV.map.getContainer().clientWidth*P.split/100;
    const map=right?P.second:MV.map;if(!map?.getLayer('mp-schools'))return;
    const f=map.queryRenderedFeatures(e.point,{layers:['mp-schools']})[0];
    if(!f)return;
    const text=f.properties.hoverText||`${f.properties.name} · ${right?$('mp-right').textContent:$('mp-left').textContent} ${f.properties.display}`;
    $('mp-message').textContent=text;
    $('mp-hover').hidden=false;$('mp-hover').textContent=text;
    $('mp-hover').style.left=Math.max(8,Math.min(e.point.x+12,MV.map.getContainer().clientWidth-300))+'px';
    $('mp-hover').style.top=Math.max(70,Math.min(e.point.y+12,MV.map.getContainer().clientHeight-110))+'px';
    if(e.type==='click'&&!+f.properties.aggregate&&f.properties.schoolKey){
      const sc=findSchoolByKey(f.properties.schoolKey);if(sc){selectSchool(sc);mvRenderDetail(true);}
    }
  }
  function setPanel(open){
    P.panelOpen=!!open;
    const panel=$('mp-panel'),button=$('mp-tools-toggle');
    if(panel)panel.hidden=!P.panelOpen;
    if(button)button.setAttribute('aria-expanded',String(P.panelOpen));
    if(P.panelOpen)setTimeout(()=>$('mp-mode')?.focus(),0);
  }
  function closeTools(){
    setPanel(false);
    if(P.mode!=='normal')setMode('normal');
  }
  function goView(name){
    const hash='#'+name;
    if(location.hash===hash)showView(name);
    else location.hash=hash;
  }
  function install(){
    if(P.installed||!MV.map)return;
    P.installed=true;
    const side=$('mv-side'),mapbox=document.querySelector('.mv-map');mapbox.classList.add('mp-map');
    mapbox.insertAdjacentHTML('beforeend',`<button type="button" class="mv-fold-side mp-tools-toggle" id="mp-tools-toggle" aria-expanded="false" aria-controls="mp-panel"><span class="ic" aria-hidden="true">⇄</span><span class="lb">비교</span></button>
      <section class="mp-panel" id="mp-panel" aria-label="지도 비교 도구" hidden>
        <header><div><small>지도 분석</small><h2>비교 도구</h2></div><div class="mp-panel-actions"><button type="button" class="mp-panel-close" id="mp-panel-min" aria-label="설정 창만 접기" title="비교는 유지하고 설정 창만 접기">−</button><button type="button" class="mp-panel-close" id="mp-panel-close" aria-label="비교 종료" title="비교 종료">×</button></div></header>
        <div class="mp-controls"><label>보기 방식<select id="mp-mode"><option value="normal">학교 현황</option><option value="change">학생 수 변화</option><option value="compare">과거·현재 비교</option><option value="scenario">현재·미래 비교</option></select></label>
          <div class="mp-pair" id="mp-years"><label>기준연도<select id="mp-from"></select></label><label>비교연도<select id="mp-to"></select></label></div>
          <div id="mp-scenario"><p class="mp-muted">학생수 시뮬레이터에서 선택한 지역·학교급·모의연도·산출 기준을 가져옵니다.</p><div class="mp-actions"><button class="chip" id="mp-go-sim">조건 바꾸기</button><button class="chip" id="mp-sync-sim">현재 조건 적용</button></div></div>
          <div id="mp-summary" class="mp-coverage"></div><div id="mp-legend" class="mp-legend"></div><p class="mp-muted" id="mp-size-note"></p>
          <details class="mp-tray"><summary id="mp-count">학교 비교함 0/5</summary><div id="mp-picks"></div><div class="mp-actions"><button class="chip" id="mp-open-table">학교 비교하기</button><button class="chip" id="mp-clear">비우기</button></div></details>
          <p class="mp-muted">EDSS 2016~2025 · 학교알리미 2026<br>과거 비교는 두 연도 값이 모두 연결된 학교만 표시합니다. 제외된 학교는 신설·폐교로 판정하지 않습니다.</p><p class="mp-muted" id="mp-message" role="status" aria-live="polite"></p>
        </div>
      </section>
      <div id="mp-hover" hidden></div><div id="mp-second" hidden></div><div id="mp-divider" hidden></div><div id="mp-caption" hidden></div><div id="mp-swipe" hidden><label for="mp-slider"><span id="mp-left"></span><span id="mp-right"></span></label><input id="mp-slider" aria-label="좌우 지도 비교 위치" type="range" min="0" max="100" value="50"></div>`);
    document.body.insertAdjacentHTML('beforeend','<dialog class="mp-dialog" id="mp-dialog"><header><h2>학교별 공개자료 비교</h2><button class="chip" id="mp-close">닫기</button></header><p class="mp-muted">학생 수 단위: 명 · 빈 구간은 자료 없음 · 현재 학교 위치 기준</p><div class="mp-table-wrap" id="mp-table"></div><div class="mp-actions"><button class="chip" id="mp-csv">Excel용 CSV 저장</button></div></dialog>');
    const opts=Array.from({length:11},(_,i)=>`<option>${2016+i}년</option>`).join('');
    $('mp-from').innerHTML=opts;$('mp-to').innerHTML=opts;$('mp-from').value=P.from+'년';$('mp-to').value=P.to+'년';
    $('mp-tools-toggle').onclick=()=>setPanel(!P.panelOpen);
    $('mp-panel-min').onclick=()=>setPanel(false);$('mp-panel-close').onclick=closeTools;
    $('mp-mode').onchange=e=>setMode(e.target.value);
    ['from','to'].forEach(k=>$('mp-'+k).onchange=e=>{P[k]=parseInt(e.target.value,10);render();});
    $('mp-slider').oninput=e=>{P.split=+e.target.value;clip();};
    $('mp-go-sim').onclick=()=>{setPanel(false);goView('sim');};$('mp-sync-sim').onclick=()=>{captureScenario();render();};
    $('mp-open-table').onclick=showTable;$('mp-close').onclick=()=>$('mp-dialog').close();
    $('mp-clear').onclick=()=>{P.picks=[];renderPicks();render();};$('mp-csv').onclick=exportCsv;
    $('mp-panel').addEventListener('pointerdown',e=>e.stopPropagation());$('mp-panel').addEventListener('wheel',e=>e.stopPropagation());
    window.addEventListener('keydown',e=>{if(e.key==='Escape'&&P.panelOpen)closeTools();});
    MV.map.on('move',syncSecond);MV.map.on('moveend',()=>{renderValueMarks(MV.map,false);if(P.second)renderValueMarks(P.second,true);});
    MV.map.on('resize',()=>{P.second?.resize();syncSecond();});side.addEventListener('click',()=>setTimeout(syncSecond,0));
    MV.map.on('load',render);MV.map.on('click',hover);MV.map.on('mousemove',hover);
    renderPicks();render();
  }
  const draw=mvDraw;mvDraw=function(){draw();render();};
  const detail=mvRenderDetail;mvRenderDetail=function(...args){detail(...args);if(!P.installed)return;const sc=selectedSchoolKey?findSchoolByKey(selectedSchoolKey):null;if(!sc)return;const b=document.createElement('button');b.className='chip';b.textContent=P.picks.includes(schoolKey(sc))?'비교함에서 빼기':'학교 비교함에 담기';b.onclick=()=>{pick(schoolKey(sc));mvRenderDetail();};$('mv-detail-card').appendChild(b);};
  const base=mvSetBase;mvSetBase=function(id){base(id);const m=P.second,b=mvBaseOf(id);if(m?.getSource('mv-vworld')){m.getSource('mv-vworld').setTiles([mvUrl(b.base,b.ext)]);m.setPaintProperty('mv-vworld','raster-saturation',b.saturation??0);m.setPaintProperty('mv-vworld','raster-opacity',id==='gray'?0.75:1);m.setLayoutProperty('mv-vworld-over','visibility',b.over?'visible':'none');}};
  const start=mvStart;mvStart=async function(){await start();install();};
  const open=mvOpen;mvOpen=function(){open();install();if(P.mode==='scenario'){captureScenario();render();}};
  // The first map initialization may already be awaiting the library.
  let attempts=0;const timer=setInterval(()=>{if(MV.map){install();clearInterval(timer);}else if(++attempts>120)clearInterval(timer);},250);
  window.MapPolicy={state:P,delta,color,pair,setMode,pick,data,valueRows,scenarioSchoolRows,render,setPanel,closeTools};
})();
