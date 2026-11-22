# HENIQ WEB GAMES：作業ルール

`~/.claude/CLAUDE.md`（HENIQ 共通）と `HENIQ/CLAUDE.md` に加えて守る。矛盾したらこちらを優先し、報告する。設計は `docs/DESIGN.md`、進捗と再開は `docs/PROGRESS.md`。

## 禁止（承認なしでやらない）
- 公式 HP（`~/Documents/HENIQ/HP*`）・Unity プロジェクト・飛び石の `Backend/` の変更（読むだけ）
- 有料サービス、Cloudflare の本番設定、GitHub リポジトリの作成・push、公開（デプロイ）、解析・広告
- Git の commit（共通ルールどおり承認制）

## 方針
- 公開物は `python3 tools/build.py` で `dist/` に作る。外部 URL・インラインのスタイル／スクリプトは禁止（ビルドが止める）。
- 開発確認：`python3 tools/build.py && python3 tools/serve.py`（http://127.0.0.1:8790/）。
- テスト：`python3 -m unittest discover -s tests`（ビルド検査＋ヘッドレス Chrome の自己テスト。全ゲーム共通）。
- ゲームは `games/<id>/`（`game.json`・`index.html`・`main.js`）。共通部品は `platform/` に置き、ゲームに不要な機能を強制しない。
- **ブラウザに秘密の値（鍵・トークン）を保存しない。** 保存してよいのは表示用の自己ベストだけ。ランキングは任意の別機能で、止まってもゲームは遊べること（`docs/DESIGN.md`）。
- 新しいゲームの `status` は `draft`。`published` にするのは公開の承認を受けてから。
- 参考ゲームは着想だけ。見た目・文言・素材はまねない。
