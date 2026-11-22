#!/usr/bin/env python3
"""新しいゲームの雛形を作る。

  python3 tools/new_game.py <id> --title "TITLE" --genre casual [--kind web|ios]

games/<id>/ に game.json・store/（store.json・theme.css）・docs/（調査・仕様・テスト・公開の関門）と、
web なら play/（最小のゲームの雛形）を作る。status は draft。既存のゲームは上書きしない。
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import catalog  # noqa: E402

PLAY_HTML = """<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<title>{title} | HENIQ GAMES</title>
<link rel="stylesheet" href="../platform/ui/heniq.css">
</head>
<body>
<div id="game"></div>
<noscript><p>このゲームは JavaScript を有効にすると遊べます。</p></noscript>
<script type="module" src="main.js"></script>
</body>
</html>
"""

PLAY_JS = """import { startGame } from '../platform/core/runtime.js';

const W = 480;
const H = 720;

function create(env) {
  let t = 0;
  return {
    score: 0,
    isOver: false,
    update(dt) { t += dt; this.score = Math.floor(t * 1000); if (t > 3) this.isOver = true; },
    draw(g) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff'; g.fillText(String(this.score), 20, 40); },
  };
}

startGame({
  id: '{id}',
  title: '{title}',
  tagline: '',
  controls: [],
  width: W,
  height: H,
  scoreOrder: 'high',
  formatScore: (ms) => (ms / 1000).toFixed(2) + ' 秒',
  create,
});
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("id")
    ap.add_argument("--title", required=True)
    ap.add_argument("--genre", required=True)
    ap.add_argument("--kind", default="web", choices=catalog.KINDS)
    a = ap.parse_args()
    genres = {g["id"] for g in catalog.load_genres()}
    if not catalog.ID_RE.match(a.id) or a.id in catalog.RESERVED_IDS:
        sys.exit("id が不正か予約されています：%s" % a.id)
    if a.genre not in genres:
        sys.exit("genre は %s のいずれか" % ", ".join(sorted(genres)))
    d = catalog.GAMES_DIR / a.id
    if d.exists():
        sys.exit("既に存在します：%s" % d)
    (d / "store" / "art").mkdir(parents=True)
    (d / "docs").mkdir()
    meta = {
        "id": a.id, "title": a.title, "kind": a.kind, "genre": a.genre, "tags": [], "tagline": "", "summary": "",
        "status": "draft", "release_date": None, "play_time": "",
        "controls": {"pc": "", "touch": ""}, "features": {"ranking": False}, "store_budget_kb": 1500,
    }
    if a.kind == "web":
        meta.update({"tech": "canvas2d", "score": {"unit": "ms", "order": "high", "label": ""},
                     "data": {"local_storage": [], "cookies": [], "network": []}, "budget_kb": 200})
        (d / "play").mkdir()
        (d / "play" / "index.html").write_text(PLAY_HTML.replace("{title}", a.title), encoding="utf-8")
        (d / "play" / "main.js").write_text(PLAY_JS.replace("{id}", a.id).replace("{title}", a.title), encoding="utf-8")
    else:
        meta["app_store_url"] = None
    (d / "game.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    store = {"theme": {"bg": "#101010", "fg": "#ffffff", "accent": "#ff9f1c", "accent2": "#2ec4b6"},
             "how_to": [], "features": [], "world": [], "screenshots": [], "images": {}}
    (d / "store" / "store.json").write_text(json.dumps(store, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (d / "store" / "theme.css").write_text(
        "/* %s の詳細ページ。このゲームの世界観に合わせて、色・フォント・レイアウトを自由に作る（共通デザインに合わせない）。 */\n"
        "body.about { background: var(--bg); color: var(--fg); }\n" % a.title, encoding="utf-8")
    for name in ("RESEARCH", "SPEC", "BALANCE_TEST", "RELEASE_CHECKLIST"):
        text = (catalog.ROOT / "docs" / "templates" / (name + ".md")).read_text(encoding="utf-8").replace("{{title}}", a.title)
        (d / "docs" / (name + ".md")).write_text(text, encoding="utf-8")
    print("作成しました：%s（status: draft）。次：docs/RESEARCH.md から 9 段階で進める（docs/GAME_PIPELINE.md）" % d)


if __name__ == "__main__":
    main()
