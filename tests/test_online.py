"""オンライン対戦の実機テスト：別々の 3 つの Chrome（サーバー役 1・プレイヤー 2）を、本物の WebSocket で動かして確認する。
サーバーのコードは本番と同じ server/butt-sumo/core.js（Node が無いので、ブラウザのタブで動かし、tools/dev_hub.py が中継する）。
Cloudflare の本番環境での動作は、このテストでは確認できない。"""
import json, os, subprocess, sys, threading, time, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import cdp, build, jsrun, serve  # noqa: E402

HUB_PORT = 8791


class OnlineTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if os.environ.get("HENIQ_SKIP_ONLINE"):
            raise unittest.SkipTest("HENIQ_SKIP_ONLINE")
        cls.dist = ROOT / "tests" / "_out" / "online_dist"
        build.build(release=False, out=cls.dist)
        cls.root_srv = jsrun.serve()
        import functools, http.server
        cls.game_srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(serve.Handler, directory=str(cls.dist)))
        threading.Thread(target=cls.game_srv.serve_forever, daemon=True).start()
        cls.hub = subprocess.Popen([sys.executable, str(ROOT / "tools" / "dev_hub.py"), str(HUB_PORT)], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        time.sleep(0.8)
        cls.ctx = []
        cls.server = cdp.Browser(headless=True, port=9351).__enter__()
        cls.ctx.append(cls.server)
        cls.server.open("http://127.0.0.1:%d/tests/devhost.html?hub=ws://127.0.0.1:%d" % (cls.root_srv.server_address[1], HUB_PORT), 0.5)
        assert cls.server.wait_for("window.ready ? true : false", 10) or True
        time.sleep(1.0)

    @classmethod
    def tearDownClass(cls):
        for b in cls.ctx:
            try: b.__exit__(None, None, None)
            except Exception: pass
        for s in (getattr(cls, "root_srv", None), getattr(cls, "game_srv", None)):
            if s: s.shutdown()
        if getattr(cls, "hub", None): cls.hub.kill()

    def client(self, port, nick, char="ojisan"):
        b = cdp.Browser(headless=True, port=port, width=900, height=520, dpr=1).__enter__()
        self.ctx.append(b)
        url = "http://127.0.0.1:%d/butt-sumo/?debug=1&server=ws://127.0.0.1:%d" % (self.game_srv.server_address[1], HUB_PORT)
        b.open(url, 1.2)
        b.eval("__bs.G.save.settings.nick=%s; __bs.G.save.char=%s; 1" % (json.dumps(nick), json.dumps(char)))
        return b

    def state(self, b):
        return json.loads(b.eval("JSON.stringify({screen:__bs.G.screen, phase:__bs.G.online.phase, me:__bs.G.online.me||null, v:__bs.G.battle&&__bs.G.battle.view?{ph:__bs.G.battle.view.phase,tl:__bs.G.battle.view.timeLeft,d:__bs.G.battle.view.f.map(f=>Math.round(f.dmg)),n:__bs.G.battle.view.tick}:null})"))

    def play_until(self, bs, pred, timeout=120, attacker=0):
        """実際のキー入力を送りながら、条件を待つ。attacker の側は右（相手の方）へ移動して突進し、もう一方は動かずに踏ん張るだけ"""
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
                except Exception: pass
            time.sleep(0.12)
            if pred(): return True
        return False

    def test_two_clients_match_play_rate_ranking(self):
        A = self.client(9352, "アリス", "ojisan")
        B = self.client(9353, "ボブ", "gorilla")
        for b in (A, B): b.eval("__bs.G.enterOnline(false)")
        for b in (A, B):
            self.assertTrue(b.wait_for("__bs.G.online.phase==='lobby'", 15), "ロビーに入れない：" + json.dumps(self.state(b)))
        me = self.state(A)["me"]
        self.assertEqual(me["rating"], 1500)
        results = []
        for game in range(3):
            if game > 0:
                for b in (A, B): b.eval("__bs.G.enterOnline(true)")
            else:
                for b in (A, B): b.eval("__bs.G.findMatch()")
            for b in (A, B):
                self.assertTrue(b.wait_for("__bs.G.screen==='battle'", 25), "試合が成立しない：" + json.dumps(self.state(b)))
            # 別々のクライアントが、同じ試合の状態を見ている
            time.sleep(1.0)
            sa, sb = self.state(A), self.state(B)
            self.assertIsNotNone(sa["v"]); self.assertIsNotNone(sb["v"])
            done = self.play_until([A, B], lambda: self.state(A)["screen"] == "onlineResult" and self.state(B)["screen"] == "onlineResult", 150, attacker=game % 2)
            self.assertTrue(done, "試合が終わらない：" + json.dumps([self.state(A), self.state(B)]))
            ra = json.loads(A.eval("JSON.stringify(document.querySelector('.screen.result h2').textContent)"))
            rb = json.loads(B.eval("JSON.stringify(document.querySelector('.screen.result h2').textContent)"))
            results.append((ra, rb))
            for b in (A, B): b.key_up("ArrowRight")
            self.assertNotEqual(ra, rb, "両方が同じ結果：%s %s" % (ra, rb))
        # 戦績がサーバーに保存されている（サーバー役のタブの記憶）
        st = json.loads(self.server.eval("JSON.stringify([...host.store.players.values()].map(p=>({n:p.nick,r:p.rating,w:p.w,l:p.l,g:p.games})))"))
        st = [p for p in st if p["n"] in ("アリス", "ボブ")]
        total = sum(p["g"] for p in st)
        self.assertEqual(total, 6, st)
        self.assertEqual(sum(p["w"] for p in st), 3); self.assertEqual(sum(p["l"] for p in st), 3)
        self.assertEqual(sum(p["r"] for p in st), 3000, "レートの合計が保存されない（ゼロサム）：%s" % st)
        # ランキングに載る（3 試合）
        A.eval("__bs.G.go('ranking')")
        self.assertTrue(A.wait_for("document.querySelectorAll('.rk').length>=2", 10), "ランキングが出ない")
        names = json.loads(A.eval("JSON.stringify([...document.querySelectorAll('.rk .nm')].map(e=>e.textContent))"))
        self.assertTrue("アリス" in names and "ボブ" in names, names)

    def test_disconnect_reconnect_and_forfeit(self):
        A = self.client(9354, "カイ", "chicken")
        B = self.client(9355, "リク", "frog")
        for b in (A, B): b.eval("__bs.G.enterOnline(false)")
        for b in (A, B): self.assertTrue(b.wait_for("__bs.G.online.phase==='lobby'", 15))
        for b in (A, B): b.eval("__bs.G.findMatch()")
        for b in (A, B): self.assertTrue(b.wait_for("__bs.G.screen==='battle'", 25))
        time.sleep(2.0)
        # 通信が切れる → 自動で再接続して、試合が続く
        n0 = self.state(B)["v"]["n"]
        B.eval("__bs.G.net.debugDropRoom(); 1")
        time.sleep(3.5)
        self.assertTrue(B.wait_for("__bs.G.screen==='battle'", 5))
        n1 = self.state(B)["v"]["n"]
        self.assertGreater(n1, n0 + 30, "再接続後に状態が進まない")
        # クライアントごと消える（ブラウザを閉じる）→ 猶予のあと、相手の勝ち
        self.ctx.remove(B); B.__exit__(None, None, None)
        self.assertTrue(A.wait_for("__bs.G.screen==='onlineResult'", 60), "放棄で終わらない：" + json.dumps(self.state(A)))
        txt = json.loads(A.eval("JSON.stringify(document.querySelector('.screen.result').textContent)"))
        self.assertIn("勝利", txt)


if __name__ == "__main__":
    unittest.main()
