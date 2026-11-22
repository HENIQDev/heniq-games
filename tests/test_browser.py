"""ヘッドレス Chrome での確認。Chrome が無い環境では skip する。
- 全 web ゲームの自己テスト（起動→開始→操作→終了→リトライ→再現性）を 3 画面幅で
- ストアと詳細ページが、スマホ幅・PC 幅で横にはみ出さないこと
- 各ページのスクリーンショットを tests/_out/ に保存（見た目の確認用。Git 管理外）
"""
import json
import re
import subprocess
import sys
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import build  # noqa: E402
import catalog  # noqa: E402
import serve  # noqa: E402

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT = ROOT / "tests" / "_out"
WIDTHS = ((375, 700), (480, 800), (1280, 720))
HARNESS_JS = """
const q = new URLSearchParams(location.search);
const f = document.createElement('iframe');
f.width = q.get('w'); f.height = 800; f.style.border = '0';
f.src = q.get('u');
f.addEventListener('load', () => setTimeout(() => {
  const d = f.contentDocument.documentElement;
  const pre = document.createElement('pre'); pre.id = 'layout-result';
  pre.textContent = JSON.stringify({ overflow: d.scrollWidth > Number(q.get('w')) + 1, scrollWidth: d.scrollWidth, innerWidth: f.contentWindow.innerWidth });
  document.body.append(pre);
}, 300));
document.body.append(f);
"""


