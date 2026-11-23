#!/usr/bin/env python3
"""JS の検証用：リポジトリを一時的に配信し、ヘッドレス Chrome で JS ファイルを実行して、返り値（JSON）を表示する。
  python3 tools/jsrun.py tests/js/foo.mjs   （ファイルは async 関数の本文として実行。`return` で値を返す。`await import('/games/…')` が使える）
Node が無い環境で、純粋な JS（sim.js・サーバーのロジックなど）を試すための道具。"""
import functools, http.server, json, sys, threading
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import cdp  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".mjs": "text/javascript"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


def serve():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(H, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def run_js(code, timeout=300, port=9340):
    srv = serve()
    base = "http://127.0.0.1:%d" % srv.server_address[1]
    try:
        with cdp.Browser(headless=True, port=port) as b:
            b.open(base + "/tests/blank.html", 0.5)
            expr = "(async()=>{try{const __r=await (async()=>{%s})();return JSON.stringify({ok:true,v:__r});}catch(e){return JSON.stringify({ok:false,e:String(e&&e.stack||e)});}})()" % code
            out = b.eval(expr)
            return json.loads(out)
    finally:
        srv.shutdown()


if __name__ == "__main__":
    r = run_js(Path(sys.argv[1]).read_text(encoding="utf-8"))
    if r["ok"]:
        print(json.dumps(r["v"], ensure_ascii=False, indent=1))
    else:
        print("ERROR:", r["e"]); sys.exit(1)
