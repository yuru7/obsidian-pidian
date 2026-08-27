# ExecPlan: Pidian

## 1. 目的

Obsidian Desktop上で、Piエージェントをサイドバーから簡単に利用できるプラグイン **Pidian** を開発する。

Pidianは `@earendil-works/pi-coding-agent` をエージェントエンジンとして利用するが、Pi固有APIをアプリケーション全体へ露出させず、Adapter層に閉じ込める。

エージェントによるノート操作にはPi標準のファイル操作ツールを使用せず、すべてObsidian APIを利用する。

初期版はDesktop版を対象とする。ただし、Pi依存・Node.js依存部分を分離し、将来的に別Agent backendやMobile向けリモートAgentへ置き換えられる構造とする。

---

# 2. 完了条件

以下を満たした時点を初期リリースの完成とする。

* ObsidianサイドバーにPidianを表示できる
* Piエージェントとストリーミング会話できる
* Piが利用可能なProvider / ModelをPidianから選択できる
* OpenAI Compatible APIを設定できる
* APIキーをPidian設定または環境変数から取得できる
* Pidian設定値が環境変数より優先される
* 現在開いているノートが自動的にコンテキストへ入る
* 選択範囲がある場合、選択位置を強調したコンテキストを渡せる
* 選択範囲コンテキストを設定でOFFにできる
* ノートの表示・検索・作成・編集をObsidian API経由で実行できる
* 各操作に `常に許可 / 毎回確認 / 禁止` を設定できる
* デフォルトは表示・検索のみ許可
* 編集内容がObsidian標準Undoで取り消せる
* 非アクティブノートの編集でもUndo可能である
* 同時に編集状態として保持するノート数を制限できる
* デフォルト上限は5ノート
* 複数チャットセッションを保存・再開できる
* セッションを `pidian/sessions/` に保存する
* 古いセッションの自動削除を設定できる
* `pidian/AGENTS.md` をPidian固有指示として読み込める
* README.mdにユーザー向け・開発者向けドキュメントがある
* 主要ロジックについて高速なユニットテストがある

---

# 3. 基本アーキテクチャ

依存方向を以下に固定する。

```text
Obsidian UI
    │
    ▼
Application / Domain
    │
    ├──── AgentEngine interface
    │          │
    │          ▼
    │     PiAgentAdapter
    │          │
    │          ▼
    │  @earendil-works/pi-coding-agent
    │
    ├──── NoteRepository interface
    │          │
    │          ▼
    │     ObsidianNoteRepository
    │
    ├──── NoteEditor interface
    │          │
    │          ▼
    │     ObsidianEditorAdapter
    │
    └──── SessionRepository
               │
               ▼
         Vault filesystem
         pidian/sessions/
```

重要なのは、

```text
UI → Pi SDK
```

や、

```text
Tool → Vault.modify()
```

のような直接依存を作らないことである。

Piの型を利用してよいのは原則として、

```text
src/infrastructure/pi/
```

配下のみとする。

---

# 4. Agent Engine境界

以下のようなPidian独自interfaceを定義する。

```ts
interface AgentEngine {
  createSession(options: AgentSessionOptions): Promise<AgentSession>;
}

interface AgentSession {
  prompt(request: AgentPrompt): Promise<void>;
  abort(): Promise<void>;
  subscribe(listener: AgentEventListener): () => void;
  dispose(): Promise<void>;
}
```

Pidian内部では、

```ts
AgentEvent =
  | TextDeltaEvent
  | ThinkingDeltaEvent
  | ToolStartedEvent
  | ToolCompletedEvent
  | TurnCompletedEvent
  | AgentErrorEvent;
```

などの独自イベントへ変換する。

PiのイベントオブジェクトをUIへ直接渡さない。

これによりPiのAPI変更時も、

```text
PiAgentAdapter
PiEventMapper
PiModelProvider
```

周辺だけを修正すれば済むようにする。

---

# 5. Pi初期化

`PiAgentAdapter` 内で `createAgentSession()` を使用する。

Pi標準Toolは無効化する。

概念的には、

