# BUTT SUMO オンライン対戦サーバー

構成・費用・不正対策：`games/butt-sumo/docs/ONLINE_DESIGN.md`。ロジックは `core.js`（テスト済み）、Cloudflare 用の薄いラッパーが `worker.js`。

## ローカルでの確認（Node 不要）
```bash
python3 -m unittest tests.test_online        # サーバー役 1・プレイヤー 2 の Chrome を本物の WebSocket でつないで、対戦・レート・切断・再接続を確認
python3 tools/jsrun.py tests/js/server_core.mjs   # ロジックの単体検査
```

## Cloudflare へのデプロイ（承認が必要な操作。まだ実行していない）
前提：Node.js と wrangler が必要（この Mac には入っていない）。
1. `cd server/butt-sumo && npx wrangler login`（ブラウザで Cloudflare にログイン）
2. `npx wrangler deploy`（Worker `heniq-butt-sumo` と Durable Objects（SQLite）を作成。無料プランで可）
3. 表示された URL（`https://heniq-butt-sumo.<アカウント>.workers.dev`）を、`games/butt-sumo/play/config.js` の `SERVER`（`wss://…`）と、`game.json` の `network_hosts`・`data.network` に設定
4. `python3 tools/build.py` → `python3 -m unittest tests.test_butt_sumo`（CSP と設定の一致を確認）→ 承認を得て push
5. 本番で、2 台の端末から実際に対戦して確認

## ロールバック
`npx wrangler delete heniq-butt-sumo`（Worker と Durable Objects が消え、ゲーム側は「サーバーに接続できません」の表示になる。CP ステージは影響を受けない）。`config.js` の `SERVER` を空に戻して再デプロイすると、「準備中」の表示になる。
