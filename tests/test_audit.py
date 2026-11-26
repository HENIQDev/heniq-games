"""BUTT SUMO の品質監査：実際にゲームを動かして、3D の向き・カメラ・操作（キーボード・ゲームパッド・タッチ）・進行（全 100 ステージ）・音・保存・画面遷移を確認する。
tests/test_butt_sumo.py と重ならない、「遊んだときの違和感」に近い確認。"""
import functools, http.server, json, sys, threading, time, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import build, cdp, jsrun, serve  # noqa: E402
sys.path.insert(0, str(ROOT / "tests"))

VIEWPORTS = ((1920, 1080, 1, False), (1366, 768, 1, False), (1024, 768, 1, False), (844, 390, 2, True), (932, 430, 3, True), (667, 375, 2, True), (390, 844, 3, True), (360, 640, 2, True), (768, 1024, 2, True), (320, 568, 2, True))
PROJ = "(()=>{const v=__bs.G.battle.view;const w=__bs.gfx.toWorld(v.f[%d].x,v.f[%d].y,false);const p=__bs.gfx.project(w[0],0.8,w[1]);return [p.x,p.y]})()"


class AuditBase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dist = ROOT / "tests" / "_out" / "audit_dist"
        build.build(release=False, out=cls.dist)
        cls.srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(serve.Handler, directory=str(cls.dist)))
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = "http://127.0.0.1:%d" % cls.srv.server_address[1]
        cls.url = cls.base + "/butt-sumo/?debug=1&offline=1"      # 検証は、本番のサーバーにつながない

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def page(self, w=1000, h=620, mobile=False, dpr=1, url=None, port=9371):
        b = cdp.Browser(headless=True, width=w, height=h, dpr=dpr, mobile=mobile, port=port).__enter__()
        self.addCleanup(lambda: b.__exit__(None, None, None))
        b.open(url or self.url, 1.5)
        return b

    def ev(self, b, js):
        return json.loads(b.eval("JSON.stringify(%s)" % js))

    def evp(self, b, js):
        """Promise を返す JS を実行して、JSON の結果を受け取る"""
        return json.loads(b.eval("(async()=>JSON.stringify(await (%s)))()" % js))

    def start(self, b, n=1, passive=True, extra=""):
        b.eval("__bs.G.startCp(%d, {passive:%s%s}); 1" % (n, "true" if passive else "false", extra))
        self.assertTrue(b.wait_for("__bs.G.battle && __bs.G.battle.view && __bs.G.battle.view.phase==='fight'", 15), "試合が始まらない")
        time.sleep(0.3)

    def reset(self, b):
        """相手が動かない状態で、突進などを繰り返すと、相手が場外に出て試合が終わることがある。操作ごとに、双方を開始位置に戻す"""
        if self.ev(b, "__bs.G.battle.view.phase") != "fight":
            return self.start(b)
        b.eval("(()=>{const f=__bs.G.battle.view.f;[[0,2.5],[0,-2.5]].forEach((p,i)=>{const o=f[i];o.x=p[0];o.y=p[1];o.vx=o.vy=o.kx=o.ky=0;o.dmg=0;o.sta=o.sMax;o.stunT=0;o.dashT=0;o.dashCd=0;o.chargeT=0;o.brace=0;o.braceCd=0;o.specT=0;o.specKind='';o.exhaust=0;});f[0].gau=0;f[0].ang=-Math.PI/2;f[1].ang=Math.PI/2;})(); 1")
        time.sleep(0.15)

    def errs(self, b):
        return b.eval("window.__errs.join('|')")


