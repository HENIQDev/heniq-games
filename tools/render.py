"""HTML の生成：ストア（統一デザイン）と、ゲーム詳細ページの骨組み（見た目の既定を持たない）。"""
import html
import json

PLATFORM_LABEL = {"web": "WEB", "ios": "iOS"}
HP_URL = "https://heniq-website.pages.dev/"


def hp_url(site):
    """HENIQ 公式サイトの URL（catalog/site.json の hp_url）。"""
    return site.get("hp_url") or HP_URL


def e(s):
    return html.escape(str(s), quote=True)


def platforms(g):
    return ["PC", "スマホ"] if g["kind"] == "web" else ["iPhone"]


def genre_label(genres, gid):
    return next((x["label"] for x in genres if x["id"] == gid), gid)


def head(title, css, root, site, description="", og_image=None, canonical=None, og_type="website"):
    """<head> の先頭〜 CSS まで（閉じタグは呼び出し側）。noindex・説明・canonical・OGP・Twitter カード。"""
    robots = "" if site["indexing"] else '<meta name="robots" content="noindex">\n'
    desc = '<meta name="description" content="%s">\n' % e(description) if description else ""
    canon = '<link rel="canonical" href="%s">\n' % e(canonical) if canonical and site["indexing"] else ""
    social = ""
    if site.get("site_url"):
        social += '<meta property="og:site_name" content="%s">\n<meta property="og:type" content="%s">\n<meta property="og:locale" content="ja_JP">\n' % (e(site["name"]), og_type)
        social += '<meta property="og:title" content="%s">\n' % e(title)
        if description:
            social += '<meta property="og:description" content="%s">\n' % e(description)
        if canonical:
            social += '<meta property="og:url" content="%s">\n' % e(canonical)
        if og_image:
            social += '<meta property="og:image" content="%s">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:image" content="%s">\n' % (e(og_image), e(og_image))
        else:
            social += '<meta name="twitter:card" content="summary">\n'
        social += '<meta name="twitter:title" content="%s">\n' % e(title)
        if description:
            social += '<meta name="twitter:description" content="%s">\n' % e(description)
    links = "".join('<link rel="stylesheet" href="%s%s">\n' % (root, c) for c in css)
    return (
        '<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '%s%s<title>%s</title>\n%s%s%s'
    ) % (robots, desc, e(title), canon, social, links)


# ---- ストア（統一デザイン） --------------------------------------------------
def card(g, genres, root):
    store = g["_store"]
    images = store.get("images") or {}
    # カードの本体は、WEB・iOS とも詳細ページへ（2026-11-26：iOS も紹介ページを見てから App Store へ進めるように）
    href = "%s%s/about/" % (root, g["id"])
    ext = ""
    if "card" in images:
        art = '<img class="card-img" src="%s%s/about/art/%s" alt="" width="460" height="215" loading="lazy">' % (root, g["id"], e(images["card"]))
    else:
        art = '<div class="card-art" aria-hidden="true"><span>%s</span></div>' % e(g["title"])
    badges = ['<span class="badge badge-%s">%s</span>' % (g["kind"], PLATFORM_LABEL[g["kind"]]),
              '<span class="badge">%s</span>' % e(genre_label(genres, g["genre"]))]
    if g["features"].get("ranking"):
        badges.append('<span class="badge">RANKING</span>')
    if g["status"] != "published":
        badges.append('<span class="badge badge-draft">DRAFT</span>')
    if g.get("release_label"):
        badges.append('<span class="badge badge-test">%s</span>' % e(g["release_label"]))
    play = ""
    if g["kind"] == "web":
        play = '<a class="card-play" href="%s%s/">PLAY</a>' % (root, g["id"])
    elif g.get("app_store_url"):
        play = '<a class="card-play" href="%s" rel="noopener">App Store</a>' % e(g["app_store_url"])
    return (
        '<article class="card g-%s" data-genre="%s" data-kind="%s" data-title="%s">'
        '<a class="card-link" href="%s"%s>%s<h3>%s</h3><p>%s</p></a>'
        '<div class="card-foot"><div class="badges">%s</div>%s</div></article>'
    ) % (e(g["id"]), e(g["genre"]), g["kind"], e((g["title"] + " " + g["summary"] + " " + " ".join(g["tags"])).lower()),
         e(href), ext, art, e(g["title"]), e(g["tagline"]), "".join(badges), play)


