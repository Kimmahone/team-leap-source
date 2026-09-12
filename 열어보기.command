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

# ── 지도만 배포된 사이트에서 빌려 옵니다 ────────────────────────────
#
# ★ 왜 이렇게 하나 〔2026. 9. 6.〕
#
#   대시보드의 「실제 위치 지도」는 `<script src="/api/sgis-map">` 로 옵니다.
#   그 주소는 **Cloudflare Pages 함수**라 배포된 사이트에만 있습니다.
#   여기서 `python3 -m http.server` 만 띄우면 404 라서 지도가 아예 안 뜨고,
#   버튼을 눌러도 아무 일이 일어나지 않습니다.
#   실제로 「버튼이 안 눌린다」고 헛걸음한 적이 있습니다.
#
#   그래서 /api/ 로 시작하는 것만 배포된 사이트로 넘겨 받아 옵니다.
#   **나머지는 전부 이 컴퓨터의 파일입니다** — 고친 것이 그대로 보입니다.
#   인터넷이 없으면 그때는 간편 지도로 내려앉습니다(원래 그렇게 되어 있습니다).
#
#   열쇠는 여기 없습니다. 배포된 사이트가 자기 열쇠로 처리해 돌려줍니다.

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
