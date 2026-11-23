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
- `games/crowd-sprint/docs/SPEC.md`：参考 2 本（581万人100m走・爆走キックボード）の調査、ルール・操作・順位の仕組み・接触と追い抜き・スタミナ配分・描画の最適化・テスト項目・最小実装範囲。実装は未着手。
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

## 2026-11-22 BALL DODGE 完成（9 段階。draft のまま・公開は承認待ち）
- 基盤整備を commit：`753fa38`（push していない）。
- 1 調査（`games/ball-dodge/docs/RESEARCH.md`）：**ボールを避けるゲームの参考 URL は共有されていないので、個別の分析はしていない**（ジャンルの構造と、調査済み 2 本から取り入れた考え方だけ）。URL をもらえれば追記する。
- 2 仕様（`SPEC.md`）／3 実装：明るくポップな見た目（チェック背景・縁取りのボール・ボールを目で追うキャラクター）、**波（輪・すきまのある壁・ねらい撃ち。警告つき）**、ニアミスのコンボ、10 秒ごとのマイルストーン、やられ演出（紙吹雪・ゆれ。`prefers-reduced-motion` で抑制）、ミュート（M キー・右上のボタン）。
- 4 サウンド：WebAudio で効果音と BGM を合成（素材ファイルなし）。`platform/core/audio.js`（共通基盤。ミュートの状態だけを端末に保存）。
- 共通基盤の追加：`audio.js`・ゲーム別テーマ（CSS 変数で、開始／ゲームオーバー画面の色・フォント・ボタンをゲームごとに変える）・ミュートボタン・「あそびかた・ゲーム詳細」リンク・確認用の `hold`／`render`。
- 5〜6 テスト・バランス：ボット検査（`?botcheck=1`）— 何もしない 3〜8 秒／先読みボット 43〜73 秒（公平で、終わりがある）。調整の記録は `BALANCE_TEST.md`。テスト 27 件成功（ボットの不変条件・BALL DODGE が公開の関門を「公開日とプライバシーの確認」以外すべて満たすこと、を追加）。
- 7 詳細ページ：キービジュアル（SVG）・カード画像・共有用 OGP（PNG）・スクリーンショット 3 枚（ゲームのボット再生から自動撮影）・独自の theme.css（ストアの黒基調とは別のポップなデザイン）。
- 8 公開準備：`RELEASE_CHECKLIST.md`。残る関門：公開日・プライバシーページのオーナー確認・公開の承認・実機確認。
- 未確認：実機 iPhone での手触りと性能、実際のスピーカーでの音、人間のプレイでの難易度（ボットは人間より上手なので、人間はもっと早く終わるはず）。
- Git：BALL DODGE の変更は未コミット。`games/crowd-sprint/docs/SPEC.md` も未コミット。

