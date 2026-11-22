#!/usr/bin/env python3
"""Chrome を実時間で動かして操作・計測する小さな道具（Chrome DevTools Protocol。Python 標準機能のみ）。
ヘッドレス Chrome の `--virtual-time-budget` は時間を早送りするため、FPS や GPU 時間の計測、実際のキー・タッチ操作の確認には使えない。

  python3 tools/cdp.py "http://127.0.0.1:8790/crowd-sprint-3d/?bench=1" [待つ秒数] [幅] [高さ] [--window]
  --window：実際のウィンドウで動かす（一時的なプロファイルの別の Chrome が開く）。

ライブラリとして：`with Browser(headless=True) as b: b.open(url); b.eval("…"); b.key('ArrowRight', 600); b.touch(...)`
"""
import base64
import hashlib
import json
import os
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import time
import urllib.request

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
KEYCODES = {"ArrowLeft": 37, "ArrowUp": 38, "ArrowRight": 39, "ArrowDown": 40, "Space": 32, "ShiftLeft": 16, "Enter": 13, "Escape": 27, "KeyM": 77, "KeyP": 80}
KEYNAMES = {"Space": " ", "ShiftLeft": "Shift", "KeyM": "m", "KeyP": "p"}


class WS:
    def __init__(self, url):
        host, rest = url[5:].split("/", 1)
        h, port = host.split(":")
        self.s = socket.create_connection((h, int(port)), timeout=60)
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
            msg += self._read(ln)
            if b1 & 0x80:
                return json.loads(msg.decode())

    def call(self, method, params=None):
        self.n += 1
        self.send({"id": self.n, "method": method, "params": params or {}})
        while True:
            m = self.recv()
            if m.get("id") == self.n:
                return m.get("result", m)


class Browser:
    def __init__(self, headless=True, width=480, height=860, dpr=2, mobile=False, flags=(), port=9333):
        self.headless, self.width, self.height, self.dpr, self.mobile, self.flags, self.port = headless, width, height, dpr, mobile, flags, port

    def __enter__(self):
        self.prof = tempfile.mkdtemp()
        cmd = [CHROME] + (["--headless=new"] if self.headless else ["--no-first-run", "--no-default-browser-check"]) + [
            "--no-sandbox", "--remote-debugging-port=%d" % self.port, "--user-data-dir=" + self.prof,
            "--window-size=%d,%d" % (self.width, self.height), "--js-flags=--expose-gc", "about:blank", *self.flags]
        self.proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        info = None
        for _ in range(80):
            try:
                info = json.loads(urllib.request.urlopen("http://127.0.0.1:%d/json" % self.port, timeout=2).read())
                if info:
                    break
            except Exception:
                time.sleep(0.4)
        self.ws = WS(next(t for t in info if t.get("type") == "page")["webSocketDebuggerUrl"])
        self.ws.call("Page.enable")
        self.viewport(self.width, self.height, self.dpr, self.mobile)
        return self

    def __exit__(self, *a):
        try:
            self.ws.s.close()
        except Exception:
            pass
        try:
            self.proc.terminate()
            self.proc.wait(timeout=5)
        except Exception:
            self.proc.kill()
        shutil.rmtree(self.prof, ignore_errors=True)

    def viewport(self, w, h, dpr=2, mobile=False):
        self.width, self.height = w, h
        self.ws.call("Emulation.setDeviceMetricsOverride", {"width": w, "height": h, "deviceScaleFactor": dpr, "mobile": mobile})
        self.ws.call("Emulation.setTouchEmulationEnabled", {"enabled": bool(mobile)})

    def open(self, url, settle=0.5):
        self.ws.call("Page.navigate", {"url": url})
        time.sleep(settle)

    def eval(self, expr):
        r = self.ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
        if "exceptionDetails" in r:
            raise RuntimeError(r["exceptionDetails"].get("exception", {}).get("description", str(r["exceptionDetails"])))
        return r.get("result", {}).get("value")

    def wait_for(self, expr, timeout=30, every=0.25):
        end = time.time() + timeout
        while time.time() < end:
            v = self.eval(expr)
            if v:
                return v
            time.sleep(every)
        return None

    # ---- 実際の入力イベント ----
    def key_down(self, code):
        self.ws.call("Input.dispatchKeyEvent", {"type": "keyDown", "code": code, "key": KEYNAMES.get(code, code), "windowsVirtualKeyCode": KEYCODES.get(code, 0), "text": " " if code == "Space" else ""})

    def key_up(self, code):
        self.ws.call("Input.dispatchKeyEvent", {"type": "keyUp", "code": code, "key": KEYNAMES.get(code, code), "windowsVirtualKeyCode": KEYCODES.get(code, 0)})

    def key(self, code, ms=100):
        self.key_down(code)
        time.sleep(ms / 1000)
        self.key_up(code)

    def touch(self, kind, points):
        """kind: touchStart / touchMove / touchEnd。points: [(id, x, y), ...]（CSS ピクセル）。touchEnd は残る指だけを渡す"""
        self.ws.call("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [{"id": i, "x": x, "y": y} for i, x, y in points]})

    def mouse(self, kind, x, y, button="left"):
        self.ws.call("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, "button": button, "buttons": 1 if kind != "mouseReleased" else 0, "clickCount": 1})

    def screenshot(self, path):
        r = self.ws.call("Page.captureScreenshot", {"format": "png"})
        with open(path, "wb") as f:
            f.write(base64.b64decode(r["data"]))


def run(url, wait=120, width=480, height=860, expr=None, headless=True):
    with Browser(headless=headless, width=width, height=height) as b:
        b.open(url, 0.2)
        return b.wait_for(expr or "(document.getElementById('bot-result')||{}).textContent||''", wait, 1.0)


if __name__ == "__main__":
    url = sys.argv[1]
    wait = int(sys.argv[2]) if len(sys.argv) > 2 else 120
    w = int(sys.argv[3]) if len(sys.argv) > 3 else 480
    h = int(sys.argv[4]) if len(sys.argv) > 4 else 860
    out = run(url, wait, w, h, headless="--window" not in sys.argv)
    print(out if out else "（時間内に結果が出ませんでした）")
    sys.exit(0 if out else 1)
