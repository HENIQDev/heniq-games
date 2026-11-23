# BUTT SUMO オンライン対戦サーバー

構成・費用・不正対策：`games/butt-sumo/docs/ONLINE_DESIGN.md`。ロジックは `core.js`（テスト済み）、Cloudflare 用の薄いラッパーが `worker.js`。

## ローカルでの確認（Node 不要）
```bash
python3 -m unittest tests.test_online        # サーバー役 1・プレイヤー 2 の Chrome を本物の WebSocket でつないで、対戦・レート・切断・再接続を確認
python3 tools/jsrun.py tests/js/server_core.mjs   # ロジックの単体検査
python3 tools/jsrun.py tests/js/worker_fake.mjs   # worker.js を偽の Cloudflare 環境で検査（眠り・alarm・上限）
```

## Cloudflare へのデプロイ（2026-11-23 に実施済み）
- 本番：`https://heniq-butt-sumo.heniq-dev.workers.dev`（Worker `heniq-butt-sumo`、Durable Objects `Lobby`・`Room`（SQLite 版）、無料プラン）。ゲーム側の接続先は `games/butt-sumo/play/config.js` の `SERVER`（`wss://…`）と、`game.json` の `network_hosts`（CSP）。
- 道具：Node.js v24.22.3（`~/Documents/HENIQ/DevEnv/node/current/bin`。nodejs.org の公式配布を展開しただけ。システムには入れていない）、wrangler 4.166.0（`package.json` で固定。`npm ci`）。
```bash
export PATH=~/Documents/HENIQ/DevEnv/node/current/bin:$PATH WRANGLER_SEND_METRICS=false
cd server/butt-sumo && npm ci
npx wrangler login --browser=false     # 表示された URL を開いて、Cloudflare の画面で「許可」（利用者が行う）
npx wrangler deploy                     # 本番へ（Worker と Durable Objects）
python3 tools/prod_check.py wss://heniq-butt-sumo.heniq-dev.workers.dev --page https://heniq-games.pages.dev/butt-sumo/   # 本番で 2 台の対戦を確認（確認用の戦績は削除）
```
- 許可オリジンは `wrangler.toml` の `ALLOWED_ORIGINS`（本番は `https://heniq-games.pages.dev` のみ）。ローカルの画面から本番サーバーを試すときだけ、一時的に `http://127.0.0.1:8793` を足して、終わったら必ず戻す。

## ロールバック
`npx wrangler delete --name heniq-butt-sumo --force`（Worker・Durable Objects・保存された戦績がすべて消える。ゲームは「サーバーに接続できません」と表示し、CP ステージは影響を受けない）。`config.js` の `SERVER` を空にして再デプロイすると、「準備中」の表示になる。
