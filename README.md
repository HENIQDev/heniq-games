# HENIQ WEB GAMES

URL を開くだけで遊べる、無料のブラウザゲーム群。インストール・ログイン不要。公開先は Cloudflare Pages の `heniq-games`（予定。未公開）。

```bash
python3 tools/build.py                      # dist/ を作る（--release で published のみ）
python3 tools/serve.py                      # http://127.0.0.1:8790/
python3 -m unittest discover -s tests       # テスト
```

| ゲーム | 状態 |
|---|---|
| `ball-dodge`（ボール避け） | M1 完成（draft） |

構成・設計：[docs/DESIGN.md](docs/DESIGN.md)／進捗：[docs/PROGRESS.md](docs/PROGRESS.md)／ルール：[CLAUDE.md](CLAUDE.md)