@unittest.skipUnless(Path(CHROME).exists(), "Chrome がありません")
class BrowserTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ids = build.build()
        cls.games = catalog.load_games(catalog.load_genres())
        cls.server = serve.make_server(0)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        OUT.mkdir(exist_ok=True)
        # ヘッドレス Chrome は窓の幅が 500px 未満にならないため、iframe で本当のスマホ幅（375px）を再現する
        (build.DIST / "_harness").mkdir()
        (build.DIST / "_harness" / "index.html").write_text(
            '<!doctype html><meta charset="utf-8"><body><script type="module" src="harness.js"></script>', encoding="utf-8")
        (build.DIST / "_harness" / "harness.js").write_text(HARNESS_JS, encoding="utf-8")

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def chrome(self, path, size, *extra):
        w, h = size
        return subprocess.run(
            [CHROME, "--headless=new", "--no-sandbox", "--hide-scrollbars", "--window-size=%d,%d" % (w, h),
             "--virtual-time-budget=30000", *extra, "http://127.0.0.1:%d/%s" % (self.port, path)],
            capture_output=True, text=True, timeout=120,
        )

    def dom(self, path, size):
        return self.chrome(path, size, "--dump-dom").stdout

    def test_every_web_game_passes_selftest(self):
        for g in self.games:
            if g["kind"] != "web":
                continue
            for size in WIDTHS:
                dom = self.dom("%s/?selftest=1" % g["id"], size)
                m = re.search(r'<pre id="selftest-result">(.*?)</pre>', dom, re.S)
                self.assertIsNotNone(m, "%s %s: 自己テストの結果がありません" % (g["id"], size))
                r = json.loads(m.group(1).replace("&quot;", '"'))
                self.assertTrue(r["ok"], "%s %s: %s" % (g["id"], size, r))

    def pages(self):
        out = ["", "privacy/"]
        out += ["genre/%s/" % x for x in sorted({g["genre"] for g in self.games})]
        out += ["%s/about/" % g["id"] for g in self.games]
        return out

    def test_no_horizontal_overflow(self):
        for page in self.pages():
            for width in (375, 1280):
                dom = self.dom("_harness/?w=%d&u=/%s" % (width, page), (width + 20, 820))
                m = re.search(r'<pre id="layout-result">(.*?)</pre>', dom, re.S)
                self.assertIsNotNone(m, "%s %d: レイアウトの結果がありません" % (page, width))
                r = json.loads(m.group(1).replace("&quot;", '"'))
                self.assertEqual(r["innerWidth"], width)
                self.assertFalse(r["overflow"], "%s %d: 横にはみ出しています %s" % (page, width, r))

    def test_screenshots(self):
        for page in ("", "ball-dodge/about/", "crowd-sprint-3d/about/", "stone-dash/about/"):
            for width in (375, 1280):
                name = "%s_%d.png" % (page.strip("/").replace("/", "_") or "store", width)
                shot = OUT / name
                if shot.exists():
                    shot.unlink()
                self.chrome("_harness/?w=%d&u=/%s" % (width, page), (width + 20, 820), "--screenshot=%s" % shot)
                self.assertTrue(shot.exists() and shot.stat().st_size > 2000, name)

    def test_ball_dodge_balance_bots(self):
        """バランスの不変条件：何もしないと早く終わる／先読みするボットは長く生き残れるが、いつかは終わる（公平で、終わりがある）。"""
        dom = self.dom("ball-dodge/?botcheck=1", (480, 800))
        m = re.search(r'<pre id="bot-result">(.*?)</pre>', dom, re.S)
        self.assertIsNotNone(m, "ボット検査の結果がありません")
        r = json.loads(m.group(1).replace("&quot;", '"'))
        self.assertTrue(all(ms < 12000 for ms in r["idle"]), "何もしないのに 12 秒以上生き残った：%s" % r["idle"])
        smart = sorted(x["ms"] for x in r["smart"])
        self.assertGreaterEqual(smart[0], 30000, "先読みボットが 30 秒未満で当たった（理不尽の疑い）：%s" % smart)
        self.assertTrue(all(x["ended"] for x in r["smart"]), "先読みボットが 150 秒生き残った（難しさが足りない）：%s" % smart)

    def test_crowd_sprint_balance_bots(self):
        """バランスの不変条件：何もしないと下位〜中位／人を避けてダッシュするボットは上位に入れるが、1 位にはならない。決定性も確認。"""
        dom = self.dom("crowd-sprint/?botcheck=1", (480, 800))
        m = re.search(r'<pre id="bot-result">(.*?)</pre>', dom, re.S)
        self.assertIsNotNone(m, "ボット検査の結果がありません")
        r = json.loads(m.group(1).replace("&quot;", '"'))
        self.assertTrue(all(x["finished"] for x in r["idle"] + r["smart"]), "ゴールできないプレイがある")
        self.assertTrue(all(x["rank"] >= 1000000 for x in r["idle"]), "何もしないのに 100 万位以内に入った：%s" % [x["rank"] for x in r["idle"]])
        self.assertTrue(all(2 <= x["rank"] <= 100000 for x in r["smart"]), "先読みボットの順位が範囲外（簡単すぎる／難しすぎる）：%s" % [x["rank"] for x in r["smart"]])
        self.assertTrue(all(x["time"] >= 16.5 for x in r["smart"]), "速すぎる（理論上の最速より速い）：%s" % [x["time"] for x in r["smart"]])
        self.assertTrue(all(x["falls"] <= 12 for x in r["smart"]), "転びすぎ（理不尽の疑い）")

    def test_crowd_sprint_performance_budget(self):
        """800 人の更新と描画の所要時間（ヘッドレス Chrome のソフトウェア描画。実機より遅い目安）"""
        dom = self.dom("crowd-sprint/?bench=1", (480, 800))
        m = re.search(r'<pre id="bot-result">(.*?)</pre>', dom, re.S)
        self.assertIsNotNone(m)
        r = json.loads(m.group(1).replace("&quot;", '"'))
        self.assertGreaterEqual(r["npc"], 800)
        self.assertLess(r["update_ms"], 6, r)
        self.assertLess(r["draw_ms"], 25, r)

    def result(self, path, size=(480, 800)):
        dom = self.dom(path, size)
        m = re.search(r'<pre id="bot-result">(.*?)</pre>', dom, re.S)
        self.assertIsNotNone(m, "%s：結果がありません" % path)
        return json.loads(m.group(1).replace("&quot;", '"'))

    def test_crowd_sprint_3d_gameplay_unchanged_from_2d(self):
        """ゲームの動きの不変：移動・接触・転倒・スタミナなどの数値（P の表）は 2D 比較版と同一。同じボットのタイムも近い（順位の式と、主人公の枠の分だけが違う）。"""
        def ptable(path):
            t = (ROOT / path).read_text(encoding="utf-8")
            return re.search(r"export const P = \{.*?\n\};", t, re.S).group(0)
        self.assertEqual(ptable("games/crowd-sprint/play/sim.js"), ptable("games/crowd-sprint-3d/play/sim.js"))
        a = self.result("crowd-sprint/?botcheck=1")
        b = self.result("crowd-sprint-3d/?botcheck=1")
        for k in ("idle", "smart"):
            for x, y in zip(a[k], b[k]):
                self.assertLess(abs(x["time"] - y["time"]), 1.0, (k, x, y))
        # 順位は実際の順位（1〜800）。最後尾から始まるので、何もしない場合は後ろの方
        self.assertTrue(all(1 <= x["rank"] <= 800 for x in b["idle"] + b["smart"]))

    def test_crowd_sprint_3d_draws_every_runner_in_3d(self):
        """800 人全員が 3D モデルで描かれていること（視錐台の外に出たものを除き、必ず LOD0〜2 の 3D メッシュへ）。"""
        r = self.result("crowd-sprint-3d/?gltest=1")
        self.assertEqual(r["glError"], 0)
        self.assertEqual(r["npc"], 800)
        self.assertEqual(r["submitted"] + r["culled"], 800, "出走者 800 人（NPC 799 人＋主人公）の全員が、3D メッシュか視錐台の外のどちらかになっていない")
        self.assertEqual(len(r["lodTris"]), 3)
        self.assertTrue(all(t > 0 for t in r["lodTris"]), r["lodTris"])
        self.assertGreater(r["lodTris"][0], r["lodTris"][1] * 1.5)
        self.assertGreater(r["lodTris"][1], r["lodTris"][2] * 1.5)
        self.assertGreaterEqual(r["nonBackground"], 80, "ほぼ背景だけ（描けていない）")
        self.assertGreaterEqual(r["distinctColors"], 20)
        self.assertLessEqual(r["drawCalls"], 8, "描画コールが多すぎる")
        self.assertLess(r["triangles"], 150000)
        self.assertLess(r["gpuBytes"], 8 * 1024 * 1024)

    def test_crowd_sprint_3d_balance_bots(self):
        """実際の順位（800 位〜1 位）での不変条件：何もしないと後ろの方／人を避けてダッシュするボットは上位に入るが、1 位にはならない。"""
        r = self.result("crowd-sprint-3d/?botcheck=1")
        self.assertTrue(all(x["finished"] for x in r["idle"] + r["smart"]), "ゴールできないプレイがある")
        self.assertTrue(all(x["rank"] >= 400 for x in r["idle"]), "何もしないのに上位半分に入った：%s" % [x["rank"] for x in r["idle"]])
        self.assertTrue(all(2 <= x["rank"] <= 200 for x in r["smart"]), "ボットの順位が範囲外（簡単すぎる／難しすぎる）：%s" % [x["rank"] for x in r["smart"]])
        self.assertTrue(all(x["time"] >= 16.5 for x in r["smart"]), "速すぎる（理論上の最速より速い）")
        self.assertTrue(all(x["falls"] <= 12 for x in r["smart"]), "転びすぎ（理不尽の疑い）")

    def test_crowd_sprint_3d_has_no_2d_sprite_fallback(self):
        """絶対条件：2D スプライトへの置き換え・Canvas 2D の疑似 3D・既存の 2D 版の流用をしていない（ソースの検査）。"""
        root = ROOT / "games" / "crowd-sprint-3d" / "play"
        for f in root.rglob("*.js"):
            text = f.read_text(encoding="utf-8")
            code = re.sub(r"//.*", "", text)
            self.assertNotIn("drawImage", code, f.name)
            self.assertIsNone(re.search(r"sprites?\b|atlas|billboard", code, re.I), f.name)
            self.assertNotIn("crowd-sprint/", code, f.name)
            self.assertNotIn("../../crowd-sprint", code, f.name)
        self.assertFalse((root / "sprites.js").exists())

    def test_crowd_sprint_3d_cpu_budget(self):
        """JS の CPU 時間（800 人の更新＋インスタンス構築＋描画命令＋HUD）。GPU は含まない。回帰の検出用（実機の合否ではない）。"""
        r = self.result("crowd-sprint-3d/?cpubench=1")
        self.assertGreaterEqual(r["npc"], 800)
        self.assertLess(r["avg_ms"], 5, r)
        self.assertLess(r["p95_ms"], 12, r)

    def test_store_renders(self):
        dom = self.dom("", (1280, 800))
        self.assertIn("HENIQ GAMES", dom)
        self.assertIn("BALL DODGE", dom)
        self.assertIn("STONE DASH!", dom)


if __name__ == "__main__":
    unittest.main()
