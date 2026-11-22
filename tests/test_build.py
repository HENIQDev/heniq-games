import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import build  # noqa: E402


class BuildTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ids = build.build()

    def test_all_games_built_with_required_files(self):
        self.assertIn("ball-dodge", self.ids)
        for gid in self.ids:
            for f in ("index.html", "main.js", "game.json"):
                self.assertTrue((build.DIST / gid / f).exists(), f"{gid}/{f}")
        self.assertTrue((build.DIST / "platform/core/runtime.js").exists())

    def test_catalog_links_every_game(self):
        text = (build.DIST / "index.html").read_text(encoding="utf-8")
        for gid in self.ids:
            self.assertIn(f'href="{gid}/"', text)

    def test_not_indexable_until_approved(self):
        self.assertIn("Disallow: /", (build.DIST / "robots.txt").read_text())
        for p in [build.DIST / "index.html"] + list(build.DIST.glob("*/index.html")):
            self.assertIn('name="robots" content="noindex"', p.read_text(encoding="utf-8"), p.name)

    def test_csp_blocks_external_and_inline(self):
        h = (build.DIST / "_headers").read_text()
        for needle in ("default-src 'self'", "script-src 'self'", "style-src 'self'", "frame-ancestors 'none'"):
            self.assertIn(needle, h)
        self.assertNotIn("unsafe-inline", h)

    def test_no_external_urls_or_inline_code(self):
        self.assertEqual(build.check_no_external(build.DIST), [])

    def test_release_build_excludes_drafts(self):
        ids = build.build(release=True)
        self.assertEqual(ids, [])  # まだ公開の承認がないので、全部 draft
        build.build()

    def test_validation_catches_bad_metadata(self):
        d = ROOT / "games" / "ball-dodge"
        meta = json.loads((d / "game.json").read_text(encoding="utf-8"))
        self.assertEqual(build.validate(meta, d), [])
        self.assertTrue(build.validate({**meta, "id": "Bad_ID"}, d))
        self.assertTrue(build.validate({**meta, "status": "live"}, d))
        self.assertTrue(build.validate({**meta, "budget_kb": 1}, d))
        self.assertTrue(build.validate({**meta, "score": {"order": "up"}}, d))
        missing = dict(meta)
        del missing["summary"]
        self.assertTrue(build.validate(missing, d))

    def test_external_url_check_detects(self):
        with tempfile.TemporaryDirectory() as t:
            (Path(t) / "a.js").write_text("fetch('https://example.com/x')")
            (Path(t) / "b.html").write_text('<p style="color:red">x</p>')
            bad = build.check_no_external(Path(t))
            self.assertEqual(len(bad), 2)

    def test_runtime_has_no_secret_storage(self):
        # 方針：秘密の値をブラウザに保存しない。保存するのは表示用の自己ベストだけ。
        for f in (ROOT / "platform").rglob("*.js"):
            text = f.read_text(encoding="utf-8")
            self.assertIsNone(re.search(r"secret|hmac|token", text, re.I), f.name)


if __name__ == "__main__":
    unittest.main()