```ts
createAgentSession({
  noTools: "builtin",
  customTools: pidianTools,
  ...
});
```

とする。

Pi側の、

```text
read
write
edit
bash
grep
find
ls
```

などへVaultを触らせない。

PidianからPiへ渡すToolのみを利用可能とする。

---

# 6. Obsidian Tool

初期版では以下の4種類に絞る。

```text
read_note
search_notes
create_note
edit_note
```

将来的には、

```text
list_notes
get_backlinks
get_properties
update_properties
```

などを追加できる構造にする。

## read_note

入力:

```text
path
```

返却:

```text
path
content
revision
```

`revision` はファイル内容から生成するハッシュ等とする。

このrevisionを編集競合検出にも利用する。

---

# 7. 検索

`search_notes` はObsidian Vaultを対象とする。

初期版ではEmbeddingやRAG用インデックスを作らない。

ObsidianのVault APIとMetadataCacheを利用した、

```text
ファイル名検索
本文検索
```

を基本とする。

以下は検索対象から除外する。

```text
.obsidian/
pidian/sessions/
```

`pidian/AGENTS.md` はエージェント設定として扱い、通常の検索対象には含めない。

---

# 8. 編集Toolの安全設計

ここはPidianの重要部分とする。

`edit_note` にファイル全体の新しい内容を渡して、

```ts
vault.modify(file, content);
```

する実装にはしない。

代わりに、

```text
元文字列
↓
置換後文字列
```

を指定するPatch型Toolとする。

例:

```ts
{
  path: "notes/example.md",
  revision: "...",
  replacements: [
    {
      oldText: "変更前",
      newText: "変更後"
    }
  ]
}
```

Pidian側で、

1. 対象ノートが現在のrevisionと一致する
2. `oldText` が存在する
3. 置換対象が一意である
4. 編集権限がある

ことを確認してから編集する。

曖昧な場合は編集せずTool errorをPiへ返す。

これによりAgentが古いコンテキストを元に上書きする事故を防ぐ。

---

# 9. 「read before write」を強制する

エージェントが編集するノートについては、

```text
read_note
↓
edit_note
```

を必須とする。

Pidian側で、

```text
sessionId
path
revision
```

の読み取り履歴を保持する。

読み取り履歴がないファイルへの `edit_note` は拒否する。

また、読み取り後にユーザーがノートを変更してrevisionが変化した場合も編集を拒否する。

Piへ、

```text
The note changed after it was read.
Read the note again before editing.
```

相当のTool errorを返し、再読み込みさせる。

---

# 10. Obsidian標準Undo

編集には `Vault.modify()` を直接使用せず、

**ObsidianのMarkdown editor経由で変更を適用する。**

現在開いているノートなら、その `MarkdownView.editor` を使用する。

一回の `edit_note` Tool callに含まれる複数置換は、可能な限り1つのEditor transactionとして適用する。

これにより、

```text
Ctrl + Z
```

またはObsidian標準Undoで、Pidianによる変更を戻せるようにする。

---

# 11. 非アクティブノート編集

非アクティブノートも標準Undo可能にするため、編集対象を一時的にMarkdown editorへロードする。

その管理を、

```ts
EditorLeaseManager
```

として独立させる。

概念上、

```text
Pidian edit request
       ↓
EditorLeaseManager
       ↓
対象ノート用 MarkdownView
       ↓
editor transaction
```

とする。

ユーザーが作業中の現在ノートからフォーカスを奪わないことを優先する。

Obsidianの公開APIだけでバックグラウンドEditorを安全に維持できるかは最初の技術スパイクで検証する。

Private APIには依存しない。

---

# 12. 編集対象上限

Undo履歴を維持するためにEditorを保持する必要がある場合に備え、

```text
maxEditableNotes = 5
```

をデフォルトとする。

設定値として変更可能にする。

推奨範囲:

```text
1〜10
```

上限へ到達した状態で6個目のノート編集要求が来た場合、古いEditorを勝手に閉じない。

代わりに編集Toolを拒否し、

```text
Maximum editable note limit reached.
```

としてAgentへ返す。

**Undo可能性を失ってまでLRUで自動解放しない。**