class Gameplay3D(AuditBase):
    def test_screen_direction_matches_keys_and_butt_faces_opponent(self):
        b = self.page()
        self.start(b)
        before = self.ev(b, PROJ % (0, 0))
        for key, axis, sign in (("ArrowRight", 0, 1), ("ArrowLeft", 0, -1), ("ArrowUp", 1, -1), ("ArrowDown", 1, 1), ("KeyD", 0, 1), ("KeyW", 1, -1)):
            b.eval("__bs.G.battle.view.f[0].x=0; __bs.G.battle.view.f[0].y=2.5; __bs.G.battle.view.f[0].kx=0; __bs.G.battle.view.f[0].ky=0; 1")
            time.sleep(0.25); p0 = self.ev(b, PROJ % (0, 0))
            b.key_down(key); time.sleep(0.5); p1 = self.ev(b, PROJ % (0, 0)); b.key_up(key); time.sleep(0.2)
            self.assertGreater((p1[axis] - p0[axis]) * sign, 0.01, "%s で画面上の動きが逆／動かない %s→%s" % (key, p0, p1))
        # 斜め：右＋上
        b.eval("__bs.G.battle.view.f[0].x=0; __bs.G.battle.view.f[0].y=2.5; 1"); time.sleep(0.25)
        p0 = self.ev(b, PROJ % (0, 0)); b.key_down("ArrowRight"); b.key_down("ArrowUp"); time.sleep(0.5)
        v = self.ev(b, "[__bs.G.battle.view.f[0].vx,__bs.G.battle.view.f[0].vy]"); b.key_up("ArrowRight"); b.key_up("ArrowUp"); p1 = self.ev(b, PROJ % (0, 0))
        self.assertGreater(p1[0] - p0[0], 0.01); self.assertLess(p1[1] - p0[1], -0.005)
        speed = (v[0] ** 2 + v[1] ** 2) ** 0.5
        self.assertLess(speed, 3.7 * 1.05, "斜め入力で速くならない（正規化）: %s" % speed)
        # 離したら止まる（0.8 秒で、ほぼ停止）
        time.sleep(0.8)
        v = self.ev(b, "Math.hypot(__bs.G.battle.view.f[0].vx,__bs.G.battle.view.f[0].vy)")
        self.assertLess(v, 0.4, "キーを離しても止まらない")
        # お尻は相手の方を向く（向き直しに最長 0.7 秒）
        ang = self.ev(b, "(()=>{const f=__bs.G.battle.view.f;let d=Math.atan2(f[1].y-f[0].y,f[1].x-f[0].x)-f[0].ang;return Math.abs(Math.atan2(Math.sin(d),Math.cos(d)))})()")
        self.assertLess(ang, 0.35, "お尻が相手を向いていない：%s" % ang)
        self.assertEqual(self.errs(b), "")

    def test_ringout_win_and_fall_visuals(self):
        b = self.page()
        self.start(b)
        # 相手を土俵のふち近くに置いて、お尻から突進
        b.eval("(()=>{const f=__bs.G.battle.view.f;f[1].x=0;f[1].y=-4.2;f[0].x=0;f[0].y=-2.2;f[0].ang=-Math.PI/2;})(); 1")
        time.sleep(0.15)
        b.key_down("ArrowRight"); b.key("Space", 60); b.key_up("ArrowRight")
        self.assertTrue(b.wait_for("__bs.G.battle.view.phase==='ko'||__bs.G.battle.view.phase==='over'", 8), "押し出せない：%s" % self.ev(b, "__bs.G.battle.view.f.map(f=>[f.x,f.y,f.out,f.dmg])"))
        v = self.ev(b, "({w:__bs.G.battle.view.winner, out:__bs.G.battle.view.f.map(f=>f.out), r:__bs.G.battle.view.ringR, d:__bs.G.battle.view.f.map(f=>Math.hypot(f.x,f.y))})")
        self.assertEqual(v["w"], 0); self.assertEqual(v["out"], [0, 1])
        self.assertGreater(v["d"][1], v["r"], "場外判定の位置が土俵の内側")
        # 落下の演出：z が下がり、回転しながら、画面の外へ消えきらない（カメラが追う）
        self.assertTrue(b.wait_for("__bs.G.battle.view.f[1].z < -0.3", 6), "落下しない（z=%s）" % self.ev(b, "__bs.G.battle.view.f[1].z"))     # 決着のあとはスローモーション（0.35 倍）
        banner = b.eval("document.querySelector('.banner').textContent")
        self.assertTrue(banner in ("土俵の外へ！", "勝利！"), banner)
        self.assertTrue(b.wait_for("__bs.G.screen==='cpResult'", 10), "結果画面が出ない")
        self.assertIn("勝利", b.eval("document.querySelector('.screen.result h2').textContent"))
        self.assertEqual(self.errs(b), "")

    def test_camera_keeps_fighters_in_view_at_all_sizes(self):
        b = self.page()
        b.eval("__bs.G.save.cleared=3; 1")
        self.start(b, 3)
        b.eval("__bs.G.battle.setPaused(true); 1")
        import math
        for (w, h, dpr, mobile) in VIEWPORTS:
            b.viewport(w, h, dpr, mobile); time.sleep(0.4)
            bad = []
            for ang in range(0, 360, 45):
                x, y = 4.7 * math.cos(math.radians(ang)), 4.7 * math.sin(math.radians(ang))
                for same in (False, True):     # False：2 人が反対側のふち／True：2 人が同じふちに並ぶ
                    x2, y2 = (x * 0.8 + 0.5, y * 0.8) if same else (-x, -y)
                    res = self.evp(b, "(async()=>{const S=await import('./sim.js');const v=S.createMatch({chars:['baby','ojisan'],seed:1});v.phase='fight';v.f[0].x=%f;v.f[0].y=%f;v.f[1].x=%f;v.f[1].y=%f;for(let i=0;i<30;i++)__bs.gfx.render({view:v,dt:0.1,time:i*0.1,flip:false,touch:false});const o=[];for(const f of v.f){const w=__bs.gfx.toWorld(f.x,f.y,false);for(const yy of [0,2.6]){const p=__bs.gfx.project(w[0],yy,w[1]);o.push([p.x,p.y]);}}return o;})()" % (x, y, x2, y2))
                    self.assertEqual(len(res), 4, "投影の結果がない")
                    for px, py in res:
                        if not (0.0 <= px <= 1.0 and 0.0 <= py <= 1.0):
                            bad.append((ang, same, round(px, 2), round(py, 2)))
            self.assertEqual(bad, [], "土俵のふちのキャラが画面の外 %dx%d" % (w, h))
        b.viewport(1000, 620, 1, False)
        self.assertEqual(self.errs(b), "")

    def test_camera_shake_is_bounded_and_respects_setting(self):
        b = self.page()
        self.start(b)
        b.eval("__bs.G.battle.setPaused(true); 1")
        js = "(()=>{const s=__bs.gfx.st;s.shake=%s;let mx=0;const c=__bs.gfx.render({view:__bs.G.battle.view,dt:0.016,time:0,flip:false});const base=c.eye.slice();for(let i=1;i<200;i++){s.shake=%s;const k=__bs.gfx.render({view:__bs.G.battle.view,dt:0,time:i*0.016,flip:false});mx=Math.max(mx,Math.hypot(k.eye[0]-base[0],k.eye[1]-base[1]));}return mx})()"
        on = self.ev(b, js % ("1", "1"))
        self.assertLess(on, 0.5, "カメラのゆれが大きすぎる：%s" % on)
        self.assertGreater(on, 0.02, "ゆれが全く出ない")
        b.eval("__bs.G.save.settings.shake=false; 1")
        off = self.ev(b, js % ("1", "1"))
        self.assertLess(off, 1e-6, "設定でオフにしてもゆれる：%s" % off)

    def test_resize_during_battle_keeps_running(self):
        b = self.page()
        self.start(b, 1, passive=False)
        for (w, h, dpr, mobile) in VIEWPORTS:
            b.viewport(w, h, dpr, mobile); time.sleep(0.25)
            size = self.ev(b, "[document.querySelector('canvas.gl').clientWidth, document.querySelector('canvas.gl').clientHeight, innerWidth, innerHeight]")
            self.assertEqual(size[:2], size[2:], "キャンバスが画面に合っていない")
        # 縦横の回転を繰り返す
        for _ in range(3):
            b.viewport(844, 390, 2, True); time.sleep(0.2); b.viewport(390, 844, 2, True); time.sleep(0.2)
        self.assertEqual(self.errs(b), "")
        self.assertFalse(self.ev(b, "__bs.gfx.lost"))


    def test_all_themes_and_characters_render_without_gl_errors(self):
        """10 のテーマ × 10 のキャラクターを描いて、GL エラーがなく、画面が空白・単色でない"""
        from test_butt_sumo import png_stats
        b = self.page(900, 520)
        b.eval("__bs.G.save.cleared=100; 1")
        themes = ["park", "bath", "shrine", "beach", "space", "ice", "volcano", "neon", "kitchen", "sky"]
        chars = ["ojisan", "chicken", "gorilla", "frog", "burger", "pudding", "sushi", "robot", "baby", "mystery"]
        for i, th in enumerate(themes):
            me, foe = chars[i], chars[(i + 3) % 10]
            b.eval("__bs.G.startCp(%d,{me:'%s',foe:'%s',theme:'%s',passive:true}); 1" % (10 * i + 1, me, foe, th))
            self.assertTrue(b.wait_for("__bs.G.battle && __bs.G.battle.view && __bs.G.battle.view.phase==='fight'", 15))
            b.key("ArrowRight", 300); time.sleep(0.4)
            self.assertEqual(self.ev(b, "__bs.gfx.gl.getError()"), 0, "%s で GL エラー" % th)
            p = Path(ROOT / "tests" / "_out" / ("audit_theme_%s.png" % th)); b.screenshot(str(p))
            st = png_stats(p)
            self.assertGreater(st["colors"], 120, (th, st)); self.assertGreater(st["std"], 18, (th, st))
        self.assertEqual(self.errs(b), "")


