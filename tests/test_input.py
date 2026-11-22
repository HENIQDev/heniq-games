"""実際のブラウザイベント（キーボード・マルチタッチ）で、操作が効くことを確認する。
Chrome（CDP）に本物の入力イベントを送る：左右移動・DASH・JUMP・3 本の指の同時操作。"""
import sys
import threading
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import build  # noqa: E402
import cdp  # noqa: E402
import serve  # noqa: E402

CHROME_OK = Path(cdp.CHROME).exists()
PLAYER = "window.__heniq.game.sim.player"


@unittest.skipUnless(CHROME_OK, "Chrome がありません")
class InputTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        build.build()
        cls.server = serve.make_server(0)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def url(self, game="crowd-sprint-3d"):
        return "http://127.0.0.1:%d/%s/?debug=1" % (self.port, game)

    def start_playing(self, b):
        self.assertTrue(b.wait_for("!!window.__heniq", 15), "ゲームが起動しない")
        self.assertEqual(b.eval("window.__heniq.state"), "title")
        b.key("Space", 80)                                              # Space で開始
        self.assertTrue(b.wait_for("window.__heniq.state==='playing' && window.__heniq.game.sim.t>0.3", 20), "カウントダウンが終わらない")

    def test_keyboard_move_dash_jump(self):
        with cdp.Browser(headless=True, width=480, height=860, port=9341) as b:
            b.open(self.url())
            self.start_playing(b)
            # 左右移動（実際のキーイベント）
            x0 = b.eval(PLAYER + ".x")
            b.key_down("ArrowRight"); time.sleep(0.7); x_right = b.eval(PLAYER + ".x"); b.key_up("ArrowRight")
            self.assertGreater(x_right - x0, 1.0, "→ で右に動かない")
            b.key_down("ArrowLeft"); time.sleep(0.7); x_left = b.eval(PLAYER + ".x"); b.key_up("ArrowLeft")
            self.assertLess(x_left, x_right - 1.0, "← で左に動かない")
            # DASH（Shift 長押し）：速くなり、スタミナが減る。離すと戻る
            time.sleep(0.6)
            s0 = b.eval(PLAYER + ".stam")
            b.key_down("ShiftLeft"); time.sleep(0.8)
            dashing, v, s1 = b.eval(PLAYER + ".dashing"), b.eval(PLAYER + ".v"), b.eval(PLAYER + ".stam")
            b.key_up("ShiftLeft"); time.sleep(0.5)
            self.assertTrue(dashing, "Shift でダッシュにならない")
            self.assertGreater(v, 7.0)
            self.assertLess(s1, s0 - 5)
            self.assertFalse(b.eval(PLAYER + ".dashing"), "Shift を離してもダッシュが続く")
            # JUMP（Space）
            time.sleep(0.8)
            b.key_down("Space")
            jumped = b.wait_for(PLAYER + ".jumpT>0", 1.0, 0.02)
            b.key_up("Space")
            self.assertTrue(jumped, "Space でジャンプしない")

    def test_multitouch_drag_dash_jump(self):
        with cdp.Browser(headless=True, width=390, height=844, dpr=3, mobile=True, port=9342) as b:
            b.open(self.url())
            self.assertTrue(b.wait_for("!!window.__heniq", 15))
            rect = b.eval("(()=>{const r=document.querySelector('.hg-primary').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()")
            b.touch("touchStart", [(1, rect[0], rect[1])]); b.touch("touchEnd", [])      # START をタップ
            self.assertTrue(b.wait_for("window.__heniq.state==='playing' && window.__heniq.game.sim.t>0.3", 20), "タップで開始できない")
            cv = b.eval("(()=>{const r=document.querySelector('.hg-over2d').getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()")
            pt = lambda lx, ly: (cv[0] + lx / 480 * cv[2], cv[1] + ly / 720 * cv[3])
            time.sleep(0.5)
            x0 = b.eval(PLAYER + ".x")
            # 指 1：なぞって右へ
            a = pt(240, 330)
            b.touch("touchStart", [(1,) + a])
            for k in range(1, 8):
                b.touch("touchMove", [(1, a[0] + k * 8, a[1])]); time.sleep(0.06)
            x1 = b.eval(PLAYER + ".x")
            self.assertGreater(x1 - x0, 0.6, "なぞっても右に動かない")
            # 指 2：DASH ボタンを押し続ける（指 1 は動かしたまま）
            d = pt(70, 626)
            b.touch("touchStart", [(1, a[0] + 56, a[1]), (2,) + d])
            b.touch("touchMove", [(1, a[0] + 56, a[1]), (2,) + d]); time.sleep(0.7)
            self.assertTrue(b.eval(PLAYER + ".dashing"), "DASH ボタンでダッシュにならない（なぞりと同時）")
            # 指 3：JUMP ボタンをタップ（指 1・2 は押したまま）→ 3 本の指の同時操作
            j = pt(410, 626)
            b.touch("touchStart", [(1, a[0] + 56, a[1]), (2,) + d, (3,) + j])
            jumped = b.wait_for(PLAYER + ".jumpT>0", 1.0, 0.02)
            b.touch("touchEnd", [(1, a[0] + 56, a[1]), (2,) + d])
            self.assertTrue(jumped, "JUMP ボタンでジャンプしない（3 本の指の同時操作）")
            self.assertTrue(b.eval(PLAYER + ".dashing") in (True, False))
            # 全部離すと、ダッシュは止まる
            b.touch("touchEnd", [])
            time.sleep(0.6)
            self.assertFalse(b.eval(PLAYER + ".dashing"), "指を離してもダッシュが続く")


