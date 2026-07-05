# kakushin-media — 付加価値ニュース自動メディア

株式会社カクシンの認知・想起向上のための全自動コンテンツパイプライン。
一般ニュースを「付加価値レンズ」で解釈した記事を毎日生成し、Wixブログに自動投稿する。

## アーキテクチャ
```
[毎朝6:30] kakushin-media-daily (スケジュールタスク)
  → sources.md のクエリでWebSearch(ニュース収集)
  → published.jsonl と照合(重複回避)
  → editorial.md のフレームで記事生成
  → Wix Blog API で投稿 (config.mode: draft=下書き / publish=自動公開)
  → published.jsonl に記録

[毎週月曜7:30] kakushin-media-monitor (監視タスク)
  → 直近7日の published.jsonl を検査
  → Wix APIで実際の投稿存在を照合
  → 欠落・エラーを health-report.md に出力、異常があれば通知
```

## 運用モード
- 現在: `draft` — 記事はWixの下書きに入る。公開は人間がワンクリック。
- 品質に納得したら config.json の mode を `publish` に変えるだけで完全自動公開になる。

## 注意
- スケジュールタスクはClaude(このアプリ)が起動している間に実行される。
  閉じていた場合は次回起動時に実行される。
- Wixサイト: Kakushin Corp (siteId: 048ea057-aa11-4067-a02d-50107b3fbdfc)