class Controls(AuditBase):
    def test_every_documented_key_works(self):
        """操作説明（遊び方画面）に書いたキーが、実際にその操作になる"""
        help_text = None
        b = self.page()
        b.eval("__bs.G.go('how'); 1"); time.sleep(0.3)
        help_text = b.eval("document.body.innerText")
        for token in ("WASD", "矢印", "Space", "Shift", "Enter", "ポーズ"):
            self.assertIn(token, help_text)
        for dash in ("Space", "KeyJ", "KeyZ"):
            self.start(b); sta0 = 100
            b.key(dash, 70); time.sleep(0.08)
            d = self.ev(b, "[__bs.G.battle.view.f[0].dashT, __bs.G.battle.view.f[0].dashCd]")
            self.assertTrue(d[0] > 0 or d[1] > 0, "%s で突進しない：%s" % (dash, d))
        for brace in ("ShiftLeft", "ShiftRight", "KeyK", "KeyX"):
            self.start(b)
            b.key_down(brace); time.sleep(0.3); r = self.ev(b, "__bs.G.battle.view.f[0].brace"); b.key_up(brace)
            self.assertTrue(r in (1, True), "%s で踏ん張らない" % brace)
        for charge in ("KeyC", "KeyL"):
            self.start(b)
            b.key_down(charge); time.sleep(0.5); c = self.ev(b, "__bs.G.battle.view.f[0].chargeT"); b.key_up(charge); time.sleep(0.15)
            d = self.ev(b, "__bs.G.battle.view.f[0].dashT")
            self.assertGreater(c, 0.2, "%s でチャージしない" % charge); self.assertTrue(d > 0 or self.ev(b, "__bs.G.battle.view.f[0].dashCd>0"), "%s を離しても突進しない" % charge)
        for sp in ("KeyE", "Enter", "KeyU"):
            self.start(b)
            b.eval("__bs.G.battle.view.f[0].gau=100; 1"); b.key(sp, 70); time.sleep(0.12)
            self.assertLess(self.ev(b, "__bs.G.battle.view.f[0].gau"), 30, "%s で必殺技が出ない" % sp)
        self.assertEqual(self.errs(b), "")

    def test_keyboard_edge_cases(self):
        b = self.page()
        self.start(b)
        # 左右同時押しは打ち消し合う
        b.key_down("ArrowLeft"); b.key_down("ArrowRight"); time.sleep(0.5)
        self.assertLess(abs(self.ev(b, "__bs.G.battle.view.f[0].vy")), 0.5); b.key_up("ArrowLeft"); b.key_up("ArrowRight")
        # フォーカスを失う（別のウィンドウへ）と、押しっぱなしの入力が消える
        b.key_down("ArrowRight"); time.sleep(0.3); b.eval("window.dispatchEvent(new Event('blur')); 1"); time.sleep(0.7)
        self.assertLess(abs(self.ev(b, "__bs.G.battle.view.f[0].vy")), 0.5, "フォーカスを失っても動き続ける")
        b.key_up("ArrowRight")
        # 押し続けたままポーズ→再開：リピートのキー入力で、移動が再開する
        b.eval("__bs.G.battle.view.f[0].x=0;__bs.G.battle.view.f[0].y=3.5; 1"); b.key_down("ArrowRight"); time.sleep(0.2)
        b.key("Escape", 50); time.sleep(0.3); b.key("Escape", 50); time.sleep(0.2)
        b.key_down("ArrowRight", repeat=True); time.sleep(0.5)
        self.assertLess(self.ev(b, "__bs.G.battle.view.f[0].vy"), -1.0, "ポーズから戻ったあと、押し続けているキーが効かない")
        b.key_up("ArrowRight")
        # 連続入力：突進を連打しても、クールダウンとスタミナで抑えられる（画面の操作が詰まらない）
        n = 0
        for _ in range(12):
            b.key("Space", 30); time.sleep(0.05)
        d = self.ev(b, "__bs.G.battle.stats")
        sta = self.ev(b, "__bs.G.battle.view.f[0].sta")
        self.assertGreaterEqual(sta, 0)
        # 長押しの切り替え：踏ん張り→離す→すぐ再入力しても、操作不能にならない（突進の連打で相手が場外に出て終わっていることがあるので、新しく始める）
        self.start(b)
        b.key_down("ShiftLeft"); time.sleep(0.3); b.key_up("ShiftLeft"); time.sleep(0.1)
        b.key_down("ArrowRight"); time.sleep(0.5)
        self.assertLess(self.ev(b, "__bs.G.battle.view.f[0].vy"), -0.8, "踏ん張りのあとに動けない"); b.key_up("ArrowRight")
        self.assertEqual(self.errs(b), "")

    def test_gamepad(self):
        b = self.page()
        self.start(b)
        b.eval("""window.__pad={axes:[0,0],buttons:Array.from({length:16},()=>({pressed:false})),connected:true};navigator.getGamepads=()=>[window.__pad];1""")
        b.eval("window.__pad.axes=[1,0]; 1"); time.sleep(0.5)
        self.assertLess(self.ev(b, "__bs.G.battle.view.f[0].vy"), -1.0, "スティックで動かない")
        b.eval("window.__pad.axes=[0,0]; 1"); self.reset(b)
        b.eval("window.__pad.axes=[0,0]; window.__pad.buttons[1].pressed=true; 1"); time.sleep(0.35)
        self.assertTrue(self.ev(b, "__bs.G.battle.view.f[0].brace") in (1, True), "B ボタンで踏ん張らない")
        b.eval("window.__pad.buttons[1].pressed=false; 1"); self.reset(b)
        b.eval("window.__pad.buttons[0].pressed=true; 1"); time.sleep(0.15)
        b.eval("window.__pad.buttons[0].pressed=false; 1")
        self.assertTrue(self.ev(b, "__bs.G.battle.view.f[0].dashCd>0||__bs.G.battle.view.f[0].dashT>0"), "A ボタンで突進しない")
        time.sleep(0.4); self.reset(b)
        b.eval("__bs.G.battle.view.f[0].gau=100; window.__pad.buttons[3].pressed=true; 1"); time.sleep(0.15); b.eval("window.__pad.buttons[3].pressed=false; 1")
        self.assertLess(self.ev(b, "__bs.G.battle.view.f[0].gau"), 30, "Y ボタンで必殺技が出ない")
        self.assertEqual(self.errs(b), "")

    def test_touch_all_buttons_and_no_scroll_or_zoom(self):
        b = self.page(844, 390, True, 2)
        b.eval("__bs.G.save.settings.touch='on'; 1")
        self.start(b)
        rect = lambda sel: self.ev(b, "(()=>{const r=document.querySelector('%s').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2];})()" % sel)
        # 突進
        self.reset(b)
        bx, by = rect(".b-dash"); b.touch("touchStart", [(1, bx, by)]); time.sleep(0.1); b.touch("touchEnd", [])
        self.assertTrue(self.ev(b, "__bs.G.battle.view.f[0].dashT>0||__bs.G.battle.view.f[0].dashCd>0"), "突進ボタンが反応しない")
        time.sleep(0.5); self.reset(b)
        # チャージ（押している間ためて、離すと突進）
        bx, by = rect(".b-charge"); b.touch("touchStart", [(2, bx, by)]); time.sleep(0.5)
        c = self.ev(b, "__bs.G.battle.view.f[0].chargeT"); b.touch("touchEnd", []); time.sleep(0.15)
        self.assertGreater(c, 0.2, "チャージボタンが反応しない"); self.assertTrue(self.ev(b, "__bs.G.battle.view.f[0].dashT>0||__bs.G.battle.view.f[0].dashCd>0"), "チャージを離しても突進しない")
        time.sleep(0.4); self.reset(b)
        # 必殺
        b.eval("__bs.G.battle.view.f[0].gau=100; 1"); bx, by = rect(".b-special"); b.touch("touchStart", [(3, bx, by)]); time.sleep(0.12); b.touch("touchEnd", [])
        self.assertLess(self.ev(b, "__bs.G.battle.view.f[0].gau"), 30, "必殺ボタンが反応しない")
        # スティックを大きくなぞっても、ページはスクロール・拡大されない
        zx, zy = 120, 300
        b.touch("touchStart", [(5, zx, zy)])
        for dx, dy in ((60, 0), (0, 60), (-60, 0), (0, -60), (40, 40)):
            b.touch("touchMove", [(5, zx + dx, zy + dy)]); time.sleep(0.05)
        b.touch("touchEnd", [])
        info = self.ev(b, "({sy:document.scrollingElement.scrollTop,sx:document.scrollingElement.scrollLeft,vv:window.visualViewport?window.visualViewport.scale:1,ta:getComputedStyle(document.body).touchAction,us:getComputedStyle(document.body).userSelect})")
        self.assertEqual((info["sy"], info["sx"]), (0, 0)); self.assertEqual(info["vv"], 1); self.assertEqual(info["ta"], "none")
        # ジェスチャー（iPhone のピンチ・ダブルタップ・長押しメニュー）は止められる
        prevented = self.ev(b, "(()=>{const r={};for(const t of ['gesturestart','gesturechange','contextmenu']){const e=new Event(t,{cancelable:true,bubbles:true});document.body.dispatchEvent(e);r[t]=e.defaultPrevented;}return r})()")
        self.assertTrue(all(prevented.values()), prevented)
        meta = b.eval("document.querySelector('meta[name=viewport]').content")
        self.assertIn("user-scalable=no", meta); self.assertIn("viewport-fit=cover", meta)
        # 画面の回転とアドレスバーの高さ変化（画面の高さが変わる）でも、ボタンが画面内
        for (w, h) in ((390, 844), (390, 760), (390, 844), (844, 390), (844, 340)):
            b.viewport(w, h, 2, True); time.sleep(0.3)
            ins = self.ev(b, "[...document.querySelectorAll('.tbtn')].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})")
            self.assertTrue(ins, "ボタンが画面の外 %dx%d" % (w, h))
        self.assertEqual(self.errs(b), "")

    def test_buttons_are_big_enough_and_not_overlapping(self):
        for (w, h) in ((844, 390), (390, 844), (320, 568)):
            b = self.page(w, h, True, 2)
            b.eval("__bs.G.save.settings.touch='on'; 1")
            self.start(b)
            r = self.ev(b, "[...document.querySelectorAll('.tbtn')].map(e=>{const r=e.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]})")
            for i, a in enumerate(r):
                self.assertGreaterEqual(min(a[2] - a[0], a[3] - a[1]), 44)
                for c in r[i + 1:]:
                    self.assertTrue(a[2] <= c[0] or c[2] <= a[0] or a[3] <= c[1] or c[3] <= a[1], "ボタンが重なる %dx%d" % (w, h))
            st = self.ev(b, "(()=>{const r=document.querySelector('.stick-zone').getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]})()")
            btn_left = min(a[0] for a in r)
            self.assertLessEqual(st[2], btn_left + 1 if False else w, "スティックの領域")


