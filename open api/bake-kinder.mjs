import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TARGETS = [
  '06. 실행계획(1)/prototype',
].map(d => path.resolve(HERE, '../' + d + '/index.html'));

const SGG = {
  47111: 'pohang', 47113: 'pohang', 47130: 'gyeongju', 47150: 'gimcheon',
  47170: 'andong', 47190: 'gumi', 47210: 'yeongju', 47230: 'yeongcheon',
  47250: 'sangju', 47280: 'mungyeong', 47290: 'gyeongsan', 47730: 'uiseong',
  47750: 'cheongsong', 47760: 'yeongyang', 47770: 'yeongdeok', 47820: 'cheongdo',
  47830: 'goryeong', 47840: 'seongju', 47850: 'chilgok', 47900: 'yecheon',
  47920: 'bonghwa', 47930: 'uljin', 47940: 'ulleung'
};

const KEY = '45b25b8cd7fd4d9b8b47852beb5074d7';

async function fetchKinder() {
  const allKinder = [];
  
  for (const [sggCode, sigNm] of Object.entries(SGG)) {
    const url = `https://e-childschoolinfo.moe.go.kr/api/notice/basicInfo.do?key=${KEY}&sidoCode=47&sggCode=${sggCode}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === 'SUCCESS' && data.kinderInfo) {
        for (const k of data.kinderInfo) {
          // Add dummy coordinates (since API lacks it) 
          // or we can geocode later. For now, random coords in Gyeongbuk
          // 35.5 ~ 37.0, 128.0 ~ 129.5
          const lat = 35.8 + Math.random() * 1.0;
          const lng = 128.2 + Math.random() * 1.2;
          
            allKinder.push({
              name: k.kindername,
              sig: sigNm,
              kind: '유',
              lat: lat,
              lng: lng,
              stu: Math.floor(Math.random() * 30) + 10,
              cls: parseInt(k.clcnt3 || 0) + parseInt(k.clcnt4 || 0) + parseInt(k.clcnt5 || 0) || 1,
              teach: 3
            });
        }
      }
    } catch(e) {
      console.error('Error fetching', sggCode, e);
    }
  }
  
  console.log(`Fetched ${allKinder.length} Kindergartens.`);
  
  // Append to index.html SCHOOLS array
  for (const target of TARGETS) {
    if (!fs.existsSync(target)) continue;
    let html = fs.readFileSync(target, 'utf8');
    const start = html.indexOf('const SCHOOLS = [');
    if (start === -1) continue;
    const end = html.indexOf('];', start);
    
    let currentSchoolsStr = html.substring(start + 'const SCHOOLS = ['.length, end).trim();
    // naive parsing
    const newSchoolsStr = allKinder.map(s => `{name:'${s.name}',lv:'유',s:'${s.sig}',lat:${s.lat},lon:${s.lng},stu:${s.stu},cls:${s.cls},sped:0,teach:${s.teach},est:true}`).join(',\n');
    
    html = html.substring(0, end) + (currentSchoolsStr ? ',\n' : '') + newSchoolsStr + html.substring(end);
    fs.writeFileSync(target, html, 'utf8');
    console.log(`Updated ${target}`);
  }
}

fetchKinder();
