# Pidian アーキテクチャ

AI エージェントがこのリポジトリを読み、実装するときの正本。Obsidian API の調べ方はルートの [AGENTS.md](../AGENTS.md)。ビルド・テスト・リリース手順は [CONTRIBUTING.md](../CONTRIBUTING.md)。

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
  notes/                    NoteRepository, NoteEditor, ContextSnapshot
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
  fetch/                    SSRF、HTML 抽出、FetchService 工場
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
    ├── NoteEditor ───────────► ObsidianNoteEditor
    ├── WorkspaceNavigator ───► ObsidianWorkspaceNavigator
    ├── SessionRepository ────► ObsidianSessionRepository（Vault の pidian/sessions/）
    ├── PermissionPrompter ───► ObsidianPermissionPrompter
    └── Search / Fetch ───────► Firecrawl / DuckDuckGo / FetchService（corsFreeFetch）
```

**例外:** `application/fetch/FetchService.ts` は HTML 抽出と SSRF を infrastructure から直接 import している。新規でも、配線は `infrastructure/*/create*.ts` の工場に寄せ、Application が具象を増やさないようにする。

テストは対象の隣に `*.test.ts` を置く。Vitest。Obsidian `ItemView` と Pi SDK 内部はユニットテストしない。Agent のテストは `FakeAgentEngine` を使う。

---

## 起動と配線

`PidianPlugin.onload` の順:

1. `loadSettings()`（`bindConfigDir` / `bindPluginDirectory`）
2. Setting tab
3. `initServices()`（失敗しても View / ribbon / command は登録する）
4. `PidianView`（`VIEW_TYPE_PIDIAN = "pidian-view"`）
5. ribbon と command（`open`, `new-chat`）
6. layout ready 後にサイドバーを開き、`bootstrap()`（既定モデル解決、新規チャット、古いセッション掃除）

`initServices()` が作るもの:

| 役割 | 具象 |
| --- | --- |
| notes | `ObsidianNoteRepository` |
| editor | `ObsidianNoteEditor` |
| workspace | `ObsidianWorkspaceNavigator` |
| sessions | `SessionService` + `ObsidianSessionRepository` |
| tracker | `ReadRevisionTracker`（プロセス内。永続化しない） |
| permissions | `PermissionService` + `ObsidianPermissionPrompter` |
| search / fetch | `createSearchService` / `createFetchService`（どちらも `corsFreeFetch`） |
| agent | `PiAgentAdapter` → `AgentService` |
| tools | セッション ID ごとに `createPidianTools(...)` |

UI は `plugin.agentService.subscribe` と `plugin.subscribeSettings` で再描画する。エディタのカーソル/選択は `editorContextExtension` が `subscribeEditorContext` を叩く。

---

## 会話の流れ

```text
Composer
  → AgentService.send(text)
      → ContextService.snapshot()（現在ノートの path と 1-based 行範囲。本文は入れない）
      → ユーザー発言 + 空の assistant を PidianSession に追加して保存
      → AgentSession.prompt({ text: formatAgentPrompt(...), context })
          → PiAgentAdapter（Pi イベント）
              → PiEventMapper → AgentEvent
                  → AgentService が最新 assistant を更新して notify
                      → Chat がストリーム表示
```

`AgentEvent`（`src/domain/agent/AgentEvent.ts`）だけが UI / Application のイベント面:

- `text_delta` / `thinking_delta`
- `tool_started` / `tool_completed`
- `turn_completed`（token usage）
- `error`

`AgentSession` の操作は `prompt` / `abort` / `subscribe` / `dispose` のみ。

プロンプト本文の形（`formatAgentPrompt`）:

```text
Current note:
<path>

Cursor:          または  Selection:
Line N                   Lines A-B

<user text>
```

ノート本文はコンテキストに載せない。エージェントは `read_note` で読む。システムプロンプトは `PIDIAN_SYSTEM_PROMPT`（`src/infrastructure/pi/PiCredentials.ts`）。Vault の `pidian/AGENTS.md`（プラグインフォルダ設定に追随）は任意の追加指示。

---

## ツール

実装は `src/tools/`。Domain 型は `src/domain/tools/PidianTool.ts`。Pi への変換は `src/infrastructure/pi/PiToolAdapter.ts` だけ。

| name | 権限 | 役割 |
| --- | --- | --- |
| `read_note` | read | 行範囲で読む。revision を返す。`ReadRevisionTracker` に記録 |
| `search_notes` | read | ファイル名 + 本文検索。`AGENTS.md` と制限パスは除外 |
| `list_files` | read | 直下のみ。再帰しない。`""` / `"/"` が Vault ルート |
| `open_file` | read | 開いてアクティブにする。未オープンなら開く |
| `workspace_tabs` | read | タブ一覧。`tabId` または `path` でフォーカス |
| `web_search` | webSearch | Firecrawl（既定）→ DuckDuckGo。結果に `provider` を含める。Pi / Obsidian に依存しない |
| `fetch_url` | webSearch | SSRF ガード付き取得。HTML は Markdown 化 |
| `create_note` | create | Vault API で作成 |
| `edit_note` | edit | 下記の編集経路 |
| `delete_note` | delete | `fileManager.trashFile`（Obsidian のゴミ箱設定に従う） |

Pi 起動時は `noTools: "builtin"` で標準ツールを切り、`customTools` に上記だけを渡す。

### ツールを足す

1. `src/tools/FooTool.ts` に `PidianTool` を実装する。パスは `assertSafeNotePath`。権限は `PermissionService.authorize`。
2. 新しい権限カテゴリが必要なら `ToolCategory` と Settings の `permissions` と i18n を同時に足す。
3. `createPidianTools()` に登録する。
4. 隣に `*.test.ts` を書く。Pi の型や `defineTool` は tools 配下に書かない。
5. エージェント向け説明はツールの `description` と、必要なら `PIDIAN_SYSTEM_PROMPT` を更新する。

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
edit_note
  → assertSafeNotePath
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

`src/application/notePath.ts` が唯一の判定場所。ツールも Repository もこれを通す。

触ってはいけない:

- Vault の config フォルダ（通常 `.obsidian/`）。`Vault#configDir` を `bindConfigDir` している
- セッションディレクトリ（既定 `pidian/sessions/`）
- パスの `..` / `.`、空パス

検索からは上記に加え `pidian/AGENTS.md` も除外する。プラグインフォルダ名は Settings の `pluginDirectory`（既定 `pidian`）。config 配下には置けない。

---

## セッション永続化

保存先: `{pluginDirectory}/sessions/{createdAt}_{id}.json.md`（または `.json`）。

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
  messages: PidianMessage[];
}
```

- パースは `migratePidianSession`。`version !== 1` は throw。フィールド追加時は後方互換を崩さないか、version を上げて migration を足す。
- アシスタントの `workedMs` は各 Work 区間（思考・ツール）が次の見える `text_delta` に達するまでの時間。空白だけの delta では区切らない。テキストが無い区間は完了時に記録。`blocks` が無い古い保存データは思考・ツールを1つの WorkLog にまとめる。
- 再開は `PidianSession → AgentConversation → PiAgentAdapter`。Pi 固有オブジェクトは保存しない。
- 破損ファイルは list 時にスキップする。
- 自動削除は `SessionCleanupService`。既定オフ。起動時のみ。アクティブ session id は消さない。
- fork は指定メッセージまでをコピーした新セッション。`forkedMessageCount` で UI が分岐点を出す。

---

## 認証とモデル

優先順位: **Pidian 設定の API キー > 環境変数**。`~/.pi/agent/auth.json` は読まない（`InMemoryCredentialStore`）。

- 既知プロバイダの env 名は `src/infrastructure/pi/PiCredentials.ts` の `PROVIDER_ENV_VARS`。本体にプロバイダ分岐を足さない。
- Custom OpenAI Compatible は Settings の `customProviders`。`ModelRuntime.registerProvider`（api: `openai-completions`）。env は使わない。
- 実行時キーは `setRuntimeApiKey`。
- モデル一覧は `PiModelCatalog`。動的カタログは `{plugin install dir}/dynamicModels.json`。無い、または 1 日以上古いときだけ `runtime.refresh({ allowNetwork: true, force: true })`。
- 接続設定（キー・custom provider）が変わったら `AgentService.reloadModel()`。削除された provider は `reconcileModelSelection` で落とす。
- thinking は `src/domain/agent/thinkingLevel.ts`。モデルが支持する集合へ clamp する。

---

## Pi Adapter とバンドル

Pi を Obsidian の eval 環境で動かすための隔離が `src/infrastructure/pi/` と `esbuild.config.mjs`。

| ファイル | 役割 |
| --- | --- |
| `PiAgentAdapter.ts` | `AgentEngine` 実装。`SessionManager.inMemory()`、`noTools: "builtin"` |
| `piCodingAgentSdk.ts` | パッケージ barrel の代わり。CLI / self-update をバンドルに入れない |
| `PiEventMapper.ts` | Pi イベント → `AgentEvent` |
| `PiToolAdapter.ts` | `PidianTool` → `defineTool` |
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
| `PidianView.tsx` | `ItemView`。React root |
| `PidianApp.tsx` | ヘッダ、Chat、Composer、ModelSelector、SessionSelector |
| `Chat.tsx` / `Message.tsx` / `WorkLog.tsx` / `ToolCall.tsx` / `Thinking.tsx` | ストリーム表示。思考とツールは WorkLog にまとめ、`text_delta` で区切って複数出せる |
| `Composer.tsx` | 入力。`subscribeComposerFocus` でフォーカス |
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

Pi にも Obsidian にも依存しない。`corsFreeFetch` を渡す。

- 検索: `FirecrawlSearchProvider`（API キー任意。未設定なら Keyless）→ 失敗時 `DuckDuckGoSearchProvider` → `SearchService`。返却テキストに `Provider: <id>` を含める
- 取得: `SsrfGuard`（プライベート IP / リンクローカル等を拒否、リダイレクト先も解決して判定）→ `FetchService` → HTML は Readability / Defuddle / Turndown
- どちらも権限カテゴリは `webSearch`

---

## テストの厚みを置く場所

`CONTRIBUTING.md` と同じ。特に次を壊さない:

- `CredentialResolver`
- `PermissionService`
- `ContextService`
- `SessionCleanupService` / `sessionSerialization` / migration
- `PiEventMapper`
- `revision` / `replacements`
- `notePath`（制限パス）
- 各 Tool の失敗系（未読 edit、非アクティブ edit、deny、SSRF）

実行: `pnpm test`。環境は node。`vitest.setup.ts` が `window` を補う。

---

## よくある変更の置き場

| やりたいこと | 触る場所 | 触らない場所 |
| --- | --- | --- |
| ツール追加 | `src/tools/`, `createPidianTools` | `infrastructure/pi` の `defineTool` 直書き、Pi 標準ツール有効化 |
| 編集ルール | `EditNoteTool`, `replacements.ts`, `ObsidianNoteEditor` | editor を飛ばした `vault.modify` |
| コンテキスト | `ContextService`, `ObsidianContextProvider` | プロンプトにノート全文を埋め込む |
| セッション形式 | `PidianSession`, `sessionSerialization` | Pi session JSON の保存 |
| モデル一覧 | `PiModelCatalog`, Settings custom provider | UI での provider 特例 |
| チャットのノートリンク | `Markdown.tsx`, `chatNoteLink.ts`, `ObsidianWorkspaceNavigator` | `openLinkText` のデフォルト、`instanceof MarkdownView` でのタブ検索 |
| システム指示 | `PIDIAN_SYSTEM_PROMPT`, Vault `AGENTS.md` | Pi のデフォルト AGENTS 探索（fs stub で止めてある） |
| CORS / LLM HTTP | `corsFreeFetch`, `customRequestBody` | レンダラの `fetch` に戻す |
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
