#!/usr/bin/env python3
"""HENIQ GAMES のビルド：games/<id>/game.json を集めて dist/ を作る（Python 3 標準機能のみ）。

  python3 tools/build.py            開発用（draft も含める。検索エンジンには載せない）
  python3 tools/build.py --release  公開用（status が published のゲームだけ）
"""
import html
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,40}$")
REQUIRED = ["id", "title", "summary", "status", "tech", "controls", "score", "features", "budget_kb"]
STATUSES = {"draft", "published"}
SCORE_ORDERS = {"high", "low"}
TEXT_EXT = {".html", ".js", ".css", ".json"}
EXTERNAL_URL = re.compile(r"https?://", re.I)

HEADERS = """/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
"""


class BuildError(Exception):
    pass


def load_games():
    games = []
    for d in sorted((ROOT / "games").iterdir()):
        if not d.is_dir():
            continue
        meta_path = d / "game.json"
        if not meta_path.exists():
            raise BuildError(f"{d.name}: game.json がありません")
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        problems = validate(meta, d)
        if problems:
            raise BuildError(f"{d.name}: " + " / ".join(problems))
        games.append((d, meta))
    return games


def validate(meta, d):
    p = []
    for k in REQUIRED:
        if k not in meta:
            p.append(f"{k} がありません")
    if p:
        return p
    if not ID_RE.match(meta["id"]):
        p.append("id は半角英小文字・数字・ハイフン")
    if meta["id"] != d.name:
        p.append("id がフォルダ名と違います")
    if meta["status"] not in STATUSES:
        p.append("status は draft か published")
    if meta["score"].get("order") not in SCORE_ORDERS:
        p.append("score.order は high か low")
    if not (d / "index.html").exists() or not (d / "main.js").exists():
        p.append("index.html と main.js が必要です")
    size_kb = sum(f.stat().st_size for f in d.rglob("*") if f.is_file()) / 1024
    if size_kb > meta["budget_kb"]:
        p.append(f"容量 {size_kb:.0f}KB が予算 {meta['budget_kb']}KB を超えています")
    return p


def check_no_external(root):
    """外部通信・外部素材・インラインのスタイルを禁止する（CSP と無料運用の方針）。"""
    bad = []
    for f in root.rglob("*"):
        if f.suffix not in TEXT_EXT or not f.is_file():
            continue
        text = f.read_text(encoding="utf-8")
        if f.suffix != ".json" and EXTERNAL_URL.search(text):
            bad.append(f"{f.relative_to(root)}: 外部 URL")
        if f.suffix == ".html" and re.search(r"<style|\sstyle=|<script(?![^>]*\ssrc=)", text):
            bad.append(f"{f.relative_to(root)}: インラインのスタイル／スクリプト")
    return bad


def catalog_html(games):
    cards = []
    for _, m in games:
        badge = "" if m["status"] == "published" else '<span class="hg-badge">DRAFT</span>'
        cards.append(
            f'<li><a class="hg-card" href="{m["id"]}/"><h2>{html.escape(m["title"])}</h2>'
            f'<p>{html.escape(m["summary"])}</p>{badge}</a></li>'
        )
    items = "\n".join(cards) if cards else "<li>公開中のゲームはまだありません。</li>"
    return f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>HENIQ GAMES</title>
<link rel="stylesheet" href="platform/ui/heniq.css">
</head>
<body>
<main class="hg-catalog">
<h1>HENIQ GAMES</h1>
<p class="lead">URL を開くだけで遊べる、無料のブラウザゲーム。</p>
<ul class="hg-grid">
{items}
</ul>
</main>
</body>
</html>
"""


def build(release=False):
    games = [(d, m) for d, m in load_games() if not release or m["status"] == "published"]
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    shutil.copytree(ROOT / "platform", DIST / "platform")
    for d, m in games:
        shutil.copytree(d, DIST / m["id"])
    (DIST / "index.html").write_text(catalog_html(games), encoding="utf-8")
    (DIST / "_headers").write_text(HEADERS, encoding="utf-8")
    # 検索エンジンへの掲載は、公開の承認を受けるまで許可しない
    (DIST / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
    bad = check_no_external(DIST)
    if bad:
        raise BuildError("; ".join(bad))
    return [m["id"] for _, m in games]


if __name__ == "__main__":
    try:
        ids = build(release="--release" in sys.argv)
    except BuildError as e:
        print(f"ビルド失敗: {e}", file=sys.stderr)
        sys.exit(1)
    print(f"dist/ を作成しました：{len(ids)} 本（{', '.join(ids)}）")
