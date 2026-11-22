# HENIQ GAMES 運用手順（デプロイの確認・ロールバック・ゲームの追加）

## 構成
- **HENIQ GAMES**（ゲーム配信の中心）：`https://heniq-games.pages.dev/`。GitHub `HENIQDev/heniq-games` の `main` を Cloudflare Pages が自動でビルド（`python3 tools/build.py --release`・出力 `dist`）。
- **HENIQ 公式サイト**（ブランド紹介・会社情報・問い合わせ）：`https://heniq-website.pages.dev/`。GitHub `HENIQDev/heniq-website` の `main` から自動デプロイ。
- 役割は重複させない：**ゲームの一覧・詳細・遊ぶ場所は HENIQ GAMES だけ**。公式 HP の GAMES（メニュー・フッター・ホーム）は HENIQ GAMES へ飛び、`/games/` は転送（`static/_redirects`）。HENIQ GAMES の全ページに「HENIQ 公式サイト」へのリンクがある。

## 公開内容が最新か確かめる（デプロイの確認）
```bash
curl -s https://heniq-games.pages.dev/build-info.json      # commit が GitHub の最新コミットと同じか
curl -s https://heniq-website.pages.dev/build-info.json
git ls-remote https://github.com/HENIQDev/heniq-games.git refs/heads/main
```
`commit` が違えば、デプロイが失敗しているか、止まっている。Cloudflare のダッシュボード（Workers & Pages → 該当プロジェクト → Deployments）で、ビルドログを確認する。

## ロールバック
- **公開内容だけを戻す**（最速）：Cloudflare の Deployments で、以前の成功したデプロイの「Rollback to this deployment」。
- **コードを戻す**：`git revert <コミット>` → push（自動でデプロイ）。履歴を書き換える `reset --force` は使わない。
- 公式 HP の `/games/` の転送を止める：`static/_redirects` の該当行を消して push。

## ゲームを追加する
`docs/GAME_PIPELINE.md`。`python3 tools/new_game.py <id> --title … --genre …` → 9 段階 → `status: published`・`release_date` → `python3 tools/build.py --release`（関門）→ テスト → push。一覧・ジャンル別・feed（`games.json`）は自動で更新される。

## 検索エンジンへの掲載（`catalog/site.json` の `indexing`）
- `false`（現在）：全ページに `noindex`（meta と `X-Robots-Tag`）。**robots.txt は巡回を許可**（止めると noindex が読まれず、URL だけが載る場合があるため。公式 HP と同じ方針）。sitemap は出さない。
- `true`：sitemap・canonical を出し、noindex を外す。**掲載を許可するのは、オーナーの判断**。

## 不具合の切り分け
- 存在しない URL が 200 でトップを返す → `404.html` が公開されていない（デプロイの失敗を疑う）。
- 画像・JS が 404 → `build-info.json` のコミットを確認。
