#!/usr/bin/env python3
"""本番のオンライン対戦サーバーの確認：2 つの独立した Chrome が、実際のサーバー（Cloudflare）と WebSocket でつながって対戦する。
  python3 tools/prod_check.py <wss://サーバー> [--page http://127.0.0.1:8793/butt-sumo/ | https://…/butt-sumo/]
・--page を省略すると、ローカルでゲームを配信（オリジン http://127.0.0.1:8793 を、サーバー側で許可しておく必要がある）
・確認用の戦績（ニックネーム「検証A」「検証B」）は、最後にサーバーから削除する
CPU 同士の対戦ではない。2 つの別々のクライアントの入力を、サーバーが 30 Hz で処理する。"""
import argparse, functools, http.server, json, sys, threading, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import build, cdp, serve  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("server")
ap.add_argument("--page")
ap.add_argument("--matches", type=int, default=1)
args = ap.parse_args()
http_base = args.server.replace("wss://", "https://")
results = []


def ok(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("PASS " if cond else "FAIL ") + name + (("  " + str(extra)) if extra != "" else ""), flush=True)


# 1 稼働（HTTP）
t0 = time.time()
UA = {"User-Agent": "heniq-check/1.0"}
body = urllib.request.urlopen(urllib.request.Request(http_base + "/health", headers=UA), timeout=15).read().decode()
ok("サーバーが稼働している（/health）", body == "ok", "%d ms" % round((time.time() - t0) * 1000))
req = urllib.request.Request(http_base + "/lobby", headers={"Origin": "https://evil.example", **UA})
try:
    urllib.request.urlopen(req, timeout=15); code = 200
except urllib.error.HTTPError as e:
    code = e.code
ok("WebSocket 以外の接続は拒否される（426）", code == 426, code)

# 2 ゲームのページ
srv = None
if args.page:
    page = args.page