## 2026-11-22 CROWD SPRINT 完成（9 段階。draft のまま・公開は承認待ち）
- 前提：BALL DODGE を `cb145df` でコミット（push していない）。権利ルールを適用：`ASSET_LICENSES.md` を新設し、公開の関門が台帳の節を検査（`CLAUDE.md` にもルールを追加）。外部ライブラリ・外部素材・同梱フォントなし。
- 設計メモ 11 章の 5 項目は、推奨案で進めた（縦 480×720／演出の人数 8,888,888／疑似 3D／id `crowd-sprint`／失敗なしで必ずゴール）。
- 1 調査：`games/crowd-sprint/docs/RESEARCH.md`（参考 2 本。**実プレイは不可**だった旨を記録。コピーはしない）。2 仕様：`SPEC.md`（実装で確定した値を先頭に追記）。
- 3 実装：`play/sim.js`（決定性のあるシミュレーション。800 人・順位の式・接触・転倒の連鎖・スリップストリーム・スタミナ）／`sprites.js`（起動時に描くスプライトのアトラス）／`main.js`（疑似 3D の描画・入力・音）／`bot.js`（検査用）。
- 4 UI・演出・サウンド：巨大な順位の数字（桁が変わると光って音）、進行バー、スタミナ、ふらつきの点、カウントダウン、ゴールゲート、紙吹雪、効果音（WebAudio 合成）と BGM（ドラム・メロディ）。
- 5 PC・スマホ：共通基盤に**マルチタッチのゾーン入力**（`input.setZones`）を追加。スマホは なぞる＋DASH＋JUMP の同時操作。PC は ← → ／ Shift ／ Space。
- 6 テスト・バランス：ボットで調整（`BALANCE_TEST.md`）。**調整で分かったこと**：転倒に上限がないと人混みの 2 割が転び、順位が荒れの量で決まった／NPC が後ろから来るプレイヤーをよけるようにしたら手応えが一変した。結果：何もしない＝約 260〜310 万位、ボット＝約 4,000〜9,000 位、1 位は理論上ぎりぎり。性能：更新 約 1.0ms・描画 約 5.1ms（800 人・ヘッドレス）。
- 7 詳細ページ：夕焼けの紺とオレンジ・斜めの構図・斜体・斜めに切ったボタン（BALL DODGE のポップなデザインとは別物）。キービジュアルは生成スクリプト（`docs/art-src/make_art.py`）で図形だけから作成。共有用画像・スクリーンショットは JPEG。
- 8 公開準備：`RELEASE_CHECKLIST.md`。残る関門：公開日・プライバシーページの確認・公開の承認・実機確認（テストで確認済み）。
- テスト 31 件成功（自己テストは「ゲーム内の時間」で入力する形に修正：リトライは短いカウントダウンのため）。
- 未確認：iPhone 実機（3 本指に近い同時操作・60fps・発熱）、人間の手触りと難易度、実際のスピーカーでの音、フォントの扱い（共有用画像の文字は Mac の OS フォント）。
- Git：CROWD SPRINT・共通基盤・台帳の変更は未コミット。

## 2026-11-22 CROWD SPRINT 3D 版（完全 3D・WebGL2）
- 方針変更（ユーザー）：800 人全員を実際の 3D モデルで。2D スプライト・Canvas 2D の疑似 3D・人数削減は禁止。iPhone で 60fps が目標、ヘッドレスの数値だけで合格にしない。既存の 2D 版は比較用に保持し、3D 版は独立（`games/crowd-sprint-3d`）。ルールは変えない。**追加の指示：順位を実際の順位（800 位〜）に**（主人公を含めて 800 人。NPC は 799 人。最後尾＝800 位）。
- 先に技術設計とベンチ計画：`games/crowd-sprint-3d/docs/TECH_DESIGN.md`。**素の WebGL2 を採用**（外部ライブラリなし。three.js は不採用）。GPU インスタンシング／頂点シェーダーでのアニメーション／LOD 3 段階（244・96・48 三角形）／視錐台カリング／バッファの再利用／TypedArray のシミュレーション／解像度の動的調整。描画コール 6。
- 実装：`play/gl/`（行列・モデル生成・世界生成・レンダラー）、`sim.js`（2D 版と同じ動き。順位だけ実際の順位）、`main.js`（カメラ・転倒/復帰/ジャンプの 3D アニメーション・HUD・音）。共通基盤に WebGL 対応・フレーム統計・入力時刻を追加（非対応のブラウザには 2D に置き換えず説明を表示）。
- 計測：`?perf=1`・`?bench=1&loop=N`（ベースラインの確認つき）・`tools/cdp.py`・`tools/serve.py --lan`。**Mac の計測は、環境が高負荷（空の WebGL でも 24〜50fps）だったため、FPS と GPU 時間は無効**。有効なのは、構造の数値（描画コール 6・約 9 万三角形・GPU バッファ 3.2MB）と JS の CPU 時間（約 1ms）。詳細は `BENCHMARK.md`。
- ボット（実際の順位）：何もしない 510〜596 位／ボット 67〜107 位。
- 詳細ページ：3D 版の実画面（ボット再生から自動撮影）からスクリーンショット 4 枚・キービジュアル・共有用画像・カード画像を作成。権利：`ASSET_LICENSES.md` に `crowd-sprint-3d` の節（外部素材なし）。
- テスト：自己テスト、ゲームの動きが 2D 版と同じこと、全員が 3D であること（メッシュ・LOD・描画コール・三角形・バッファ・ソースに 2D スプライトが無いこと）、実際の順位でのバランス、CPU 時間の上限、ほか。
- **未確認（正直に）**：iPhone 実機の FPS・CPU・GPU・メモリ・発熱・入力遅延・3 本指の同時操作・60fps、実際のスピーカーでの音、人間の手触り。実機の測り方は `BENCHMARK.md`（承認制）。
- Git：未コミット。push・公開はしていない。HP・Unity・STONE DASH・他ゲームは未変更。