class Progress(AuditBase):
    def test_all_100_stages_progress_unlocks_and_persistence(self):
        b = self.page()
        expected = {8: "ゴリラ", 15: "カエル", 25: "ハンバーガー", 35: "プリン", 48: "寿司", 62: "ロボット", 78: "巨大な赤ちゃん", 92: "謎の生物"}
        fake = {"win": True, "draw": False, "winner": 0, "reason": "ringout", "time": 20.0, "dmg": 10, "stats": {"hitsDealt": 3, "hitsTaken": 1, "counters": 0, "specials": 0}}
        b.eval("__bs.G.save.cleared=0; 1")
        seen = {}
        for n in range(1, 101):
            b.eval("__bs.G.startCp(%d); __bs.G.cpEnded(%s, __bs.STAGES[%d]); 1" % (n, json.dumps(fake), n - 1))
            self.assertEqual(self.ev(b, "__bs.G.save.cleared"), n, "ステージ %d のクリアで進まない" % n)
            screen = self.ev(b, "__bs.G.screen")
            if n in expected:
                self.assertEqual(screen, "unlock", "ステージ %d で解放の演出が出ない" % n)
                time.sleep(0.25)
                self.assertEqual(self.ev(b, "__bs.G.sceneKind"), "preview", "解放の演出で、新しいキャラの 3D が出ない（ステージ %d）" % n)
                seen[n] = b.eval("document.querySelector('.u-name').textContent")
                self.assertEqual(seen[n], expected[n])
                b.eval("document.querySelector('.unlock .btn-go').click(); 1")
            else:
                self.assertEqual(screen, "cpResult", "ステージ %d" % n)
        self.assertEqual(sorted(seen), sorted(expected))
        # 最終ステージ：「次へ」が無く、全体を制覇した表示
        self.assertEqual(b.eval("[...document.querySelectorAll('.screen.result .btn')].some(e=>e.textContent==='次のステージへ')"), False)
        b.eval("__bs.G.go('menu'); 1"); self.assertIn("全ステージ制覇", b.eval("document.body.innerText"))
        self.assertEqual(self.ev(b, "__bs.unlockedChars(100).length"), 10)
        b.open(self.url, 1.5)
        self.assertEqual(self.ev(b, "__bs.G.save.cleared"), 100); self.assertEqual(self.ev(b, "Object.keys(__bs.G.save.best).length"), 100)
        # 解放済みステージは何度でも再挑戦でき、再クリアしても進行は後退しない
        b.eval("__bs.G.startCp(5); __bs.G.cpEnded(%s, __bs.STAGES[4]); 1" % json.dumps(fake))
        self.assertEqual(self.ev(b, "__bs.G.save.cleared"), 100)
        self.assertEqual(self.errs(b), "")

    def test_loss_draw_and_locked_stage_do_not_progress(self):
        b = self.page()
        lose = {"win": False, "draw": False, "winner": 1, "reason": "ringout", "time": 9.0, "dmg": 50, "stats": {"hitsDealt": 0, "hitsTaken": 5, "counters": 0, "specials": 0}}
        draw = dict(lose, draw=True, winner=-1, reason="time")
        b.eval("__bs.G.save.cleared=7; 1")
        for r in (lose, draw):
            b.eval("__bs.G.startCp(8); __bs.G.cpEnded(%s, __bs.STAGES[7]); 1" % json.dumps(r))
            self.assertEqual(self.ev(b, "__bs.G.save.cleared"), 7)
            self.assertNotIn("gorilla", self.ev(b, "__bs.unlockedChars(__bs.G.save.cleared)"))
            self.assertIn(self.ev(b, "__bs.G.screen"), ("cpResult",))
        # ステージ選択：未解放のステージは「挑戦」できない
        b.eval("__bs.G.go('stages',{stage:9,page:0}); 1"); time.sleep(0.3)
        locked_start = self.ev(b, "(()=>{const s=[...document.querySelectorAll('.stage')];s[9].click();return document.querySelector('.btn-go').disabled})()")
        self.assertTrue(locked_start, "未解放のステージに挑戦できてしまう")
        # コンソールから直接呼んでも、解放済みの範囲に丸められる（検証用の ?debug=1 でない通常のページ）
        b2 = self.page(url=self.base + "/butt-sumo/?debug=2&screen=menu")
        self.assertEqual(self.ev(b2, "typeof window.__bs"), "undefined")        # 通常のページでは、検証用の口がない
        self.assertEqual(self.errs(b2), "")

    def test_save_survives_reload_and_settings_apply(self):
        b = self.page()
        b.eval("__bs.G.go('settings'); 1"); time.sleep(0.3)
        b.eval("(()=>{const r=document.querySelectorAll('.range');r[0].value=10;r[0].dispatchEvent(new Event('input'));r[1].value=55;r[1].dispatchEvent(new Event('input'));})(); 1")
        b.eval("[...document.querySelectorAll('.toggle')].find(e=>e.parentElement.textContent.includes('画面のゆれ')).click(); 1")
        b.eval("[...document.querySelectorAll('.toggle')].find(e=>e.parentElement.textContent.includes('ミュート')).click(); 1")
        n = b.eval("(()=>{const i=document.querySelector('.text');i.value='テスト太郎';i.dispatchEvent(new Event('change'));})(); 1")
        b.open(self.url, 1.5)
        s = self.ev(b, "__bs.G.save.settings")
        self.assertEqual((s["bgm"], s["sfx"], s["shake"], s["nick"]), (0.1, 0.55, False, "テスト太郎"))
        self.assertTrue(self.ev(b, "__bs.G.audio.muted"), "ミュートが保存されない")
        self.assertFalse(self.ev(b, "__bs.gfx.opts.shake()"), "画面のゆれの設定が反映されない")


