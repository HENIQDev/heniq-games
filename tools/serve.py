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


def make_server(port=8790):
    return http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Handler, directory=str(DIST)))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8790
    print(f"http://127.0.0.1:{port}/  （Ctrl+C で停止）")
    make_server(port).serve_forever()
