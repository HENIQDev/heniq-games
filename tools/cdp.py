#!/usr/bin/env python3
"""Chrome を実時間で動かして、ページの結果を取る小さな道具（Chrome DevTools Protocol。Python 標準機能のみ）。
ヘッドレス Chrome の `--virtual-time-budget` は時間を早送りするため、FPS や GPU 時間の計測には使えない。
この道具は、Chrome をそのまま実時間で動かし、ページの `#bot-result` が現れるまで待って、中身を返す。

  python3 tools/cdp.py "http://127.0.0.1:8790/crowd-sprint-3d/?bench=1" [待つ秒数] [幅] [高さ] [--window]
  --window：実際のウィンドウで動かす（一時的なプロファイルの別の Chrome が開く）。ヘッドレスは画面の同期が実機と違うので、FPS・GPU 時間は --window で測る
"""
import base64
import hashlib
import json
import os
import socket
import struct
import subprocess
import sys
import tempfile
import time
import urllib.request

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


class WS:
    def __init__(self, url):
        host, rest = url[5:].split("/", 1)
        h, port = host.split(":")
        self.s = socket.create_connection((h, int(port)), timeout=30)
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall(("GET /%s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n" % (rest, host, key)).encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += self.s.recv(4096)
        self.buf = buf.split(b"\r\n\r\n", 1)[1]
        self.n = 0

    def send(self, obj):
        data = json.dumps(obj).encode()
        hdr = bytearray([0x81])
        mask = os.urandom(4)
        if len(data) < 126:
            hdr.append(0x80 | len(data))
        elif len(data) < 65536:
            hdr.append(0x80 | 126); hdr += struct.pack(">H", len(data))
        else:
            hdr.append(0x80 | 127); hdr += struct.pack(">Q", len(data))
        self.s.sendall(bytes(hdr) + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def _read(self, n):
        while len(self.buf) < n:
            chunk = self.s.recv(65536)
            if not chunk:
                raise ConnectionError("closed")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def recv(self):
        msg = b""
        while True:
            b1, b2 = self._read(2)
            ln = b2 & 0x7F
            if ln == 126:
                ln = struct.unpack(">H", self._read(2))[0]
            elif ln == 127:
                ln = struct.unpack(">Q", self._read(8))[0]
            payload = self._read(ln)
            msg += payload
            if b1 & 0x80:
                return json.loads(msg.decode())

    def call(self, method, params=None):
        self.n += 1
        self.send({"id": self.n, "method": method, "params": params or {}})
        while True:
            m = self.recv()
            if m.get("id") == self.n:
                return m.get("result", m)


def run(url, wait=120, width=480, height=860, expr=None, extra_flags=(), headless=True):
    port = 9333
    prof = tempfile.mkdtemp()
    proc = subprocess.Popen([CHROME] + (["--headless=new"] if headless else ["--no-first-run", "--no-default-browser-check"]) + ["--no-sandbox", "--remote-debugging-port=%d" % port, "--user-data-dir=" + prof,
                             "--window-size=%d,%d" % (width, height), "about:blank", *extra_flags], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        info = None
        for _ in range(60):
            try:
                info = json.loads(urllib.request.urlopen("http://127.0.0.1:%d/json" % port, timeout=2).read())
                if info:
                    break
            except Exception:
                time.sleep(0.5)
        ws = WS(next(t for t in info if t.get("type") == "page")["webSocketDebuggerUrl"])
        ws.call("Page.enable")
        ws.call("Emulation.setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": 2, "mobile": False})
        ws.call("Page.navigate", {"url": url})
        end = time.time() + wait
        expr = expr or "(document.getElementById('bot-result')||{}).textContent||''"
        while time.time() < end:
            time.sleep(1.0)
            r = ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
            v = r.get("result", {}).get("value")
            if v:
                return v
        return None
    finally:
        proc.terminate()


if __name__ == "__main__":
    url = sys.argv[1]
    wait = int(sys.argv[2]) if len(sys.argv) > 2 else 120
    w = int(sys.argv[3]) if len(sys.argv) > 3 else 480
    h = int(sys.argv[4]) if len(sys.argv) > 4 else 860
    out = run(url, wait, w, h, headless="--window" not in sys.argv)
    print(out if out else "（時間内に結果が出ませんでした）")
    sys.exit(0 if out else 1)
