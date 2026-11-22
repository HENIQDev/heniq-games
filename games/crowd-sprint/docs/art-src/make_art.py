#!/usr/bin/env python3
"""CROWD SPRINT のキービジュアル（hero.svg・card.svg）を生成する。HENIQ 独自の図形だけで描く（外部素材なし）。
  python3 docs/art-src/make_art.py   （games/crowd-sprint から。store/art/ に書き出す）
"""
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent.parent / "store" / "art"
SHIRTS = ["#ff6b6b", "#4dabf7", "#ffd43b", "#51cf66", "#cc5de8", "#ff922b"]
INK = "#0d1b3a"


def runner(x, y, h, shirt, hero=False):
    """足元 (x, y)・身長 h の、単純なランナー"""
    w = h * 0.3
    lw = max(1.2, h * 0.05)
    parts = []
    parts.append('<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="#000" fill-opacity=".22"/>' % (x, y, h * 0.22, h * 0.05))
    for dx in (-0.07, 0.07):
        parts.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%.1f" stroke-linecap="round"/>' % (x + dx * h, y - h * 0.3, x + dx * h * 1.6, y, INK, lw * 1.6))
    parts.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s" stroke="%s" stroke-width="%.1f"/>' % (x - w / 2, y - h * 0.72, w, h * 0.45, h * 0.06, shirt, INK, lw))
    for dx in (-1, 1):
        parts.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%.1f" stroke-linecap="round"/>' % (x + dx * w / 2, y - h * 0.68, x + dx * w * 0.95, y - h * 0.46, INK, lw * 1.5))
    parts.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="#f3c9a0" stroke="%s" stroke-width="%.1f"/>' % (x, y - h * 0.84, h * 0.1, INK, lw))
    parts.append('<path d="M%.1f %.1f a%.1f %.1f 0 0 1 %.1f 0z" fill="%s"/>' % (x - h * 0.1, y - h * 0.85, h * 0.1, h * 0.1, h * 0.2, INK))
    if hero:
        parts.append('<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="none" stroke="#25a8ff" stroke-width="%.1f"/>' % (x, y, h * 0.34, h * 0.09, lw * 1.6))
    return "".join(parts)


def scene(w, h_, horizon, runners, seed, hero_scale, with_title_space):
    rnd = random.Random(seed)
    vx = w / 2
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" role="img" aria-label="夕焼けのトラックを、色とりどりの大勢のランナーが走る">' % (w, h_, w, h_)]
    out.append('<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1b3a"/><stop offset=".6" stop-color="#e6256f"/><stop offset="1" stop-color="#ffb347"/></linearGradient>'
               '<linearGradient id="trk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9a3c"/><stop offset="1" stop-color="#d9621f"/></linearGradient></defs>')
    out.append('<rect width="%d" height="%d" fill="url(#sky)"/>' % (w, horizon))
    out.append('<circle cx="%d" cy="%d" r="%d" fill="#ffd43b" fill-opacity=".9"/>' % (vx, horizon - 6, h_ * 0.14))
    out.append('<rect y="%d" width="%d" height="%d" fill="#2f9e5a"/>' % (horizon, w, h_ - horizon))
    out.append('<polygon points="%d,%d %d,%d %d,%d %d,%d" fill="url(#trk)"/>' % (vx - 8, horizon, vx + 8, horizon, w * 1.15, h_, -w * 0.15, h_))
    for k in range(-4, 5):
        out.append('<line x1="%d" y1="%d" x2="%.0f" y2="%d" stroke="#fff" stroke-opacity=".55" stroke-width="%d"/>' % (vx, horizon, vx + k * w * 0.32, h_, 3 if abs(k) == 4 else 1.5))
    # 速度線
    for _ in range(26):
        a = rnd.uniform(0, 6.283)
        r0, r1 = rnd.uniform(h_ * .5, h_ * .8), rnd.uniform(h_ * .9, h_ * 1.4)
        import math
        out.append('<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f" stroke="#fff" stroke-opacity=".28" stroke-width="%d" stroke-linecap="round"/>' % (
            vx + math.cos(a) * r0, horizon + 50 + math.sin(a) * r0 * .7, vx + math.cos(a) * r1, horizon + 50 + math.sin(a) * r1 * .7, rnd.choice([2, 3, 4])))
    # ランナー（奥から手前へ）
    items = []
    for _ in range(runners):
        d = rnd.uniform(1.0, 9.0)                      # 奥行き（大きいほど遠い）
        sx = vx + rnd.uniform(-1.15, 1.15) * (w * 0.55) / d
        sy = horizon + (h_ - horizon) * 1.05 / d
        hh = h_ * 0.34 / d
        items.append((d, sx, sy, hh, rnd.choice(SHIRTS)))
    for d, sx, sy, hh, c in sorted(items, reverse=True):
        if 0 < sx < w and sy < h_ + hh:
            out.append(runner(sx, sy, hh, c))
    out.append(runner(vx, h_ * 0.9, h_ * 0.36 * hero_scale, "#ff7a2f", hero=True))
    out.append('</svg>')
    return "\n".join(out)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "hero.svg").write_text(scene(1280, 720, 300, 330, 7, 1.0, True), encoding="utf-8")
    (OUT / "card.svg").write_text(scene(460, 215, 92, 120, 11, 0.85, False), encoding="utf-8")
    print("hero.svg・card.svg を書き出しました")
