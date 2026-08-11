const fs = require('fs');
const https = require('https');

const CLIENT_ID = 'e6gxp2t8xr';
const CLIENT_SECRET = 'iNJgQTDNxwQ004Rpt3s2iHGM5UJT25lAXdxWaoz';

const query = encodeURIComponent('학령인구 감소');

function tryFetchNcp() {
  const options = {
    hostname: 'naveropenapi.apigw.ntruss.com',
    path: `/search/v1/news?query=${query}&display=4`,
    headers: {
      'X-NCP-APIGW-API-KEY-ID': CLIENT_ID,
      'X-NCP-APIGW-API-KEY': CLIENT_SECRET
    }
  };

  console.log('📰 NCP Naver API Hub 뉴스 API 수집 시도 중...');
  https.get(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('NCP Response:', res.statusCode, body);
      try {
        const data = JSON.parse(body);
        if (data.items && data.items.length > 0) {
          saveNews(data.items);
          return;
        }
      } catch (e) {}
      tryFetchDevelopers();
    });
  }).on('error', () => tryFetchDevelopers());
}

function tryFetchDevelopers() {
  const options = {
    hostname: 'openapi.naver.com',
    path: `/v1/search/news.json?query=${query}&display=4&sort=sim`,
    headers: {
      'X-Naver-Client-Id': CLIENT_ID,
      'X-Naver-Client-Secret': CLIENT_SECRET
    }
  };
  https.get(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('Developers Response:', res.statusCode, body);
      try {
        const data = JSON.parse(body);
        if (data.items && data.items.length > 0) {
          saveNews(data.items);
        }
      } catch (e) {}
    });
  });
}

function saveNews(items) {
  const formatted = items.map(item => ({
    title: item.title.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
    link: item.originallink || item.link,
    pubDate: item.pubDate,
    description: item.description ? item.description.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"') : ''
  }));
  fs.writeFileSync('news-latest.json', JSON.stringify(formatted, null, 2));
  console.log('🎉 최신 뉴스 5건 자동 수집 성공!');
}

tryFetchNcp();
