# PDF to TIFF Converter

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

---

## サーバー構築手順（Windows Server + IIS）

### 1. 前提ソフトウェアのインストール

| ソフトウェア | 用途 | インストール確認コマンド |
|---|---|---|
| **Node.js** (LTS推奨) | バックエンド実行 | `node -v` |
| **Git** | ソースコード取得 | `git --version` |
| **Ghostscript** (64bit) | PDF→TIFF 変換エンジン | `gswin64c --version` |

> Ghostscript が PATH に通っていない場合は、`backend/.env` を作成して `GS_PATH=C:\Program Files\gs\gs10.x\bin\gswin64c.exe` のようにフルパスを指定してください。

### 2. ソースコードの取得と依存関係のインストール

```bat
cd C:\inetpub
git clone https://github.com/masaya-kikuchi-59253/pdf-2-tiff.git
cd pdf-2-tiff

:: ルートの依存関係
npm install

:: バックエンド
cd backend
npm install
cd ..

:: フロントエンドのビルド
cd frontend
npm install
npm run build
cd ..
```

ビルドが完了すると `frontend/dist/` にフロントエンドの静的ファイルが生成されます。

### 3. バックエンド（Node.js）の起動

#### 方法 A: 手動起動（動作確認用）

```bat
prod.bat
```

#### 方法 B: バックグラウンドサービス化（本番推奨）

サーバー再起動時に自動起動させるため、[NSSM](https://nssm.cc/) を使って Windows サービスとして登録します。

```bat
:: NSSM をダウンロード・展開後:
nssm install pdf2tiff "C:\Program Files\nodejs\node.exe"
nssm set pdf2tiff AppParameters "C:\inetpub\pdf-2-tiff\backend\index.js"
nssm set pdf2tiff AppDirectory "C:\inetpub\pdf-2-tiff\backend"
nssm set pdf2tiff AppStdout "C:\inetpub\pdf-2-tiff\logs\service.log"
nssm set pdf2tiff AppStderr "C:\inetpub\pdf-2-tiff\logs\service-error.log"
nssm start pdf2tiff
```

> `C:\inetpub\pdf-2-tiff\logs\` ディレクトリは事前に作成してください。

サービスの操作:
```bat
nssm status pdf2tiff    :: 状態確認
nssm restart pdf2tiff   :: 再起動
nssm stop pdf2tiff      :: 停止
```

### 4. IIS の設定

#### 4-1. 必要な IIS 機能を有効化

「サーバーマネージャー」→「役割と機能の追加」で以下を有効にします:

- **Web サーバー (IIS)** — 基本機能
- **Application Request Routing (ARR)** — リバースプロキシ用（[別途ダウンロード](https://www.iis.net/downloads/microsoft/application-request-routing)）
- **URL Rewrite** — URL 書き換え用（[別途ダウンロード](https://www.iis.net/downloads/microsoft/url-rewrite)）

#### 4-2. ARR のプロキシを有効化

1. IIS マネージャーを開く
2. サーバーノード（ルート）を選択
3. **Application Request Routing Cache** をダブルクリック
4. 右側の **Server Proxy Settings** をクリック
5. **Enable proxy** にチェックを入れて適用

#### 4-3. 仮想ディレクトリ / アプリケーションの作成

1. IIS マネージャーで対象サイト（通常 **Default Web Site**）を右クリック
2. 「**アプリケーションの追加**」を選択
3. 以下を設定:
   - **エイリアス**: `pdf-2-tiff`
   - **物理パス**: `C:\inetpub\pdf-2-tiff\frontend\dist`

#### 4-4. web.config の配置

`frontend/dist/web.config` を以下の内容で作成します（ビルドのたびに `dist/` は再生成されるため、ルートにも保管しておくと便利です）:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <!-- API リクエストをバックエンド (Node.js) にプロキシ -->
        <rule name="API Proxy" stopProcessing="true">
          <match url="^api/(.*)" />
          <action type="Rewrite" url="http://localhost:3001/api/{R:1}" />
        </rule>

        <!-- SPA フォールバック: 静的ファイル以外は index.html へ -->
        <rule name="SPA Fallback" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/pdf-2-tiff/index.html" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
```

### 5. 動作確認

ブラウザで以下にアクセス:

```
http://<サーバー名>/pdf-2-tiff/
```

- 画面が表示されれば **フロントエンド OK**
- PDF をアップロードして変換できれば **バックエンド（API + Ghostscript）OK**

うまくいかない場合のチェックポイント:

| 症状 | 確認箇所 |
|---|---|
| 白画面 | ブラウザ DevTools のコンソール/ネットワークタブで JS の 404 を確認。`vite.config.js` の `base` 設定を確認 |
| API が 502/503 | Node.js バックエンドが起動しているか確認（`nssm status pdf2tiff`） |
| 変換が失敗する | `gswin64c --version` で Ghostscript が動くか確認。`backend/.env` の `GS_PATH` を確認 |
| ファイルの権限エラー | IIS の AppPool ユーザーに `uploads/` `outputs/` への書き込み権限があるか確認 |

---

## アップデート手順

ソースコードの更新を反映する手順:

```bat
cd C:\inetpub\pdf-2-tiff
git pull

:: フロントエンド再ビルド
cd frontend
npm install
npm run build
cd ..

:: web.config を dist に再配置（消えるため）
copy web.config frontend\dist\web.config

:: バックエンド再起動
nssm restart pdf2tiff
```

---

## 開発モード（ローカル）

ローカルで開発・テストする場合:

```bat
dev.bat
```

ブラウザで http://localhost:5173 にアクセス。

---

## Project Structure
- `frontend/` — React (Vite) フロントエンド
- `frontend/dist/` — ビルド済みフロントエンド（本番配信用）
- `backend/` — Express サーバー + Ghostscript 呼び出しロジック
- `backend/uploads/` — アップロードされた PDF の一時保存先（変換後に自動削除）
- `backend/outputs/` — 変換後の TIFF / PNG プレビュー（1時間後に自動クリーンアップ）

## ポート・環境変数

| 変数 | デフォルト値 | 説明 |
|---|---|---|
| `PORT` | `3001` | バックエンドのリッスンポート |
| `GS_PATH` | `gswin64c` | Ghostscript 実行ファイルのパス |

`backend/.env` ファイルで設定できます。

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
