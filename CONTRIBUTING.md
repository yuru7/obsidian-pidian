# 開発者向け

利用者向けの説明は [README.md](README.md) を見てください。このファイルはビルド、アーキテクチャ、テスト、リリース手順です。

## 必要環境

- Node.js（mise 管理を推奨）
- pnpm 11

## コマンド

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
```

`pnpm dev` は `main.js` を監視ビルドします。Vault の `.obsidian/plugins/pidian/` にこのリポジトリを置くか、成果物をコピーして使います。

## Architecture

詳細とエージェント向けの変更手順は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) を正とします。

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

## AgentEngine abstraction

`AgentEngine.createSession()` が `AgentSession` を返します。UI は `prompt` / `abort` / `subscribe` / `dispose` だけを使います。テストでは `FakeAgentEngine` を使えます。

## Pi Adapter

`PiAgentAdapter` が `@earendil-works/pi-coding-agent` の `createAgentSession()` を呼び出します。

- `noTools: "builtin"` で Pi 標準ツールを無効化
- Pidian Tool だけを `customTools` として渡す
- Pi の session ファイルは使わず `SessionManager.inMemory()`
- API キーは `setRuntimeApiKey` で runtime override する（Pidian 設定 → OAuth → 環境変数）。`~/.pi/agent/auth.json` は読まない
- サブスク OAuth は `ENABLED_SUBSCRIPTION_PROVIDERS`（いまは OpenAI Codex）と `ModelRuntime.login`。トークンは plugin data
- 起動時に `{manifest.dir}/dynamicModels.json` が無い、または更新から1日以上経っているときだけ `runtime.refresh({ allowNetwork: true, force: true })` する。新しいときはキャッシュから復元する

## Obsidian Tool architecture

初期ツールは `read_note` / `read_image` / `search_notes` / `list_files` / `open_file` / `workspace_tabs` / `web_search` / `fetch_url` / `create_note` / `edit_markdown` / `delete_note` です。Domain の `PidianTool` として定義し、`PiToolAdapter` だけが Pi の `defineTool` に変換します。`search_notes` / `list_files` / `open_file` / `workspace_tabs` / `read_image` は読み取り権限を使います。`read_image` は PNG / JPEG / WebP をこのターンの image ブロックとして渡し、セッションには path のテキストだけ残します。Pi セッション作成時、`model.input` に `image` が無いモデルには `read_image` を渡しません。Custom OpenAI Compatible はモデルごとの Vision 対応チェック（既定オフ）で `input` を決めます。`web_search` / `fetch_url` は Web search 権限を使います。`web_search` は Pi / Obsidian に依存しません。`fetch_url` は静的取得のあと、JS 描画ページだけ Obsidian Desktop の隠し `BrowserWindow` でレンダリングします。ページ本文を外部サービスへ送りません。`delete_note` は削除権限を使い、Obsidian のゴミ箱設定に従ってファイルを捨てます。

ツール追加手順:

1. `src/tools/` に `PidianTool` を追加する
2. 必要なら Permission category を足す
3. `createPidianTools()` に登録する
4. Pi の型や `defineTool` は tools 配下に書かない

## Permission architecture

`PermissionService` が allow / ask / deny を解釈します。確認 UI は `PermissionPrompter` の後ろに置き、Adapter には置きません。

## Undo architecture

`ObsidianNoteEditor` はアクティブな Markdown editor に対してだけ transaction を適用します。対象がアクティブでない場合は `open_file` を先に要求します。Private API には依存しません。

## Session format

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

## Adding a Provider-specific configuration

Pidian 本体に Provider 分岐を増やさないでください。Pi の catalog に載るものは `PiModelCatalog` 経由で UI に出します。OpenAI Compatible だけは Settings の custom provider として `ModelRuntime.registerProvider` します。

## Testing strategy

Vitest で Domain / Application を Fake 実装に対して厚くテストします。Obsidian ItemView や Pi SDK 内部はユニットテストしません。

```bash
pnpm test
pnpm test --watch
```

特に CredentialResolver、PermissionService、ContextService、SessionCleanupService、PiEventMapper、revision / replacements、session serialization / migration をカバーします。

## Manual smoke checklist

リリース前にこの節を手で確認します。

- [ ] Sidebar 起動
- [ ] Chat 送信
- [ ] Streaming 表示
- [ ] Model 切替
- [ ] 現在ファイル Context（Markdown の行、Canvas / PNG / JPEG / WebP は path のみ）
- [ ] Selection Context
- [ ] read_note
- [ ] read_image
- [ ] search_notes
- [ ] list_files
- [ ] open_file
- [ ] workspace_tabs
- [ ] web_search / fetch_url / Web search permission
- [ ] create permission
- [ ] edit permission
- [ ] delete permission / delete_note
- [ ] Undo（アクティブノート）
- [ ] 非アクティブノートは open_file してから edit_markdown
- [ ] Session 再起動復元
- [ ] AGENTS.md 反映
- [ ] 古い Session 削除

## Release procedure

作業ブランチは `dev` です。作業ツリーをクリーンにしたうえで:

```bash
pnpm test
pnpm lint
pnpm run bump-and-tag --version 0.11.0
pnpm run bump-and-tag --version 0.12.0 --min-app-version 1.9.0
```

`bump-and-tag` は次を行います。

1. 現在のブランチが `dev` であることを確認する
2. `pnpm build` が通ることを確認する
3. `manifest.json` / `package.json` のバージョンを `--version` にする。`--min-app-version` があるときだけ `manifest.json` の `minAppVersion` も更新し、`versions.json` は `minAppVersion` が変わったときだけエントリを足す
4. `Bump to <version>` でコミットする
5. `main` へ fast-forward マージしてプッシュする
6. 注釈付きタグ `<version>` を切って `origin` へプッシュする
7. `dev` に戻る

その後:

- `main.js` / `manifest.json` / `styles.css` を GitHub Release に添付する
- [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) を確認する
