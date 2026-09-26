#!/bin/bash
#
# 주간 브리프 만들기 — 로컬 〔2026. 9. 26.〕
#
#   Finder 에서 두 번 누르면 이 터미널에서 브리프를 만듭니다.
#   GitHub 에서는 매주 월요일 05:17(한국) 에 v2-deploy.yml(main 에서 예약 → v2 가지에서 job=weekly) 이 같은 일을 합니다.
#
#   ★ AI 초안을 보려면 이 폴더 맨 위에 .dev.vars 파일을 두고 한 줄을 넣으세요.
#        GEMINI_API_KEY=발급받은열쇠
#     (.dev.vars 는 깃에 올라가지 않습니다.) 열쇠가 없으면 «규칙 초안»을 만듭니다.
#   ★ 뉴스를 새로 받지는 않습니다 — 있는 news-history.json 으로 만듭니다.

cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "✗ node 가 없습니다. https://nodejs.org 에서 설치하세요."; read -r -p "엔터를 누르면 닫힙니다"; exit 1; }

echo "무엇을 할까요?"
echo "  1) 지난주 브리프 만들기  (이미 있는 시범호·검토 완료 호는 건너뜀)"
echo "  2) 지난주 브리프 새로 만들기  (있는 호도 덮어씀)"
echo "  3) 특정 주 만들기  (월요일 날짜를 물어봅니다)"
echo "  4) 비어 있는 지난 호 채우기  (최근 6주)"
read -r -p "번호: " pick
case "$pick" in
  1) node news-pipeline/build-weekly-brief.mjs ;;
  2) node news-pipeline/build-weekly-brief.mjs --force ;;
  3) read -r -p "월요일 날짜 (예: 2026-09-21): " wk; node news-pipeline/build-weekly-brief.mjs --week "$wk" --force ;;
  4) node news-pipeline/build-weekly-brief.mjs --backfill 6 ;;
  *) echo "번호를 고르지 않았습니다." ;;
esac
echo
echo "브라우저의 주간 브리프 화면을 새로 고치면 보입니다."
read -r -p "엔터를 누르면 닫힙니다"
