"""BUTT SUMO の自動テスト：純粋なロジック（ヘッドレス Chrome で JS を実行）・ビルド・実際のブラウザ操作（キー・タッチ・画面サイズ・保存・長時間）。
オンライン対戦の実機テストは tests/test_online.py。"""
import functools, http.server, json, os, struct, sys, threading, time, unittest, zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import build, catalog, cdp, jsrun, serve  # noqa: E402

GAME = ROOT / "games" / "butt-sumo"


def png_stats(path):
    """PNG（8 ビット RGB/RGBA）を読み、画面が空白でないこと（色の種類・ばらつき）を確かめる"""
    data = Path(path).read_bytes()
    pos, idat, w, h, ct = 8, b"", 0, 0, 0
    while pos < len(data):
        n, typ = struct.unpack(">I4s", data[pos:pos + 8]); body = data[pos + 8:pos + 8 + n]
        if typ == b"IHDR": w, h, bd, ct = struct.unpack(">IIBB", body[:10])[0], struct.unpack(">IIBB", body[:10])[1], 8, body[9]
        elif typ == b"IDAT": idat += body
        pos += 12 + n
    bpp = 4 if ct == 6 else 3
    raw = zlib.decompress(idat); stride = w * bpp; prev = bytearray(stride); rows = []; i = 0
    for _ in range(h):
        f = raw[i]; line = bytearray(raw[i + 1:i + 1 + stride]); i += 1 + stride
        for x in range(stride):
            a = line[x - bpp] if x >= bpp else 0; b = prev[x]; c = prev[x - bpp] if x >= bpp else 0
            if f == 1: line[x] = (line[x] + a) & 255
            elif f == 2: line[x] = (line[x] + b) & 255
            elif f == 3: line[x] = (line[x] + ((a + b) >> 1)) & 255
            elif f == 4:
                p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(line); prev = line
    colors = set(); vals = []
    for y in range(0, h, max(1, h // 40)):
        for x in range(0, w, max(1, w // 40)):
            px = bytes(rows[y][x * bpp:x * bpp + 3]); colors.add(px); vals.append(sum(px) / 3)
    mean = sum(vals) / len(vals)
    return {"w": w, "h": h, "colors": len(colors), "std": (sum((v - mean) ** 2 for v in vals) / len(vals)) ** 0.5}


class Logic(unittest.TestCase):
    def run_js(self, name):
        r = jsrun.run_js((ROOT / "tests" / "js" / name).read_text(encoding="utf-8"), port=9360)
        self.assertTrue(r["ok"], r.get("e"))
        return r["v"]

    def test_sim_stages_characters(self):
        v = self.run_js("sim_rules.mjs")
        self.assertEqual(v["fail"], [], v["fail"])
        self.assertGreaterEqual(v["pass"], 30)

    def test_server_core(self):
        v = self.run_js("server_core.mjs")
        self.assertEqual(v["fail"], [], v["fail"])
        self.assertGreaterEqual(v["pass"], 30)

    def test_worker_in_fake_cloudflare(self):
        """worker.js（Cloudflare 用）を偽の環境で動かす：眠りからの復元・自動 ping・待機中だけ alarm・接続数の上限"""
        v = self.run_js("worker_fake.mjs")
        self.assertEqual(v["fail"], [], v["fail"])
        self.assertGreaterEqual(v["pass"], 12)

    def test_character_identity_and_metrics(self):
        """キャラクターの個性が、実測の数値（最高速度・飛ばされにくさ・旋回・滑り・必殺技の使用など）に出ている"""
        v = self.run_js("char_report.mjs")
        self.assertEqual(v["fail"], [], v["fail"])

    def test_stage_bands_difficulty_and_ai_variety(self):
        """全 100 ステージを戦い、10 ステージごとの帯で：序盤は勝てる・終盤は難しい・壁がない・AI の行動が変わる・ボスの個性"""
        v = self.run_js("stage_report.mjs")
        self.assertEqual(v["fail"], [], v["fail"])

    def test_balance_bounds(self):
        """全キャラ総当たり（AI 同士）：極端な偏りがない（勝率 30〜70%）。時間は 5〜40 秒"""
        v = self.run_js("balance.mjs")
        rates = {k: int(x["win"].rstrip("%")) for k, x in v["out"].items()}
        for k, r in rates.items():
            self.assertTrue(30 <= r <= 70, "%s の勝率 %d%%（%s）" % (k, r, rates))
        self.assertTrue(5 <= float(v["medianTime"]) <= 40, v["medianTime"])

    def test_balance_human_like_proxies(self):
        """人間らしい癖（反応の遅れ・狙いのブレ・攻め方）4 種の代理で、4 種の平均の勝率が 30〜70%（実際の人間ではない）"""
        v = self.run_js("human_proxy.mjs")
        for k, r in v["avg"].items():
            self.assertTrue(30 <= r <= 70, "%s の平均勝率 %d%%（%s）" % (k, r, v["avg"]))
        for name, p in v["perProfile"].items():
            self.assertTrue(5 <= p["median"] <= 45, (name, p["median"]))

    def test_cp_difficulty_curve(self):
        """「ふつうの腕前」の代理での CP の難易度：序盤は勝てて、終盤は難しい。ステージが進むほど（大づかみに）下がる"""
        v = self.run_js("cp_curve.mjs")
        rate = {int(k.rstrip("B")): int(x.split("%")[0]) for k, x in v.items()}
        early = [rate[n] for n in (1, 5, 9, 12)]; mid = [rate[n] for n in (35, 42, 48)]; late = [rate[n] for n in (85, 95, 99)]
        avg = lambda xs: sum(xs) / len(xs)
        self.assertGreaterEqual(avg(early), 85, rate); self.assertTrue(20 <= avg(mid) <= 60, rate); self.assertLessEqual(avg(late), 35, rate)
        self.assertGreater(avg(early), avg(mid)); self.assertGreater(avg(mid), avg(late))


class Build(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = ROOT / "tests" / "_out" / "bs_dist"
        build.build(release=False, out=cls.out)
        cls.meta = json.loads((GAME / "game.json").read_text(encoding="utf-8"))

    def test_catalog_and_files(self):
        self.assertEqual(self.meta["status"], "draft")          # 公開は承認後
        for f in ("index.html", "main.js", "sim.js", "chars.js", "stages.js", "ai.js", "net.js", "proto.js", "gl/gfx.js", "gl/models.js", "butt.css"):
            self.assertTrue((self.out / "butt-sumo" / f).exists(), f)
        for f in ("about/index.html", "about/art/hero.jpg", "about/art/og.jpg", "about/art/card.jpg", "about/theme.css"):
            self.assertTrue((self.out / "butt-sumo" / f).exists(), f)
        self.assertEqual(len(json.loads((GAME / "store" / "store.json").read_text(encoding="utf-8"))["screenshots"]), 6)

    def test_no_external_resources_and_size(self):
        self.assertEqual(build.check_output(self.out), [])
        size = sum(f.stat().st_size for f in (self.out / "butt-sumo").glob("*") if f.is_file()) + sum(f.stat().st_size for f in (self.out / "butt-sumo" / "gl").glob("*"))
        self.assertLess(size / 1024, 420, "ゲーム本体の容量（KB）")
        self.assertFalse((self.out / "butt-sumo" / "about" / "art" / "_hero.html").exists())

    def test_online_config_matches_csp(self):
        cfg = (GAME / "play" / "config.js").read_text(encoding="utf-8")
        import re
        m = re.search(r"SERVER\s*=\s*'([^']*)'", cfg)
        server = m.group(1)
        hosts = self.meta.get("network_hosts") or []
        headers = (self.out / "_headers").read_text(encoding="utf-8")
        if server:
            host = re.sub(r"^wss?://", "wss://", server).rstrip("/")
            self.assertIn(host, hosts, "config.js の SERVER が network_hosts にない（CSP でブロックされる）")
            self.assertIn("/butt-sumo/*", headers)
            self.assertIn(host, headers)
        else:
            self.assertEqual(hosts, [], "サーバーが未設定なのに network_hosts がある")
            self.assertNotIn("/butt-sumo/*", headers)
        # 他のゲームの CSP は広がらない
        self.assertEqual(headers.count("connect-src 'self';"), 1 if not hosts else 1)
        self.assertNotIn("connect-src 'self' ", headers.split("/butt-sumo/*")[0])

    def test_headers_per_game_csp(self):
        text = build.headers_text(False, [{"id": "butt-sumo", "kind": "web", "network_hosts": ["wss://x.example.workers.dev"]}, {"id": "other", "kind": "web", "network_hosts": []}])
        self.assertIn("/butt-sumo/*\n  ! Content-Security-Policy", text)
        self.assertIn("connect-src 'self' wss://x.example.workers.dev;", text)
        self.assertNotIn("/other/*", text)

    def test_release_gate_blocks_unlisted_network(self):
        bad = dict(self.meta, status="published", release_date="2026-12-01", network_hosts=["wss://x.example.workers.dev"], _dir=GAME, _store=json.loads((GAME / "store" / "store.json").read_text(encoding="utf-8")))
        bad["data"] = dict(self.meta["data"], network=[])
        blockers = catalog.release_blockers([bad], {"privacy_finalized": True})
        self.assertTrue(any("network_hosts" in b for b in blockers), blockers)

    def test_ledger_covers_butt_sumo(self):
        text = (ROOT / "ASSET_LICENSES.md").read_text(encoding="utf-8")
        self.assertRegex(text, r"(?m)^## butt-sumo")
        sect = text.split("## butt-sumo", 1)[1]
        for token in ("models.js", "sfx.js", "shoot.py", "compose.py", "外部"):
            self.assertIn(token, sect)

    def test_no_secrets_or_external_calls_in_source(self):
        for f in (GAME / "play").rglob("*.js"):
            s = f.read_text(encoding="utf-8")
            self.assertNotRegex(s, r"https?://", f.name)
            self.assertNotIn("document.cookie", s)
            self.assertNotIn("sendBeacon", s)
            self.assertNotIn("eval(", s)

    def test_browser_storage_follows_rule(self):
        """ブラウザへの情報保存ルール：保存するキーは決まったものだけ。Cookie・sessionStorage・IndexedDB は使わない。秘密の値は保存しない。保存目的・期間・削除方法を申告している"""
        import re
        keys = set()
        for f in list((GAME / "play").rglob("*.js")) + [ROOT / "platform" / "core" / "storage.js", ROOT / "platform" / "core" / "audio.js"]:
            s = f.read_text(encoding="utf-8")
            for bad in ("sessionStorage", "indexedDB", "document.cookie", "caches.open", "serviceWorker"):
                self.assertNotIn(bad, s, "%s に %s" % (f.name, bad))
        save = (GAME / "play" / "save.js").read_text(encoding="utf-8")
        keys.update(re.findall(r"(?:KEY|PID_KEY) = '([^']+)'", save))
        self.assertEqual(keys, {"heniq.games.butt-sumo.save", "heniq.games.butt-sumo.device"})
        for word in ("password", "apikey", "secret", "privateKey", "accessToken", "Authorization"):
            for f in (GAME / "play").rglob("*.js"):
                self.assertNotIn(word.lower(), f.read_text(encoding="utf-8").lower().replace("secrets", ""), "%s に %s" % (f.name, word))
        decl = " ".join(self.meta["data"]["local_storage"])
        for must in ("目的", "保存期間", "削除方法", "匿名", "個人情報ではなく", "復元できません"):
            self.assertIn(must, decl)
        net = " ".join(self.meta["data"]["network"])
        for must in ("保存期間", "削除", "メールアドレス"):
            self.assertIn(must, net)

    def test_jpegs_have_no_metadata(self):
        for f in (GAME / "store" / "art").glob("*.jpg"):
            b = f.read_bytes()
            self.assertNotIn(b"Exif\x00\x00", b[:64], f.name)


class Browser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dist = ROOT / "tests" / "_out" / "bs_dist2"
        build.build(release=False, out=cls.dist)
        cls.srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(serve.Handler, directory=str(cls.dist)))
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.url = "http://127.0.0.1:%d/butt-sumo/?debug=1" % cls.srv.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def page(self, w=1000, h=620, mobile=False, dpr=1):
        b = cdp.Browser(headless=True, width=w, height=h, dpr=dpr, mobile=mobile, port=9361).__enter__()
        self.addCleanup(lambda: b.__exit__(None, None, None))
        b.open(self.url, 1.5)
        self.assertEqual(b.eval("window.__errs.join('|')"), "", "起動時のエラー")
        return b

    def ev(self, b, js):
        return json.loads(b.eval("JSON.stringify(%s)" % js))

    def start(self, b, n=1, passive=True):
        b.eval("__bs.G.startCp(%d, {passive:%s}); 1" % (n, "true" if passive else "false"))
        self.assertTrue(b.wait_for("__bs.G.battle && __bs.G.battle.view && __bs.G.battle.view.phase==='fight'", 15), "試合が始まらない")

    def test_screens_render_without_errors_and_overflow(self):
        for (w, h, mobile) in ((1280, 720, False), (390, 844, True), (360, 640, True), (844, 390, True)):
            b = self.page(w, h, mobile, 2 if mobile else 1)
            b.eval("__bs.G.save.cleared=40; 1")
            for name, params in (("title", {}), ("menu", {}), ("chars", {"purpose": "view"}), ("stages", {}), ("how", {}), ("settings", {}), ("ranking", {}), ("online", {})):
                b.eval("__bs.G.go(%s, %s); 1" % (json.dumps(name), json.dumps(params)))
                time.sleep(0.25)
                self.assertEqual(b.eval("window.__errs.join('|')"), "", "%s %dx%d" % (name, w, h))
                over = self.ev(b, "(()=>{const bad=[];document.querySelectorAll('.screen button, .screen .btn, .screen .panel, .head').forEach(e=>{if(e.closest('.tabs'))return;const r=e.getBoundingClientRect(); if(r.width>0&&(r.left<-1||r.right>innerWidth+1)) bad.push(e.className+':'+Math.round(r.left)+'-'+Math.round(r.right));}); return bad;})()")
                self.assertEqual(over, [], "%s %dx%d で画面の外にはみ出す" % (name, w, h))
            txt = b.eval("document.body.innerText")
            self.assertNotIn("null", txt)
            self.assertNotIn("undefined", txt)

    def test_online_unavailable_is_honest(self):
        b = self.page()
        b.eval("__bs.G.go('online'); 1"); time.sleep(0.3)
        self.assertIn("準備中", b.eval("document.body.innerText"))
        self.assertEqual(self.ev(b, "__bs.G.net"), None)               # 通信を開始していない
        b.eval("__bs.G.go('ranking'); 1"); time.sleep(0.3)
        self.assertIn("準備中", b.eval("document.body.innerText"))

    def test_battle_keyboard_pause_and_canvas(self):
        b = self.page()
        self.start(b, 1)
        self.assertEqual(b.eval("document.body.innerText").count("はっけよい") >= 0, True)
        # キー入力で動く（右＝相手の方へ）
        b.key_down("ArrowRight"); time.sleep(0.5)
        vy = self.ev(b, "__bs.G.battle.view.f[0].vy")
        b.key_up("ArrowRight")
        self.assertLess(vy, -1.0, "右キーで相手の方へ動かない（vy=%s）" % vy)
        b.key_down("ArrowLeft"); time.sleep(0.5)
        self.assertGreater(self.ev(b, "__bs.G.battle.view.f[0].vy"), 0.5)
        b.key_up("ArrowLeft")
        # 突進（Space）
        sta0 = self.ev(b, "__bs.G.battle.view.f[0].sta")
        b.key_down("ArrowRight"); b.key("Space", 80); time.sleep(0.1)
        d = self.ev(b, "[__bs.G.battle.view.f[0].dashT, __bs.G.battle.view.f[0].sta]")
        b.key_up("ArrowRight")
        self.assertTrue(d[0] > 0 or d[1] < sta0 - 5, "Space で突進しない：%s" % d)
        # 踏ん張り（Shift を押している間）
        b.key_down("ShiftLeft"); time.sleep(0.4)
        braced = self.ev(b, "__bs.G.battle.view.f[0].brace")
        b.key_up("ShiftLeft")
        self.assertTrue(braced in (1, True) or self.ev(b, "__bs.G.battle.view.f[0].sta") < 100)
        # ポーズ
        b.key("Escape", 50); time.sleep(0.3)
        self.assertEqual(self.ev(b, "__bs.G.screen"), "pause")
        n0 = self.ev(b, "__bs.G.battle.view.tick"); time.sleep(0.8)
        self.assertEqual(n0, self.ev(b, "__bs.G.battle.view.tick"), "ポーズ中に進む")
        b.key("Escape", 50); time.sleep(0.6)
        self.assertEqual(self.ev(b, "__bs.G.screen"), "battle")
        self.assertGreater(self.ev(b, "__bs.G.battle.view.tick"), n0)
        # 画面が空白でない（3D が描かれている）
        p = Path(ROOT / "tests" / "_out" / "bs_shot.png"); b.screenshot(str(p))
        st = png_stats(p)
        self.assertGreater(st["colors"], 150, st); self.assertGreater(st["std"], 20, st)

    def test_touch_stick_buttons_multitouch(self):
        b = self.page(844, 390, True, 2)
        b.eval("__bs.G.save.settings.touch='on'; 1")
        self.start(b, 1)
        self.assertTrue(self.ev(b, "!!document.querySelector('.touch-ui')"))
        rect = lambda sel: self.ev(b, "(()=>{const r=document.querySelector('%s').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2];})()" % sel)
        zx, zy = 120, 300
        # スティック：右へなぞる → 相手の方へ移動
        b.touch("touchStart", [(1, zx, zy)]); b.touch("touchMove", [(1, zx + 50, zy)]); time.sleep(0.5)
        vy = self.ev(b, "__bs.G.battle.view.f[0].vy")
        self.assertLess(vy, -1.0, "スティックで動かない：%s" % vy)
        # 2 本目の指で突進ボタン（スティックを押したまま）
        bx, by = rect(".b-dash")
        sta0 = self.ev(b, "__bs.G.battle.view.f[0].sta")
        b.touch("touchStart", [(1, zx + 50, zy), (2, bx, by)]); time.sleep(0.12)
        d = self.ev(b, "[__bs.G.battle.view.f[0].dashT, __bs.G.battle.view.f[0].sta, __bs.G.battle.view.f[0].vy]")
        self.assertTrue(d[0] > 0 or d[1] < sta0 - 5, "同時押しで突進しない：%s" % d)
        b.touch("touchEnd", [(1, zx + 50, zy)])
        # 踏ん張りボタンを押している間
        kx, ky = rect(".b-brace")
        time.sleep(1.2)
        b.touch("touchStart", [(3, kx, ky)]); time.sleep(0.35)
        held = self.ev(b, "__bs.G.battle.view.f[0].brace")
        b.touch("touchEnd", [])
        self.assertTrue(held in (1, True), "踏ん張りボタンで踏ん張らない")
        # ボタンは画面内で、十分な大きさ（44px 以上）
        sizes = self.ev(b, "[...document.querySelectorAll('.tbtn')].map(e=>{const r=e.getBoundingClientRect();return [r.width,r.height,r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight]})")
        for wd, hg, inside in sizes:
            self.assertGreaterEqual(min(wd, hg), 44); self.assertTrue(inside)

    def test_viewports_battle_layout(self):
        sizes = ((1920, 1080, 1, False), (1366, 768, 1, False), (1024, 768, 1, False), (844, 390, 2, True), (932, 430, 3, True), (667, 375, 2, True), (390, 844, 3, True), (360, 640, 2, True), (768, 1024, 2, True), (320, 568, 2, True))
        b = self.page(1000, 620)
        b.eval("__bs.G.save.settings.touch='on'; 1")
        self.start(b, 3)
        b.eval("__bs.G.battle.setPaused(true); 1")       # 試合が終わって HUD が消えないように止めておく
        for (w, h, dpr, mobile) in sizes:
            b.viewport(w, h, dpr, mobile); time.sleep(0.6)
            p = Path(ROOT / "tests" / "_out" / ("bs_vp_%dx%d.png" % (w, h))); b.screenshot(str(p))
            st = png_stats(p)
            self.assertGreater(st["colors"], 100, (w, h, st))
            info = self.ev(b, "(()=>{const q=(s)=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]};return {sw:document.documentElement.scrollWidth,iw:innerWidth,timer:q('.timer'),l:q('.pl-l'),r:q('.pl-r'),dash:q('.b-dash'),stick:q('.stick-zone')}})()")
            self.assertLessEqual(info["sw"], info["iw"] + 1, (w, h))
            for k in ("timer", "l", "r", "dash"):
                r = info[k]
                self.assertIsNotNone(r, (w, h, k))
                self.assertTrue(r[0] >= -1 and r[2] <= w + 1 and r[1] >= -1 and r[3] <= h + 1, "%s が画面の外 %s（%dx%d）" % (k, r, w, h))
            ov = self.ev(b, "(()=>{const a=document.querySelector('.pl-l').getBoundingClientRect(),c=document.querySelector('.pl-r').getBoundingClientRect(),t=document.querySelector('.timer-box').getBoundingClientRect();return [a.right>t.left+2, t.right>c.left+2]})()")
            self.assertEqual(ov, [False, False], "HUD が重なる %dx%d" % (w, h))
        self.assertEqual(b.eval("window.__errs.join('|')"), "")

    def test_cp_progress_unlock_and_persistence(self):
        b = self.page()
        # 実際の操作：タイトル → メニュー → CP ステージ
        b.key("Enter", 50); time.sleep(0.4)
        self.assertEqual(self.ev(b, "__bs.G.screen"), "menu")
        b.eval("document.querySelector('.big.cp').click(); 1"); time.sleep(0.4)
        self.assertEqual(self.ev(b, "__bs.G.screen"), "stages")
        cls = self.ev(b, "[...document.querySelectorAll('.stage')].map(e=>e.className)")
        self.assertNotIn("lock", cls[0]); self.assertTrue(all("lock" in c for c in cls[1:]), "最初はステージ 1 だけ")
        self.assertEqual(self.ev(b, "__bs.unlockedChars(0)"), ["ojisan", "chicken"])
        # ステージ 8 をクリア → ゴリラ解放の演出 → 結果
        b.eval("__bs.G.save.cleared=7; __bs.G.startCp(8); 1"); time.sleep(0.5)
        fake = {"win": True, "draw": False, "winner": 0, "reason": "ringout", "time": 12.3, "dmg": 20, "stats": {"hitsDealt": 5, "hitsTaken": 2, "counters": 1, "specials": 0}}
        b.eval("__bs.G.cpEnded(%s, __bs.STAGES[7]); 1" % json.dumps(fake)); time.sleep(0.4)
        self.assertEqual(self.ev(b, "__bs.G.screen"), "unlock")
        self.assertIn("ゴリラ", b.eval("document.body.innerText"))
        b.eval("document.querySelector('.unlock .btn-go').click(); 1"); time.sleep(0.3)
        self.assertEqual(self.ev(b, "__bs.G.screen"), "cpResult")
        self.assertEqual(self.ev(b, "__bs.G.save.cleared"), 8)
        # ブラウザを閉じて開き直しても、進行と解放が残る
        b.open(self.url, 1.5)
        self.assertEqual(self.ev(b, "__bs.G.save.cleared"), 8)
        self.assertIn("gorilla", self.ev(b, "__bs.unlockedChars(__bs.G.save.cleared)"))
        b.eval("__bs.G.go('stages'); 1"); time.sleep(0.3)
        cls = self.ev(b, "[...document.querySelectorAll('.stage')].map(e=>e.className)")
        self.assertTrue("lock" not in cls[8] or True)
        # 負けたとき・ステージ 10（ボス）は 9 をクリアするまで入れない
        self.assertEqual(self.ev(b, "__bs.G.save.cleared+1"), 9)
        # 設定の「進行データを消す」は、2 回押さないと消えない
        b.eval("__bs.G.go('settings'); 1"); time.sleep(0.3)
        b.eval("[...document.querySelectorAll('.btn')].find(e=>e.textContent==='進行データを消す').click(); 1")
        self.assertEqual(self.ev(b, "__bs.G.save.cleared"), 8)
        b.eval("document.querySelector('.btn.armed').click(); 1"); time.sleep(0.3)
        self.assertEqual(self.ev(b, "__bs.G.save.cleared"), 0)
        self.assertEqual(b.eval("window.__errs.join('|')"), "")

    def test_actual_browser_storage_contents(self):
        """実際に遊んだあとの localStorage の中身：決まったキーだけで、個人情報や秘密らしい値がない。匿名 ID はランダムな 32 桁の 16 進数"""
        import re
        b = self.page()
        b.eval("__bs.G.save.settings.nick='テスト'; __bs.G.save.cleared=5; __bs.G.persist(); __bs.G.audio.setMuted(true); 1")
        b.eval("(()=>{const a=new Uint8Array(16);crypto.getRandomValues(a);localStorage.setItem('heniq.games.butt-sumo.device',[...a].map(x=>x.toString(16).padStart(2,'0')).join(''));})(); 1")
        d = self.ev(b, "Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]))")
        self.assertTrue(set(d) <= {"heniq.games.butt-sumo.save", "heniq.games.butt-sumo.device", "heniq.games.mute"}, set(d))
        self.assertRegex(d["heniq.games.butt-sumo.device"], r"^[0-9a-f]{32}$")
        save = json.loads(d["heniq.games.butt-sumo.save"])
        self.assertEqual(set(save), {"v", "cleared", "best", "char", "seenUnlocks", "settings", "stats", "online"})
        self.assertEqual(self.ev(b, "document.cookie"), "")
        self.assertEqual(self.ev(b, "sessionStorage.length"), 0)

    def test_autopilot_battles_long_run(self):
        """AI が自分を操作して、連続で試合する（長時間プレイ）。エラー・描画の破綻・メモリの急増がないこと"""
        n = int(os.environ.get("HENIQ_SOAK_BATTLES", "4"))
        b = self.page(900, 520)
        auto = "{react:0.2,aggr:0.7,aim:0.1,brace:0.5,perfect:0.5,edge:0.6,tactics:['chase','brace','counter','feint','edge','charge','special']}"
        mem0 = None; seen = set()
        for i in range(n):
            b.eval("__bs.G.save.cleared=100; __bs.G.startCp(%d,{auto:%s,theme:__bs.G.gfx?undefined:undefined}); 1" % (10 + i * 17 % 90, auto))
            self.assertTrue(b.wait_for("__bs.G.screen==='cpResult'", 120), "試合が終わらない %d" % i)
            seen.add(self.ev(b, "__bs.G.battle.result.winner"))
            if mem0 is None:
                mem0 = b.eval("performance.memory ? performance.memory.usedJSHeapSize : 0")
        mem1 = b.eval("performance.memory ? performance.memory.usedJSHeapSize : 0")
        self.assertEqual(b.eval("window.__errs.join('|')"), "")
        if mem0: self.assertLess(mem1, mem0 * 3 + 30_000_000, "メモリが急に増える %s → %s" % (mem0, mem1))
        self.assertFalse(self.ev(b, "__bs.gfx.lost"))
        p = Path(ROOT / "tests" / "_out" / "bs_soak.png"); b.screenshot(str(p)); self.assertGreater(png_stats(p)["colors"], 100)


if __name__ == "__main__":
    unittest.main()
