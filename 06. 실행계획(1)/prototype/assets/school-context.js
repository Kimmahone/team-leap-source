/* Pohang personnel transfer grades, confirmed 2027 criteria.
 * School-zone and middle-school links are intentionally outside this release. */
(function(root){
  'use strict';
  const general = [
    '포항중앙 효자 두호남부 이동 포항대흥 장량 포항송곡 포항해맞이 포항양덕 유강',
    '양학 두호 장성 창포 포항장흥 포항장원 대이 양서 달전 학천 흥해 흥해남산 초곡 연일 연일형산',
    '포항 포항영흥 포항남부 포항동부 포항항도 포항송도 신흥 대해 송림 대도 죽도 대잠 상대 항구 용흥 오천 구정 문덕 포항원동 초서 포항펜타',
    '청림 인덕 흥해서부 죽천 곡강 신광 청하 월포 송라 기계 대송 남성 동해 포항용산',
    '구룡포 대보 기북 죽장 문충 장기 양포'
  ];
  const health = [
    '포항영흥 포항항도 포항송도 죽도 대잠 항구 용흥',
    '포항 포항남부 포항동부 대해 상대 송림 대도 두호 포항장흥 달전 흥해 흥해남산 흥해서부 죽천 곡강 신광 기계 대송',
    '신흥 청림 장성 창포 대이 포항해맞이 구룡포 대보 청하 월포 송라 기북 죽장 연일형산 남성 오천 구정 문충 동해 장기 양포 초서 포항펜타',
    '포항중앙 인덕 효자 양학 포항대흥 포항장원 포항송곡 포항양덕 양서 학천 초곡 문덕 포항용산',
    '두호남부 이동 장량 연일 유강 포항원동'
  ];
  const specialist = [
    '포항 포항영흥 포항남부 포항항도 포항송도 대해 송림 죽도 대잠 상대 항구 용흥 대이',
    '포항동부 신흥 대도 두호 포항장흥 흥해 흥해남산 흥해서부 기계 연일형산 대송 남성',
    '청림 양학 포항대흥 장성 창포 포항장원 포항해맞이 구룡포 학천 죽천 곡강 신광 청하 월포 송라 기북 오천 구정 문충 동해 초서 포항용산 포항펜타',
    '인덕 두호남부 이동 장량 대보 달전 연일 유강 장기 양포',
    '포항중앙 효자 포항송곡 포항양덕 양서 초곡 죽장 문덕 포항원동'
  ];
  function grade(list,name){const i=list.findIndex(row=>row.split(' ').includes(name));return i<0?null:i+1;}
  function personnel(sc){
    if(sc.s!=='포항'||!['초','유'].includes(sc.lv)||sc.fondKind==='사립')return null;
    let name=String(sc.name||'').normalize('NFC');
    if(sc.lv==='유' && !name.endsWith('초등학교병설유치원')){
      const special={'유강유치원':[3,2,4],'포항장량유치원':[4,3,5]}[name];
      return special?{general:special[0],health:special[1],specialist:special[2]}:null;
    }
    name=name.replace(/초등학교(?:병설유치원)?$/,'');
    const g=grade(general,name);
    return g?{general:g,health:grade(health,name),specialist:grade(specialist,name),note:name==='포항대흥'?'일반 급지는 2027학년도까지 1급지, 2028학년도부터 2급지로 예고되어 있습니다.':''}:null;
  }
  const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function render(sc,compact=false){
    const parts=[];
    const p=personnel(sc);
    if(p){
      parts.push('<b>포항 관내 이동</b> · 일반 '+p.general+'급지 <small>(2027학년도 기준)</small>');
      if(!compact)parts.push('<details><summary>직종별 급지·적용 기준</summary>일반 '+p.general+'급지 / 보건 '+p.health+'급지 / 영양·사서·전문상담 '+p.specialist+'급지<br>포항 공립 유·초등 대상. 병설유치원은 본교에 준합니다. 학생 수 연도와 별개인 2027학년도 인사 기준입니다.<br>출처: 제공받은 「2027학년도 교육공무원(유초등) 인사관리기준 및 실무」 제7조'+(p.note?'<br>'+esc(p.note):'')+'</details>');
    }
    return parts.length?'<div class="sch-note school-context" style="line-height:1.6;overflow-wrap:anywhere">'+parts.join('<br>')+'</div>':'';
  }
  root.LeapSchoolContext={personnel,render};
  if(typeof module==='object')module.exports=root.LeapSchoolContext;
})(typeof globalThis==='object'?globalThis:this);
