# CROWD SPRINT 3D 公開前の確認事項（2026-11-22）

**公開は、下の「あなたの判断が必要な項目」が決まるまで止めている。** リリース関門は無効化していない。

## 1. リリース関門の再確認（`catalog.release_blockers`）
残る不足は 2 つだけ（テストでも確認済み）：①`release_date`（公開の直前に設定する）②**プライバシーページの確認（あなたの確認が必要）**。ほかはすべて満たしている（画像 card・hero・og／スクリーンショット 4 枚／遊び方と特徴／保存・通信する情報の申告／権利台帳の節）。

## 2. プライバシーと、実際の挙動の照合（コードの検査）
| 項目 | プライバシーページの記載 | コードの実態 | 照合 |
|---|---|---|---|
| 端末への保存 | 自己ベストの順位とミュート設定（この端末だけ。外部へ送らない） | `localStorage` のみ（`platform/core/storage.js`。キー `heniq.games.best.crowd-sprint-3d`・`heniq.games.mute`）。値は数字だけ | 一致 |
| Cookie | なし | `document.cookie` を使っていない（検索結果なし） | 一致 |
| 外部通信 | なし | `fetch`・`XMLHttpRequest`・`WebSocket`・`sendBeacon`・画像ビーコンなし。CSP は `connect-src 'self'`・`default-src 'self'`。ビルドが外部 URL を禁止して検査し、`dist` は問題なし | 一致 |
| 広告・解析 | 使っていない | 広告・解析のコードなし | **コード上は一致。ただし、Cloudflare 側の「Web Analytics」を有効にしていないことの確認が必要（あなたのダッシュボードの設定）** |
| 配信事業者 | Cloudflare Pages。IP アドレスなどの通信情報は配信事業者が処理 | 配信側のログは Cloudflare が処理（私には確認できない） | 記載のまま（事実の推測は足していない） |
| 問い合わせ | heniq.support@gmail.com | HP と同じ公開済みのアドレス | 一致 |

**気づいた点（公開前に直したい）**：検証用の `bot.js`（ベンチ・シナリオ用。`?bench=` などの指定があるときだけ読み込まれ、通信はしない。端末の情報を画面に表示する機能を含む）が、公開物にも入る。リリースビルドから除外するのが望ましい（ご承認があれば除外する）。

## 3. 公式 HP への掲載に関わること（読み取りの調査）
- HP の公開版は GitHub `main`（`dd25685`）。ローカルの `cms` ブランチ（未コミット 3 ファイル）とは別。**`cms` の作業ツリーには触れず、`origin/main` から別の作業場所（git worktree）を作って、そこで最小の変更を行う**。
- HP の正式公開の関門：**ゲームを 1 件でも公開すると、`privacy.json` の `apps` に情報が必要**（関門は無効化しない）。つまり、**HP の「確定済み」のプライバシーポリシーに、CROWD SPRINT 3D の項を足す**ことになる。→ あなたの確認が必要。
- 掲載は `content/games/crowd-sprint-3d.json`＋画像 1 枚（HP の CSP は `img-src 'self'` のため、HP の中にコピーが必要）。表示は「テスト公開中」「プレイ可能」「今後調整・修正が入る可能性があります」。

## 4. あなたの判断が必要な項目
1. **プライバシーページの文面の確認**（上の表のとおり。確認できたら `privacy_finalized: true` にする）。
2. **Cloudflare の Web Analytics が無効**であることの確認（広告・解析を使っていない、という記載のため）。
3. **HP のプライバシーポリシーに足す項**の文面の確認（案：「CROWD SPRINT 3D（ブラウザゲーム）：端末のブラウザに、自己ベストの順位とミュート設定を保存します。外部へは送信しません。Cookie・広告・アクセス解析は使用していません。配信：Cloudflare Pages。」＋施行日／改定日の扱い）。**HP の確定済みの文章を変える**ため、あなたの承認が必要。
4. **Cloudflare Pages プロジェクト `heniq-games` の作成**（あなたのアカウントの操作。私は Cloudflare の認証情報を持たず、wrangler もない）。GitHub `HENIQDev/heniq-games` を接続し、ビルドコマンド `python3 tools/build.py --release`・出力ディレクトリ `dist`・環境変数 `PYTHON_VERSION=3.11`（目安）。作成したら教えてほしい（公開 URL が `https://heniq-games.pages.dev` になるか確認する）。
5. 検索エンジンへの掲載（`indexing: true`）：公開と同時に許可してよいか（「テスト公開中」のため、当面は載せない選択もある）。
6. 検証用 `bot.js` をリリースビルドから除外してよいか。

## 5. 判断がそろったあとの手順（私が行う）
`release_date` と `privacy_finalized` を設定 → `--release` でビルド・全テスト → コミット → `heniq-games` を push → （あなたの Pages 作成後）公開 URL で起動・操作・詳細ページ・画像・音声を確認 → HP は別作業：`origin/main` から worktree を作り、最小の変更（掲載＋プライバシーの項）→ HP のビルド・テスト・公開情報の検査 → push → HP の公開 URL でリンクとプレイを確認。**`cms` ブランチの未コミット 3 ファイルは一切触れない。**