## 2026-11-22 CROWD SPRINT 3D 版：Mac ブラウザでの徹底検証（実機検証は行わない方針）
- 方針（ユーザー）：iPhone 実機の検証は不要（リリース後にオーナーが iPhone でプレイして確認）。LAN での実機テスト環境の構築・機種確認はしない。実機の FPS・発熱・入力遅延は**未確認**として記録。Mac のブラウザで徹底する。push・Cloudflare 公開はしない。
- 道具：`tools/cdp.py`（Chrome に本物のキー・タッチ・画面サイズを与える。`Browser` クラス）、`tools/perf_runs.py`（性能計測を複数回行い、環境が高負荷の回を除外）、ゲーム内の `?scenario=`・`?soak=`・`?debug=1`。
- 操作：実際のキー（← → Shift Space）と、3 本の指の同時操作（なぞる＋DASH＋JUMP）で確認（テスト化）。
- 転倒・復帰・追い抜き：決まった状況を再現して確認（つまずく→約 1.4 秒で復帰／ジャンプで越える／接触でよろける／転倒の連鎖（上限内・固まらない）／NPC の状態の遷移／800 位から追い抜いて 81 位）。**見つけて直した問題**：転んだ人が前向きに倒れ、後ろ上のカメラからほぼ見えなかった → 横向きに倒れる＋足元に赤い危険ゾーンの輪。タイトル画面の背景に HUD が重なっていた → 3D の景色だけにした。
- 長時間動作：80 レース（約 10.8 万フレーム）でヒープ 4.3→5.8MB（増加は 0.005MB/レース）・DOM 一定・GPU バッファ一定・GL エラー 0。
- 画面サイズ：10 種類（320×568〜2560×1080）で、はみ出し・歪み・スクロールなし。
- 性能：14 回試行して有効は 1 回のみ → **FPS・GPU 時間は採用しない**（この Mac の Chrome では、何も描かなくても GPU 時間に 14〜16ms の固定の遅れがあり、解像度・描画要素・HUD を変えても傾向が変わらないため、ゲームの重さを表していないと判断）。採用するのは、環境に左右されない数値（描画コール 6・約 9 万三角形・GPU バッファ 3.2MB・JS の CPU 時間 約 1ms・メモリ）。
- テスト：新規に、操作（キー・マルチタッチ）・画面サイズ・転倒と復帰とジャンプ・接触と連鎖と NPC の状態・追い抜き・ソークを追加。詳細は `games/crowd-sprint-3d/docs/BENCHMARK.md`。
- **未確認**：iPhone 実機（FPS・発熱・入力遅延・Safari の挙動・手触り）、実際のスピーカーでの音、人間の手触りと難易度。
- Git：3D 版は `ffa8a72` でコミット済み。この検証の変更は未コミット。push・公開はしていない。

## 2026-11-22 CROWD SPRINT 3D 正式リリースの準備（承認：公開・push・HP 掲載）
- 確認事項 1〜6 を、推奨どおり承認：プライバシーページの文面／Cloudflare Web Analytics は無効（オーナーの確認）／HP のプライバシーの項の文面／検索エンジンへの掲載は許可しない（`indexing: false`）／検証用 `bot.js` の除外／Pages プロジェクトはオーナーが作成。
- 変更：`catalog/site.json`（`privacy_finalized: true`）・`games/crowd-sprint-3d/game.json`（published・公開日 2026-11-22・「テスト公開中」の表示）・`tools/build.py`（リリースビルドから `bot.js` を除外）・`tools/render.py`・`store/store.css`（「テスト公開中」のバッジ）。他のゲーム（BALL DODGE・2D 比較版・STONE DASH）は draft のまま、変更なし（リリースビルドの公開物にも入らない）。
- テスト 46 件成功（公開物は 3D 版 1 本だけ・`bot.js` なし・プライバシーは確定表示・noindex・実際の設定で関門に不足なし）。
- 未確認：FPS・GPU 時間（未計測）、iPhone 実機（未確認。リリース後にオーナーが確認）。

