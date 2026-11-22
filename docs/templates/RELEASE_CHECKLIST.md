# 公開の関門チェック：{{title}}

- [ ] ゲームが起動し、操作・終了・リトライが動く（自己テスト：3 画面幅）
- [ ] PC とスマホ幅で確認した（実機は承認後）
- [ ] game.json：status・release_date・data（保存・通信する情報）が正しい
- [ ] store/：card・hero・og の画像、スクリーンショット 3 枚以上、遊び方と特徴の文章
- [ ] 詳細ページが、このゲーム独自のデザインになっている（theme.css）
- [ ] 素材（画像・音・フォント）・ライブラリ・外部コードの出典とライセンスを `ASSET_LICENSES.md` の `## <id>` に記録した（自作か、商用利用できるライセンスのものだけ）
- [ ] `python3 tools/build.py --release` が成功する
- [ ] プライバシーのページの内容をオーナーが確認した（catalog/site.json の privacy_finalized）
- [ ] **オーナーの公開の承認**（push・デプロイは承認後）