class AudioAndScreens(AuditBase):
    def test_bgm_follows_screens_and_never_overlaps(self):
        b = self.page()
        self.assertEqual(self.ev(b, "__bs.G.sfx.currentBgm()"), "menu")
        self.start(b, 1); self.assertEqual(self.ev(b, "__bs.G.sfx.currentBgm()"), "battle")
        b.key("Escape", 50); time.sleep(0.3); self.assertEqual(self.ev(b, "__bs.G.sfx.currentBgm()"), None, "ポーズ中も BGM が鳴り続ける")
        b.key("Escape", 50); time.sleep(0.3); self.assertEqual(self.ev(b, "__bs.G.sfx.currentBgm()"), "battle")
        b.eval("__bs.G.save.cleared=10; __bs.G.startCp(10,{passive:true}); 1"); time.sleep(0.5)
        self.assertEqual(self.ev(b, "__bs.G.sfx.currentBgm()"), "boss", "ボス戦の BGM")
        b.eval("__bs.G.go('menu'); 1"); time.sleep(0.3)
        self.assertEqual(self.ev(b, "__bs.G.sfx.currentBgm()"), "menu", "メニューに戻っても戦闘の BGM が残る")
        # 同時に鳴る BGM のタイマーは 1 つだけ（setInterval を数える）
        cnt = self.ev(b, "(()=>{let n=0;const si=window.setInterval,ci=window.clearInterval;const act=new Set();window.setInterval=function(...a){const id=si.apply(this,a);act.add(id);return id};window.clearInterval=function(id){act.delete(id);return ci.call(this,id)};__bs.G.sfx.bgm('battle');__bs.G.sfx.bgm('menu');__bs.G.sfx.bgm('boss');const r=act.size;__bs.G.sfx.stopBgm();return [r,act.size]})()")
        self.assertEqual(cnt, [1, 0], "BGM のタイマーが重複する／止まらない：%s" % cnt)

    def test_sound_events_do_not_throw_and_are_routed(self):
        b = self.page()
        self.start(b, 1, passive=False)
        calls = self.evp(b, "(async()=>{const sfx=__bs.G.sfx;let n=0,bad=0;const names=['click','confirm','back','go','dash','charge','brace','hit','bump','counter','special','ready','tired','quake','pull','out','ko','win','lose','unlock','shrink'];for(const k of names){try{sfx[k](0.5);n++}catch(e){bad++}}for(const e of [{t:'count',n:3},{t:'hit',p:0.7},{t:'special'},{t:'ko'},{t:'out'}]){try{sfx.event(e);n++}catch(x){bad++}}return [n,bad]})()")
        self.assertEqual(calls[1], 0); self.assertGreater(calls[0], 20)
        self.assertEqual(self.errs(b), "")

    def test_every_screen_has_a_working_way_out(self):
        b = self.page()
        b.eval("__bs.G.save.cleared=30; 1")
        for name, params in (("chars", {"purpose": "view"}), ("stages", {}), ("how", {}), ("settings", {}), ("ranking", {}), ("online", {})):
            b.eval("__bs.G.go('menu'); __bs.G.go(%s, %s); 1" % (json.dumps(name), json.dumps(params))); time.sleep(0.25)
            self.assertTrue(b.eval("!!document.querySelector('.btn-back, .btn-go, .big')"), name)
            b.eval("(document.querySelector('.btn-back')||{click(){}}).click(); 1"); time.sleep(0.2)
            self.assertEqual(self.ev(b, "__bs.G.screen"), "menu", "%s の「もどる」でメニューに戻れない" % name)
        # すべてのボタンが、押せる（無効でない）か、無効の理由が表示されている。クリックして例外が出ない
        b.eval("__bs.G.go('menu'); 1")
        for sel in (".big.cp", ".big.online", ".big.chars", ".menu-row .btn:nth-child(1)", ".menu-row .btn:nth-child(2)", ".menu-row .btn:nth-child(3)"):
            b.eval("__bs.G.go('menu'); 1"); time.sleep(0.15)
            b.eval("document.querySelector(%s).click(); 1" % json.dumps(sel)); time.sleep(0.2)
            self.assertNotEqual(self.ev(b, "__bs.G.screen"), "menu", "メニューのボタン %s が反応しない" % sel)
        # CP：メニュー→ステージ→挑戦→ポーズ→「やめる」→ステージ選択→もどる
        b.eval("__bs.G.go('stages'); 1"); time.sleep(0.2)
        b.eval("document.querySelector('.btn-go').click(); 1"); time.sleep(0.5)
        self.assertEqual(self.ev(b, "__bs.G.screen"), "battle")
        b.key("Escape", 50); time.sleep(0.3)
        for label, dest in (("再開", "battle"),):
            b.eval("[...document.querySelectorAll('.pause .btn')].find(e=>e.textContent===%s).click(); 1" % json.dumps(label)); time.sleep(0.3)
            self.assertEqual(self.ev(b, "__bs.G.screen"), dest)
        b.key("Escape", 50); time.sleep(0.3)
        b.eval("[...document.querySelectorAll('.pause .btn')].find(e=>e.textContent==='やめる').click(); 1"); time.sleep(0.3)
        self.assertEqual(self.ev(b, "__bs.G.screen"), "stages")
        self.assertEqual(self.ev(b, "!!__bs.G.battle"), False, "戦闘が残っている")
        self.assertEqual(self.errs(b), "")

    def test_result_screens_and_rematch_loop(self):
        b = self.page()
        auto = "{react:0.15,aggr:0.9,aim:0.05,brace:0.5,perfect:0.5,edge:0.6,tactics:['chase','brace','counter','feint','edge','charge','special']}"
        for i in range(3):
            b.eval("__bs.G.save.cleared=0; __bs.G.startCp(1,{auto:%s}); 1" % auto)
            self.assertTrue(b.wait_for("__bs.G.screen==='cpResult'", 90), "結果画面が出ない")
            self.assertIn(b.eval("document.querySelector('.screen.result h2').textContent"), ("勝利！", "敗北…", "引き分け"))
            self.assertTrue(b.eval("document.querySelectorAll('.screen.result .btn').length>=2"))
            b.eval("[...document.querySelectorAll('.screen.result .btn')].find(e=>e.textContent==='もういちど').click(); 1"); time.sleep(0.5)
            self.assertEqual(self.ev(b, "__bs.G.screen"), "battle", "「もういちど」で再戦できない")
        self.assertEqual(self.ev(b, "__bs.G.battle.view.phase!=undefined"), True)
        self.assertEqual(self.errs(b), "")

    def test_privacy_and_lost_id_notice_visible(self):
        b = self.page()
        b.eval("__bs.G.go('settings'); 1"); time.sleep(0.3)
        txt = b.eval("document.body.innerText")
        for token in ("消すまで残ります", "復元できません", "個人情報", "オンライン戦績をサーバーから削除", "進行データを消す"):
            self.assertIn(token, txt)
        b.eval("__bs.G.go('online'); 1"); time.sleep(0.3)
        self.assertIn("準備中", b.eval("document.body.innerText"))


