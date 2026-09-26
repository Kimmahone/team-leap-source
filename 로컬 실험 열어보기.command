#!/bin/bash
#
# 로컬 실험 — 디자인 팀 틀 · 한눈에 보기 · 주간 브리프 〔2026. 9. 26.〕
#
#   Finder 에서 이 파일을 두 번 누르면 대시보드가 «한눈에 보기»로 열립니다.
#   끝낼 때는 이 터미널 창에서 Control-C 를 누르거나 창을 닫으세요.
#
#   ★ 이 폴더는 로컬 실험용 작업 폴더(git worktree)입니다.
#     원래 폴더 「1. 깃허브 탑재 (배포)」와 따로 움직이고, 깃허브에는 올라가지 않았습니다.
#     원래 폴더의 「열어보기.command」와 함께 켜도 번호(포트)가 겹치지 않습니다.
#
#   ★ 파일을 바로 두 번 눌러 열면(file://) 주간 브리프가 안 뜹니다.
#     브라우저가 자료 파일 읽기를 막기 때문입니다. 꼭 이 파일로 여세요.

set -euo pipefail
cd "$(dirname "$0")"

PORT=8810
while lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
  if [ "$PORT" -gt 8850 ]; then echo "✗ 쓸 수 있는 번호를 찾지 못했습니다."; exit 1; fi
done

DASH="http://127.0.0.1:$PORT/06.%20실행계획(1)/prototype/index.html"

echo "TEAM LEAP — 로컬 실험 (디자인 팀 틀 · 주간 브리프)"
echo
echo "  한눈에 보기   $DASH#overview"
echo "  주간 브리프   $DASH#brief"
echo
echo "  브리프를 새로 만들려면 「주간 브리프 만들기.command」를 두 번 누르세요."
echo "끝낼 때는 Control-C 를 누르세요."
echo

( sleep 1; open "$DASH#overview" ) &

# /api/ 로 시작하는 것만 배포된 사이트로 넘깁니다(시뮬레이터 AI 해설 등). 나머지는 이 폴더의 파일입니다.
python3 - "$PORT" <<'PYEOF'
import sys, subprocess, http.server, socketserver

PORT = int(sys.argv[1])
LIVE = "https://team-leap.pages.dev"

# 받아 오는 데 curl 을 씁니다.
# 맥에 딸려 오는 파이썬은 인증서 꾸러미가 없어 https 를 스스로 확인하지 못합니다
# (CERTIFICATE_VERIFY_FAILED). curl 은 시스템 인증서를 그대로 씁니다.
class H(http.server.SimpleHTTPRequestHandler):
    def proxy_api(self, method):
        try:
            args = ["curl", "-sS", "--max-time", "70", "-X", method,
                    "-w", "\n%{http_code}\n%{content_type}"]
            payload = None
            if method == "POST":
                length = int(self.headers.get("content-length", "0"))
                payload = self.rfile.read(length)
                args += ["-H", "content-type: application/json", "--data-binary", "@-"]
            args.append(LIVE + self.path)
            out = subprocess.run(args, input=payload, capture_output=True, check=True).stdout
            body, status, ctype = out.rsplit(b"\n", 2)
            self.send_response(int(status))
            self.send_header("content-type", ctype.decode().strip() or "application/octet-stream")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception:
            self.send_error(502, "live api unreachable")

    def do_GET(self):
        if self.path.startswith("/api/"):
            return self.proxy_api("GET")
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            return self.proxy_api("POST")
        self.send_error(405, "method not allowed")

    def log_message(self, fmt, *a):
        pass   # 조용히

socketserver.ThreadingTCPServer.allow_reuse_address = True
socketserver.ThreadingTCPServer.daemon_threads = True
with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), H) as httpd:
    httpd.serve_forever()
PYEOF
