# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-05-25

初回リリース。Ghostscript を用いた PDF → TIFF 変換 Web アプリ。

### Added

- PDF アップロード → Ghostscript による TIFF 変換（200 / 300 / 400 / 600 DPI）
- カラー/白黒の自動判定（inkcov ベース、CMY 10% 閾値）と手動上書き
- 変換結果のページごと分割 / 1 ファイル統合の切り替え
- ファイル名カスタマイズ（数字+`_` のみ抽出、suffix 追加、ページ番号位置、`.tif`/`.tiff` 拡張子）
- サーバー固有プリセット機能（`backend/presets.yaml` で部署・拠点ごとのワークフローを定義可能）
- TIFF / PDF の左右比較ビュー
- 10 ページ超 PDF の警告ダイアログ
- 変換結果の **ZIP 一括ダウンロード**（保存ダイアログ 1 回で全 TIFF を取得）
- 個別ファイルの直接ダウンロード
- 日本語ファイル名対応（multer Latin1 → UTF-8 復元、Ghostscript には ASCII パスで渡す）
- IIS + ARR/URL Rewrite によるサブディレクトリ配信対応（`/pdf-2-tiff/`）
- ビルド時に `web.config` を `dist/` に自動コピーする Vite プラグイン
- NSSM による Windows サービス化手順を README に整備
- フッターにアプリバージョン表示

### Security

- アップロード PDF は変換完了後に自動削除
- 変換結果 TIFF / PNG は 1 時間後に自動クリーンアップ
- 外部 API / クラウドサービスへの送信なし（社内ネットワーク内で完結）

[1.0.0]: https://github.com/masaya-kikuchi-59253/pdf-2-tiff/releases/tag/v1.0.0
