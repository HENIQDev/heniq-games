#!/usr/bin/env python3
"""開発・テスト用の WebSocket 中継（Python 標準機能のみ）。
Node / wrangler が無い環境で、オンライン対戦サーバーのコード（server/butt-sumo/core.js）を本物の WebSocket で試すためのもの。
  ・ブラウザの 1 タブが「サーバー役」（server/butt-sumo/devhost.js）として /__server に接続する
  ・ゲームのクライアントは /lobby や /room/<id> に接続する → ハブが、サーバー役のタブへ中継する
本番の Cloudflare の代わりではない（本番は server/butt-sumo/worker.js）。127.0.0.1 だけで待ち受ける。"""
import asyncio, base64, hashlib, json, os, struct, sys

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


async def read_frame(r):
    b = await r.readexactly(2)
    op, ln, masked = b[0] & 0x0F, b[1] & 0x7F, b[1] & 0x80
    if ln == 126:
        ln = struct.unpack(">H", await r.readexactly(2))[0]
    elif ln == 127:
        ln = struct.unpack(">Q", await r.readexactly(8))[0]
    mask = await r.readexactly(4) if masked else b""
    data = await r.readexactly(ln)
    if masked:
        data = bytes(c ^ mask[i % 4] for i, c in enumerate(data))
    return op, data


def frame(op, data=b""):
    n = len(data)
    head = bytes([0x80 | op])
    if n < 126:
        head += bytes([n])
    elif n < 65536:
        head += bytes([126]) + struct.pack(">H", n)
    else:
        head += bytes([127]) + struct.pack(">Q", n)
    return head + data


class Hub:
    def __init__(self, delay_ms=0):
        self.delay = delay_ms / 1000.0        # 通信遅延の再現（片道。クライアント⇄サーバーの両方向に付く）
        self.next = 1
        self.clients = {}
        self.server = None
        self.pending = []   # サーバー役が来る前のメッセージ

    def later(self, fn):
        """順序を保ったまま、遅延をつけて実行する"""
        if self.delay <= 0:
            fn()
        else:
            asyncio.get_event_loop().call_later(self.delay, fn)

    async def to_server(self, obj):
        if self.server:
            w = self.server["w"]
            data = frame(1, json.dumps(obj).encode())
            self.later(lambda: w.write(data))
        else:
            self.pending.append(obj)

    async def handle(self, r, w):
        try:
            head = await r.readuntil(b"\r\n\r\n")
        except Exception:
            w.close(); return
        lines = head.decode("latin1").split("\r\n")
        path = lines[0].split(" ")[1]
        hdr = {l.split(":", 1)[0].strip().lower(): l.split(":", 1)[1].strip() for l in lines[1:] if ":" in l}
        if hdr.get("upgrade", "").lower() != "websocket":
            w.write(b"HTTP/1.1 426 Upgrade Required\r\nContent-Length: 0\r\n\r\n"); await w.drain(); w.close(); return
        acc = base64.b64encode(hashlib.sha1((hdr["sec-websocket-key"] + GUID).encode()).digest()).decode()
        w.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n\r\n" % acc).encode())
        await w.drain()
        if path == "/__server":
            self.server = {"w": w}
            for o in self.pending:
                await self.to_server(o)
            self.pending = []
            await self.server_loop(r, w)
            return
        cid = self.next; self.next += 1
        self.clients[cid] = w
        await self.to_server({"k": "open", "c": cid, "path": path, "origin": hdr.get("origin", "")})
        try:
            while True:
                op, data = await read_frame(r)
                if op == 8:
                    break
                if op == 9:
                    w.write(frame(10, data)); continue
                if op in (1, 2):
                    await self.to_server({"k": "msg", "c": cid, "d": data.decode("utf-8", "replace")})
        except Exception:
            pass
        self.clients.pop(cid, None)
        await self.to_server({"k": "close", "c": cid})
        try:
            w.write(frame(8)); w.close()
        except Exception:
            pass

    async def server_loop(self, r, w):
        try:
            while True:
                op, data = await read_frame(r)
                if op == 8:
                    break
                if op != 1:
                    continue
                m = json.loads(data.decode())
                cw = self.clients.get(m.get("c"))
                if not cw:
                    continue
                if m["k"] == "send":
                    data = frame(1, m["d"].encode())
                    self.later(lambda cw=cw, data=data: cw.write(data))
                elif m["k"] == "close":
                    self.later(lambda cw=cw: (cw.write(frame(8)), cw.close()))
        except Exception:
            pass
        self.server = None


async def main(port, delay_ms=0):
    hub = Hub(delay_ms)
    srv = await asyncio.start_server(hub.handle, "127.0.0.1", port)
    print("dev hub: ws://127.0.0.1:%d" % port, flush=True)
    async with srv:
        await srv.serve_forever()


if __name__ == "__main__":
    asyncio.run(main(int(sys.argv[1]) if len(sys.argv) > 1 else 8791, int(sys.argv[2]) if len(sys.argv) > 2 else 0))