def hero_slide(g, root):
    images = (g["_store"].get("images") or {})
    img = ""
    if "hero" in images:
        img = '<img class="hero-img" src="%s%s/about/art/%s" alt="" width="1280" height="720">' % (root, g["id"], e(images["hero"]))
    about = "%s%s/about/" % (root, g["id"])
    if g["kind"] == "web":
        primary = '<a class="btn btn-primary" href="%s%s/">PLAY</a>' % (root, g["id"])
    elif g.get("app_store_url"):
        primary = '<a class="btn btn-primary" href="%s" rel="noopener">App Store</a>' % e(g["app_store_url"])
    else:
        primary = '<span class="btn btn-soon">COMING SOON</span>'
    return (
        '<section class="hero-slide g-%s" aria-label="%s">%s<div class="hero-copy">'
        '<p class="hero-kind">%s</p><h2>%s</h2><p>%s</p><div class="hero-actions">%s<a class="btn" href="%s">詳細</a></div></div></section>'
    ) % (e(g["id"]), e(g["title"]), img, PLATFORM_LABEL[g["kind"]] + (" GAME" if g["kind"] == "web" else " APP") + ((" ・ " + g["release_label"]) if g.get("release_label") else ""),
         e(g["title"]), e(g["tagline"]), primary, e(about))


def nav_genres(genres, used, root):
    return "".join('<a href="%sgenre/%s/">%s</a>' % (root, g["id"], e(g["label"])) for g in genres if g["id"] in used)


def store_shell(site, title, body, root, genres, used_genres, description="", og=None, canonical=None, extra_head=""):
    h = head(title, ["_store/store.css", "_store/games-theme.css"], root, site, description, og, canonical)
    return (
        h + "</head>\n" +
        '<body class="store">\n<header class="top"><a class="logo" href="%s" aria-label="HENIQ GAMES トップ"><img src="%s_store/heniq-logo.png" alt="HENIQ" width="138" height="17"><span class="logo-games">GAMES</span></a>'
        '<nav class="top-nav" aria-label="ジャンル">%s</nav>'
        '<a class="top-hp" href="%s" rel="noopener">HENIQ 公式サイト<span aria-hidden="true"> &#8599;</span></a></header>\n<main>\n%s\n</main>\n'
        '<footer class="foot"><a href="%sprivacy/">プライバシー</a><a href="mailto:%s">お問い合わせ</a>'
        '<a href="%s" rel="noopener">HENIQ 公式サイト</a><small>&copy; HENIQ</small></footer>\n'
        '<script type="module" src="%splatform/ui/layoutcheck.js"></script>\n'
        '<script type="module" src="%s_store/store.js"></script>\n</body>\n</html>\n'
    ) % (root, root, nav_genres(genres, used_genres, root), e(hp_url(site)), body, root, e(site["support_email"]), e(hp_url(site)), root, root)


def filter_bar(genres, used):
    chips = ['<button type="button" class="chip is-on" data-genre="">すべて</button>']
    chips += ['<button type="button" class="chip" data-genre="%s">%s</button>' % (g["id"], e(g["label"])) for g in genres if g["id"] in used]
    return (
        '<div class="filters" data-filters hidden><input type="search" class="search" placeholder="ゲームを探す" aria-label="ゲームを探す">'
        '<div class="chips" role="group" aria-label="ジャンル">%s</div>'
        '<div class="chips" role="group" aria-label="プラットフォーム">'
        '<button type="button" class="chip is-on" data-kind="">すべて</button>'
        '<button type="button" class="chip" data-kind="web">WEB</button>'
        '<button type="button" class="chip" data-kind="ios">iOS</button></div></div>'
    ) % "".join(chips)


def store_index(games, genres, site):
    used = {g["genre"] for g in games}
    featured = [g for g in games if g.get("featured")] or games[:3]
    parts = []
    if featured:
        parts.append('<div class="hero" aria-label="注目のゲーム">%s</div>' % "".join(hero_slide(g, "") for g in featured))
    if not games:
        parts.append('<p class="empty">公開中のゲームはまだありません。</p>')
    else:
        parts.append('<section class="block"><h2 class="label">GAMES</h2>%s<div class="grid" data-grid>%s</div>'
                     '<p class="empty" data-empty hidden>該当するゲームがありません。</p></section>' % (
                         filter_bar(genres, used), "".join(card(g, genres, "") for g in games)))
        parts.append('<section class="block"><h2 class="label">GENRES</h2><div class="genre-tiles">%s</div></section>' % "".join(
            '<a class="genre-tile" href="genre/%s/"><strong>%s</strong><span>%s</span></a>' % (x["id"], e(x["label"]), e(x["description"]))
            for x in genres if x["id"] in used))
    og = None
    for g in featured:
        if (g["_store"].get("images") or {}).get("og"):
            og = "%s/%s/about/art/%s" % (site["site_url"], g["id"], g["_store"]["images"]["og"])
            break
    return store_shell(site, site["name"], "\n".join(parts), "", genres, used,
                       "URL を開くだけで遊べる、無料のブラウザゲーム。", og, canonical=site["site_url"] + "/")


