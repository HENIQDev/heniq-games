"""カタログ（games/<id>/game.json・store/store.json）の読み込みと検査。Python 3 標準機能のみ。"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAMES_DIR = ROOT / "games"
CATALOG_DIR = ROOT / "catalog"

ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,40}$")
HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# URL の最上位に使われる名前は、ゲームの id にできない
RESERVED_IDS = {"platform", "genre", "privacy", "_store", "assets", "api", "admin", "about", "404"}
STATUSES = ("draft", "published")
KINDS = ("web", "ios")
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".svg", ".avif"}
ART_SLOTS = ("card", "hero", "icon", "og")  # card 460×215・hero 1280×720・icon 256×256・og 1200×630
COMMON_REQUIRED = ("id", "title", "kind", "genre", "tags", "tagline", "summary", "status", "play_time",
                   "controls", "features", "store_budget_kb")
WEB_REQUIRED = ("tech", "score", "data", "budget_kb")
APP_STORE_RE = re.compile(r"^https://apps\.apple\.com/")


class CatalogError(Exception):
    pass


def load_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise CatalogError("%s を読み込めません：%s" % (path, e))


# ---- 色のコントラスト（WCAG） -------------------------------------------
def _channel(v):
    v = v / 255.0
    return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4


def luminance(hex_color):
    h = hex_color.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * _channel(r) + 0.7152 * _channel(g) + 0.0722 * _channel(b)


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


# ---- 読み込み -------------------------------------------------------------
def load_site():
    site = load_json(CATALOG_DIR / "site.json")
    for key in ("name", "site_url", "indexing", "privacy_finalized", "support_email"):
        if key not in site:
            raise CatalogError("catalog/site.json に %s がありません" % key)
    return site


def load_genres():
    genres = load_json(CATALOG_DIR / "genres.json")
    ids = [g.get("id") for g in genres]
    if len(set(ids)) != len(ids) or not all(isinstance(i, str) and ID_RE.match(i) for i in ids):
        raise CatalogError("catalog/genres.json の id が不正か重複しています")
    return genres


def load_games(genres):
    genre_ids = {g["id"] for g in genres}
    games = []
    if not GAMES_DIR.is_dir():
        return games
    for d in sorted(GAMES_DIR.iterdir()):
        if not d.is_dir() or d.name.startswith("."):
            continue
        meta_path = d / "game.json"
        if not meta_path.exists():
            raise CatalogError("%s: game.json がありません" % d.name)
        meta = load_json(meta_path)
        store_path = d / "store" / "store.json"
        store = load_json(store_path) if store_path.exists() else {}
        problems = validate(meta, store, d, genre_ids)
        if problems:
            raise CatalogError("%s: %s" % (d.name, " / ".join(problems)))
        meta["_dir"] = d
        meta["_store"] = store
        games.append(meta)
    ids = [g["id"] for g in games]
    if len(set(ids)) != len(ids):
        raise CatalogError("id が重複しています")
    return sorted(games, key=sort_key)


def sort_key(g):
    # 公開済みを新しい順、そのあとに下書き（題名順）
    if g["status"] == "published":
        return (0, "".join(chr(255 - ord(c)) for c in (g.get("release_date") or "0000-00-00")), g["title"])
    return (1, "", g["title"])


def dir_size_kb(path):
    return sum(f.stat().st_size for f in Path(path).rglob("*") if f.is_file()) / 1024


# ---- 検査（常に必要なもの） -------------------------------------------------
def validate(meta, store, d, genre_ids):
    p = []
    for k in COMMON_REQUIRED:
        if k not in meta:
            p.append("%s がありません" % k)
    if p:
        return p
    if not ID_RE.match(meta["id"]):
        p.append("id は半角英小文字・数字・ハイフン（2〜41 文字）")
    if meta["id"] in RESERVED_IDS:
        p.append("id「%s」は予約されています" % meta["id"])
    if meta["id"] != d.name:
        p.append("id がフォルダ名と違います")
    if meta["kind"] not in KINDS:
        p.append("kind は web か ios")
    if meta["status"] not in STATUSES:
        p.append("status は draft か published")
    if meta["genre"] not in genre_ids:
        p.append("genre「%s」は catalog/genres.json にありません" % meta["genre"])
    if not isinstance(meta["tags"], list):
        p.append("tags は一覧")
    if meta.get("release_date") and not DATE_RE.match(str(meta["release_date"])):
        p.append("release_date は YYYY-MM-DD")
    if meta["kind"] == "web":
        for k in WEB_REQUIRED:
            if k not in meta:
                p.append("%s がありません（web）" % k)
        if not p:
            if meta["score"].get("order") not in ("high", "low"):
                p.append("score.order は high か low")
            play = d / "play"
            if not (play / "index.html").exists() or not (play / "main.js").exists():
                p.append("play/index.html と play/main.js が必要です")
            elif dir_size_kb(play) > meta["budget_kb"]:
                p.append("play/ が容量の予算 %dKB を超えています" % meta["budget_kb"])
    else:
        if "app_store_url" not in meta:
            p.append("app_store_url がありません（ios。未公開なら null）")
        elif meta["app_store_url"] and not APP_STORE_RE.match(meta["app_store_url"]):
            p.append("app_store_url は https://apps.apple.com/ で始めてください")
    if p:
        return p
    # ストアの素材
    theme = store.get("theme")
    if not isinstance(theme, dict) or not all(HEX_RE.match(str(theme.get(k, ""))) for k in ("bg", "fg", "accent", "accent2")):
        p.append("store/store.json の theme に bg・fg・accent・accent2（#rrggbb）が必要です")
        return p
    if contrast(theme["fg"], theme["bg"]) < 4.5:
        p.append("theme: fg と bg のコントラストが 4.5 未満です（%.2f）" % contrast(theme["fg"], theme["bg"]))
    for k in ("accent", "accent2"):
        if contrast(theme[k], theme["bg"]) < 3.0:
            p.append("theme: %s と bg のコントラストが 3.0 未満です（%.2f）" % (k, contrast(theme[k], theme["bg"])))
    art = d / "store" / "art"
    for slot, name in (store.get("images") or {}).items():
        if slot not in ART_SLOTS:
            p.append("images の項目は %s のいずれか" % "・".join(ART_SLOTS))
        elif not (art / name).is_file() or (art / name).suffix.lower() not in IMAGE_EXT:
            p.append("画像が見つかりません（store/art/%s）" % name)
    for s in store.get("screenshots", []):
        if not (isinstance(s, dict) and s.get("src") and s.get("alt")):
            p.append("screenshots は {src, alt} の形")
        elif not (art / s["src"]).is_file():
            p.append("スクリーンショットが見つかりません（store/art/%s）" % s["src"])
    if (d / "store").is_dir() and dir_size_kb(d / "store") > meta["store_budget_kb"]:
        p.append("store/ が容量の予算 %dKB を超えています" % meta["store_budget_kb"])
    return p


# ---- 公開の関門（status が published のゲームだけ） ---------------------------
def release_blockers(games, site):
    out = []
    published = [g for g in games if g["status"] == "published"]
    if published and not site.get("privacy_finalized"):
        out.append("プライバシーのページが確認前です（catalog/site.json の privacy_finalized が false）")
    licenses = (ROOT / "ASSET_LICENSES.md")
    license_text = licenses.read_text(encoding="utf-8") if licenses.exists() else ""
    for g in published:
        gid, store = g["id"], g["_store"]
        if not re.search(r"^## %s(?![\w-])" % re.escape(gid), license_text, re.M):
            out.append("%s: ASSET_LICENSES.md に権利情報の節（## %s）がありません" % (gid, gid))
        art = g["_dir"] / "store" / "art"
        if not g.get("release_date"):
            out.append("%s: release_date がありません" % gid)
        images = store.get("images") or {}
        for slot in ("card", "hero", "og"):
            if slot not in images:
                out.append("%s: store/art の %s 画像が未設定です" % (gid, slot))
        if not store.get("how_to") or not store.get("features"):
            out.append("%s: 遊び方と特徴の文章がありません" % gid)
        if len(store.get("screenshots", [])) < 3:
            out.append("%s: スクリーンショットが 3 枚未満です" % gid)
        if g["kind"] == "web":
            data = g["data"]
            if not all(k in data for k in ("local_storage", "cookies", "network")):
                out.append("%s: data（保存・通信する情報の申告）が不完全です" % gid)
        else:
            if not g.get("app_store_url"):
                out.append("%s: app_store_url が未設定です" % gid)
    return out