安全性を優先する。

---

# 13. Permissionモデル

各Tool categoryに以下の3段階を持つ。

```ts
type Permission =
  | "allow"
  | "ask"
  | "deny";
```

対象:

```text
read
search
create
edit
```

初期値:

| 操作 | 初期値  |
| -- | ---- |
| 表示 | 常に許可 |
| 検索 | 常に許可 |
| 作成 | 禁止   |
| 編集 | 禁止   |

設定画面では、

```text
Always allow
Ask every time
Deny
```

を選択できるようにする。

---

# 14. 毎回確認

`ask` の場合、Tool実行前にObsidian Modalを表示する。

編集の場合は最低限、

```text
対象ファイル
変更箇所数
追加文字数
削除文字数
```

を表示する。

可能であれば変更前後の簡易diffも表示する。

ユーザーが拒否した場合は、

```text
Tool execution denied by user
```

としてPiへ返す。

確認処理自体はPi Adapter側ではなく、

```text
PermissionService
```

に置く。

---

# 15. 現在ノートの標準コンテキスト

Prompt送信時に現在のMarkdownViewを取得し、

```ts
ContextSnapshot {
  notePath;
  noteContent;
  selection?;
}
```

として**その時点のスナップショット**を作成する。

Agent実行中に別ノートへ移動しても、途中でコンテキストを差し替えない。

これによりAgentの1ターン中の前提が安定する。

---

# 16. 選択範囲コンテキスト

設定:

```text
Include selected text context
default: ON
```

選択範囲が存在する場合でもノート全文はコンテキストへ含める。

それに加えて、

```text
選択文字列
開始行
終了行
選択周辺の抜粋
```

をFocus Contextとして渡す。

概念的には、

```text
Current note:
notes/example.md

Current note content:
...

Focused selection:
Lines 42-47

Context around selection:
...

Selected text:
...
```

とする。

ノート本文自体を書き換えて `<selection>` タグを挿入する必要はない。

---

# 17. `pidian/AGENTS.md`

Vaultルートに、

```text
pidian/
├── AGENTS.md
└── sessions/
```

を利用する。

`pidian/AGENTS.md` が存在する場合、各Agent sessionの追加instructionとして読み込む。

存在しない場合は何もしない。

自動生成もしない。

これによりユーザーは例えば、

```markdown
# Instructions

- 日本語で回答する
- ノートの文体を維持する
- 編集前に必ず内容を確認する
```

などを定義できる。

Pi自身のresource loader仕様をUIやDomainへ露出させず、

```text
InstructionProvider
```

からPi Adapterへ文字列として渡す。

---

# 18. Provider / Model

Pidian側でProviderをハードコードしすぎない。

Pi Adapter配下に、

```ts
interface ModelCatalog {
  listProviders(): Promise<Provider[]>;
  listModels(providerId: string): Promise<Model[]>;
}
```

を用意する。

Piが利用可能なProvider / Modelを可能な限りここへ変換してUIへ返す。

そのため、

```text
OpenAI
Anthropic
Gemini
OpenRouter
DeepSeek
Groq
Mistral
xAI
...
```

などについて、Pidian本体へProvider固有実装を増やさない。

---

# 19. OpenAI Compatible

別途、

```text
Custom OpenAI Compatible
```

Provider設定を用意する。

最低限、

```text
Name
Base URL
Model ID
API key
```

を設定できるようにする。

必要になった場合のみ、

```text
Responses API
Chat Completions API
```

等の互換設定を追加する。

初期実装ではPi側が提供するcompatibility設定をできるだけ利用する。

---

# 20. APIキー

Credential解決を、

```ts
CredentialResolver
```

へ集約する。

優先順位は必ず、

```text
1. Pidian設定
2. Environment variable
3. Pi側が利用可能な既定Credential
```

とする。

例えばOpenAIなら概念的に、

```text
Pidian Settings
OPENAI_API_KEY
Pi Runtime Credential
```

の順。

Pidian設定が空文字の場合は「未設定」として扱う。

Providerごとの環境変数名はPi Adapter側へ集約する。

---

# 21. APIキー保存

