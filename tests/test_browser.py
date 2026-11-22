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
            [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", "--window-size=%d,%d" % (w, h),
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
        for page in ("", "ball-dodge/about/", "stone-dash/about/"):
            for width in (375, 1280):
                name = "%s_%d.png" % (page.strip("/").replace("/", "_") or "store", width)
                shot = OUT / name
                if shot.exists():
                    shot.unlink()
                self.chrome("_harness/?w=%d&u=/%s" % (width, page), (width + 20, 820), "--screenshot=%s" % shot)
                self.assertTrue(shot.exists() and shot.stat().st_size > 2000, name)

    def test_store_renders(self):
        dom = self.dom("", (1280, 800))
        self.assertIn("HENIQ GAMES", dom)
        self.assertIn("BALL DODGE", dom)
        self.assertIn("STONE DASH!", dom)


if __name__ == "__main__":
    unittest.main()