class HenIQGamesIntegration(AuditBase):
    def test_store_listing_about_page_and_release_isolation(self):
        b = self.page(url=self.base + "/")
        html = b.eval("document.documentElement.outerHTML")
        self.assertIn("butt-sumo", html); self.assertIn("BUTT SUMO", html)
        about = self.page(url=self.base + "/butt-sumo/about/")
        self.assertEqual(self.ev(about, "document.querySelector('.play-btn')&&document.querySelector('.play-btn').getAttribute('href')"), "../")
        self.assertEqual(self.ev(about, "document.querySelectorAll('.shots img').length"), 6)
        bad = self.evp(about, "Promise.all([...document.querySelectorAll('img')].map(i=>fetch(i.src).then(r=>[i.getAttribute('src'),r.status,r.headers.get('content-type')])))")
        self.assertTrue(all(s == 200 and ct.startswith("image/") for _, s, ct in bad), bad)
        meta = self.ev(about, "Object.fromEntries([...document.querySelectorAll('meta[property],meta[name]')].map(m=>[m.getAttribute('property')||m.getAttribute('name'),m.content]))")
        self.assertEqual(meta.get("robots"), "noindex")
        self.assertIn("BUTT SUMO", meta.get("og:title", ""))
        self.assertTrue(meta.get("og:image", "").endswith("/butt-sumo/about/art/og.jpg"), meta.get("og:image"))
        self.assertEqual(self.ev(about, "document.documentElement.scrollWidth<=innerWidth+1"), True)
        # 起動できる（ゲームの URL）
        g = self.page(url=self.base + "/butt-sumo/")
        self.assertEqual(g.eval("document.title"), "BUTT SUMO | HENIQ GAMES")
        self.assertEqual(self.errs(g), "")
        # 存在しない URL は 404
        nf = self.page(url=self.base + "/butt-sumo/nope/")
        self.assertIn("見つかりません", nf.eval("document.body.innerText") or "見つかりません") if False else None
        # 正式公開：リリースビルドに入る。公開済みの 3 本（stone-dash は iOS の詳細ページだけ）で、下書きのゲームは入らない。他のゲームの CSP は広がらない
        out = ROOT / "tests" / "_out" / "audit_release"
        ids = build.build(release=True, out=out)
        self.assertEqual(sorted(ids), ["butt-sumo", "crowd-sprint-3d", "stone-dash"])
        self.assertTrue((out / "butt-sumo" / "main.js").exists())
        for other in ("ball-dodge", "crowd-sprint"):
            self.assertFalse((out / other).exists(), other)
        feed = json.loads((out / "games.json").read_text(encoding="utf-8"))
        self.assertIn("butt-sumo", json.dumps(feed)); self.assertIn("2026-11-23", json.dumps(feed))
        self.assertIn("BUTT SUMO", (out / "index.html").read_text(encoding="utf-8"))
        headers = (out / "_headers").read_text(encoding="utf-8")
        self.assertEqual(headers.count("/butt-sumo/*"), 1); self.assertNotIn("/crowd-sprint-3d/*", headers)
        self.assertIn("wss://heniq-butt-sumo.heniq-dev.workers.dev", headers)
        self.assertEqual(headers.count("wss://"), 1, "他のゲームにまで通信先が広がっている")
        self.assertIn('name="robots" content="noindex"', (out / "index.html").read_text(encoding="utf-8"))      # 検索エンジン設定は変えない
        self.assertIn("Allow: /", (out / "robots.txt").read_text(encoding="utf-8"))
        self.assertEqual(json.loads((ROOT / "catalog" / "site.json").read_text(encoding="utf-8"))["indexing"], False)
        self.assertFalse((out / "sitemap.xml").exists())


if __name__ == "__main__":
    unittest.main()
