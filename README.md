# Pidian

Obsidian Desktop から Pi エージェントをサイドバーで使うプラグインです。Vault の操作は Pi 標準のファイルツールではなく、すべて Obsidian API 経由で行います。

## User Guide

### Pidianとは

Pidian は Obsidian の右サイドバーにチャット UI を出し、開いているノートをコンテキストにしながら会話できるプラグインです。初期版は Desktop 専用です。

### インストール

1. リリースの `main.js` / `manifest.json` / `styles.css` を Vault の `.obsidian/plugins/pidian/` に置く
2. Obsidian のコミュニティプラグイン設定で Pidian を有効化する
3. 左リボンのチャットアイコン、またはコマンドパレットの `Open Pidian` でサイドバーを開く。有効化直後は右サイドバーが自動で開きます

開発中は [Developer Guide](#developer-guide) の `pnpm dev` を使います。

### 初期設定

1. Settings → Pidian を開く
2. Provider と Model を選ぶ
3. API キーを設定する。空欄なら環境変数、それも無ければ Pi 側の既存 credential を使います
4. Create / Edit は **デフォルト無効** です。必要なときだけ Always allow か Ask every time に変更してください

### Provider / Model設定

サイドバー下部の入力欄横、または Settings の Agent セクションで切り替えます。Pi が認識している Provider / Model をそのまま選択できます。Pidian 本体に Provider 固有実装は持たせません。

### APIキー設定

API キーは **Obsidian Plugin data**（`data.json`）に保存されます。チャットセッションファイルには保存しません。

ローカル保存を避けたい場合は、各 Provider の環境変数を使ってください。設定値が空なら環境変数が使われ、「Using environment variable」と表示されます。値そのものは表示しません。

優先順位:

1. Pidian 設定
2. 環境変数
3. Pi 側の既定 credential（`~/.pi/agent/auth.json` など）

### 環境変数

例:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `OPENROUTER_API_KEY`

Obsidian を起動しているプロセスから見える環境変数だけが使えます。

### OpenAI Compatible

Settings の Custom OpenAI Compatible で、Name / Base URL / Model ID / API key を追加できます。ローカルの Ollama や社内プロキシなど、Chat Completions 互換のエンドポイント向けです。

### Permissions

| 操作 | 初期値 |
| --- | --- |
| Read | Always allow |
| Search | Always allow |
| Create | Deny |
| Edit | Deny |

Ask every time のときは実行前に確認モーダルが出ます。Edit では対象ファイル、変更箇所数、追加・削除文字数、簡易 diff を表示します。拒否するとエージェントには `Tool execution denied by user` が返ります。

Read にはノート本文の読み取りに加え、未オープンファイルを開く `open_file` と、既存タブの確認・移動 `workspace_tabs` も含みます。

**Create / Edit はデフォルト無効です。** 誤編集を防ぐための初期値です。

### 現在ノートContext

メッセージ送信時点のアクティブな Markdown ノートをスナップショットして渡します。送信後に別ノートへ移動しても、そのターンのコンテキストは変わりません。

### Selection Context

選択範囲がある場合、ノート全文に加えて選択文字列・開始行・終了行・周辺抜粋を Focus Context として渡します。Settings の `Include selected text context` で OFF にできます。OFF でもノート全文は渡します。

### Session

会話は `pidian/sessions/` に Pidian 独自 JSON として保存されます。タイトルは最初のユーザーメッセージから自動生成し、LLM は呼びません。

古いセッションの自動削除はデフォルト OFF です。有効化すると retention days（7 / 30 / 90 / Custom）より古いセッションを起動時に削除します。利用中のセッションは削除しません。

### pidian/AGENTS.md

Vault ルートの `pidian/AGENTS.md` がある場合、追加指示として読み込みます。無い場合は何もしません。自動生成もしません。

```markdown
# Instructions

- 日本語で回答する
- ノートの文体を維持する
- 編集前に必ず内容を確認する
```

### Undo

`edit_note` は `Vault.modify()` ではなく Markdown editor の transaction で適用します。開いているノートならその editor を使い、Obsidian 標準の Undo（Ctrl+Z）で戻せます。1 回の tool call 内の複数置換は 1 つの transaction にまとめます。

非アクティブなノートは、フォーカスを奪わないようにタブとして開いてから編集します。Undo 履歴を残すため、Pidian が開いた editor はすぐには閉じません。保持数の上限はデフォルト 5 です（1〜10）。上限に達した 6 件目は自動解放せず、編集を拒否します。

Create は Undo 対象ではありません。取り消す場合は Obsidian 上でファイルを削除してください。

### 安全性

- Pi 標準の `read` / `write` / `edit` / `bash` / `grep` / `find` / `ls` は無効です
- ノート操作は Pidian の `read_note` / `search_notes` / `create_note` / `edit_note` だけです
- タブ操作は `open_file` / `workspace_tabs` です。権限は読み取りと同じ設定を使います
- 編集は exact unique replacement です。曖昧なら実行しません
- 編集対象は事前の `read_note` が必須です
- 読み取り後にノートが変わっていたら再 read を要求します
- `.obsidian/` と `pidian/sessions/` はツール対象外です
- `pidian/AGENTS.md` は通常検索から除外します

### 制限事項

- Desktop only（Mobile 非対応）
- Embedding / Vault 全体 RAG / Web 検索 / Shell / MCP は初期版の対象外です
- 非アクティブノートの編集では Undo 用タブが増えることがあります

## Developer Guide

### 必要環境

- Node.js（mise 管理を推奨）
- pnpm 11

### コマンド

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
```

`pnpm dev` は `main.js` を監視ビルドします。Vault の `.obsidian/plugins/pidian/` にこのリポジトリを置くか、成果物をコピーして使います。

### Architecture

依存方向は次の通りです。

```text
Obsidian UI
    → Application / Domain
        → AgentEngine / NoteRepository / NoteEditor / SessionRepository
            → PiAgentAdapter / Obsidian adapters
```

**Pi 固有 API を `src/infrastructure/pi` の外へ持ち出さない。** UI と Domain は Pidian 独自の `AgentEvent` と Tool 抽象だけを扱います。

編集の必須経路:

```text
Agent request
→ Permission
→ revision check
→ exact patch validation
→ Obsidian Editor transaction
→ Undo history
```

Pi から Obsidian へ直接アクセスする経路は作りません。

### AgentEngine abstraction

`AgentEngine.createSession()` が `AgentSession` を返します。UI は `prompt` / `abort` / `subscribe` / `dispose` だけを使います。テストでは `FakeAgentEngine` を使えます。

### Pi Adapter

`PiAgentAdapter` が `@earendil-works/pi-coding-agent` の `createAgentSession()` を呼び出します。

- `noTools: "builtin"` で Pi 標準ツールを無効化
- Pidian Tool だけを `customTools` として渡す
- Pi の session ファイルは使わず `SessionManager.inMemory()`
- API キーは `setRuntimeApiKey` で runtime override する（Pidian 設定 → 環境変数 → Pi 既定）

### Obsidian Tool architecture

初期ツールは `read_note` / `search_notes` / `open_file` / `workspace_tabs` / `create_note` / `edit_note` です。Domain の `PidianTool` として定義し、`PiToolAdapter` だけが Pi の `defineTool` に変換します。`open_file` と `workspace_tabs` は読み取り権限を使います。

ツール追加手順:

1. `src/tools/` に `PidianTool` を追加する
2. 必要なら Permission category を足す
3. `createPidianTools()` に登録する
4. Pi の型や `defineTool` は tools 配下に書かない

### Permission architecture

`PermissionService` が allow / ask / deny を解釈します。確認 UI は `PermissionPrompter` の後ろに置き、Adapter には置きません。

### Undo architecture

`ObsidianNoteEditor` は既存の MarkdownView を優先し、無ければ `EditorLeaseManager` が補助タブを開きます。上限超過時は LRU 解放せず拒否します。Private API には依存しません。

### Session format

```ts
interface PidianSession {
  version: 1;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  provider: string;
  model: string;
  messages: PidianMessage[];
}
```

Pi 固有の session/event オブジェクトはシリアライズしません。再開時は `PidianSession → AgentConversation → PiAgentAdapter` で復元します。未知バージョンは migration で失敗させます。

### Adding a Provider-specific configuration

Pidian 本体に Provider 分岐を増やさないでください。Pi の catalog に載るものは `PiModelCatalog` 経由で UI に出します。OpenAI Compatible だけは Settings の custom provider として `ModelRuntime.registerProvider` します。

### Testing strategy

Vitest で Domain / Application を Fake 実装に対して厚くテストします。Obsidian ItemView や Pi SDK 内部はユニットテストしません。

```bash
pnpm test
pnpm test --watch
```

特に CredentialResolver、PermissionService、ContextService、SessionCleanupService、PiEventMapper、revision / replacements、EditorLease 上限、session serialization / migration をカバーします。

### Manual smoke checklist

README のこの節をリリース前に手で確認します。

- [ ] Sidebar 起動
- [ ] Chat 送信
- [ ] Streaming 表示
- [ ] Model 切替
- [ ] 現在ノート Context
- [ ] Selection Context
- [ ] read_note
- [ ] search_notes
- [ ] open_file
- [ ] workspace_tabs
- [ ] create permission
- [ ] edit permission
- [ ] Undo（アクティブノート）
- [ ] 非アクティブノート Undo
- [ ] 5 ファイル上限で 6 件目拒否
- [ ] Session 再起動復元
- [ ] AGENTS.md 反映
- [ ] 古い Session 削除

### Release procedure

1. `manifest.json` と `package.json` の version を上げる
2. `versions.json` に `"plugin-version": "min-obsidian-version"` を追加する
3. `pnpm test` と `pnpm build` と `pnpm lint` を通す
4. `main.js` / `manifest.json` / `styles.css` を GitHub Release に添付する
5. [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) を確認する