APIキーは通常のチャットセッションデータには絶対保存しない。

Pidian Plugin settingsにのみ保存する。

READMEには、

**Obsidian Plugin dataへAPIキーが保存される**

ことを明記する。

環境変数を利用した方がローカル保存を避けられることも説明する。

---

# 22. Sessionモデル

PiネイティブSessionファイルをそのままPidianの永続データ形式にしない。

Pidian独自形式を定義する。

理由はPiとの疎結合を維持するため。

例えば、

```text
pidian/
└── sessions/
    ├── 019xxx.json
    ├── 019yyy.json
    └── 019zzz.json
```

とする。

各ファイル:

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

Pi固有のsession/eventオブジェクトをそのままシリアライズしない。

---

# 23. Session再開

保存済みPidian messageを、

```text
PidianSession
↓
AgentConversation
↓
PiAgentAdapter
```

で復元する。

Piの将来バージョンでSession形式が変化しても、Pidian session migrationだけで対応できる構造とする。

---

# 24. Session UI

サイドバー上部に、

```text
New chat
Session history
Provider / Model
```

を配置する。

Session historyでは、

```text
タイトル
更新日時
使用モデル
```

程度を表示する。

タイトルは最初のUser messageをベースに自動生成する程度でよい。

タイトル生成のためだけにLLMを呼ばない。

---

# 25. Session自動削除

設定:

```text
Automatically delete old sessions
default: OFF
```

ONの場合、

```text
Retention days
```

を指定できる。

例えば、

```text
7
30
90
Custom
```

を選択可能にする。

Plugin起動時などに、

```text
updatedAt < now - retentionDays
```

のSessionを削除する。

現在利用中のSessionは削除しない。

初期値をOFFとし、ユーザーが明示的に有効化しない限り自動削除しない。

---

# 26. UI

Obsidian `ItemView` の中にReact UIをマウントする。

初期版ではTailwindや大規模UI Frameworkを入れず、

```text
React
Obsidian CSS variables
通常CSS
```

を基本とする。

これによりObsidian Themeとの親和性と保守性を優先する。

---

# 27. Sidebar構成

概ね以下とする。

```text
┌─────────────────────────────┐
│ Pidian                +  ≡  │
│ GPT-5.x / OpenAI        ▼   │
├─────────────────────────────┤
│                             │
│ You                         │
│ この部分を書き直して       │
│                             │
│ Pidian                      │
│ ...                         │
│                             │
│ ▸ read_note                 │
│   example.md                │
│                             │
│ ▸ Thinking                  │
│                             │
├─────────────────────────────┤
│ example.md                  │
│ Selection: lines 42-47      │
│                             │
│ ┌─────────────────────────┐ │
│ │ Ask Pidian...           │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

Tool callやThinkingは折りたたみ表示する。

---

# 28. Settings

最低限以下を用意する。

### Agent

```text
Provider
Model
Custom OpenAI Compatible providers
```

### Credentials

```text
Provider API keys
```

環境変数を使用している場合は、

```text
Using environment variable
```

程度を表示し、値そのものは表示しない。

### Context

```text
Include selected text context: ON
```

### Permissions

```text
Read     Always
Search   Always
Create   Deny
Edit     Deny
```

### Editing

```text
Maximum editable notes: 5
```

### Session

```text
Auto-delete sessions: OFF
Retention days: 30
```

---

# 29. ディレクトリ構成

```text
src/
├── main.ts
│
├── domain/
│   ├── agent/
│   │   ├── AgentEngine.ts
│   │   ├── AgentSession.ts
│   │   └── AgentEvent.ts
│   │
│   ├── notes/
│   │   ├── NoteRepository.ts
│   │   └── NoteEditor.ts
│   │
│   └── sessions/
│       └── PidianSession.ts
│
├── application/
│   ├── AgentService.ts
│   ├── ContextService.ts
│   ├── PermissionService.ts
│   ├── CredentialResolver.ts
│   ├── SessionService.ts
│   └── SessionCleanupService.ts
│
├── infrastructure/
│   ├── pi/
│   │   ├── PiAgentAdapter.ts
│   │   ├── PiEventMapper.ts
│   │   ├── PiModelCatalog.ts
│   │   └── PiToolAdapter.ts
│   │
│   └── obsidian/
│       ├── ObsidianNoteRepository.ts
│       ├── ObsidianNoteEditor.ts
│       ├── EditorLeaseManager.ts
│       ├── ObsidianContextProvider.ts
│       └── ObsidianSessionRepository.ts
│
├── tools/
│   ├── ReadNoteTool.ts
│   ├── SearchNotesTool.ts
│   ├── CreateNoteTool.ts
│   └── EditNoteTool.ts
│
├── ui/
│   ├── PidianView.tsx
│   ├── Chat.tsx
│   ├── Composer.tsx
│   ├── Message.tsx
│   ├── ToolCall.tsx
│   ├── Thinking.tsx
│   ├── ModelSelector.tsx
│   └── SessionSelector.tsx
│
└── settings/
    ├── Settings.ts
    └── PidianSettingTab.ts
