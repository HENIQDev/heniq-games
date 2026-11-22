"""ヘッドレス Chrome で、全ゲームの自己テスト（起動→開始→操作→終了→リトライ→再現性）を実行する。
Chrome が無い環境では skip する。"""
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
import serve  # noqa: E402

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


@unittest.skipUnless(Path(CHROME).exists(), "Chrome がありません")
class BrowserSelfTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ids = build.build()
        cls.server = serve.make_server(0)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def run_page(self, path, window="480,800"):
        url = f"http://127.0.0.1:{self.port}/{path}"
        out = subprocess.run(
            [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox", f"--window-size={window}",
             "--virtual-time-budget=30000", "--dump-dom", url],
            capture_output=True, text=True, timeout=120,
        )
        return out.stdout

    def test_every_game_passes_selftest(self):
        for gid in self.ids:
            for window in ("480,800", "375,700", "1280,720"):  # スマホ幅と PC 幅
                dom = self.run_page(f"{gid}/?selftest=1", window)
                m = re.search(r'<pre id="selftest-result">(.*?)</pre>', dom, re.S)
                self.assertIsNotNone(m, f"{gid} {window}: 自己テストの結果がありません")
                r = json.loads(m.group(1).replace("&quot;", '"'))
                self.assertTrue(r["ok"], f"{gid} {window}: {r}")

    def test_catalog_renders(self):
        dom = self.run_page("")
        self.assertIn("HENIQ GAMES", dom)
        self.assertIn("BALL DODGE", dom)


if __name__ == "__main__":
    unittest.main()