def genre_page(genre, games, all_games, genres, site):
    used = {g["genre"] for g in all_games}
    body = ('<section class="block"><h1 class="label">%s</h1><p class="lead">%s</p><div class="grid">%s</div></section>'
            % (e(genre["label"]), e(genre["description"]), "".join(card(g, genres, "../../") for g in games)))
    return store_shell(site, "%s | %s" % (genre["label"], site["name"]), body, "../../", genres, used, genre["description"],
                       canonical="%s/genre/%s/" % (site["site_url"], genre["id"]))


def privacy_page(games, genres, site):
    used = {g["genre"] for g in games}
    rows = []
    for g in games:
        if g["kind"] == "web":
            d = g["data"]
            li = lambda items: "".join("<li>%s</li>" % e(i) for i in items) or "<li>なし</li>"
            rows.append('<section class="block"><h2>%s</h2><dl><dt>端末に保存する情報（localStorage）</dt><dd><ul>%s</ul></dd>'
                        '<dt>Cookie</dt><dd><ul>%s</ul></dd><dt>外部との通信</dt><dd><ul>%s</ul></dd></dl></section>'
                        % (e(g["title"]), li(d["local_storage"]), li(d["cookies"]), li(d["network"])))
        else:
            rows.append('<section class="block"><h2>%s</h2><p>iOS アプリの情報の扱いは、App Store の掲載ページのプライバシー情報に従います。</p></section>' % e(g["title"]))
    note = "" if site["privacy_finalized"] else '<p class="notice">このページは確認前の下書きです。公開前に内容を確認します。</p>'
    body = (
        '<section class="block"><h1 class="label">PRIVACY</h1>%s'
        '<p>HENIQ GAMES は、ログイン不要で遊べるブラウザゲームです。広告・アクセス解析は使っていません。</p>'
        '<p>配信：%s。アクセスに伴う通信情報（IP アドレスなど）は、配信事業者が処理します。</p>'
        '<p>お問い合わせ：<a href="mailto:%s">%s</a></p></section>%s'
    ) % (note, e(site["hosting"]), e(site["support_email"]), e(site["support_email"]), "".join(rows))
    return store_shell(site, "PRIVACY | %s" % site["name"], body, "../", genres, used, "HENIQ GAMES が扱う情報について",
                       canonical="%s/privacy/" % site["site_url"])


def not_found_page(games, genres, site):
    """404 ページ（どの深さの URL でも表示されるので、リンクは / から始まる形）。無いと、Cloudflare Pages は存在しない URL にも 200 でトップを返してしまう。"""
    used = {g["genre"] for g in games}
    body = ('<section class="block"><h1 class="label">404</h1><p class="lead">ページが見つかりません。URL をご確認ください。</p>'
            '<p><a class="btn btn-primary" href="/">HENIQ GAMES のトップへ</a></p></section>')
    return store_shell(site, "404 | %s" % site["name"], body, "/", genres, used, "")


def feed(games, genres):
    out = []
    for g in games:
        images = g["_store"].get("images") or {}
        out.append({
            "id": g["id"], "title": g["title"], "kind": g["kind"], "genre": g["genre"],
            "genre_label": genre_label(genres, g["genre"]), "tags": g["tags"], "tagline": g["tagline"],
            "summary": g["summary"], "status": g["status"], "release_label": g.get("release_label"), "release_date": g.get("release_date"),
            "platforms": platforms(g), "ranking": bool(g["features"].get("ranking")),
            "play_url": "%s/" % g["id"] if g["kind"] == "web" else None,
            "about_url": "%s/about/" % g["id"], "app_store_url": g.get("app_store_url"),
            "accent": g["_store"]["theme"]["accent"],
            "card": "%s/about/art/%s" % (g["id"], images["card"]) if "card" in images else None,
            "hero": "%s/about/art/%s" % (g["id"], images["hero"]) if "hero" in images else None,
        })
    return json.dumps(out, ensure_ascii=False, indent=2) + "\n"


def games_theme_css(games):
    out = ["/* 自動生成：ゲームごとの色（カード・ヒーローの色づけ用） */"]
    for g in games:
        t = g["_store"]["theme"]
        out.append(".g-%s{--g-bg:%s;--g-fg:%s;--g-accent:%s;--g-accent2:%s}" % (g["id"], t["bg"], t["fg"], t["accent"], t["accent2"]))
    return "\n".join(out) + "\n"