```

---

# 30. テスト方針

テスト効率を重視し、**Obsidianそのものを大量にmockしない。**

純粋なDomain/Applicationロジックを小さいinterfaceの後ろへ分離し、Fake実装でテストする。

テストランナーはVitestを採用する。

```text
pnpm test
pnpm test --watch
```

で高速実行できるようにする。

---

# 31. 優先してユニットテストする対象

特に以下を厚くテストする。

```text
CredentialResolver
PermissionService
ContextService
SessionCleanupService
PiEventMapper
revision検証
edit replacements検証
EditorLease上限
Session serialization
Session migration
```

例:

```text
Pidian設定にAPI keyあり
 + 環境変数あり
 → Pidian設定を返す
```

```text
edit permission = deny
 → Editor APIが一度も呼ばれない
```

```text
read後にnote revision変更
 → editを拒否
```

```text
EditorLease 5件使用中
 → 6件目を拒否
```

```text
selection context OFF
 → selection情報がAgent Promptに含まれない
```

---

# 32. テストしすぎない対象

以下は大量のユニットテストを作らない。

```text
Obsidian ItemViewそのもの
Obsidian Workspace挙動
単純なReact表示
Pi SDK内部
```

ここはIntegration / Manual smoke testへ寄せる。

ライブラリ自身の実装をテストし直さない。

---

# 33. Integration test

少数だけ用意する。

Fake Vault / Fake Editorを利用し、

```text
read
↓
edit
↓
revision更新
```

といった一連のApplication flowを確認する。

Piについては実APIをCIで呼ばない。

`FakeAgentEngine` を利用する。

---

# 34. Manual smoke test

READMEのDeveloper sectionにチェックリストを用意する。

主な確認項目:

```text
Sidebar起動
Chat送信
Streaming表示
Model切替
現在ノートContext
Selection Context
read_note
search_notes
create permission
edit permission
Undo
非アクティブノートUndo
5ファイル上限
Session再起動復元
AGENTS.md反映
古いSession削除
```

---

# 35. README.md

一つのREADME内を、

```text
User Guide
Developer Guide
```

へ明確に分ける。

## User向け

最低限以下を書く。

```text
Pidianとは
インストール
初期設定
Provider / Model設定
APIキー設定
環境変数
OpenAI Compatible
Permissions
現在ノートContext
Selection Context
Session
pidian/AGENTS.md
Undo
安全性
制限事項
```

特に、

```text
Create/Editはデフォルト無効
```

であることを明記する。

---

# 36. Developer向けREADME

以下を書く。

```text
必要環境
pnpm install
pnpm dev
pnpm build
pnpm test

Architecture
AgentEngine abstraction
Pi Adapter
Obsidian Tool architecture
Permission architecture
Undo architecture
Session format

