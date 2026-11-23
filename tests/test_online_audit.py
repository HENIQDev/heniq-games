"""オンライン対戦の総合検証（本物の WebSocket：サーバー役 1・クライアント複数の別々の Chrome）。
通信遅延の再現・3 人以上の待機・キャンセル・待機中／開始前の切断・不正なメッセージ・戦績削除の権限。
注意：サーバーのコードは本番と同じ core.js だが、動かしているのは Cloudflare ではなく、ローカルのブラウザのタブ。本番の検証ではない。"""
import functools, http.server, json, os, subprocess, sys, threading, time, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import build, cdp, jsrun, serve  # noqa: E402

PORT = 8792


class OnlineAudit(unittest.TestCase):
    delay = 0

    @classmethod
    def setUpClass(cls):
        if os.environ.get("HENIQ_SKIP_ONLINE"):
            raise unittest.SkipTest("HENIQ_SKIP_ONLINE")
        cls.dist = ROOT / "tests" / "_out" / "online_audit_dist"
        build.build(release=False, out=cls.dist)
        cls.root_srv = jsrun.serve()
        cls.game_srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(serve.Handler, directory=str(cls.dist)))
        threading.Thread(target=cls.game_srv.serve_forever, daemon=True).start()
        cls.ctx = []
        cls.hub = None

    def setUp(self):
        self.ctx = []
        self.hub = subprocess.Popen([sys.executable, str(ROOT / "tools" / "dev_hub.py"), str(PORT), str(self.delay)], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        time.sleep(0.8)
        self.server = cdp.Browser(headless=True, port=9381).__enter__()
        self.ctx.append(self.server)
        self.server.open("http://127.0.0.1:%d/tests/devhost.html?hub=ws://127.0.0.1:%d" % (self.root_srv.server_address[1], PORT), 0.5)
        time.sleep(1.2)

    def tearDown(self):
        for b in self.ctx:
            try: b.__exit__(None, None, None)
            except Exception: pass
        if self.hub: self.hub.kill()
        time.sleep(0.5)

    @classmethod
    def tearDownClass(cls):
        cls.root_srv.shutdown(); cls.game_srv.shutdown()

    port_n = 9382

    def client(self, nick, char="ojisan"):
        OnlineAudit.port_n += 1
        b = cdp.Browser(headless=True, port=OnlineAudit.port_n, width=900, height=520, dpr=1).__enter__()
        self.ctx.append(b)
        b.open("http://127.0.0.1:%d/butt-sumo/?debug=1&server=ws://127.0.0.1:%d" % (self.game_srv.server_address[1], PORT), 1.2)
        b.eval("__bs.G.save.settings.nick=%s; __bs.G.save.char=%s; 1" % (json.dumps(nick), json.dumps(char)))
        return b

    def st(self, b):
        return json.loads(b.eval("JSON.stringify({screen:__bs.G.screen, phase:__bs.G.online.phase, v:__bs.G.battle&&__bs.G.battle.view?{ph:__bs.G.battle.view.phase,n:__bs.G.battle.view.tick}:null})"))

    def lobby(self, b):
        b.eval("__bs.G.enterOnline(false); 1")
        self.assertTrue(b.wait_for("__bs.G.online.phase==='lobby'", 15), "ロビーに入れない：%s" % self.st(b))

    def play(self, bs, pred, timeout=150, attacker=0):
        end = time.time() + timeout; i = 0
        while time.time() < end:
            i += 1
            for k, b in enumerate(bs):
                try:
                    if k == attacker:
                        b.key_down("ArrowRight")
                        if i % 2 == 0: b.key("Space", 60)
                    elif i % 5 == 0: b.key("ShiftLeft", 150)
                except Exception: pass
            time.sleep(0.12)
            if pred(): return True
        return False

    def players(self):
        return {p["n"]: p for p in json.loads(self.server.eval("JSON.stringify([...host.store.players.values()].map(p=>({n:p.nick,r:p.rating,w:p.w,l:p.l,g:p.games,s:p.streak,b:p.best})))"))}


class DelayedNetwork(OnlineAudit):
    delay = 80          # 片道 80 ms（往復 約 160 ms）

    def test_match_plays_through_with_latency(self):
        A, B = self.client("遅延A"), self.client("遅延B", "gorilla")
        for b in (A, B): self.lobby(b)
        for b in (A, B): b.eval("__bs.G.findMatch(); 1")
        for b in (A, B): self.assertTrue(b.wait_for("__bs.G.screen==='battle'", 30), "遅延下で試合が成立しない：%s" % self.st(b))
        time.sleep(2.5)
        # 状態が届き続ける（30 Hz のスナップショット）：1 秒あたりの更新数
        n0 = self.st(A)["v"]["n"]; time.sleep(1.0); n1 = self.st(A)["v"]["n"]
        self.assertGreater(n1 - n0, 20, "遅延下で状態が届かない：%d tick/秒" % (n1 - n0))
        rtt = json.loads(A.eval("JSON.stringify(__bs.G.net.rtt)"))
        self.assertTrue(self.play([A, B], lambda: self.st(A)["screen"] == "onlineResult" and self.st(B)["screen"] == "onlineResult", 150), "遅延下で試合が終わらない")
        ra = A.eval("document.querySelector('.screen.result h2').textContent"); rb = B.eval("document.querySelector('.screen.result h2').textContent")
        self.assertNotEqual(ra, rb)
        for b in (A, B): b.key_up("ArrowRight")
        self.assertEqual(A.eval("window.__errs.join('|')"), ""); self.assertEqual(B.eval("window.__errs.join('|')"), "")
        pl = self.players()
        self.assertEqual(pl["遅延A"]["r"] + pl["遅延B"]["r"], 3000)
        # 実測した往復遅延（ping）。80 ms × 2 以上
        print("\n[遅延下の実測] RTT(ping) =", None if rtt is None else round(rtt), "ms／1 秒の状態更新数 =", n1 - n0)


class Matchmaking(OnlineAudit):
    def test_three_clients_cancel_and_ghost_disconnect(self):
        A, B, C = self.client("甲"), self.client("乙"), self.client("丙")
        for b in (A, B, C): self.lobby(b)
        A.eval("__bs.G.findMatch(); 1"); time.sleep(1.3)
        C.eval("__bs.G.findMatch(); 1"); time.sleep(0.2)
        # 3 人目（丙）は、1 人目（甲）と成立（先着順の 2 人）。乙はまだ待たない
        self.assertTrue(A.wait_for("__bs.G.screen==='battle'", 20) and C.wait_for("__bs.G.screen==='battle'", 20), "甲と丙が成立しない")
        # 乙が待機 → 甲・丙は対戦中なので、乙は待ち続ける。キャンセルできる
        B.eval("__bs.G.findMatch(); 1"); time.sleep(2.0)
        self.assertEqual(self.st(B)["phase"], "search")
        B.eval("__bs.G.cancelFind(); 1"); time.sleep(0.5)
        self.assertEqual(self.st(B)["phase"], "lobby", "キャンセルで戻れない")
        self.assertEqual(self.server.eval("host.lobby.queue.length"), 0)
        # 対戦中の甲が、重複して待機しようとしても拒否される（サーバーの状態は変わらない）
        A.eval("__bs.G.net.find('ojisan'); 1"); time.sleep(0.6)
        self.assertEqual(self.server.eval("host.lobby.queue.length"), 0, "対戦中の二重マッチング")
        # 待機中に、ブラウザごと消える（切断）→ 待機列から消え、次に来た人は幽霊と組まれない
        B.eval("__bs.G.findMatch(); 1"); time.sleep(1.0)
        self.assertEqual(self.server.eval("host.lobby.queue.length"), 1)
        self.ctx.remove(B); B.__exit__(None, None, None); time.sleep(1.0)
        self.assertEqual(self.server.eval("host.lobby.queue.length"), 0, "切断した人が待機列に残る")
        D = self.client("丁"); self.lobby(D); D.eval("__bs.G.findMatch(); 1"); time.sleep(3.0)
        self.assertEqual(self.st(D)["phase"], "search", "幽霊と組まれた？")
        self.assertEqual(self.server.eval("host.rooms.size"), 1, "部屋の数（甲・丙の 1 つだけ）")

    def test_disconnect_right_after_match_voids_without_rating_change(self):
        A, B = self.client("開始前A"), self.client("開始前B")
        for b in (A, B): self.lobby(b)
        A.eval("__bs.G.findMatch(); 1"); B.eval("__bs.G.findMatch(); 1")
        self.assertTrue(A.wait_for("__bs.G.online.phase==='matched'", 15) and B.wait_for("__bs.G.online.phase==='matched'", 15))
        self.ctx.remove(B); B.__exit__(None, None, None)           # 部屋に入る前（matched の 1.6 秒後に入る）に、乙が消える
        self.assertTrue(A.wait_for("__bs.G.screen==='onlineResult'", 40), "開始前の切断で、相手が結果画面に進めない：%s" % self.st(A))
        txt = A.eval("document.querySelector('.screen.result').textContent")
        self.assertIn("無効試合", txt)
        pl = self.players()
        self.assertEqual((pl["開始前A"]["g"], pl["開始前A"]["r"], pl["開始前B"]["g"], pl["開始前B"]["r"]), (0, 1500, 0, 1500), "無効試合でレート・戦績が動いた")
        # 続けて、新しい試合に入れる（対戦中の印が解除されている）
        A.eval("__bs.G.enterOnline(true); 1"); time.sleep(1.5)
        self.assertEqual(self.st(A)["phase"], "search", "無効試合のあと、次に進めない")


class Abuse(OnlineAudit):
    def test_malformed_flood_forged_and_erase_authority(self):
        A, B = self.client("正規A"), self.client("正規B")
        for b in (A, B): self.lobby(b)
        # 別のクライアント（Chrome のページ）から、生の WebSocket で不正なメッセージを大量に送る
        X = self.client("攻撃者")
        res = json.loads(X.eval("""(async()=>{const out={};const ws=new WebSocket('ws://127.0.0.1:%d/lobby');await new Promise(r=>ws.onopen=r);const got=[];ws.onmessage=e=>got.push(e.data);
        ws.send('garbage'); ws.send('x'.repeat(100000)); ws.send(JSON.stringify({t:'result',winner:0,rating:9999}));
        ws.send(JSON.stringify({t:'hello',pid:'zz',v:1})); await new Promise(r=>setTimeout(r,300));
        ws.send(JSON.stringify({t:'hello',pid:'a'.repeat(32),nick:'<img src=x onerror=alert(1)>'.repeat(5),v:1}));
        for(let i=0;i<500;i++) ws.send(JSON.stringify({t:'find',char:'ojisan'})); await new Promise(r=>setTimeout(r,800));
        out.got=got.length; out.types=[...new Set(got.map(g=>{try{return JSON.parse(g).t}catch(e){return 'x'}}))]; ws.close(); return JSON.stringify(out)})()""" % PORT))
        self.assertLess(res["got"], 40, "連投に対して、大量の応答を返してしまう：%s" % res)
        nick = [p for p in json.loads(self.server.eval("JSON.stringify([...host.store.players.values()].map(p=>p.nick))")) if "img" in p or "<" in p]
        self.assertEqual(nick, [], "不正なニックネームがそのまま保存された：%s" % nick)
        # サーバーは健全：正規の 2 人が、そのまま対戦できる
        for b in (A, B): b.eval("__bs.G.findMatch(); 1")
        for b in (A, B): self.assertTrue(b.wait_for("__bs.G.screen==='battle'", 25), "不正メッセージのあと、正規の対戦ができない")
        # 対戦中の戦績削除は拒否される（サーバーの記録が残る）
        A.eval("__bs.G.net.erase(); 1"); time.sleep(0.8)
        self.assertIn("正規A", self.players(), "対戦中に戦績が削除された")
        # 試合を終わらせる
        self.assertTrue(self.play([A, B], lambda: self.st(A)["screen"] == "onlineResult" and self.st(B)["screen"] == "onlineResult", 150))
        for b in (A, B): b.key_up("ArrowRight")
        before = self.players()
        self.assertEqual(before["正規A"]["g"] + before["正規B"]["g"], 2)
        # 待機中は削除できない
        A.eval("__bs.G.enterOnline(true); 1"); time.sleep(1.2)
        self.assertEqual(self.st(A)["phase"], "search")
        A.eval("__bs.G.net.erase(); 1"); time.sleep(0.8)
        self.assertIn("正規A", self.players(), "待機中に戦績が削除された")
        A.eval("__bs.G.cancelFind(); 1"); time.sleep(0.5)
        # 本人（ロビーにいる）は、自分の戦績だけを削除でき、相手の戦績は残る
        A.eval("__bs.G.net.erase(); 1"); time.sleep(0.8)
        pl = self.players()
        self.assertNotIn("正規A", pl, "本人の削除ができない"); self.assertIn("正規B", pl, "他人の戦績まで消えた")
        self.assertEqual(self.server.eval("window.__errs ? window.__errs.join('|') : ''"), "")


if __name__ == "__main__":
    unittest.main()
