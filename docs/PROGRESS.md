# 進捗（WEB_GAMES）

## 2026-11-22 M1 完了（土台＋ボール避け）
- 実施：最終設計を `docs/DESIGN.md` に反映／共通基盤（`platform/core`：ランタイム・入力・種つき乱数・自己ベスト保存・自己テスト、`platform/ui/heniq.css`）／ビルド（`tools/build.py`：game.json 検査・容量予算・外部 URL とインライン禁止・CSP の `_headers`・公開前は noindex）／ローカル配信（`tools/serve.py`）／1 本目 `games/ball-dodge`（status: draft）。
- テスト：`python3 -m unittest discover -s tests` 11 件成功（ビルド検査 9・ヘッドレス Chrome の自己テスト 2。自己テストは全ゲーム×3 画面幅〔375・480・1280〕で 起動→開始→操作→ゲームオーバー→リトライ→同じ種で同じ結果 を確認）。
- 画面確認（ブラウザ）：PC 幅・スマホ幅（375）でタイトル→プレイ→GAME OVER（NEW RECORD）→自己ベストの保持を確認。実機 iPhone は未確認（承認制）。
- Git：`GAME/WEB_GAMES` をローカルで `git init`（main、user は HENIQ）。**commit なし**（承認待ち）。リモートなし。
- GitHub の認証状態（確認のみ）：`gh` なし、`~/.ssh` なし、Git のグローバルの user なし、credential helper は osxkeychain（HP は https の remote）。`HENIQDev/heniq-games` の作成・push は未実施。作成の方法（ブラウザで GitHub から作る／トークンの用意）をユーザーと決める必要がある。
- 触っていない物：HP（`cms` ブランチの未コミット変更も含め変更なし）・Unity・飛び石の Backend・Cloudflare・外部サービス。

## 2026-11-22 GitHub へ push 完了
- `origin` = `https://github.com/HENIQDev/heniq-games.git`（Private）。`main`（`8dcb586`）を push、ローカルと同期（差 0/0）。
- 認証：Fine-grained token `HENIQ-WEB-GAMES` を、このリポジトリだけ `credential.useHttpPath=true` で別のキーチェーン項目に保存（HP の認証には影響しない）。トークンはファイル・ログに残していない。
- Cloudflare Pages への接続・公開設定は未実施（承認待ち）。

## 次回の再開地点
1. 承認待ち：①M1 の commit ②GitHub リポジトリの作成方法 ③ボール避けの手触りの確認（難易度・当たり判定）
2. M2：大量 100m 走。先に設計メモを書く（大量描画：キャラクターは単純な図形＋スプライトの一括描画、追い抜き＝レーンの入れ替わり、回避＝プレイヤーの 1〜2 ボタンの操作、群衆の人数と性能の予算：スマホで 60fps／数千体の目標を実測で詰める）。決定性（種）を守る。
3. M3 の前：Node／wrangler の再調査、ランキングの API を Pages Functions にするか別 Worker にするかの決定（承認）。