# ---- ゲーム詳細ページ（骨組み。見た目は theme.css が決める） -------------------
def about_page(g, genres, site, has_theme):
    store, t = g["_store"], g["_store"]["theme"]
    images = store.get("images") or {}
    root = "../../"
    h = head("%s | %s" % (g["title"], site["name"]), [], root, site, g["summary"],
             "%s/%s/about/art/%s" % (site["site_url"], g["id"], images["og"]) if "og" in images else None,
             "%s/%s/about/" % (site["site_url"], g["id"]), "article")
    h += '<link rel="stylesheet" href="%splatform/ui/about-base.css">\n<link rel="stylesheet" href="vars.css">\n' % root
    if has_theme:
        h += '<link rel="stylesheet" href="theme.css">\n'
    if g["kind"] == "web":
        cta = '<a class="play-btn" href="../">PLAY</a>'
    elif g.get("app_store_url"):
        cta = '<a class="play-btn" href="%s" rel="noopener">App Store で見る</a>' % e(g["app_store_url"])
    else:
        cta = '<span class="play-btn is-soon">COMING SOON</span>'
    meta = ['<li>%s</li>' % e(genre_label(genres, g["genre"])), '<li>%s</li>' % e(PLATFORM_LABEL[g["kind"]]),
            '<li>%s</li>' % e("・".join(platforms(g))), '<li>%s</li>' % e(g["play_time"])]
    if g["features"].get("ranking"):
        meta.append("<li>ランキング</li>")
    if g.get("release_label"):
        meta.insert(0, '<li class="is-test">%s</li>' % e(g["release_label"]))
    meta += ["<li>%s</li>" % e(x) for x in g["tags"]]
    body = ['<body class="about" data-game="%s" data-kind="%s">' % (e(g["id"]), g["kind"]),
            '<nav class="hg-bar"><a href="%s">&larr; HENIQ GAMES</a><span>%s</span></nav>' % (root, PLATFORM_LABEL[g["kind"]]),
            '<main>', '<header class="about-hero"><h1>%s</h1><p class="tagline">%s</p>%s</header>' % (e(g["title"]), e(g["tagline"]), cta)]
    if "hero" in images:
        body.append('<figure class="about-visual"><img src="art/%s" alt="%s のキービジュアル" width="1280" height="720"></figure>' % (e(images["hero"]), e(g["title"])))
    body.append('<ul class="about-meta">%s</ul>' % "".join(meta))
    if store.get("about_note"):
        body.append('<section class="about-section"><p>%s</p></section>' % e(store["about_note"]))
    if store.get("how_to"):
        body.append('<section class="about-section" id="how"><h2>遊び方</h2>%s</section>' % "".join("<p>%s</p>" % e(x) for x in store["how_to"]))
    if store.get("features"):
        body.append('<section class="about-section" id="features"><h2>特徴</h2><ul class="feature-list">%s</ul></section>' % "".join(
            "<li><h3>%s</h3><p>%s</p></li>" % (e(f["title"]), e(f["text"])) for f in store["features"]))
    if store.get("world"):
        body.append('<section class="about-section" id="world"><h2>世界観</h2>%s</section>' % "".join("<p>%s</p>" % e(x) for x in store["world"]))
    if store.get("screenshots"):
        body.append('<section class="about-section" id="shots"><h2>スクリーンショット</h2><div class="shots">%s</div></section>' % "".join(
            '<img src="art/%s" alt="%s" loading="lazy">' % (e(s["src"]), e(s["alt"])) for s in store["screenshots"]))
    c = g["controls"]
    rows = "".join("<tr><th>%s</th><td>%s</td></tr>" % (e(k), e(v)) for k, v in (("PC", c.get("pc")), ("スマホ", c.get("touch"))) if v)
    body.append('<section class="about-section" id="controls"><h2>操作</h2><table class="controls">%s</table></section>' % rows)
    if g["kind"] == "web":
        d = g["data"]
        items = d["local_storage"] + d["cookies"] + d["network"]
        info = "".join("<li>%s</li>" % e(x) for x in items) or "<li>端末への保存や外部への送信はありません。</li>"
        body.append('<section class="about-section" id="data"><h2>このゲームが扱う情報</h2><ul>%s</ul>'
                    '<p><a href="%sprivacy/">プライバシーの詳細</a></p></section>' % (info, root))
    body.append('</main>\n<footer class="hg-foot"><a href="%s">HENIQ GAMES</a><a href="%s" rel="noopener">HENIQ 公式サイト</a>'
                '<a href="%sprivacy/">プライバシー</a><a href="mailto:%s">お問い合わせ</a></footer>' % (root, e(hp_url(site)), root, e(site["support_email"])))
    body.append('<script type="module" src="%splatform/ui/layoutcheck.js"></script>\n</body>\n</html>\n' % root)
    return h + "</head>\n" + "\n".join(body)


def vars_css(g):
    t = g["_store"]["theme"]
    return ":root{--bg:%s;--fg:%s;--accent:%s;--accent2:%s}\n" % (t["bg"], t["fg"], t["accent"], t["accent2"])
