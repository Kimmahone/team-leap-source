/* 지도 7~8단계: 도로망 기반 통학 접근성 + SGIS 연령별 인구.
   키는 모두 Pages Function에만 있고 이 파일이나 브라우저 응답에는 들어오지 않습니다. */
(() => {
  'use strict';
  const C = { installed:false, panelOpen:false, tab:'access', armed:false, popup:null, population:null };
  const $ = id => document.getElementById(id);
  const empty = () => ({ type:'FeatureCollection', features:[] });
  const colors = ['#e8f1fb','#b9d5f2','#7eb0e4','#3e80c7','#174f9b'];

  function selectedSchool(){ return selectedSchoolKey ? findSchoolByKey(selectedSchoolKey) : null; }
  function schoolBox(){
    const sc=selectedSchool();
    return sc ? `<b>${htmlEsc(sc.name)}</b><br>${htmlEsc(sc.s)} · ${(LEVEL_CFG[sc.lv]||{}).full||sc.lv}<br><span>학교 좌표에서 출발합니다.</span>`
      : '<b>먼저 학교를 선택해 주세요.</b><br>지도 이름표나 왼쪽 학교 목록을 누르면 출발 학교가 정해집니다.';
  }
  function setStatus(text,error=false){const el=$('mc-status');if(!el)return;el.textContent=text||'';el.classList.toggle('is-error',!!error);}
  function setResult(html){const el=$('mc-result');if(!el)return;el.hidden=!html;el.innerHTML=html||'';}
  function setTab(tab){
    C.tab=tab==='population'?'population':'access';
    ['access','population'].forEach(name=>{
      const button=$('mc-tab-'+name),view=$('mc-'+name);
      if(button)button.setAttribute('aria-selected',String(name===C.tab));
      if(view)view.hidden=name!==C.tab;
    });
    if($('mc-school'))$('mc-school').innerHTML=schoolBox();
  }
  function disarmDestination(){
    C.armed=false;
    if(MV.map?.getCanvas)MV.map.getCanvas().style.cursor='';
  }
  function setPanel(open,preserve=true){
    C.panelOpen=!!open;
    const panel=$('mc-panel'),button=$('mc-tools-toggle');
    if(panel)panel.hidden=!C.panelOpen;
    if(button){button.setAttribute('aria-expanded',String(C.panelOpen));button.classList.toggle('is-active',C.panelOpen);}
    if(C.panelOpen){
      if(window.MapPolicy)MapPolicy.closeTools();
      setTab(C.tab);
      setTimeout(()=>$('mc-tab-'+C.tab)?.focus(),0);
    }else{
      disarmDestination();
      if(!preserve)clearAll();
    }
  }

  function sourceData(id,data){
    const source=MV.map?.getSource(id);
    if(source)source.setData(data||empty());
  }
  function ensureLayers(){
    const map=MV.map;if(!map||!map.isStyleLoaded?.())return false;
    const addSource=(id)=>{if(!map.getSource(id))map.addSource(id,{type:'geojson',data:empty()});};
    addSource('mc-pop');addSource('mc-iso');addSource('mc-route');
    const before=map.getLayer('mv-bound')?'mv-bound':undefined;
    if(!map.getLayer('mc-pop-fill'))map.addLayer({id:'mc-pop-fill',type:'fill',source:'mc-pop',paint:{
      'fill-color':['get','color'],'fill-opacity':['case',['==',['get','missing'],1],.16,.52]
    }},before);
    if(!map.getLayer('mc-pop-line'))map.addLayer({id:'mc-pop-line',type:'line',source:'mc-pop',paint:{
      'line-color':['case',['==',['get','missing'],1],'#8a96a3','#174f9b'],'line-width':1.3,'line-opacity':.78
    }},before);
    if(!map.getLayer('mc-iso-fill'))map.addLayer({id:'mc-iso-fill',type:'fill',source:'mc-iso',paint:{'fill-color':'#0d8b7b','fill-opacity':.2}},before);
    if(!map.getLayer('mc-iso-line'))map.addLayer({id:'mc-iso-line',type:'line',source:'mc-iso',paint:{'line-color':'#087f71','line-width':2.4,'line-opacity':.9}},before);
    if(!map.getLayer('mc-route-case'))map.addLayer({id:'mc-route-case',type:'line',source:'mc-route',paint:{'line-color':'#fff','line-width':7,'line-opacity':.9}},before);
    if(!map.getLayer('mc-route-line'))map.addLayer({id:'mc-route-line',type:'line',source:'mc-route',paint:{'line-color':'#ce6410','line-width':4,'line-opacity':.95}},before);
    return true;
  }
  function clearRoute(){sourceData('mc-iso',empty());sourceData('mc-route',empty());disarmDestination();setResult('');setStatus('');}
  function clearPopulation(){sourceData('mc-pop',empty());C.population=null;if(C.popup){C.popup.remove();C.popup=null;}setResult('');setStatus('');}
  function clearAll(){clearRoute();clearPopulation();}

  function coordinates(data,out=[]){
    if(!data)return out;
    if(Array.isArray(data)&&data.length===2&&data.every(Number.isFinite)){out.push(data);return out;}
    if(Array.isArray(data))data.forEach(value=>coordinates(value,out));
    else if(data.type==='FeatureCollection')(data.features||[]).forEach(feature=>coordinates(feature.geometry?.coordinates,out));
    else if(data.type==='Feature')coordinates(data.geometry?.coordinates,out);
    return out;
  }
  function fit(data){
    const points=coordinates(data);if(!points.length||!window.maplibregl)return;
    const bounds=new maplibregl.LngLatBounds(points[0],points[0]);points.slice(1).forEach(point=>bounds.extend(point));
    MV.map.fitBounds(bounds,{padding:70,maxZoom:14.8,duration:650});
  }
  async function postRoute(body){
    const response=await fetch('/api/route-access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    let data={};try{data=await response.json();}catch(_error){}
    if(!response.ok)throw Object.assign(new Error(data.error||'통학 경로를 계산하지 못했습니다.'),{reason:data.reason,status:response.status});
    return data;
  }
  function routeErrorText(error){
    if(error.reason==='not_configured')return 'Cloudflare에 ORS_API_KEY를 등록한 뒤 사용할 수 있습니다.';
    const local=['127.0.0.1','localhost'].includes(location.hostname);
    if(local&&[404,405,501].includes(error.status))return '정적 로컬 서버에서는 통학 API를 쓸 수 없습니다. Pages 개발 서버 또는 배포 미리보기에서 확인해 주세요.';
    return error.message;
  }
  async function showIsochrone(){
    const sc=selectedSchool();if(!sc){setStatus('먼저 출발 학교를 선택해 주세요.',true);return;}
    if(!ensureLayers()){setStatus('지도가 준비된 뒤 다시 시도해 주세요.',true);return;}
    const profile=$('mc-profile').value,minutes=Number($('mc-minutes').value);
    setStatus('도로망을 따라 도달권을 계산하는 중입니다…');setResult('');
    try{
      const data=await postRoute({action:'isochrone',profile,coordinates:[[sc.lon,sc.lat]],ranges:[minutes*60]});
      sourceData('mc-route',empty());sourceData('mc-iso',data.geojson);fit(data.geojson);
      const mode=profile==='foot-walking'?'도보':'자동차';
      setResult(`<b>${htmlEsc(sc.name)}</b><br><strong>${minutes}분 ${mode} 도달권</strong><br>OpenRouteService 도로망 기반 예상 범위`);
      setStatus('실제 통학차량 노선·교통상황·학생별 통학 기록은 반영하지 않습니다.');
    }catch(error){setStatus(routeErrorText(error),true);}
  }
  function armDestination(){
    const sc=selectedSchool();if(!sc){setStatus('먼저 출발 학교를 선택해 주세요.',true);return;}
    C.armed=true;setStatus('지도에서 목적지를 한 곳 눌러 주세요.');
    if(MV.map?.getCanvas)MV.map.getCanvas().style.cursor='crosshair';
  }
  async function showDirections(point){
    const sc=selectedSchool();if(!sc)return;
    disarmDestination();
    const profile=$('mc-profile').value;
    setStatus('도로 경로를 계산하는 중입니다…');setResult('');
    try{
      const data=await postRoute({action:'directions',profile,coordinates:[[sc.lon,sc.lat],[point.lng,point.lat]]});
      sourceData('mc-iso',empty());sourceData('mc-route',data.geojson);fit(data.geojson);
      const summary=data.geojson?.features?.[0]?.properties?.summary||{};
      const road=Number(summary.distance),duration=Number(summary.duration);
      const straight=haversineKm(sc.lat,sc.lon,point.lat,point.lng);
      const roadText=Number.isFinite(road)?(road<1000?`${Math.round(road)}m`:`${(road/1000).toFixed(1)}km`):'자료 없음';
      const timeText=Number.isFinite(duration)?`${Math.max(1,Math.round(duration/60))}분`:'자료 없음';
      setResult(`<b>${htmlEsc(sc.name)}에서 선택 지점까지</b><br><strong>도로 ${roadText} · 예상 ${timeText}</strong><br>직선거리 ${straight<1?Math.round(straight*1000)+'m':straight.toFixed(1)+'km'}`);
      setStatus('예상 경로이며 실제 통학노선과 등하교 시간대 교통상황은 반영하지 않습니다.');
    }catch(error){setStatus(routeErrorText(error),true);}
  }

  function closedRing(ring){
    if(!ring.length)return ring;const first=ring[0],last=ring[ring.length-1];
    return first[0]===last[0]&&first[1]===last[1]?ring:ring.concat([[first[0],first[1]]]);
  }
  function quantiles(values){
    const sorted=values.slice().sort((a,b)=>a-b);if(!sorted.length)return [0,0,0,0];
    return [.2,.4,.6,.8].map(p=>sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))]);
  }
  function colorFor(value,cuts){let index=0;while(index<cuts.length&&value>cuts[index])index++;return colors[index];}
  function populationGeo(data){
    const by={};(data.rows||[]).forEach(row=>{by[row.region]=row;});
    const cuts=quantiles((data.rows||[]).map(row=>Number(row.population)).filter(Number.isFinite));
    const features=Object.keys(GB||{}).map(region=>{
      const row=by[region],value=row?Number(row.population):null,rings=gbRings(GB[region]);
      return {type:'Feature',properties:{region,value:value??0,display:value==null?'자료 없음':fmt(value)+'명',missing:value==null?1:0,color:value==null?'#aeb7c1':colorFor(value,cuts)},geometry:{type:'MultiPolygon',coordinates:rings.map(ring=>[closedRing(ring)])}};
    });
    return {geojson:{type:'FeatureCollection',features},cuts};
  }
  function legend(cuts){
    const labels=[`~${fmt(cuts[0])}`,`${fmt(cuts[0]+1)}~${fmt(cuts[1])}`,`${fmt(cuts[1]+1)}~${fmt(cuts[2])}`,`${fmt(cuts[2]+1)}~${fmt(cuts[3])}`,`${fmt(cuts[3]+1)}~`];
    return colors.map((color,index)=>`<span><i style="background:${color}"></i>${labels[index]}명</span>`).join('')+'<span><i style="background:#aeb7c1;opacity:.35"></i>자료 없음</span>';
  }
  async function showPopulation(){
    if(!ensureLayers()){setStatus('지도가 준비된 뒤 다시 시도해 주세요.',true);return;}
    const year=$('mc-pop-year').value,band=$('mc-pop-band').value;
    setStatus('SGIS 연령별 인구를 불러오는 중입니다…');setResult('');
    try{
      const response=await fetch(`/api/sgis-school-age?year=${encodeURIComponent(year)}&band=${encodeURIComponent(band)}`);
      let data={};try{data=await response.json();}catch(_error){}
      if(!response.ok)throw Object.assign(new Error(data.error||'연령별 인구를 받지 못했습니다.'),{reason:data.reason,status:response.status});
      const built=populationGeo(data);C.population=data;sourceData('mc-pop',built.geojson);sourceData('mc-iso',empty());sourceData('mc-route',empty());
      $('mc-legend').innerHTML=legend(built.cuts);
      setResult(`<b>${data.year}년 ${htmlEsc(data.bandLabel)}</b><br><strong>${fmt(data.total)}명 · ${fmt(data.rows.length)}개 시군 연결</strong><br>${htmlEsc(data.source)}`);
      setStatus(data.limitation||'낮은 인구와 자료 없음을 다른 색으로 표시합니다.');
      fit(built.geojson);
    }catch(error){
      const text=error.reason==='not_configured'?'Cloudflare의 SGIS 키·비밀값을 확인해 주세요.':(error.status===404?'정적 로컬 서버에서는 자료 API를 쓸 수 없습니다. Pages 개발 서버 또는 배포 미리보기에서 확인해 주세요.':error.message);
      setStatus(text,true);
    }
  }
  function populationHover(event){
    if(!C.population)return;const feature=event.features?.[0];if(!feature)return;
    if(!C.popup)C.popup=new maplibregl.Popup({closeButton:false,closeOnClick:false,offset:10,maxWidth:'220px'});
    C.popup.setLngLat(event.lngLat).setHTML(`<b>${htmlEsc(feature.properties.region)}</b><br>${C.population.year}년 ${htmlEsc(C.population.bandLabel)} · ${htmlEsc(feature.properties.display)}`).addTo(MV.map);
  }

  function install(){
    if(C.installed||!MV.map)return;C.installed=true;
    const mapbox=document.querySelector('.mv-map');
    mapbox.insertAdjacentHTML('beforeend',`<button type="button" class="mv-fold-side mc-tools-toggle" id="mc-tools-toggle" aria-expanded="false" aria-controls="mc-panel"><span class="ic" aria-hidden="true">◎</span><span class="lb">지역 여건</span></button>
      <section class="mc-panel" id="mc-panel" aria-label="통학 접근성과 연령별 인구 도구" hidden>
        <header><div><small>지도 7~8단계</small><h2>지역 여건</h2></div><div class="mc-panel-actions"><button type="button" class="mc-panel-close" id="mc-panel-min" aria-label="설정 창만 접기" title="레이어는 유지하고 설정 창만 접기">−</button><button type="button" class="mc-panel-close" id="mc-panel-close" aria-label="지역 여건 종료" title="레이어까지 모두 닫기">×</button></div></header>
        <div class="mc-tabs" role="tablist"><button type="button" id="mc-tab-access" role="tab" aria-controls="mc-access" aria-selected="true">통학 접근</button><button type="button" id="mc-tab-population" role="tab" aria-controls="mc-population" aria-selected="false">연령별 인구</button></div>
        <div class="mc-view" id="mc-access" role="tabpanel"><div class="mc-school" id="mc-school"></div><div class="mc-grid"><label>이동수단<select id="mc-profile"><option value="driving-car">자동차</option><option value="foot-walking">도보</option></select></label><label>도달시간<select id="mc-minutes"><option value="15">15분</option><option value="30" selected>30분</option><option value="60">60분</option></select></label></div><div class="mc-actions"><button type="button" class="chip" id="mc-isochrone">도달권 보기</button><button type="button" class="chip" id="mc-destination">목적지 찍어 경로 보기</button><button type="button" class="chip" id="mc-clear-route">지우기</button></div><p class="mc-muted">도로망 기반 예상치입니다. 실제 통학차량 노선·교통상황·학생별 기록은 포함하지 않습니다.</p></div>
        <div class="mc-view" id="mc-population" role="tabpanel" hidden><div class="mc-grid"><label>기준연도<select id="mc-pop-year">${Array.from({length:8},(_v,i)=>`<option value="${2022-i}">${2022-i}년</option>`).join('')}</select></label><label>연령구간<select id="mc-pop-band"><option value="05_19">5~19세 합계</option><option value="00_04">0~4세</option><option value="05_09">5~9세</option><option value="10_14">10~14세</option><option value="15_19">15~19세</option></select></label></div><div class="mc-actions"><button type="button" class="chip" id="mc-show-pop">지도에 표시</button><button type="button" class="chip" id="mc-clear-pop">지우기</button></div><div class="mc-legend" id="mc-legend"></div><p class="mc-muted">SGIS가 제공하는 5세 단위만 표시합니다. 5~19세 합계는 학령기 근사치이며 재학생 수가 아닙니다.</p></div>
        <div class="mc-result" id="mc-result" hidden></div><p class="mc-status" id="mc-status" role="status" aria-live="polite"></p>
      </section>`);
    $('mc-tools-toggle').onclick=()=>setPanel(!C.panelOpen);
    $('mc-panel-min').onclick=()=>setPanel(false,true);$('mc-panel-close').onclick=()=>setPanel(false,false);
    $('mc-tab-access').onclick=()=>setTab('access');$('mc-tab-population').onclick=()=>setTab('population');
    $('mc-isochrone').onclick=showIsochrone;$('mc-destination').onclick=armDestination;$('mc-clear-route').onclick=clearRoute;
    $('mc-show-pop').onclick=showPopulation;$('mc-clear-pop').onclick=clearPopulation;
    $('mc-panel').addEventListener('pointerdown',event=>event.stopPropagation());$('mc-panel').addEventListener('wheel',event=>event.stopPropagation());
    MV.map.on('click',event=>{if(C.armed)showDirections(event.lngLat);});
    MV.map.on('mousemove','mc-pop-fill',populationHover);MV.map.on('mouseleave','mc-pop-fill',()=>{if(C.popup){C.popup.remove();C.popup=null;}});
    MV.map.on('load',ensureLayers);if(MV.map.isStyleLoaded?.())ensureLayers();
    window.addEventListener('keydown',event=>{if(event.key==='Escape'&&C.panelOpen)setPanel(false,true);});
    $('mp-tools-toggle')?.addEventListener('click',()=>setPanel(false,false));
    setTab('access');
  }

  const detail=mvRenderDetail;mvRenderDetail=function(...args){
    detail(...args);if(!C.installed||!selectedSchool())return;
    const button=document.createElement('button');button.type='button';button.className='chip';button.textContent='통학 접근 보기';
    button.onclick=()=>{C.tab='access';setPanel(true);};$('mv-detail-card').appendChild(button);
  };
  const start=mvStart;mvStart=async function(){await start();install();};
  const open=mvOpen;mvOpen=function(){open();install();if(C.panelOpen)setTab(C.tab);};
  let attempts=0;const timer=setInterval(()=>{if(MV.map){install();clearInterval(timer);}else if(++attempts>120)clearInterval(timer);},250);
  window.MapContext={state:C,setPanel,setTab,clearAll,showIsochrone,showPopulation,populationGeo};
})();
