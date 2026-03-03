# PDF to TIFF Converter (Ghostscript Backend)

Ghostscript を利用して PDF を高品質 TIFF（300 DPI）に変換する Web アプリケーションです。

**社内サーバー（オンプレミス / プライベートクラウド）にデプロイして利用する前提**で設計されています。  
外部のクラウドサービスや API には一切依存せず、すべての処理がサーバー内で完結します。

## Features
- **Frontend**: Modern React (Vite) with flat design & glassmorphism.
- **Ghostscript Integration**: Splits PDF into multiple TIFF files (one per page).
- **Auto Color Detection**: Automatically detects if a PDF contains color or is strictly B&W.
- **Manual Overrides**: Force Color or B&W mode.
- **Large PDF Warning**: Alerts users if the PDF exceeds 10 pages.
- **Comparison View**: Side-by-side view (Original PDF vs. TIFF result).
- **Multiple Downloads**: Download individual TIFFs or "Download All" as separate files.

## Prerequisites
- Node.js installed.
- **Ghostscript** installed and available in system PATH (Default: `gswin64c.exe`).
  - If it's not in PATH, edit `backend/.env` and set `GS_PATH` to the full path of the executable.

## How to Run

### Option A: Development Mode
Useful for testing and seeing changes.
1. Run `dev.bat`.
2. Open http://localhost:5173.

### Option B: Production Mode (For Windows Server hosting)
Useful for hosting.
1. Run `prod.bat`.
2. This will:
   - Build the frontend.
   - Start the backend on port 3001.
3. Access at http://localhost:3001 (or your server's IP).

## Project Structure
- `frontend/`: React components.
- `backend/`: Express server + Ghostscript logic.
- `uploads/`: Temporary storage for uploaded PDFs.
- `outputs/`: Storage for converted TIFFs and PNG previews.

## Security

本サービスはセキュリティに配慮した設計となっています。

| 項目 | 内容 |
|---|---|
| **ネットワーク** | 社内プライベートネットワーク上で稼働します。インターネットを介した外部への通信は一切行いません。 |
| **アップロードファイル** | アップロードされた PDF ファイルは、TIFF 変換完了後にサーバーから速やかに自動削除されます。 |
| **変換結果ファイル** | 変換後の TIFF / PNG プレビューファイルは、1時間経過後に自動クリーンアップされます（`MAX_AGE_MS` で調整可能）。 |
| **外部API連携** | 外部の API やクラウドサービスへの接続は一切ありません。すべての処理はローカルサーバー上で完結します。 |

## License

This project is licensed under the [MIT License](./LICENSE).

### Ghostscript のライセンスについて

本プロジェクトは PDF 変換エンジンとして [Ghostscript](https://www.ghostscript.com/) を外部プロセスとして利用しています（同梱・再頒布はしていません）。

Ghostscript のオープンソース版は **AGPL v3** でライセンスされています。  
AGPL の性質上、Ghostscript を組み込んだサービスを**社外（インターネット上）に公開**する場合は、サービス全体のソースコードを AGPL に基づき公開する義務が生じる可能性があります。

- **社内利用のみ**: AGPL オープンソース版をそのままご利用いただけます。
- **外部公開サービスとして提供する場合**: Artifex 社の[商用ライセンス](https://artifex.com/licensing)の取得をご検討ください。
