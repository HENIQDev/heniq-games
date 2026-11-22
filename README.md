# HENIQ GAMES（WEB_GAMES）

URL を開くだけで遊べる、無料のブラウザゲーム群と、そのゲームストア。公式 HP とは独立（公開先は Cloudflare Pages の `heniq-games`。**未公開**）。

```bash
python3 tools/build.py && python3 tools/serve.py   # ストア：http://127.0.0.1:8790/
python3 -m unittest discover -s tests              # テスト
python3 tools/new_game.py <id> --title "…" --genre casual   # ゲームを追加
```

| URL | 内容 |
|---|---|
| `/` | ストアのトップ（統一デザイン） |
| `/genre/<id>/` | ジャンル別 |
| `/<id>/` | ゲーム本体（ブラウザゲーム） |
| `/<id>/about/` | ゲーム詳細ページ（ゲームごとに独自のデザイン） |

| ゲーム | 種類 | 状態 |
|---|---|---|
| `ball-dodge` | WEB | **9 段階を完了**（draft。公開は承認待ち） |
| `stone-dash` | iOS | 掲載データの下書き（draft。App Store の URL は未設定） |
| `crowd-sprint-3d` | WEB | **完成版（WebGL2 の 3D・800 人全員が 3D モデル。実際の順位 800 位〜）**。draft。iPhone 実機の計測は未実施 |
| `crowd-sprint` | WEB | 2D 比較版（Canvas 2D の疑似 3D）。比較用に保持 |

資料：[ルール](CLAUDE.md)／[運用フロー](docs/GAME_PIPELINE.md)／[ポータル設計](docs/PORTAL_DESIGN.md)／[設計](docs/DESIGN.md)／[進捗](docs/PROGRESS.md)
