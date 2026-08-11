#!/bin/bash
#
# 로컬에서 열어 봅니다.
#
#   Finder 에서 이 파일을 두 번 누르면 브라우저가 열립니다.
#   끝낼 때는 이 터미널 창에서 Control-C 를 누르거나 창을 닫으세요.
#
# 왜 서버가 필요한가
#   앱은 파일을 그냥 두 번 눌러도(file://) 대부분 동작합니다.
#   다만 브라우저에 따라 file:// 에서 막히는 것이 있습니다 —
#   앱 C 의 책장(IndexedDB)이 사파리에서 그렇습니다.
#   그래서 확인할 때는 서버로 여는 편이 실제와 가깝습니다.
#
#   이 서버는 이 컴퓨터 안에서만 열립니다(127.0.0.1). 밖에서는 닿지 않습니다.
#

set -euo pipefail
cd "$(dirname "$0")"

PORT=8765
# 이미 쓰고 있는 번호면 비어 있는 번호를 찾습니다.
while lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
  if [ "$PORT" -gt 8800 ]; then echo "✗ 쓸 수 있는 번호를 찾지 못했습니다."; exit 1; fi
done

URL="http://127.0.0.1:$PORT/index.html"

APPS="http://127.0.0.1:$PORT/08.%20실행계획(3)/apps"

echo "TEAM LEAP — 학령인구 감소 대응"
echo
echo "  메인       $URL"
echo "  대시보드   http://127.0.0.1:$PORT/06.%20실행계획(1)/prototype/index.html"
echo "  앱 카탈로그 $APPS/index.html"
echo
echo "  앱 I 법정 의무교육 점검표를 채워진 예시로 보시려면,"
echo "  앱 안의 「파일에서 열기」로 이 파일을 여세요."
echo "    법정 의무교육/앱 I 예시 — 포항양덕초 4학년.json"
echo
echo "끝낼 때는 Control-C 를 누르세요."
echo

( sleep 1; open "$URL" ) &
python3 -m http.server "$PORT" --bind 127.0.0.1
