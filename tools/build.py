#!/usr/bin/env python3
"""HENIQ GAMES のビルド：games/<id>/ とカタログから dist/ を作る（Python 3 標準機能のみ）。

  python3 tools/build.py            開発用（draft も含める。検索エンジンには載せない）
  python3 tools/build.py --release  公開用（published だけ。公開の関門を満たさなければ失敗）

dist/ の構成
  /                    ストアのトップ        /genre/<id>/   ジャンル別
  /<id>/               ゲーム本体（web）     /<id>/about/   ゲーム詳細ページ
  /privacy/            プライバシー          /games.json    フィード（自動生成）
"""
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import catalog  # noqa: E402
import render  # noqa: E402

ROOT = catalog.ROOT
DIST = ROOT / "dist"
CHECKED_EXT = {".html", ".js", ".css"}
EXTERNAL_URL = re.compile(r"https?://", re.I)
# 資源として読み込む外部 URL だけを禁止する（<a href> のリンクは許可）
HTML_RESOURCE = re.compile(r"<(?:link|script|img|iframe|source|video|audio|embed|object)\b[^>]*\b(?:src|href|srcset|data)\s*=\s*[\"']\s*(?:https?:)?//", re.I)

HEADERS = """/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; media-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
"""


class BuildError(Exception):
    pass


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def check_output(root):
    """外部の資源・インラインのスタイル／スクリプトを禁止する（CSP と無料運用の方針）。"""
    bad = []
    for f in sorted(Path(root).rglob("*")):
        if not f.is_file() or f.suffix not in CHECKED_EXT:
            continue
        text = f.read_text(encoding="utf-8")
        rel = f.relative_to(root)
        if f.suffix == ".html":
            if HTML_RESOURCE.search(text):
                bad.append("%s: 外部の資源" % rel)
            if re.search(r"<style|\sstyle\s*=|\son[a-z]+\s*=|<script(?![^>]*\ssrc=)", text, re.I):
                bad.append("%s: インラインのスタイル／スクリプト" % rel)
        elif EXTERNAL_URL.search(text) or re.search(r"@import|url\(\s*[\"']?\s*//", text):
            bad.append("%s: 外部 URL／@import" % rel)
    return bad


DEV_FILES = ("bot.js",)


def strip_dev_files(game_dir):
    """公開用のビルドから、検証用のファイル（ベンチ・シナリオ・ボット）を除く。"""
    removed = []
    for name in DEV_FILES:
        f = Path(game_dir) / name
        if f.exists():
            f.unlink()
            removed.append(name)
    return removed


def build(release=False, out=None):
    site = catalog.load_site()
    genres = catalog.load_genres()
    all_games = catalog.load_games(genres)
    games = [g for g in all_games if not release or g["status"] == "published"]
    if release:
        blockers = catalog.release_blockers(all_games, site)
        if blockers:
            raise BuildError("公開の関門を満たしていません：\n  - " + "\n  - ".join(blockers))
    dist = Path(out) if out else DIST
    if dist.exists():
        shutil.rmtree(dist)
    dist.mkdir(parents=True)

    shutil.copytree(ROOT / "platform", dist / "platform")
    shutil.copytree(ROOT / "store", dist / "_store", ignore=shutil.ignore_patterns(".DS_Store"))
    write(dist / "_store" / "games-theme.css", render.games_theme_css(games))

    redirects = []
    for g in games:
        gid = g["id"]
        d = g["_dir"]
        if g["kind"] == "web":
            shutil.copytree(d / "play", dist / gid)
            if release:
                strip_dev_files(dist / gid)           # 検証用の bot.js は、公開物に入れない
        about = dist / gid / "about"
        about.mkdir(parents=True, exist_ok=True)
        art = d / "store" / "art"
        if art.is_dir():
            shutil.copytree(art, about / "art", ignore=shutil.ignore_patterns(".DS_Store"))
        theme = d / "store" / "theme.css"
        if theme.exists():
            shutil.copy(theme, about / "theme.css")
        custom = d / "store" / "about.html"
        if custom.exists():
            shutil.copy(custom, about / "index.html")
        else:
            write(about / "index.html", render.about_page(g, genres, site, theme.exists()))
        write(about / "vars.css", render.vars_css(g))
        if g["kind"] == "ios":
            redirects.append("/%s/ /%s/about/ 302" % (gid, gid))

    write(dist / "index.html", render.store_index(games, genres, site))
    for genre in genres:
        in_genre = [g for g in games if g["genre"] == genre["id"]]
        if in_genre:
            write(dist / "genre" / genre["id"] / "index.html", render.genre_page(genre, in_genre, games, genres, site))
    write(dist / "privacy" / "index.html", render.privacy_page(games, genres, site))
    write(dist / "404.html", render.not_found_page(games, genres, site))
    write(dist / "games.json", render.feed(games, genres))
    write(dist / "_headers", HEADERS)
    if redirects:
        write(dist / "_redirects", "\n".join(redirects) + "\n")

    if site["indexing"]:
        urls = [""] + ["genre/%s/" % x["id"] for x in genres if any(g["genre"] == x["id"] for g in games)]
        for g in games:
            urls += ["%s/about/" % g["id"]] + (["%s/" % g["id"]] if g["kind"] == "web" else [])
        write(dist / "sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n%s</urlset>\n' % "".join(
            "  <url><loc>%s/%s</loc></url>\n" % (site["site_url"], u) for u in urls))
        write(dist / "robots.txt", "User-agent: *\nAllow: /\nSitemap: %s/sitemap.xml\n" % site["site_url"])
    else:
        # 検索エンジンへの掲載は、公開の承認を受けるまで許可しない
        write(dist / "robots.txt", "User-agent: *\nDisallow: /\n")

    bad = check_output(dist)
    if bad:
        raise BuildError("; ".join(bad))
    return [g["id"] for g in games]


if __name__ == "__main__":
    try:
        ids = build(release="--release" in sys.argv)
    except (BuildError, catalog.CatalogError) as e:
        print("ビルド失敗: %s" % e, file=sys.stderr)
        sys.exit(1)
    print("dist/ を作成しました：%d 本（%s）" % (len(ids), ", ".join(ids)))