## 2026-11-22 リリース作業の途中経過（Cloudflare Pages の作成待ち）
- 完了：リリースコミット `2aaeaa9`（公開日・プライバシー確定・bot.js 除外・「テスト公開中」表示）を GitHub `HENIQDev/heniq-games` の `main` に push。公開前の検査で、**画像にメタデータ（EXIF）が残っていた**ため、`tools/strip_exif.py` で除去し、テストで確認（HP の公開情報の検査と同じ方針）。
- HP 掲載：`cms` ブランチとは別に、`origin/main` のクローン（作業場所：スクラッチパッド）でコミット `f7c5c1b` まで作成（掲載データ・画像・プライバシーの項・最小のコード・テスト 124 件・公開情報の検査は問題なし）。**push していない**（ゲームの公開 URL が動くことを確認してから、HP に出す）。
- 止まっている理由：Cloudflare Pages のプロジェクト `heniq-games` が、まだ存在しない（`heniq-games.pages.dev` が名前解決できない）。作成はオーナーのアカウントでの操作。
- 未確認：FPS・GPU 時間（未計測）、iPhone 実機（リリース後にオーナーが確認）。

## 2026-11-22 CROWD SPRINT 3D 公開（テスト公開中）
- **ゲーム**：https://heniq-games.pages.dev/crowd-sprint-3d/ （ストア https://heniq-games.pages.dev/ ・詳細 …/crowd-sprint-3d/about/ ・プライバシー …/privacy/）。Cloudflare Pages `heniq-games`（GitHub `HENIQDev/heniq-games` の `main` から自動デプロイ。ビルド：`python3 tools/build.py --release`）。公開日 2026-11-22。コミット `2aaeaa9`（リリース）・`240bfab`（画像のメタデータ除去）・`90312e0`（404 ページ）。
- **公式 HP**：https://heniq-website.pages.dev/games/ に「テスト公開中（プレイできます）」として掲載（HP のコミット `bb746e5`。`cms` ブランチの作業ツリー・未コミット 3 ファイルは、別クローンで作業し、触れていない）。プライバシーポリシーに項を追加（最終改定日 2026-11-22）。
- **公開後の確認（公開 URL・実ブラウザ）**：ゲームの起動（WebGL2）／実際のキー（← → Shift Space）とマルチタッチ（なぞる＋DASH＋JUMP）の操作／3D の描画（描画コール 6・全員が 3D）／音声（AudioContext が動作・ミュート切替。**聞こえ方そのものは未確認**）／完走（結果画面）／詳細ページと画像（スマホ 375・PC 1280。はみ出しなし）／プライバシーページ／HP の `/games/` から「今すぐプレイ」で遷移して遊べること。JS のエラーなし。
- **公開して分かったこと**：Cloudflare Pages は `404.html` が無いと、存在しない URL にも 200 でトップを返す（公開していないゲームの URL も 200 になる）。404 ページを追加して push したが、確認した時点（約 25 分後）では**まだ反映されていない**（Pages のデプロイ状況をダッシュボードで確認する必要がある。機能への影響はない）。
- **未確認**：FPS・GPU 時間（未計測）、iPhone 実機（FPS・発熱・入力遅延・手触り。リリース後にオーナーが確認）、実際のスピーカーでの音。
- 検索エンジンには載せていない（`indexing: false`・noindex）。

