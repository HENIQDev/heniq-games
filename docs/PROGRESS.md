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

## 2026-11-22 M2 設計メモ（大量 100m 走）作成
- `docs/M2_CROWD_SPRINT_DESIGN.md`：参考 2 本（581万人100m走・爆走キックボード）の調査、ルール・操作・順位の仕組み・接触と追い抜き・スタミナ配分・描画の最適化・テスト項目・最小実装範囲。実装は未着手。
- 参考ゲームの調査は、アプリ内ブラウザが GPU なしで約 1.5fps のため**実プレイできず**、遊び方の文面・画面・技術の概観に基づく（手触りは未確認）。
- 進捗記録のコミット `d276782`（push していない。origin/main より 1 つ先）。

## 2026-11-22 運用方針の変更とポータル設計の提案
- 方針変更（ユーザー）：1 本ずつ企画から完成まで一気通貫（調査→仕様→実装→UI・音→PC/スマホ→テスト→詳細ページ→公開準備→報告）。細かい承認は不要。重大な設計変更・有料・HP の変更・本番公開・push は従来どおり事前確認。ゲームごとの詳細ページは**ゲームごとに独自のアートディレクション**（HP のシックなデザインを強制しない）。HP の GAMES は Steam 型ポータルへ進化させたい（HP は未コミット変更があるので勝手に触らない）。
- 調査・提案：`docs/PORTAL_DESIGN.md`（HP の GAMES・build・CSP・公開構成、WEB_GAMES の現状、URL 設計、ポータルの実現方法、ゲーム別デザインの仕組み、完成から掲載までの自動化、制作フロー）。推奨はストア＋詳細ページを `heniq-games` 側に置く案。HP は変更していない。
- 承認待ち：設計 9 章の 5 項目。

## 2026-11-22 基盤の整備（ポータル）完了
- 承認：推奨構成・URL・H1・STONE DASH 掲載・制作順（BALL DODGE → CROWD SPRINT）・デザイン方針（ストアは統一、詳細ページはゲームごとに独自）。
- 実施：①`games/<id>/` を `play/`・`store/`・`docs/` に分離（`ball-dodge` を移動、`git mv`）②`tools/catalog.py`（読み込み・検査・色のコントラスト・公開の関門）・`tools/render.py`（ストアの統一デザイン＋詳細ページの骨組み）・`tools/build.py`（ストア・ジャンル別・詳細・プライバシー・フィード `games.json`・`_headers`・iOS の転送・sitemap/robots）③`store/store.css`・`store.js`（ストア。絞り込みは JS が無くても全件表示）④`platform/ui/about-base.css`（骨組みだけ）・`layoutcheck.js` ⑤`tools/new_game.py`（雛形）と `docs/templates/`（調査・仕様・テスト・公開の関門）⑥`stone-dash`（iOS）の掲載データ（下書き）⑦`ball-dodge` の詳細ページ（明るくポップな初版。完成版は 9 段階の中で作り込む）。
- 資料：`docs/GAME_PIPELINE.md`（ゲーム追加の運用フロー）・`CLAUDE.md`（新しい運用と承認の線引き）・`README.md` を更新。
- テスト：`python3 -m unittest discover -s tests` 25 件成功（ビルド・ストア・iOS 区別・内部リンク・CSP・外部資源の禁止・独自 about.html・公開の関門・雛形／ヘッドレス Chrome：全 web ゲームの自己テスト×3 画面幅・ストアと詳細ページの横はみ出し〔iframe で本物の 375px と 1280px〕・スクリーンショット）。ヘッドレス Chrome は窓幅 500px 未満にできないため、iframe で幅を再現（最初の 375px のテストは実際は 500px だった→修正）。
- 画面確認：ストア（統一の黒基調）と BALL DODGE の詳細ページ（クリーム・ピンク・太い縁取りのポップ）が全く別のデザインになることを確認（PC・375px）。
- 状態：status はすべて draft・indexing は false（検索に載らない）・privacy_finalized は false。HP・Unity・飛び石の Backend は未変更。commit・push は未実施（承認待ち）。

## 次回の再開地点
00. **BALL DODGE を 9 段階で完成**（調査→仕様→手触り・当たり判定→ポップな見た目と効果音→PC/スマホ→テスト→詳細ページの完成〔キービジュアル・スクリーンショット〕→公開準備）。その後 CROWD SPRINT（設計メモの 11 章の承認も未回答）。
00a. 承認待ち：基盤整備の commit。HP 連携（H1）は別作業。
0. M2：設計メモの 11 章（5 項目）の承認 → M2-a（マルチタッチ入力 → ベンチマーク版で iPhone 実機 60fps の確認 → 本体）。
1. 承認待ち：①M1 の commit ②GitHub リポジトリの作成方法 ③ボール避けの手触りの確認（難易度・当たり判定）
2. M2：大量 100m 走。先に設計メモを書く（大量描画：キャラクターは単純な図形＋スプライトの一括描画、追い抜き＝レーンの入れ替わり、回避＝プレイヤーの 1〜2 ボタンの操作、群衆の人数と性能の予算：スマホで 60fps／数千体の目標を実測で詰める）。決定性（種）を守る。
3. M3 の前：Node／wrangler の再調査、ランキングの API を Pages Functions にするか別 Worker にするかの決定（承認）。
