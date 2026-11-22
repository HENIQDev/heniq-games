#!/usr/bin/env python3
"""dist/ をローカルで配信する（Cloudflare Pages に近い動作）。http://127.0.0.1:8790/"""
import functools
import http.server
import sys
from pathlib import Path

DIST = Path(__file__).resolve().parent.parent / "dist"


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".mjs": "text/javascript"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


def make_server(port=8790, host="127.0.0.1"):
    return http.server.ThreadingHTTPServer((host, port), functools.partial(Handler, directory=str(DIST)))


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    port = int(args[0]) if args else 8790
    lan = "--lan" in sys.argv
    if lan:
        import socket
        try:
            ip = socket.gethostbyname(socket.gethostname())
        except OSError:
            ip = "<Mac の IP>"
        print("【LAN モード】同じ Wi-Fi の端末から http://%s:%d/ で開けます。実機の確認が終わったら Ctrl+C で止めてください。" % (ip, port))
    else:
        print("http://127.0.0.1:%d/  （Ctrl+C で停止）" % port)
    make_server(port, "0.0.0.0" if lan else "127.0.0.1").serve_forever()
