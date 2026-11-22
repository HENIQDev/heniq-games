# ゲーム追加の運用フロー（1 本ずつ、企画から公開準備まで一気通貫）

2026-11-22 の方針：ゲームごとに 9 段階をまとめて完成させる。細かい承認は求めない。**事前承認が要るもの**：既存 HP の変更・本番公開・Git の push・有料サービス・外部サービスの新規登録・重大な設計変更（Git の commit は HENIQ 共通ルールどおり、区切りで確認）。

## 手順
```bash
python3 tools/new_game.py <id> --title "TITLE" --genre casual      # 雛形（status: draft）
python3 tools/build.py && python3 tools/serve.py                    # ローカル確認 http://127.0.0.1:8790/
python3 -m unittest discover -s tests                               # テスト（ビルド検査・自己テスト・画面幅・スクリーンショット）
python3 tools/build.py --release                                    # 公開の関門の確認（published のゲームだけ）
```

| 段階 | 何をする | 置き場所・成果物 |
|---|---|---|
| 1 参考ゲーム調査 | 実際にアクセスして分析（ルール・操作・面白さ・UI・難易度・技術）。コピーしない。実プレイできない時は、何に基づく分析かを書く | `games/<id>/docs/RESEARCH.md` |
| 2 企画・仕様 | ルール・操作・画面・バランスの初期値・アートディレクション・サウンド・保存する情報・テスト項目 | `docs/SPEC.md` |
| 3 実装 | `startGame`（platform/core）の契約で作る。必要な機能だけ使う | `play/` |
| 4 UI・演出・サウンド | 効果音・音楽は自作か権利が明確なもの。出典を記録 | `play/`・`docs/SPEC.md` |
| 5 PC・スマホ対応 | 3 画面幅（375・480・1280）で確認。実機は承認後 | テストの結果 |
| 6 テスト・バランス | 自己テスト・ボット検査・手動確認。調整の記録 | `docs/BALANCE_TEST.md` |
| 7 詳細ページ | **そのゲーム独自のアートディレクション**。`store.json`（文章・色・画像）＋ `theme.css`（見た目は全面的に自由）。必要なら `store/about.html` を丸ごと独自に | `store/` |
| 8 公開準備 | 画像（card・hero・og）・スクリーンショット 3 枚以上・`data` の申告・`release_date` を整え、`--release` の関門を通す | `docs/RELEASE_CHECKLIST.md` |
| 9 完成報告 | 結果・未解決・次の再開地点を `docs/PROGRESS.md` に記録して報告 | |

## 構造（ゲーム 1 本）
```
games/<id>/
├── game.json     共通の情報（kind: web|ios・genre・tags・tagline・summary・status・controls・data など）
├── play/         ゲーム本体（web のみ）→ /<id>/
├── store/        詳細ページの素材 → /<id>/about/
│   ├── store.json   theme（bg・fg・accent・accent2）・遊び方・特徴・世界観・画像・スクリーンショット
│   ├── theme.css    このゲーム専用の自由な CSS
│   ├── art/         card 460×215・hero 1280×720・icon 256・og 1200×630・スクリーンショット
│   └── about.html   （任意）完全に独自の詳細ページ
└── docs/         非公開の資料（dist に出ない）
```

## 自動で検査されること
- `game.json`・`store.json` の項目、id の規則と予約名（platform・genre・privacy・api など）、容量の予算（play／store）。
- `theme` の色のコントラスト（文字と背景 4.5 以上、アクセント 3.0 以上）。
- 外部の資源・インラインのスタイル／スクリプト・`@import` の禁止（`<a href>` の外部リンクは可）。
- 内部リンクの切れ、ストアと詳細ページの横はみ出し（幅 375・1280）、全 web ゲームの自己テスト（起動→開始→操作→終了→リトライ→同じ種で同じ結果）。
- 公開の関門（`--release`）：release_date・card/hero/og 画像・遊び方と特徴の文章・スクリーンショット 3 枚以上・`data`（web）・`app_store_url`（ios）・プライバシーの確認（`catalog/site.json` の `privacy_finalized`）。

## 公開（承認制）
`status` を `published` にし、`catalog/site.json` の `indexing` を `true` にするのは、**公開の承認を受けてから**。そのあと `git push` → Cloudflare Pages（`heniq-games`）で自動デプロイ。公開後は、トップ・詳細・ゲーム本体・ヘッダー・robots を確認する。

## iOS ゲームの扱い
`kind: ios`。`/<id>/` は `/<id>/about/` へ転送。カードと詳細ページの導線は、`app_store_url` が設定されていれば App Store、未設定なら詳細ページ（COMING SOON 表示）。ブラウザゲームには WEB、iOS には iOS のバッジが付く。

## 公式 HP との連携（H1。別作業・承認制）
HP のデザインは変えない。HP の GAMES から HENIQ GAMES へ誘導する変更は、HP の未コミット変更とブランチの状態を保護したうえで、別作業として行う。それまで HP は一切触らない。
