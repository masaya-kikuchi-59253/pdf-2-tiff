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
| **[NSSM](https://nssm.cc/)** | バックエンドの自動起動（Windows サービス化） | `nssm version` |

> Ghostscript が PATH に通っていない場合は、`backend/.env` を作成して `GS_PATH=C:\Program Files\gs\gs10.x\bin\gswin64c.exe` のようにフルパスを指定してください。

### 2. ソースコードの取得と依存関係のインストール

```bat
cd C:\
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
**初回のみ**以下を実行してください。登録後はサーバー再起動時にバックエンドが自動で起動します。

```bat
:: NSSM をダウンロード・展開後:
nssm install pdf2tiff "C:\Program Files\nodejs\node.exe"
nssm set pdf2tiff AppParameters "C:\pdf-2-tiff\backend\index.js"
nssm set pdf2tiff AppDirectory "C:\pdf-2-tiff\backend"
nssm set pdf2tiff AppStdout "C:\pdf-2-tiff\logs\service.log"
nssm set pdf2tiff AppStderr "C:\pdf-2-tiff\logs\service-error.log"
nssm start pdf2tiff
```

> `C:\pdf-2-tiff\logs\` ディレクトリは事前に作成してください。

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
   - **物理パス**: `C:\pdf-2-tiff\frontend\dist`

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

## サーバー再起動時

NSSM でサービス登録済み（手順 3-B）であれば、**サーバー再起動後にバックエンドは自動起動します**。手動での操作は不要です。

再起動後にうまく動かない場合:
```bat
nssm status pdf2tiff    :: サービスが Running か確認
nssm restart pdf2tiff   :: 必要に応じて再起動
```

---

## アップデート手順

ソースコードの更新を反映する手順:

```bat
cd C:\pdf-2-tiff
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

## プリセット機能（任意）

頻繁に使う変換オプションの組み合わせを、サーバー管理者が「プリセット」として登録できます。
各サーバー（部署・拠点）ごとに固有のワークフローを反映できるようにするため、プリセット定義はリポジトリには含めず、サーバーローカルの YAML ファイルで管理します。

### セットアップ

```bat
:: 同梱のサンプルをコピーして編集
copy backend\presets.example.yaml backend\presets.yaml
notepad backend\presets.yaml
```

`backend/presets.yaml` を作成・編集すると、UI 上部に「プリセット」ドロップダウンが表示されます。
ファイルを置かない場合はドロップダウンは出ず、これまで通り全オプション自由設定の UI になります。
編集後の再起動は不要です（リクエストのたびに読み直します）。

### YAML フォーマット概要

```yaml
# defaultPreset: standard         # 起動時の選択プリセット ID（省略時は最初の visible / '__custom__' でカスタム起動）
defaultEditable: [mode, suffix]   # プリセット選択中でも編集可とするフィールドのデフォルト

presets:
  - id: standard                  # 内部 ID（URL パラメータでも使用）
    label: 標準スキャン (400 DPI 白黒)  # UI 表示名（自由に命名可能）
    # hidden: false               # true にすると UI に出ない（?preset=<id> でのみアクセス可）
    # editable: [mode, suffix]    # このプリセット固有の編集可能フィールド（省略時 defaultEditable）
    options:
      mode: bw                    # auto | bw | color
      dpi: 400                    # 200 | 300 | 400 | 600
      split: true
      digitOnly: true
      suffixEnabled: false
      suffix: ''
      pageAtEnd: true
      extension: tiff             # tiff | tif
```

完全な例は `backend/presets.example.yaml` を参照してください。

### 動作仕様

- **デフォルト編集可フィールド**: カラー設定 (`mode`) と suffix テキスト (`suffix`) のみ。それ以外はプリセット選択中はロック（disabled 表示）されます。
- **編集可フィールドのカスタマイズ**: 各プリセットに `editable: [...]` を書くとそのプリセット固有の許可リストになります。`editable: '*'` で全フィールド編集可（カスタム同様の自由度になりますが、初期値は yaml で指定可能）。
- **隠しプリセット**: `hidden: true` のプリセットは UI に出ませんが、`?preset=<id>` を URL に付けて直接アクセス可能です。特定の URL でブックマーク運用する用途に。
- **カスタムモード**: 末尾の「カスタム（自由設定）」を選ぶと全オプションが編集可能になります。プリセット ↔ カスタムを切り替えても現在表示中の値は維持されます（プリセットの値で上書きされるのは「プリセットを選択した瞬間」のみ）。
- **初期表示**: `defaultPreset` で指定したプリセット → URL の `?preset=<id>` → 最初の visible プリセット、の優先順で初期選択されます。`defaultPreset: __custom__` でカスタムモード起動。
- **UI 表示形式の自動切替**: visible プリセット数が **5 個以下ならラジオボタン**（一目で選択肢が見える）、**6 個以上なら dropdown**（省スペース）に自動で切り替わります。

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
