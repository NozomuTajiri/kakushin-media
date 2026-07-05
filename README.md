# kakushin-media — 付加価値ニュース自動メディア

株式会社カクシンの認知・想起向上のための全自動コンテンツパイプライン。
一般ニュースを「付加価値レンズ」で解釈した記事を毎日生成し、自前の静的サイトとして公開する。

## アーキテクチャ(2026-07-05にWix投稿方式から移行)
```
[毎朝6:44] kakushin-media-daily (スケジュールタスク)
  → prompts/sources.md のクエリでWebSearch(ニュース収集)
  → logs/published.jsonl と照合(重複回避)
  → prompts/editorial.md のフレームで記事Markdown生成 → articles/
  → node site/build.mjs で docs/ にHTML生成(デザインはbuild.mjs内で完結)
  → git commit & push(origin設定済みの場合) → GitHub Pagesで自動公開

[毎週月曜7:46] kakushin-media-monitor (監視タスク)
  → ログ集計・記事実体照合・ビルド検証・git状態・公開サイト照合
  → logs/health-report.md に出力、異常は【要対応】通知
```

## ディレクトリ
- `articles/` — 記事Markdown(frontmatter付き)。**これが一次資産**
- `site/build.mjs` — 静的サイトジェネレーター(Node単体・依存なし)
- `docs/` — ビルド出力(GitHub Pagesの公開ディレクトリ)。手編集しない
- `prompts/` — 編集方針(editorial.md)と収集クエリ(sources.md)
- `logs/` — published.jsonl(投稿記録) / errors.jsonl / health-report.md
- `site.config.json` — サイト名・会社情報・baseUrl

## デプロイ接続(1回だけ必要な手作業)
1. `gh auth login` でGitHubにログイン
2. Claudeに「デプロイ接続して」と言う → リポジトリ作成・push・GitHub Pages有効化・baseUrl設定まで自動
3. 以後は毎朝のタスクがpushするだけで公開される

## 旧Wix方式の残骸
- Kakushin CorpサイトのWixブログに下書き1件(2026-07-05のサンプル記事)とBlogアプリが残っている。不要なら削除可。