if __name__ == "__main__":
    unittest.main()


VIEWPORTS = [  # (名前, 幅, 高さ, dpr, スマホか)
    ("iPhone SE 以前 縦", 320, 568, 2, True), ("iPhone SE 縦", 375, 667, 2, True), ("iPhone 15 縦", 393, 852, 3, True),
    ("iPhone Pro Max 縦", 430, 932, 3, True), ("iPhone 横", 852, 393, 3, True), ("iPad 縦", 768, 1024, 2, True),
    ("iPad 横", 1024, 768, 2, True), ("ノート PC", 1440, 900, 2, False), ("デスクトップ", 1920, 1080, 1, False), ("ウルトラワイド", 2560, 1080, 1, False),
]


@unittest.skipUnless(CHROME_OK, "Chrome がありません")
class ViewportTest(unittest.TestCase):
    """画面サイズ別：ゲーム本体の画面が、はみ出さず・歪まず・3D と HUD が重なって表示されること。"""

    @classmethod
    def setUpClass(cls):
        build.build()
        cls.server = serve.make_server(0)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        (ROOT / "tests" / "_out").mkdir(exist_ok=True)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def test_game_layout_across_screen_sizes(self):
        geo = ("(()=>{const q=(s)=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};"
               "const gl=document.querySelector('.hg-gl');return {stage:q('.hg-stage'),over:q('.hg-over2d'),gl:q('.hg-gl'),glPx:gl?[gl.width,gl.height]:null,"
               "mute:q('.hg-mute'),start:q('.hg-primary'),sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,vw:innerWidth,vh:innerHeight}})()")
        for name, w, h, dpr, mobile in VIEWPORTS:
            with cdp.Browser(headless=True, width=w, height=h, dpr=dpr, mobile=mobile, port=9343) as b:
                b.open("http://127.0.0.1:%d/crowd-sprint-3d/?debug=1" % self.port)
                self.assertTrue(b.wait_for("!!window.__heniq", 15), name)
                time.sleep(0.5)
                g = b.eval(geo)
                st = g["stage"]
                tag = "%s %dx%d" % (name, w, h)
                self.assertGreaterEqual(st["x"], -0.5, tag); self.assertGreaterEqual(st["y"], -0.5, tag)
                self.assertLessEqual(st["x"] + st["w"], w + 0.5, tag); self.assertLessEqual(st["y"] + st["h"], h + 0.5, tag)
                self.assertAlmostEqual(st["w"] / st["h"], 480 / 720, delta=0.02, msg="縦横比が崩れている " + tag)
                self.assertLessEqual(g["sw"], w + 1, "横スクロールが出る " + tag)
                self.assertLessEqual(g["sh"], h + 1, "縦スクロールが出る " + tag)
                self.assertAlmostEqual(g["gl"]["w"], st["w"], delta=1.5, msg="3D の Canvas が画面と合っていない " + tag)
                self.assertAlmostEqual(g["over"]["w"], st["w"], delta=1.5, msg="HUD の Canvas が 3D と重なっていない " + tag)
                self.assertGreaterEqual(g["glPx"][0], st["w"] * 0.45, "3D の解像度が低すぎる " + tag)
                self.assertLessEqual(g["glPx"][0], st["w"] * 2.01, tag)
                self.assertGreaterEqual(g["mute"]["x"], st["x"] - 0.5, tag)
                self.assertLessEqual(g["mute"]["x"] + g["mute"]["w"], st["x"] + st["w"] + 0.5, tag)
                self.assertGreaterEqual(g["start"]["y"] + g["start"]["h"], 0, tag)
                self.assertLessEqual(g["start"]["y"] + g["start"]["h"], st["y"] + st["h"] + 0.5, "START ボタンが画面の外 " + tag)
                b.screenshot(str(ROOT / "tests" / "_out" / ("game_%dx%d.png" % (w, h))))


@unittest.skipUnless(CHROME_OK, "Chrome がありません")
class SoakTest(unittest.TestCase):
    """長時間動作：レースを続けて描画しても、メモリ・DOM・GPU バッファが増え続けず、GL エラーも出ないこと。"""

    def test_soak_no_leaks(self):
        import json
        build.build()
        srv = serve.make_server(0)
        port = srv.server_address[1]
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            raw = cdp.run("http://127.0.0.1:%d/crowd-sprint-3d/?soak=14" % port, 240, 480, 860)
        finally:
            srv.shutdown()
        self.assertIsNotNone(raw, "ソークの結果が出ない")
        d = json.loads(raw)
        self.assertEqual(d["glErrors"], 0)
        self.assertTrue(d["gpu_buffer_constant"], "GPU バッファの量が変わった（リーク）")
        self.assertTrue(d["all_finished"])
        self.assertLessEqual(abs(d["dom_last"] - d["dom_first"]), 2, "DOM が増え続けている")
        self.assertLess(d["heap_slope_mb_per_race"], 0.3, "JS のメモリが増え続けている：%s" % d["heap_slope_mb_per_race"])
        self.assertLess(d["heap_max_mb"], 60)
