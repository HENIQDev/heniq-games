# BUTT SUMO 公開の関門と、公開前の作業（2026-11-23 時点）

現在 `status: draft`。**公開はオーナーの承認後。** 下の「承認が必要」は、私が勝手には実行しない。

## 満たしているもの
- [x] 3D のゲーム本体（10 体・100 ステージ・CP AI・必殺技・演出・音）
- [x] PC（キーボード）・スマホ（仮想スティック＋ボタン）の操作。画面サイズ 10 種で HUD のはみ出し・重なりなし
- [x] 専用の詳細ページ（独自デザイン）・カード・ヒーロー・OGP・スクリーンショット 6 枚・遊び方・特徴・操作
- [x] 権利台帳（`ASSET_LICENSES.md` の `## butt-sumo`）。外部素材なし
- [x] 外部 URL・インラインのスクリプト／スタイルなし（ビルドが検査）。CSP は、サーバーを設定したときだけ BUTT SUMO のページで `connect-src` を広げる仕組み
- [x] 自動テスト（`tests/test_butt_sumo.py`・`tests/test_online.py`・`tests/js/*`）

## 未完了・未確認（公開前に必要）
- [ ] **オンライン対戦サーバーを Cloudflare にデプロイ**（承認事項：外部サービスの設定変更。wrangler（Node）のインストール、または Cloudflare のダッシュボードの操作が必要）。手順は `server/butt-sumo/README.md`。デプロイ前は「準備中」と表示し、通信しない。
- [ ] デプロイ後：`play/config.js` の `SERVER`、`game.json` の `network_hosts`・`data.network` を更新 → 本番で 2 台の端末を使って実際に対戦して確認。
- [x] Lobby の Hibernation 対応・待機中だけの alarm・上限（コード済み。**Cloudflare 上では未検証**）。
- [x] 匿名 ID の方式（オーナー決定）。**CLAUDE.md の一文の改訂の承認**が必要（`ONLINE_DESIGN.md` の 6）。
- [ ] プライバシーページ（`catalog/site.json` の `privacy_finalized`）の再確認：BUTT SUMO の保存・通信の記載。
- [ ] iPhone・Android の実機での確認（操作感・FPS・発熱・音）。ヘッドレス Chrome とエミュレーションだけで確認した。
- [ ] 人間の実プレイでのバランス・難易度の調整（`BALANCE_TEST.md`）。
- [ ] 音の聞こえ方の確認（合成音。ヘッドレスでは聞けていない）。
- [ ] `release_date`・`status: published`・`indexing`（現在は false のまま）。