else:
    out = ROOT / "tests" / "_out" / "prod_check_dist"
    build.build(release=False, out=out)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8793), functools.partial(serve.Handler, directory=str(out)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    page = "http://127.0.0.1:8793/butt-sumo/"
url = page + ("&" if "?" in page else "?") + "debug=1&server=" + args.server

clients = []


def client(nick, char, port):
    b = cdp.Browser(headless=True, port=port, width=900, height=520, dpr=1).__enter__()
    clients.append(b)
    b.open(url, 1.5)
    b.eval("__bs.G.save.settings.nick=%s; __bs.G.save.char=%s; 1" % (json.dumps(nick), json.dumps(char)))
    return b


def state(b):
    return json.loads(b.eval("JSON.stringify({screen:__bs.G.screen,phase:__bs.G.online.phase,msg:__bs.G.online.msg||null,me:__bs.G.online.me||null,v:__bs.G.battle&&__bs.G.battle.view?{n:__bs.G.battle.view.tick,ph:__bs.G.battle.view.phase}:null})"))


def play(bs, pred, timeout=150, attacker=0):
    end = time.time() + timeout
    i = 0
    while time.time() < end:
        i += 1
        for k, b in enumerate(bs):
            try:
                if k == attacker:
                    b.key_down("ArrowRight")
                    if i % 2 == 0: b.key("Space", 60)
                elif i % 5 == 0: b.key("ShiftLeft", 150)
            except Exception:
                pass
        time.sleep(0.12)
        if pred(): return True
    return False


try:
    A = client("検証A", "ojisan", 9391)
    B = client("検証B", "gorilla", 9392)
    for b in (A, B): b.eval("__bs.G.enterOnline(false); 1")
    ok("2 つのクライアントが WebSocket で接続し、ロビーに入れる", all(b.wait_for("__bs.G.online.phase==='lobby'", 20) for b in (A, B)), [state(A)["phase"], state(B)["phase"]])
    meA = state(A)["me"]
    ok("新しい匿名 ID は、レート 1500・戦績 0 で始まる", meA and meA["rating"] == 1500 and meA["games"] == 0, meA)
    A.eval("__bs.G.net.rank(); 1")
    for n in range(args.matches):
        t1 = time.time()
        if n == 0:
            for b in (A, B): b.eval("__bs.G.findMatch(); 1")
        else:
            for b in (A, B): b.eval("__bs.G.enterOnline(true); 1")
        both = all(b.wait_for("__bs.G.screen==='battle'", 40) for b in (A, B))
        ok("[試合%d] ランダムマッチングが成立し、対戦が始まる" % (n + 1), both, "%.1f 秒" % (time.time() - t1))
        if not both: raise SystemExit(1)
        time.sleep(2.0)
        n0 = state(A)["v"]["n"]; time.sleep(1.0); n1 = state(A)["v"]["n"]
        ok("[試合%d] サーバーの状態が届く（毎秒の更新数）" % (n + 1), n1 - n0 >= 20, n1 - n0)
        rtt = A.eval("__bs.G.net.rtt")
        done = play([A, B], lambda: state(A)["screen"] == "onlineResult" and state(B)["screen"] == "onlineResult", 160, attacker=n % 2)
        for b in (A, B): b.key_up("ArrowRight")
        ok("[試合%d] サーバーが勝敗を確定し、両者に結果が届く" % (n + 1), done)
        ra = A.eval("document.querySelector('.screen.result h2').textContent"); rb = B.eval("document.querySelector('.screen.result h2').textContent")
        ok("[試合%d] 勝敗が食い違わない（一方が勝ち、もう一方が負け）" % (n + 1), {ra, rb} == {"勝利！", "敗北…"}, "%s / %s" % (ra, rb))
        ra_txt = A.eval("document.querySelector('.screen.result .r-row b').textContent"); rb_txt = B.eval("document.querySelector('.screen.result .r-row b').textContent")
        print("     レート表示 A:", ra_txt, " B:", rb_txt, " ping:", None if rtt is None else round(rtt), "ms", flush=True)
    # 戦績・レートが、サーバーの記録として反映されている（ロビーに戻って取得し直す）
    for b in (A, B): b.eval("__bs.G.leaveOnline(); __bs.G.enterOnline(false); 1")
    for b in (A, B): b.wait_for("__bs.G.online.phase==='lobby'", 20)
    sa, sb = state(A)["me"], state(B)["me"]
    ok("戦績がサーバーに保存され、再接続しても取得できる（試合数）", sa["games"] == args.matches and sb["games"] == args.matches, [sa, sb])
    ok("レートの合計が変わらない（ゼロサム）", sa["rating"] + sb["rating"] == 3000, [sa["rating"], sb["rating"]])
    ok("勝ち数と負け数が整合する", sa["w"] + sb["w"] == args.matches and sa["l"] + sb["l"] == args.matches)
    # 切断・再接続・放棄
    for b in (A, B): b.eval("__bs.G.findMatch(); 1")
    ok("[切断] もう一度、マッチングして対戦が始まる", all(b.wait_for("__bs.G.screen==='battle'", 40) for b in (A, B)))
    time.sleep(2.5)
    n0 = state(B)["v"]["n"]
    B.eval("__bs.G.net.debugDropRoom(); 1")
    time.sleep(4.0)
    n1 = state(B)["v"]["n"]
    ok("[再接続] 通信が切れても自動で再接続し、試合が続く", n1 > n0 + 30 and state(B)["screen"] == "battle", [n0, n1])
    pidB = B.eval("localStorage.getItem('heniq.games.butt-sumo.device')")      # 後始末で、B の戦績を本人の権限で削除するために控える
    clients.remove(B); B.__exit__(None, None, None)
    ok("[放棄] 片方がブラウザごと消えると、猶予（10 秒）のあと、残った側の勝ちになる", A.wait_for("__bs.G.screen==='onlineResult'", 60))
    txt = A.eval("document.querySelector('.screen.result').textContent")
    ok("[放棄] 勝利として扱われ、理由が表示される", "勝利" in txt and "切断" in txt, txt[:60])
    # 後始末：確認用の戦績をサーバーから削除（本人の権限で）
    A.eval("__bs.G.leaveOnline(); __bs.G.enterOnline(false); 1"); A.wait_for("__bs.G.online.phase==='lobby'", 20)
    A.eval("__bs.G.net.erase(); 1"); time.sleep(1.5)
    B2 = client("検証B", "gorilla", 9393)
    B2.eval("localStorage.setItem('heniq.games.butt-sumo.device', %s); 1" % json.dumps(pidB))
    B2.open(url, 1.5)
    B2.eval("__bs.G.save.settings.nick='検証B'; __bs.G.enterOnline(false); 1")
    B2.wait_for("__bs.G.online.phase==='lobby'", 20)
    B2.eval("__bs.G.net.erase(); 1"); time.sleep(1.5)
    B3 = client("確認", "ojisan", 9394)
    B3.eval("localStorage.setItem('heniq.games.butt-sumo.device', %s); 1" % json.dumps(pidB))
    B3.open(url, 1.5); B3.eval("__bs.G.enterOnline(false); 1"); B3.wait_for("__bs.G.online.phase==='lobby'", 20)
    me = state(B3)["me"]
    ok("[後始末] 確認用の戦績（A・B）をサーバーから削除できた（再接続すると、新規（試合数 0）に戻っている）", me and me["games"] == 0 and me["rating"] == 1500, me)
    B3.eval("__bs.G.net.erase(); 1"); time.sleep(1.0)
finally:
    for b in clients:
        try: b.__exit__(None, None, None)
        except Exception: pass
    if srv: srv.shutdown()
bad = [r for r in results if not r[1]]
print("\n結果：%d 件中 %d 件が成功" % (len(results), len(results) - len(bad)))
sys.exit(1 if bad else 0)
