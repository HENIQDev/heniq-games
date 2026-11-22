import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import build  # noqa: E402
import catalog  # noqa: E402


class StoreBuildTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ids = build.build()
        cls.dist = build.DIST
        cls.feed = json.loads((cls.dist / "games.json").read_text(encoding="utf-8"))

    # ---- 構造 ----
    def test_web_game_has_play_and_about(self):
        for f in ("ball-dodge/index.html", "ball-dodge/main.js", "ball-dodge/about/index.html",
                  "ball-dodge/about/vars.css", "ball-dodge/about/theme.css", "platform/core/runtime.js"):
            self.assertTrue((self.dist / f).exists(), f)

    def test_ios_game_has_about_only_and_redirect(self):
        self.assertTrue((self.dist / "stone-dash/about/index.html").exists())
        self.assertFalse((self.dist / "stone-dash/index.html").exists())
        self.assertIn("/stone-dash/ /stone-dash/about/", (self.dist / "_redirects").read_text())

    def test_store_pages(self):
        for f in ("index.html", "genre/casual/index.html", "genre/action/index.html", "privacy/index.html", "games.json"):
            self.assertTrue((self.dist / f).exists(), f)
        self.assertTrue((self.dist / "genre/race/index.html").exists())
        self.assertFalse((self.dist / "genre/horror/index.html").exists())  # 掲載 0 件のジャンルは作らない

    # ---- ブラウザゲームと iOS の区別 ----
    def test_feed_distinguishes_web_and_ios(self):
        by_id = {g["id"]: g for g in self.feed}
        self.assertEqual(by_id["ball-dodge"]["kind"], "web")
        self.assertEqual(by_id["ball-dodge"]["play_url"], "ball-dodge/")
        self.assertEqual(by_id["stone-dash"]["kind"], "ios")
        self.assertIsNone(by_id["stone-dash"]["play_url"])
        self.assertEqual(by_id["stone-dash"]["platforms"], ["iPhone"])

    def test_card_links(self):
        text = (self.dist / "index.html").read_text(encoding="utf-8")
        self.assertIn('href="ball-dodge/">PLAY', text)
        self.assertIn('class="card-link" href="ball-dodge/about/"', text)
        # App Store の URL が未設定の iOS は、詳細ページへ（存在しない App Store へのリンクを出さない）
        self.assertIn('href="stone-dash/about/"', text)
        self.assertIn("badge-ios", text)
        self.assertIn("badge-web", text)

    def test_ios_card_goes_to_app_store_when_url_set(self):
        import render
        g = next(x for x in catalog.load_games(catalog.load_genres()) if x["id"] == "stone-dash")
        g = dict(g, app_store_url="https://apps.apple.com/jp/app/id1")
        html = render.card(g, catalog.load_genres(), "")
        self.assertIn('href="https://apps.apple.com/jp/app/id1"', html)
        self.assertIn('rel="noopener"', html)

    # ---- 内部リンクの整合 ----
    def test_internal_links_resolve(self):
        broken = []
        for page in self.dist.rglob("*.html"):
            text = page.read_text(encoding="utf-8")
            for m in re.finditer(r'(?:href|src)="([^"#?]+)"', text):
                url = m.group(1)
                if re.match(r"^(https?:|mailto:|//)", url):
                    continue
                target = ((self.dist / url.lstrip("/")) if url.startswith("/") else (page.parent / url)).resolve()
                if url.endswith("/"):
                    target = target / "index.html"
                if not target.exists():
                    broken.append("%s -> %s" % (page.relative_to(self.dist), url))
        self.assertEqual(broken, [])

    # ---- 方針の検査 ----
    def test_404_page_exists_and_is_noindex(self):
        # 404.html が無いと、Cloudflare Pages は存在しない URL（公開していないゲームなど）にも 200 でトップを返してしまう
        t = (self.dist / "404.html").read_text(encoding="utf-8")
        self.assertIn("ページが見つかりません", t)
        self.assertIn('name="robots" content="noindex"', t)
        self.assertIn('href="/"', t)
        self.assertIn('href="/_store/store.css"', t)

    def test_not_indexable_until_approved(self):
        self.assertIn("Disallow: /", (self.dist / "robots.txt").read_text())
        self.assertFalse((self.dist / "sitemap.xml").exists())
        for p in self.dist.rglob("index.html"):
            if p.parent.name in ("platform",):
                continue
            self.assertIn('name="robots" content="noindex"', p.read_text(encoding="utf-8"), str(p))

    def test_csp(self):
        h = (self.dist / "_headers").read_text()
        for needle in ("default-src 'self'", "script-src 'self'", "style-src 'self'", "frame-ancestors 'none'"):
            self.assertIn(needle, h)
        self.assertNotIn("unsafe-inline", h)

    def test_no_external_resources_or_inline_code(self):
        self.assertEqual(build.check_output(self.dist), [])

    def test_check_output_detects(self):
        with tempfile.TemporaryDirectory() as t:
            (Path(t) / "a.js").write_text("fetch('https://example.com/x')")
            (Path(t) / "b.html").write_text('<p style="color:red">x</p>')
            (Path(t) / "c.html").write_text('<img src="https://example.com/x.png"><a href="https://ok.example/">link</a>')
            (Path(t) / "d.css").write_text("@import url(x.css);")
            self.assertEqual(len(build.check_output(Path(t))), 4)

    def test_external_anchor_is_allowed(self):
        with tempfile.TemporaryDirectory() as t:
            (Path(t) / "c.html").write_text('<a href="https://ok.example/">link</a>')
            self.assertEqual(build.check_output(Path(t)), [])

    def test_runtime_has_no_secret_storage(self):
        # 方針：秘密の値をブラウザに保存しない。保存するのは表示用の自己ベストだけ。
        for f in (ROOT / "platform").rglob("*.js"):
            self.assertIsNone(re.search(r"secret|hmac|token", f.read_text(encoding="utf-8"), re.I), f.name)

    # ---- デザインの自由（詳細ページは共通デザインに縛られない） ----
    def test_about_pages_do_not_share_store_css(self):
        for gid in ("ball-dodge", "stone-dash"):
            text = (self.dist / gid / "about" / "index.html").read_text(encoding="utf-8")
            self.assertNotIn("_store/store.css", text)
            self.assertIn("about-base.css", text)
            self.assertIn("vars.css", text)
        self.assertIn("theme.css", (self.dist / "ball-dodge/about/index.html").read_text(encoding="utf-8"))

    def test_ball_dodge_and_stone_dash_have_different_themes(self):
        a = (self.dist / "ball-dodge/about/vars.css").read_text()
        b = (self.dist / "stone-dash/about/vars.css").read_text()
        self.assertNotEqual(a, b)

    def test_custom_about_html_is_used_as_is(self):
        # store/about.html があれば、骨組みを使わず、そのまま詳細ページになる（完全に独自のデザイン）
        with tempfile.TemporaryDirectory() as t:
            games = Path(t) / "games"
            shutil.copytree(ROOT / "games" / "ball-dodge", games / "ball-dodge")
            (games / "ball-dodge" / "store" / "about.html").write_text("<!doctype html><title>x</title><p>CUSTOM PAGE</p>", encoding="utf-8")
            original = catalog.GAMES_DIR
            catalog.GAMES_DIR = games
            try:
                out = Path(t) / "dist"
                build.build(out=out)
                self.assertIn("CUSTOM PAGE", (out / "ball-dodge" / "about" / "index.html").read_text(encoding="utf-8"))
            finally:
                catalog.GAMES_DIR = original

    # ---- 公開の関門 ----
    def test_release_build_has_no_drafts(self):
        ids = build.build(release=True, out=tempfile.mkdtemp())
        self.assertEqual(ids, ["crowd-sprint-3d"])  # 公開済みは、承認された 1 本だけ。draft は含まれない

    def test_release_blockers(self):
        site = catalog.load_site()
        games = catalog.load_games(catalog.load_genres())
        # 素材のそろっていないゲーム（STONE DASH の下書き）は、画像・スクリーンショット・App Store の URL などで止まる
        s = dict(next(x for x in games if x["id"] == "stone-dash"), status="published")
        text = "\n".join(catalog.release_blockers([s], dict(site, privacy_finalized=False)))
        for needle in ("プライバシー", "release_date", "card", "hero", "og", "スクリーンショット", "app_store_url"):
            self.assertIn(needle, text)

    def test_finished_games_are_release_ready_except_owner_decisions(self):
        # 完成したゲームは、素材・文章・申告・権利台帳がそろっている。残るのは、オーナーの判断（公開日・プライバシーの確認）だけ
        site = catalog.load_site()
        games = {x["id"]: x for x in catalog.load_games(catalog.load_genres())}
        for gid in ("ball-dodge", "crowd-sprint", "crowd-sprint-3d"):
            g = dict(games[gid], status="published", release_date=None)      # 公開日が未設定の状態で、関門を確認
            blockers = catalog.release_blockers([g], dict(site, privacy_finalized=False))
            self.assertEqual(len(blockers), 2, (gid, blockers))
            self.assertTrue(any("プライバシー" in b for b in blockers))
            self.assertTrue(any("release_date" in b for b in blockers))
            ready = catalog.release_blockers([dict(g, release_date="2026-12-01")], dict(site, privacy_finalized=True))
            self.assertEqual(ready, [], gid)

    def test_release_build_strips_dev_files_and_publishes_only_finished(self):
        out = Path(tempfile.mkdtemp()) / "dist"
        ids = build.build(release=True, out=out)
        self.assertEqual(ids, ["crowd-sprint-3d"])                       # 公開するのは、承認された 1 本だけ
        self.assertFalse((out / "crowd-sprint-3d" / "bot.js").exists(), "検証用の bot.js が公開物に入っている")
        for other in ("ball-dodge", "crowd-sprint", "stone-dash"):
            self.assertFalse((out / other).exists(), other + " が公開物に入っている")
        priv = (out / "privacy" / "index.html").read_text(encoding="utf-8")
        self.assertNotIn("確認前の下書き", priv)
        self.assertIn("CROWD SPRINT", priv)
        self.assertNotIn("BALL DODGE", priv)
        index = (out / "index.html").read_text(encoding="utf-8")
        self.assertIn("テスト公開中", index)
        self.assertIn('name="robots" content="noindex"', index)          # 検索には載せない（indexing: false）
        self.assertIn("Disallow: /", (out / "robots.txt").read_text())

    def test_strip_dev_files(self):
        with tempfile.TemporaryDirectory() as t:
            (Path(t) / "bot.js").write_text("x"); (Path(t) / "main.js").write_text("y")
            self.assertEqual(build.strip_dev_files(t), ["bot.js"])
            self.assertTrue((Path(t) / "main.js").exists())

    def test_published_game_passes_real_release_gate(self):
        # 公開済みのゲームは、実際の設定（公開日・プライバシー確認済み）で、関門に不足がない
        site = catalog.load_site()
        games = catalog.load_games(catalog.load_genres())
        pub = [g for g in games if g["status"] == "published"]
        self.assertEqual([g["id"] for g in pub], ["crowd-sprint-3d"])
        self.assertEqual(catalog.release_blockers(games, site), [])
        self.assertTrue(site["privacy_finalized"])

    def test_public_jpegs_have_no_metadata(self):
        # 公開する画像に、EXIF などのメタデータを残さない（HP の公開情報の検査と同じ方針）
        import strip_exif
        bad = []
        for f in (ROOT / "games").rglob("store/art/*.jpg"):
            if strip_exif.has_metadata(f.read_bytes()):
                bad.append(str(f.relative_to(ROOT)))
        self.assertEqual(bad, [])

    def test_asset_licenses_ledger(self):
        text = (ROOT / "ASSET_LICENSES.md").read_text(encoding="utf-8")
        for g in catalog.load_games(catalog.load_genres()):
            self.assertRegex(text, r"(?m)^## %s(?![\w-])" % re.escape(g["id"]))
        # 台帳にない published のゲームは、公開の関門で止まる
        site = catalog.load_site()
        g = dict(next(x for x in catalog.load_games(catalog.load_genres()) if x["id"] == "ball-dodge"), status="published", id="no-such-ledger")
        self.assertTrue(any("ASSET_LICENSES.md" in b for b in catalog.release_blockers([g], site)))

    def test_every_shipped_asset_is_recorded(self):
        # 同梱している画像・音・フォントのファイルは、台帳（ASSET_LICENSES.md）にファイル名が載っていること
        text = (ROOT / "ASSET_LICENSES.md").read_text(encoding="utf-8")
        exts = {".png", ".jpg", ".jpeg", ".webp", ".svg", ".avif", ".mp3", ".wav", ".ogg", ".m4a", ".woff", ".woff2", ".ttf", ".otf"}
        missing = []
        for base in ("games", "platform", "store"):
            for f in (ROOT / base).rglob("*"):
                if f.is_file() and f.suffix.lower() in exts and f.name not in text and f.stem not in text.replace("shot-*", "shot-play shot-wave shot-over"):
                    missing.append(str(f.relative_to(ROOT)))
        self.assertEqual(missing, [])

    # ---- 検査 ----
    def test_validation_catches_bad_metadata(self):
        d = ROOT / "games" / "ball-dodge"
        meta = json.loads((d / "game.json").read_text(encoding="utf-8"))
        store = json.loads((d / "store" / "store.json").read_text(encoding="utf-8"))
        genres = {"casual", "action"}
        self.assertEqual(catalog.validate(meta, store, d, genres), [])
        for bad in ({"id": "Bad_ID"}, {"id": "platform"}, {"status": "live"}, {"kind": "pc"}, {"genre": "nope"},
                    {"budget_kb": 1}, {"score": {"order": "up"}}, {"release_date": "soon"}):
            self.assertTrue(catalog.validate(dict(meta, **bad), store, d, genres), bad)
        missing = dict(meta)
        del missing["summary"]
        self.assertTrue(catalog.validate(missing, store, d, genres))
        low = dict(store, theme=dict(store["theme"], fg="#eeeeee"))
        self.assertTrue(any("コントラスト" in x for x in catalog.validate(meta, low, d, genres)))
        self.assertTrue(catalog.validate(meta, dict(store, images={"card": "nope.png"}), d, genres))

    def test_contrast_function(self):
        self.assertAlmostEqual(catalog.contrast("#000000", "#ffffff"), 21.0, places=1)
        self.assertAlmostEqual(catalog.contrast("#777777", "#ffffff"), 4.48, places=1)

    def test_new_game_scaffold_builds(self):
        gid = "zz-scaffold-test"
        d = ROOT / "games" / gid
        try:
            subprocess.run([sys.executable, str(ROOT / "tools" / "new_game.py"), gid, "--title", "ZZ", "--genre", "casual"],
                           check=True, capture_output=True)
            self.assertIn(gid, build.build(out=tempfile.mkdtemp()))
            r = subprocess.run([sys.executable, str(ROOT / "tools" / "new_game.py"), gid, "--title", "ZZ", "--genre", "casual"],
                               capture_output=True)
            self.assertNotEqual(r.returncode, 0)  # 既存は上書きしない
        finally:
            shutil.rmtree(d, ignore_errors=True)
            build.build()


if __name__ == "__main__":
    unittest.main()