Adding a Tool
Adding a Provider-specific configuration
Testing strategy
Release procedure
```

特に、

> Pi固有APIを `infrastructure/pi` の外へ持ち出さない

ことを開発ルールとしてREADMEに明記する。

---

# 37. 実装マイルストーン

## Milestone 1: Plugin skeleton

* Obsidian Sample Pluginベースで作成
* `id: pidian`
* Desktop only
* pnpm化
* TypeScript
* React
* Vitest
* Sidebar ItemView
* Settings Tab

完成条件:

```text
Pidian sidebarが開く
pnpm build成功
pnpm test成功
```

---

## Milestone 2: Agent abstraction

* `AgentEngine`
* `AgentSession`
* `AgentEvent`
* FakeAgentEngine
* PiAgentAdapter

まずFake AgentでUIを完成させる。

その後Piを接続する。

これによりUI開発がPi SDKへ依存しない。

---

## Milestone 3: Provider / Credential

* Pi Model catalog Adapter
* Model selector
* API key設定
* CredentialResolver
* 環境変数対応
* Custom OpenAI Compatible

この段階で、

```text
ユーザー入力
↓
Pi
↓
Streaming response
```

まで成立させる。

---

## Milestone 4: Context

* Active note snapshot
* Selection detection
* Selection focus
* Context setting
* `pidian/AGENTS.md`

この段階ではAgent Toolはまだ不要。

---

## Milestone 5: Read/Search Tools

* Pi built-in tools無効化
* read_note
* search_notes
* PermissionService
* Tool UI

デフォルト設定のままでAgentが安全に利用できる状態を作る。

---

## Milestone 6: Create

* create_note
* ask / allow / deny
* Confirmation Modal
* path validation

CreateはまだUndo対象とはしない。

ファイル生成を取り消したい場合はユーザーがObsidian上で削除する。

---

## Milestone 7: Safe Edit

ここを独立マイルストーンにする。

* read-before-edit
* revision
* exact replacement
* edit confirmation
* diff
* Editor transaction
* standard Undo

まず現在開いているノートのみで完成させる。

---

## Milestone 8: Non-active Edit

* EditorLeaseManager
* Background / auxiliary MarkdownView検証
* focus保持
* Undo検証
* max 5 notes
* 上限超過拒否

この機能はObsidianのEditor lifecycleへの依存が強いため、Pi統合とは切り離して実装する。

---

## Milestone 9: Session

* Pidian独自Session format
* `pidian/sessions/`
* history
* resume
* delete
* retention cleanup
* version migration

---

## Milestone 10: Documentation / Release readiness

* README User Guide
* README Developer Guide
* Manual smoke checklist
* unit tests整理
* lint
* build
* bundle確認
* community plugin要件確認

---

# 38. 最初に行う技術スパイク

本格実装前に1つだけ検証を行う。

**非アクティブノートをObsidian標準Undo可能な状態で編集できるか。**

検証内容:

```text
WorkspaceLeaf作成
↓
Markdown fileをロード
↓
Editor transactionで変更
↓
別ノートへ戻る
↓
再度対象ノートを開く
↓
Undo可能か
```

また、

```text
Leafを閉じた後もUndo履歴が保持されるか
```

を確認する。

結果によって `EditorLeaseManager` のライフサイクルを決める。

これはPidian全体で最もObsidian内部挙動への依存が強い部分なので、**最初に潰すべきリスク**とする。

Private APIへ逃げることはせず、公開APIでUndo保証が難しい場合は「編集対象Editorを最大5件保持する」という今回の制約で解決する。

---

# 39. 明示的に初期版ではやらないこと

スコープを保つため、以下は初期版対象外とする。

```text
Mobile対応
Embedding
Vector DB
Vault全体RAG index
Web検索Tool
Shell実行
任意filesystemアクセス
MCP
Sub-agent UI
画像生成
Pi Extension管理UI
複雑なAgent workflow
```

Piに機能が存在していても、自動的にPidianへ露出させない。

---

# 40. 設計上の最重要原則

Pidianでは次の依存関係を守る。

```text
Pi
  ↓
Pidian Tool abstraction
  ↓
Permission
  ↓
Safety validation
  ↓
Obsidian API
```

**PiからObsidianへ直接アクセスする経路は作らない。**

さらに編集では、

```text
Agent request
↓
Permission
↓
revision check
↓
exact patch validation
↓
Obsidian Editor transaction
↓
Undo history
```

を必須経路とする。
