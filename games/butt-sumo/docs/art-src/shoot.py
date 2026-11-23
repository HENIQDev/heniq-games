#!/usr/bin/env python3
"""BUTT SUMO のスクリーンショットを、実際のゲームを動かして撮る（自分のゲームの画面。外部素材なし）。
  python3 tools/build.py && python3 tools/serve.py &   →   python3 games/butt-sumo/docs/art-src/shoot.py <出力フォルダ>
?debug=1 の検証用の口（AI が自分を操作する・状態を読む）を使う。"""
import sys, time, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "tools"))
from cdp import Browser  # noqa: E402

OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
URL = "http://127.0.0.1:8790/butt-sumo/?debug=1"
AUTO = "{react:0.18,aggr:0.8,aim:0.1,brace:0.5,perfect:0.5,edge:0.6,tactics:['chase','brace','counter','feint','edge','charge','special']}"


def wait(b, expr, timeout=40, every=0.04):
    end = time.time() + timeout
    while time.time() < end:
        if b.eval(expr): return True
        time.sleep(every)
    return False


def shots(w, h, suffix, dpr=1):
    with Browser(headless=True, width=w, height=h, dpr=dpr) as b:
        b.open(URL, 1.5)
        b.eval("__bs.G.save.cleared=40; __bs.G.save.settings.touch='off'; 1")
        # 1 戦闘（当たった瞬間）
        b.eval("__bs.G.startCp(12,{me:'ojisan',foe:'gorilla',theme:'shrine',auto:%s}); 1" % AUTO)
        wait(b, "__bs.G.battle && __bs.G.battle.view && __bs.G.battle.view.f[0].dmg+__bs.G.battle.view.f[1].dmg>9 && __bs.G.battle.view.phase==='fight'")
        time.sleep(0.06); b.screenshot(str(OUT / ("fight" + suffix + ".png")))
        # 1b キービジュアル用（HUD なし・寄り・右寄せ）
        b.eval("__bs.G.startCp(12,{me:'ojisan',foe:'gorilla',theme:'shrine',auto:%s}); __bs.G.battle.zoom=0.55; __bs.G.battle.shift=2.2; document.querySelector('.layer.hud').style.display='none'; 1" % AUTO)
        wait(b, "__bs.G.battle && __bs.G.battle.view && __bs.G.battle.view.f[0].dmg+__bs.G.battle.view.f[1].dmg>9 && __bs.G.battle.view.phase==='fight'")
        time.sleep(0.05); b.screenshot(str(OUT / ("key" + suffix + ".png")))
        b.eval("document.querySelector('.layer.hud').style.display=''; 1")
        # 1c 別の組み合わせ（共有画像用）
        b.eval("__bs.G.startCp(14,{me:'frog',foe:'burger',theme:'beach',auto:%s}); __bs.G.battle.zoom=0.55; __bs.G.battle.shift=2.2; document.querySelector('.layer.hud').style.display='none'; 1" % AUTO)
        wait(b, "__bs.G.battle && __bs.G.battle.view && __bs.G.battle.view.f[0].dmg+__bs.G.battle.view.f[1].dmg>9 && __bs.G.battle.view.phase==='fight'", 40)
        time.sleep(0.05); b.screenshot(str(OUT / ("key2" + suffix + ".png")))
        b.eval("document.querySelector('.layer.hud').style.display=''; 1")
        # 2 必殺技
        b.eval("__bs.G.startCp(13,{me:'chicken',foe:'robot',theme:'volcano',auto:%s}); 1" % AUTO)
        time.sleep(3.2)
        b.eval("__bs.G.battle.view.f[0].gau=100; 1")
        wait(b, "__bs.G.battle && __bs.G.battle.view.f[0].specT>0.1", 20)
        time.sleep(0.25); b.screenshot(str(OUT / ("special" + suffix + ".png")))
        # 3 ボス戦（ハンバーガー大王の舞台＝空の頂上）
        b.eval("__bs.G.startCp(14,{me:'frog',foe:'burger',theme:'neon',auto:%s}); 1" % AUTO)
        wait(b, "__bs.G.battle && __bs.G.battle.view && __bs.G.battle.view.f[0].dmg+__bs.G.battle.view.f[1].dmg>12 && __bs.G.battle.view.phase==='fight'", 40)
        time.sleep(0.1); b.screenshot(str(OUT / ("boss" + suffix + ".png")))
        # 4 キャラクター選択
        b.eval("__bs.G.save.cleared=100; __bs.G.go('chars',{purpose:'view'}); document.querySelectorAll('.chip')[8].click(); 1")
        time.sleep(1.8); b.screenshot(str(OUT / ("chars" + suffix + ".png")))
        # 5 ステージ選択
        b.eval("__bs.G.save.cleared=36; __bs.G.go('stages'); 1")
        time.sleep(1.4); b.screenshot(str(OUT / ("stages" + suffix + ".png")))
        # 6 結果（勝利）
        b.eval("__bs.G.save.cleared=0; __bs.G.startCp(1,{me:'ojisan',theme:'park',auto:%s}); 1" % AUTO)
        wait(b, "__bs.G.screen==='cpResult'", 90)
        time.sleep(0.8); b.screenshot(str(OUT / ("result" + suffix + ".png")))
        # 7 タイトル
        b.eval("__bs.G.go('title'); 1"); time.sleep(1.5); b.screenshot(str(OUT / ("title" + suffix + ".png")))


shots(1280, 720, "")
shots(390, 844, "-m", 2)
print("ok", OUT)
