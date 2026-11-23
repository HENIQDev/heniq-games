#!/usr/bin/env python3
"""ストア用のキービジュアル・カード・共有画像を、ゲームの画面写真（shoot.py の出力）と題名の文字で組み合わせて作る。
  python3 games/butt-sumo/docs/art-src/compose.py <shoot.py の出力フォルダ> <store/art のフォルダ>
文字は Mac の OS 標準フォント（ヒラギノ）で、画像として書き出す（ASSET_LICENSES.md に記載）。JPEG への変換は macOS の sips。"""
import subprocess, sys, time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "tools"))
from cdp import Browser  # noqa: E402

SRC = Path(sys.argv[1]).resolve(); OUT = Path(sys.argv[2]).resolve(); OUT.mkdir(parents=True, exist_ok=True)
CSS = """
body{margin:0;overflow:hidden;font-family:"Hiragino Maru Gothic ProN","Hiragino Sans",sans-serif;font-weight:900;background:#1a0f2e}
.bg{position:absolute;inset:0;background-size:cover;background-position:center}
.shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(26,15,46,.8) 0%,rgba(26,15,46,.25) 42%,rgba(26,15,46,0) 62%)}
.logo{position:absolute;left:6%;top:50%;transform:translateY(-52%) rotate(-4deg);line-height:.84;filter:drop-shadow(0 .06em 0 #1a0f2e)}
.logo span{display:block;-webkit-text-stroke:.12em #1a0f2e;paint-order:stroke fill}
.l1{color:#ff3d8b}.l2{color:#ffd23a;margin-left:.2em}
.tag{position:absolute;left:6%;font-size:var(--tag);color:#fff;-webkit-text-stroke:.28em #1a0f2e;paint-order:stroke fill;letter-spacing:.06em}
"""
def page(w, h, shot, fs, tagfs, tagtop, tag):
    if not tag:
        return f"""<!doctype html><meta charset=utf-8><style>{CSS}</style><body style="width:{w}px;height:{h}px"><div class=bg style="background-image:url('file://{shot}')"></div></body>"""
    return f"""<!doctype html><meta charset=utf-8><style>{CSS} .logo{{font-size:{fs}px}} .tag{{--tag:{tagfs}px;top:{tagtop}px}}</style>
<body style="width:{w}px;height:{h}px"><div class=bg style="background-image:url('file://{shot}')"></div><div class=shade></div>
<div class=logo><span class=l1>BUTT</span><span class=l2>SUMO</span></div><div class=tag>{tag}</div></body>"""

jobs = [("hero", 1600, 900, "key", 0, 0, 0, ""),
        ("og", 1200, 630, "key2", 190, 36, 520, "お尻で押し出せ！ 3D バカ相撲"),
        ("card", 800, 450, "key", 120, 24, 372, "お尻で押し出せ！")]
with Browser(headless=True, width=1600, height=900, dpr=1) as b:
    for name, w, h, shot, fs, tfs, ttop, tag in jobs:
        html = OUT / ("_" + name + ".html")
        html.write_text(page(w, h, str(SRC / (shot + ".png")), fs, tfs, ttop, tag), encoding="utf-8")
        b.viewport(w, h, 1)
        b.open("file://" + str(html), 1.2)
        png = OUT / (name + ".png")
        b.screenshot(str(png))
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "82", str(png), "--out", str(OUT / (name + ".jpg"))], check=True, capture_output=True)
        png.unlink(); html.unlink()
for n in ("fight", "special", "boss", "chars", "stages", "result"):
    png = SRC / (n + ".png")
    subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "80", str(png), "--out", str(OUT / ("shot-" + n + ".jpg"))], check=True, capture_output=True)
import strip_exif  # noqa: E402
for f in OUT.glob("*.jpg"):
    f.write_bytes(strip_exif.strip(f.read_bytes()))     # 撮影情報などのメタデータを残さない
print("ok", OUT)