## 2026-11-22 HENIQ GAMES・公式 HP の横断確認と改善
- **発見**：①Cloudflare Pages の公開内容が、GitHub の最新より古い（`240bfab` まで。`90312e0`・`2acc1c0`・`ba45c61` が未反映。404 ページと公式 HP へのリンクが無い）②存在しない URL が 200 でトップを返す（`/ball-dodge/` など未公開ゲームの URL・`/sitemap.xml`・`/crowd-sprint-3d/bot.js` も 200＝ソフト 404）③`robots.txt` が `Disallow: /`（公式 HP の「非掲載中も巡回は止めない」と逆。HP からリンクされると、noindex が読まれず URL だけが載る場合がある）④公開内容がどのコミットか確かめる手段が無い⑤共有（OGP・Twitter カード）の情報が不足⑥公式 HP の GAMES が重複（旧一覧）⑦ストアのヘッダーに HENIQ のブランドが無い。
- **改善（ローカルでコミット。push は承認待ち）**：①robots は巡回を許可し、noindex は meta と `X-Robots-Tag` で（`indexing: true` にすると sitemap・canonical・noindex 解除）②`build-info.json`（コミット・ブランチ・時刻。Cloudflare の `CF_PAGES_COMMIT_SHA`）③OGP・Twitter カード（題名・説明・URL・画像）④ヘッダーに HENIQ のロゴ（公式 HP のロゴのコピー。台帳に記載）⑤feed に `release_label`⑥canonical を含む HTML が、外部資源の検査で誤検出されない（`indexing: true` に切り替えたときにビルドが止まる不具合を、事前に修正）⑦運用手順 `docs/OPERATIONS.md`（デプロイの確認・ロールバック・追加・掲載の切り替え）。
- 公式 HP（別クローン。`cms` の未コミット 3 ファイルは触れていない）：`c3e223e`（GAMES を HENIQ GAMES へ一本化。メニュー・フッター・ホーム・`/games/` の転送・重複する掲載の削除）と `b4e5ffc`（`build-info.json`）。テスト 126 件・公開情報の検査は問題なし。
- テスト：HENIQ GAMES 53 件・公式 HP 126 件が成功。
- 未反映・未確認：Cloudflare のデプロイ（`heniq-games` の失敗の原因は、ダッシュボードのビルドログが必要）、HP の push（承認待ち）。FPS・GPU 時間は未計測、iPhone 実機は未確認。

## 次回の再開地点
00. BALL DODGE・CROWD SPRINT は完成（承認待ち：CROWD SPRINT の commit・手触りの確認・実機確認・公開）。次の候補：3 本目（巨大鳩）／HP 連携（H1）／公開の準備。旧メモ→（設計メモ `games/crowd-sprint/docs/SPEC.md` 11 章の 5 項目は未回答。推奨案で進めてよいか確認する。参考 2 本は調査済み・実プレイ不可）。HP 連携（H1）は別作業。
0. M2：設計メモの 11 章（5 項目）の承認 → M2-a（マルチタッチ入力 → ベンチマーク版で iPhone 実機 60fps の確認 → 本体）。
1. 承認待ち：①M1 の commit ②GitHub リポジトリの作成方法 ③ボール避けの手触りの確認（難易度・当たり判定）
2. M2：大量 100m 走。先に設計メモを書く（大量描画：キャラクターは単純な図形＋スプライトの一括描画、追い抜き＝レーンの入れ替わり、回避＝プレイヤーの 1〜2 ボタンの操作、群衆の人数と性能の予算：スマホで 60fps／数千体の目標を実測で詰める）。決定性（種）を守る。
3. M3 の前：Node／wrangler の再調査、ランキングの API を Pages Functions にするか別 Worker にするかの決定（承認）。

## 2026-11-23 公式 HP の push と、heniq-games のデプロイ停止の調査
- 公式 HP：別クローンから `c3e223e`・`b4e5ffc` を main へ push（bb746e5→b4e5ffc、fast-forward）。Cloudflare の公開コミット＝GitHub main＝build-info.json（b4e5ffc）が一致。`/games`・`/games/`・`/games/crowd-sprint-3d(/)` は 302 で HENIQ GAMES へ。HP の既存ページは 200、sitemap に /games なし。元の `cms` の未コミット 3 ファイルは未接触。
- heniq-games：公開中の内容は 240bfab と一致（画像の hash で確認）。90312e0・2acc1c0・ba45c61 は未反映。新規クローンで 240bfab〜ba45c61 の各コミットを `build.py --release`（Python 3.9）でビルド → すべて成功。コードの差分も小さく、Python 互換の問題なし → 原因はコードではなく Cloudflare 側（Git 連携・ビルド設定・ビルドログ）。ダッシュボードの確認が必要。
- 117cbc4 は未 push（保留）。`indexing: false` は維持。
