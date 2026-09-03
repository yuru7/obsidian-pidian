# Pidian アーキテクチャ

AI エージェントがこのリポジトリを読み、実装するときの正本。Obsidian API の調べ方はルートの [AGENTS.md](../AGENTS.md)。ビルド・テスト・リリース手順は [CONTRIBUTING.md](../CONTRIBUTING.md)。コードチェック警告の書き方は [CODE_CHECK_WARNINGS.md](CODE_CHECK_WARNINGS.md)。

実装前に **「守ること」** と **「変更レシピ」** を読む。推測で Pi や Obsidian の内部 API を足さない。

---

## これは何か

Obsidian Desktop のサイドバーから [Pi](https://github.com/badlogic/pi-mono) エージェントと会話し、開いているノートの参照・編集、Vault 検索、Web 検索を行うプラグイン。

| 項目 | 値 |
| --- | --- |
| プラグイン ID | `pidian` |
| エントリ | `src/main.ts` → バンドル `main.js` |
| 対象 | Desktop のみ（`manifest.json` の `isDesktopOnly: true`） |
| エンジン | `@earendil-works/pi-coding-agent`（Pi Adapter に閉じる） |
| UI | Obsidian `ItemView` + React 19（`src/ui/`） |

やらないこと: RAG / 埋め込み検索、シェル、MCP、モバイル、`.obsidian/` やセッションファイルの操作。

---

## 守ること（非交渉）

1. **依存は内側へだけ。** UI → Application / Domain → ポート（interface）→ Adapter。逆方向に型や実装を漏らさない。
2. **Pi 固有 API は `src/infrastructure/pi/` の外へ出さない。** `defineTool` / `createAgentSession` / `ModelRuntime` などを `src/tools/` や `src/ui/` や Domain から import しない。
3. **ノート操作は Obsidian API だけ。** Pi 標準のファイルツール・シェル・`node:fs` で Vault を触らない。
4. **編集は次の経路だけ。** Permission → revision 照合 → 一意な exact patch → アクティブ Markdown editor の `transaction` → Obsidian Undo。
5. **セッションは Pidian 形式だけ保存する。** Pi の session/event オブジェクトをシリアライズしない。未知 `version` は失敗させる。
6. **Provider 分岐を本体に増やさない。** Pi catalog のモデルは `PiModelCatalog`。OpenAI Compatible だけが Settings の custom provider。
7. **非公開 Obsidian API や DOM 内部構造に依存する場合は、公開 API では無理な理由と互換性リスクをコメントに残す。**

---

## レイヤとディレクトリ

```text
src/main.ts                 合成ルート。Plugin lifecycle、配線、command、view
src/domain/                 型・ポート・純粋な値。Obsidian / Pi を知らない
  agent/                    AgentEngine, AgentSession, AgentEvent, ModelCatalog
  notes/                    NoteRepository, NoteEditor, ContextSnapshot, ImageRepository
  permissions/              Permission, ToolCategory, PermissionPrompter
  sessions/                 PidianSession, SessionRepository
  tools/                    PidianTool（Pi 非依存）
  workspace/                WorkspaceNavigator
  search/                   SearchProvider, SearchErrors
  fetch/                    FetchResult, FetchErrors
src/application/            ユースケース。ポートに依存し、具象 Adapter を知らない（例外あり）
src/infrastructure/
  pi/                       Pi SDK の Adapter・stub・バンドル入口
  obsidian/                 Vault / Editor / View の Adapter
  fake/                     テスト用 FakeAgentEngine
  fetch/                    SSRF、HTML 抽出、Static/Browser fetcher、工場
  search/                   Firecrawl、DuckDuckGo、SearchService 工場
  http/                     cors 回避用の Web アクセス補助
src/tools/                  PidianTool 実装。Pi の defineTool は書かない
src/ui/                     サイドバー React。plugin / AgentService を購読する
src/settings/               設定スキーマと SettingTab
src/i18n/                   en がキーの正本。ja は同じキーを全部埋める
```

依存の向き:

```text
Obsidian UI (src/ui, src/settings, src/main.ts)
    │
    ▼
Application / Domain
    │
    ├── AgentEngine ──────────► PiAgentAdapter ──► pi-coding-agent
    ├── NoteRepository ───────► ObsidianNoteRepository
    ├── ImageRepository ──────► ObsidianImageRepository
    ├── NoteEditor ───────────► ObsidianNoteEditor
    ├── WorkspaceNavigator ───► ObsidianWorkspaceNavigator
    ├── SessionRepository ────► ObsidianSessionRepository（Vault の pidian/sessions/）
    ├── PermissionPrompter ───► ObsidianPermissionPrompter
    └── Search / Fetch ───────► Firecrawl / DuckDuckGo / FetchOrchestrator（StaticFetcher + 必要時 BrowserFetcher）
```

**例外:** `application/fetch/FetchOrchestrator.ts` は HTML 抽出を infrastructure から直接 import している。新規でも、配線は `infrastructure/*/create*.ts` の工場に寄せ、Application が具象を増やさないようにする。

テストは対象の隣に `*.test.ts` を置く。Vitest。Obsidian `ItemView` と Pi SDK 内部はユニットテストしない。Agent のテストは `FakeAgentEngine` を使う。

---

## 起動と配線

`PidianPlugin.onload` の順:

1. `loadSettings()`（`bindConfigDir` / `bindPluginDirectory`）
2. Setting tab
3. `initServices()`（失敗しても View / ribbon / command は登録する）
4. `PidianView`（`VIEW_TYPE_PIDIAN = "pidian-view"`）
5. ribbon と command（`open`, `new-chat`）。開く処理は `ensureSideLeaf(VIEW_TYPE_PIDIAN, "right")`。ユーザー操作では続けて Composer にフォーカスする
6. layout ready 後に `bootstrap()`（既定モデル解決、新規チャット、古いセッション掃除）。サイドバーはここで開かない
7. 初回有効化のみ `onUserEnable` でサイドバーを開く（フォーカスは移さない）。更新・再起動はワークスペースが leaf を復元する

`initServices()` が作るもの:

| 役割 | 具象 |
| --- | --- |
| notes | `ObsidianNoteRepository` |
| images | `ObsidianImageRepository` |
| editor | `ObsidianNoteEditor` |
| workspace | `ObsidianWorkspaceNavigator` |
| sessions | `SessionService` + `ObsidianSessionRepository` |
| tracker | `ReadRevisionTracker`（プロセス内。永続化しない） |
| permissions | `PermissionService` + `ObsidianPermissionPrompter` |
| search / fetch | `createSearchService` / `createFetchService`（どちらも `corsFreeFetch`） |
| agent | `PiAgentAdapter` → `AgentService` |
| tools | セッション ID ごとに `createPidianTools(...)` |

UI は `plugin.agentService.subscribe` と `plugin.subscribeSettings` で再描画する。エディタのカーソル/選択は `editorContextExtension` が `subscribeEditorContext` を叩く。

非フォーカス時の選択ハイライトは一時回避。Obsidian / CodeMirror はエディタがフォーカスを失うと選択を描かない（Composer にフォーカスしたときなど）。`unfocusedSelectionHighlight` が現在の非空選択を mark decoration で塗る。本体が同じ描画をするようになったら、この extension・テスト・`styles.css` の `.pidian-unfocused-selection`・`main.ts` の `registerEditorExtension` をまとめて消す。

---

## 会話の流れ

```text
Composer
  → AgentService.send(text)
      → 未作成なら AgentSession を作る（開いただけでは作らない）。クエリしたセッションを LRU 最大 3 件で保持
      → ContextService.snapshot()（現在ファイルの path。MarkdownView なら 1-based 行範囲。テキスト選択中なら列位置も。Canvas、PNG/JPEG/WebP、MarkdownView ではない .md（Excalidraw など）は path のみ。本文・画像バイトは入れない）
      → ユーザー発言 + 空の assistant を PidianSession に追加して保存
      → AgentSession.prompt({ text: formatAgentPrompt(...), context })
          → PiAgentAdapter（Pi イベント）
              → PiEventMapper → AgentEvent
                  → AgentService が最新 assistant を更新して notify
                      → Chat がストリーム表示
  → 送信中は停止ボタン、または Pidian ペインがフォーカスかつ Composer が空なら Esc で abort。Composer のプレースホルダは「Esc で停止」
```

ユーザーメッセージをクリックすると同じセッション内で編集再送信できる。確定すると `AgentService.editAndResend` が当該メッセージ以降を削除し（1つ前の会話まで保持）、Agent を作り直してから `send` する。Esc は編集キャンセル。送信キーは Composer と同じ（Enter または Ctrl+Enter）。

```text
ユーザーメッセージをクリック
  → 本文が textarea（1〜3行。超過分はスクロール）
  → Enter / Ctrl+Enter / 送信ボタン
      → AgentService.editAndResend(messageId, text)
          → SessionService.truncateBefore
          → Agent を残った会話で作り直す
          → AgentService.send(text)
  → Esc でフォーカスを外して編集キャンセル
```

`AgentEvent`（`src/domain/agent/AgentEvent.ts`）だけが UI / Application のイベント面:

- `text_delta` / `thinking_delta` / `thinking_start` / `thinking_end`
- `tool_started` / `tool_completed`
- `turn_completed`（token usage）
- `compaction_start` / `compacted` / `compaction_failed`
- `error`

`AgentSession` の操作は `prompt` / `abort` / `subscribe` / `dispose` のみ。

プロンプト本文の形（`formatAgentPrompt`）:

```text
<ISO 8601 local timestamp>
<path> <LINE_RANGE>
User: <user text>
```

時刻は `createdAt`（UTC）から、送信時のマシンローカルオフセット付き ISO 8601（秒まで。例 `2026-08-31T17:31:00+09:00`）。`LINE_RANGE` は Markdown エディタのカーソルなら `L12`、テキスト選択なら `L3:C4-L5:C3`（1-based。開始列は inclusive、終了列は exclusive でエディタの from/to に一致）。列が無い古い選択は `L13-L15`。Canvas、PNG/JPEG/WebP、Excalidraw などカーソルが取れないファイルは path のみ。ファイルが無いときは timestamp と `User: <user text>` のみ。

ユーザー発言の `text` は本文だけ保存する。ヘッダ（時刻・path）は保存しない。送信時の `ContextSnapshot`（path と、Markdown エディタなら行範囲。テキスト選択なら列位置も。本文は入れない）はユーザーメッセージの任意フィールド `context` に残す。再開・モデル変更で Pi を作り直すとき、`toConversation` が `formatAgentPrompt` で当時のヘッダを復元する。`context` が無い古い保存は timestamp と `User: <user text>` のみ。

ファイル本文はコンテキストに載せない。エージェントは `read_note` でノートを読む。Vision モデルでは `read_image` で PNG/JPEG/WebP を読む。システムプロンプトは `pidianSystemPrompt`（`src/infrastructure/pi/PiCredentials.ts`）。Vision でないときは `read_image` の説明を出さない。Vault の `pidian/AGENTS.md`（プラグインフォルダ設定に追随）は任意の追加指示。

---

## ツール

実装は `src/tools/`。Domain 型は `src/domain/tools/PidianTool.ts`。Pi への変換は `src/infrastructure/pi/PiToolAdapter.ts` だけ。

| name | 権限 | 役割 |
| --- | --- | --- |
| `read_note` | read | `.md` / `.canvas` を行範囲で読む。任意で開始/終了列。前後 50 文字を `beforeContext` / `afterContext` で返す。revision を返す。`ReadRevisionTracker` に記録。Canvas は offset 1 から |
| `read_image` | read | PNG / JPEG / WebP を読む。このターンだけ image ブロックを Pi に付ける。セッション jsonl には path のテキストだけ残す。復元時は付け直さない。Pi の `model.input` に `image` が無いときは `customTools` からもシステムプロンプトからも外す |
| `search_notes` | read | `.md` / `.canvas` のファイル名 + 本文検索。`AGENTS.md` と制限パスは除外 |
| `list_files` | read | 直下のみ。再帰しない。`""` / `"/"` が Vault ルート。任意の `glob` は直下の name に `*` で絞る（`**` とパス区切りは拒否） |
| `open_file` | read | 開いてアクティブにする。未オープンなら開く |
| `workspace_tabs` | read | タブ一覧。`tabId` または `path` でフォーカス |
| `web_search` | webSearch | Firecrawl（既定）→ DuckDuckGo。結果に `provider` を含める。Pi / Obsidian に依存しない |
| `fetch_url` | webSearch | SSRF ガード付き取得。HTML は Markdown 化。静的取得で JS 描画と判定したらローカルの隠し BrowserWindow にフォールバック。ページ本文を外部サービスへ送らない |
| `create_note` | create | Vault API で作成 |
| `edit_markdown` | edit | `.md` だけ。下記の編集経路 |
| `delete_note` | delete | `fileManager.trashFile`（Obsidian のゴミ箱設定に従う） |

Pi 起動時は `noTools: "builtin"` で標準ツールを切り、`customTools` に上記だけを渡す。`read_image` は `toolsVisibleToModel` で、そのセッションのモデルが画像入力を持つときだけ残す。

### ツールを足す

1. `src/tools/FooTool.ts` に `PidianTool` を実装する。パスは `assertSafeNotePath`。読む・検索する対象は `assertNoteFilePath`（`.md` / `.canvas`）。画像は `assertImageFilePath`（`.png` / `.jpg` / `.jpeg` / `.webp`）。Markdown の編集は `assertMarkdownFilePath`。権限は `PermissionService.authorize`。
2. 新しい権限カテゴリが必要なら `ToolCategory` と Settings の `permissions` と i18n を同時に足す。
3. `createPidianTools()` に登録する。
4. 隣に `*.test.ts` を書く。Pi の型や `defineTool` は tools 配下に書かない。
5. エージェント向け説明はツールの `description` と、必要なら `pidianSystemPrompt` を更新する。

---

## 権限

`Permission = "allow" | "ask" | "deny"`。カテゴリは `read | edit | create | delete | webSearch`。

既定（`DEFAULT_SETTINGS.permissions`）:

- read: allow
- edit: ask
- create / delete / webSearch: deny

`PermissionService.authorize` が解釈する。確認 UI は `PermissionPrompter`（`ObsidianPermissionPrompter`）の後ろ。Adapter に確認ダイアログを置かない。拒否はそのツール呼び出しだけ失敗し、会話は続ける。

---

## 編集・Undo・revision

```text
read_note
  → tracker.recordRead(sessionId, path, sha256)
edit_markdown
  → assertMarkdownFilePath（`.md` のみ）
  → tracker.requireRead（未読なら失敗）
  → 再読して revision が lastRead かつ引数と一致すること
  → applyReplacementsToText（oldText は一意。空ノートだけ oldText="" を許可）
  → editor.requireActive（非アクティブなら open_file / workspace_tabs を先に要求）
  → Permission ask（diff を details に載せる）
  → editor.applyReplacements → Editor.transaction
  → tracker を新 revision で更新
```

`ObsidianNoteEditor` は **アクティブな Markdown editor にだけ** transaction を書く。非アクティブノートは開いてから編集する。Private API に依存しない。Undo は Obsidian 標準。新規作成ノートは Undo できない。

revision は本文の SHA-256（`src/application/revision.ts`）。トラッカーはメモリのみ。セッションをまたがない。

---

## パス制限

`src/application/notePath.ts` が制限パスの唯一の判定場所。ノートとして読む・検索する対象（`.md` / `.canvas`）は `src/application/noteFile.ts`。ツールも Repository もこれを通す。

触ってはいけない:

- Vault の config フォルダ（通常 `.obsidian/`）。`Vault#configDir` を `bindConfigDir` している
- セッションディレクトリ（既定 `pidian/sessions/`）
- パスの `..` / `.`、空パス

検索からは上記に加え `pidian/AGENTS.md` も除外する。プラグインフォルダ名は Settings の `pluginDirectory`（既定 `pidian`）。config 配下には置けない。

---

## セッション永続化

保存先: `{pluginDirectory}/sessions/{createdAt}_{id}.jsonl.md`（または `.jsonl`）。1行目がセッション、以降がメッセージ。インデントしない。既存の `.json.md` / `.json` も読む。既定は `.jsonl.md`。

```ts
interface PidianSession {
  version: 1;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  provider: string;
  model: string;
  thinkingLevel?: string;
  forkedMessageCount?: number;
  compaction?: {
    summary: string;
    firstKeptMessageId: string;
    createdAt: string;
    tokensBefore?: number;
  };
  messages: PidianMessage[];
}
```

- パースは `migratePidianSession`。`version !== 1` は throw。フィールド追加時は後方互換を崩さないか、version を上げて migration を足す。
- ユーザーメッセージの任意 `context` は送信時のファイル位置。Markdown エディタなら行範囲、テキスト選択なら列位置も。Canvas・PNG/JPEG/WebP・MarkdownView ではない `.md` は path のみ。チャットのメッセージには出さず、コンポーザ上のコンテキスト表示と再開時の `formatAgentPrompt` 用。無い・不正なら無視する。時刻ヘッダは `createdAt` から組み立て、保存 `text` には含めない。
- ツール結果の画像バイトはセッションに書かない。`PiEventMapper` が text だけを `toolCall.result` に残す。再開・モデル変更で Pi を作り直したあとは path の履歴だけ。もう一度見るときは `read_image` する。
- アシスタントの `workedMs` は各 Work 区間が閉じるまでの時間。思考→ツール→思考は同じ Work に時系列の `items` として残し、`thinking_end` だけでは閉じない。本文が出たあと、思考 delta が途切れたとき、またはターン完了で閉じる。思考中の本文は Work の直下へ随時出す。空白だけの delta では区切らない。`blocks` が無い古い保存データは思考・ツールを1つの WorkLog にまとめる。
- 再開は `PidianSession → AgentConversation → PiAgentAdapter`。ユーザー本文は `formatAgentPrompt` でヘッダ付きに戻す。Pi 固有オブジェクトは保存しない。会話は Pi の `SessionManager` に全文を載せ、`compaction` があればその境界で要約エントリを足してから `createAgentSession` する。LLM 入力は SessionManager が組み直した要約 + 残したメッセージ。画面と `messages` は全文のまま。
- プロセス内の Pi `AgentSession`（`SessionManager.inMemory()`）は、クエリを投げたセッションだけ最大 3 件を LRU で保持する。開いただけ・新規チャットだけでは枠に入らない。4 件目のクエリで最も長くクエリしていない枠を `dispose` する。切替時は生成中なら abort し、枠にあれば Agent は残す。ディスク上のセッションファイルは消さない。
- Pi の自動 compaction が走ったら `compaction` を上書き保存する。fork は分岐点より前のチェックポイントだけコピーする。
- list は JSONL のヘッダと最初の user メッセージだけパースし、ファイル読みは並列化する。破損ファイルはスキップする。
- 常駐の一覧キャッシュは最大 300 件。`firstQuery` は 200 字で切る。起動時（cleanup のあと）に温め、`save` / `delete` で 1 件更新する。メニューの「セッションを全件読み込む」は開いている間だけ全件を持ち、閉じたら捨てる。
- 自動削除は `SessionCleanupService`。保持日数と保持数上限はそれぞれ既定オフ。起動時のみ。両方オンならいずれかの条件を超えたセッションを消す。アクティブ session id は消さない。
- fork は指定メッセージまでをコピーした新セッション。`forkedMessageCount` で UI が分岐点を出す。
- 編集再送信は同じセッションで、対象ユーザーメッセージより前まで残して Agent を作り直してから `send` する。

---

## 認証とモデル

優先順位: **Pidian 設定の API キー > プラグイン data の OAuth > 環境変数**。`~/.pi/agent/auth.json` は読まない（`PidianCredentialStore` → `InMemoryCredentialStore`）。

- 既知プロバイダの env 名は `src/infrastructure/pi/PiCredentials.ts` の `PROVIDER_ENV_VARS`。本体にプロバイダ分岐を足さない。
- サブスク OAuth は `src/application/subscriptionProviders.ts` の `ENABLED_SUBSCRIPTION_PROVIDERS` が唯一の有効化リスト。いまは `openai-codex` だけ。足すときはこの配列に id と表示名を足す。ログイン実装は Pi の `ModelRuntime.login("oauth")` に任せ、プロバイダ専用フローを本体に書かない。`browser` 選択肢があればそれを選ぶ。Pi の OAuth 本体は `registerBundledOAuth.ts` で静的登録する（動的 `import("./openai-codex.js")` は Obsidian では失敗する）。
- トークンは `Settings.oauthCredentials`（Plugin.saveData）。Pi の refresh は Store の `modify` 経由で同じ場所へ書き戻す。
- 実行時キーは `setRuntimeApiKey`。OAuth だけのプロバイダには上書きをかけない（`credentialRuntimePlan`）。
- Custom OpenAI Compatible は Settings の `customProviders`。`ModelRuntime.registerProvider`（api: `openai-completions`）。env は使わない。各モデルの `supportsImages`（既定オフ）が true のときだけ Pi の `input` を `["text", "image"]` にする。カタログモデルは Pi の `model.input` を使う。どちらも `CatalogModel.supportsImages` に載せ、UI のモデル選択が Vision 対応アイコンを出す。
- モデル一覧は `PiModelCatalog`。動的カタログは `{plugin install dir}/dynamicModels.json`。無い、または 1 日以上古いときだけ `runtime.refresh({ allowNetwork: true, force: true })`。
- 接続設定（キー・OAuth の有無・custom provider・Vision フラグ）が変わったら `AgentService.reloadModel()`。削除された provider は `reconcileModelSelection` で落とす。
- thinking は `src/domain/agent/thinkingLevel.ts`。モデルが支持する集合へ clamp する。

---

## Pi Adapter とバンドル

Pi を Obsidian の eval 環境で動かすための隔離が `src/infrastructure/pi/` と `esbuild.config.mjs`。

| ファイル | 役割 |
| --- | --- |
| `PiAgentAdapter.ts` | `AgentEngine` + `SubscriptionAuth` 実装。`SessionManager.inMemory()`、再開時は会話を SessionManager に載せる。`noTools: "builtin"` |
| `registerBundledOAuth.ts` | Pi の OAuth を静的登録。Obsidian は `import("./openai-codex.js")` を `app://obsidian.md/` から取れない |
| `piCodingAgentSdk.ts` | パッケージ barrel の代わり。CLI / self-update をバンドルに入れない |
| `PiEventMapper.ts` | Pi イベント → `AgentEvent` |
| `PiToolAdapter.ts` | `PidianTool` → `defineTool`。`read_image` のバイトは image ブロックにし、セッションへは出さない。非 Vision なら image ブロックを付けない |
| `visionModel.ts` | `model.input` に `image` があるか。無いなら `read_image` をツール一覧から外す |
| `prepareToolImage.ts` | インライン上限。Photon はスタブなので、超過分だけ Canvas で縮小 |
| `PidianResourceLoader.ts` | システムプロンプトと AGENTS.md だけ。拡張ローダは使わない |
| `corsFreeFetch.ts` | Chromium `fetch` の CORS を避けるため Node `http`/`https` |
| `customRequestBody.ts` | custom model の extra JSON body |
| `stubs/` | jiti, TUI, bash, child_process, fs などを空実装に置換 |

esbuild:

- `obsidian` / CodeMirror / `electron` / Node builtin は external
- `fs` / `child_process` / `undici` は stub へ alias
- production ビルド後に `assertBundleSurface()`。ZIP 展開、`child_process`、`os.hostname`、動的 `<script>` などが残っていたら失敗
- `import.meta.url` は仮想パス。Pi が Electron asar を walk しないようにする

Pi のモジュール解決や stub を足すときは、バンドルゲートが通ることと、Vault へ `node:fs` が届かないことを確認する。

---

## UI

| ファイル | 役割 |
| --- | --- |
| `PidianView.tsx` | `ItemView`。React root。`View.scope` でペインフォーカス時のホットキー |
| `PidianApp.tsx` | ヘッダ、Chat、Composer、ModelSelector、SessionSelector |
| `OpenActiveSessionButton.tsx` | 開いているファイルがセッションファイルなら「新しいチャット」の左に復元ボタン。不正形式はエラーツールチップ |
| `Chat.tsx` / `Message.tsx` / `UserMessageEditor.tsx` / `WorkLog.tsx` / `ToolCall.tsx` / `Thinking.tsx` | ストリーム表示。思考とツールは1つの WorkLog にまとめ、中は思考・ツールを時系列のまま出す。思考中でも本文は直下へ出せる。ユーザーメッセージのクリックで編集再送信 |
| `Composer.tsx` | 入力。`subscribeComposerFocus` でフォーカス。送信中かつ空なら Esc で abort、プレースホルダに停止案内 |
| `Markdown.tsx` | チャット内 Markdown。`[[wiki]]` はメモアイコン付きで、クリックは既存エディタタブを優先して開く |
| `PidianSettingTab.ts` | 設定 UI（React ではない） |

スタイルはルート `styles.css`。クラスは `pidian-` 接頭辞。アイコン ID は `PIDIAN_ICON_ID`。

UI は `AgentService` と `plugin.settings` を読む。Pi 型を import しない。モデル一覧は `plugin.modelCatalog`。

チャットの内部リンクは `MarkdownRenderer` が `a.internal-link` に描画するが、カスタム `ItemView` ではクリックが付かない。`Markdown.tsx` がクリックを受け、`WorkspaceNavigator.openFile` で開く。既存タブの検索は `leaf.getViewState().state.file`（非表示タブは `DeferredView` のため `instanceof MarkdownView` は使わない）。未オープンなら root split に新しいエディタタブを開く。`openLinkText` は使わない（アクティブなサイドバー leaf を置換しうる）。

---

## 設定

スキーマは `src/settings/Settings.ts` の `PidianSettings`。`mergeSettings` がロード時の正規化。廃止キー（`maxEditableNotes`, `includeSelectionContext`）はここで捨てる。

保存は `Plugin.saveData`。API キーはプラグイン data。Vault のノートには書かない。

設定を足すとき:

1. `PidianSettings` と `DEFAULT_SETTINGS` と `mergeSettings`
2. `PidianSettingTab.ts` の該当タブ
3. `src/i18n/en.ts` にキー追加 → `ja.ts` も同じキーを埋める（型が `keyof typeof en`）
4. 接続に関わる値なら `connectionConfigFingerprint` も見る

---

## i18n

- `t("key")` / `t("key", { var })`。プレースホルダは `{name}`。
- ロケールは `obsidian.getLanguage()`。未対応は `en`。
- 新しい文言は `en.ts` が先。`ja.ts` を空にしない。

---

## Web 検索と fetch

検索は Pi にも Obsidian にも依存しない。`corsFreeFetch` を渡す。

- 検索: `FirecrawlSearchProvider`（API キー任意。未設定なら Keyless）→ 失敗時 `DuckDuckGoSearchProvider` → `SearchService`。返却テキストに `Provider: <id>` を含める
- 取得: `FetchOrchestrator`（既定 `auto`）
  - `StaticFetcher`（`corsFreeFetch` + gzip/deflate/br 展開 + `SsrfGuard`）→ `ContentExtractor`（Readability / Defuddle / Turndown）
  - 静的 HTML が `javascript-required` のときだけ `BrowserFetcher`（Obsidian Desktop の Electron `BrowserWindow`、`show: false`）。描画後の HTML も同じ `ContentExtractor` に通す。HTTP エラーや 404 ではフォールバックしない
  - ページ本文を Firecrawl 等の外部サービスへ送らない
- どちらも権限カテゴリは `webSearch`

`BrowserWindow` は公開 Obsidian API では作れない。プラグインはレンダラで動くため `require("electron").remote.BrowserWindow`（無ければ `BrowserWindow`）を使う。Electron / Obsidian の更新で `remote` が変わる互換性リスクがある。

---

## テストの厚みを置く場所

`CONTRIBUTING.md` と同じ。特に次を壊さない:

- `CredentialResolver`
- サブスク OAuth の Store / `ENABLED_SUBSCRIPTION_PROVIDERS`
- `PermissionService`
- `ContextService`
- `SessionCleanupService` / `sessionSerialization` / migration / compaction checkpoint
- `AgentService` の in-memory LRU（クエリで枠に入る。開いただけでは入らない。4 件目で最古を dispose）
- `PiEventMapper`
- `revision` / `replacements`
- `notePath`（制限パス）
- `imageFile`（PNG / JPEG / WebP）
- 各 Tool の失敗系（未読 edit、非アクティブ edit、deny、SSRF）

実行: `pnpm test`。環境は node。`vitest.setup.ts` が `window` を補う。

---

## よくある変更の置き場

| やりたいこと | 触る場所 | 触らない場所 |
| --- | --- | --- |
| ツール追加 | `src/tools/`, `createPidianTools` | `infrastructure/pi` の `defineTool` 直書き、Pi 標準ツール有効化 |
| 画像読み | `ReadImageTool`, `ImageRepository`, `prepareToolImage`, `visionModel` | Pi 標準 `read`、jsonl への base64 保存、復元時の再添付、非 Vision へのツール公開 |
| 編集ルール | `EditMarkdownTool`, `replacements.ts`, `ObsidianNoteEditor` | editor を飛ばした `vault.modify` |
| コンテキスト | `ContextService`, `contextTarget`, `ObsidianContextProvider` | プロンプトにノート全文を埋め込む。`activeEditor` を別タブへ流用 |
| セッション形式 | `PidianSession`, `sessionSerialization` | Pi session JSON の保存 |
| メモリ上の Agent | `AgentService` の LRU（クエリ時、最大 3） | 開いただけで Pi セッションを作る。件数の設定項目 |
| モデル一覧 | `PiModelCatalog`, Settings custom provider | UI での provider 特例 |
| チャットのノートリンク | `Markdown.tsx`, `chatNoteLink.ts`, `ObsidianWorkspaceNavigator` | `openLinkText` のデフォルト、`instanceof MarkdownView` でのタブ検索 |
| 非フォーカス選択の表示 | `unfocusedSelectionHighlight.ts`, `styles.css` の `.pidian-unfocused-selection` | 本体が非フォーカス選択を描くようになったあとの残留。消すときは extension・CSS・`main.ts` の登録を一式で |
| システム指示 | `pidianSystemPrompt`, Vault `AGENTS.md` | Pi のデフォルト AGENTS 探索（fs stub で止めてある） |
| CORS / LLM HTTP | `corsFreeFetch`, `customRequestBody` | レンダラの `fetch` に戻す |
| サブスク OAuth | `subscriptionProviders.ts`, `PidianCredentialStore`, `subscriptionLogin.ts`, Settings API認証 | `~/.pi/agent/auth.json`、プロバイダ専用ログインの本体実装 |
| JS 描画ページの取得 | `BrowserFetcher`, `FetchOrchestrator` | ページ本文を Firecrawl 等へ送る |
| バンドル審査 | `esbuild.config.mjs` の stub と `FORBIDDEN_BUNDLE_PATTERNS` | Pi barrel の直接 import |

---

## スコープ外（足さない）

- Vault 横断の埋め込み検索（RAG）
- シェル / プロセス起動 / MCP
- モバイル
- `.obsidian/` やセッションファイルをノートとして編集
- Pi 標準 bash / ファイルツール
- 複数ノートを非アクティブのまま同時編集するバッファ

仕様がコードとこの文書で食い違うときは **コードとテストを正** とし、この文書を直す。
