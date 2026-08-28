# ExecPlan: Pi 向け `web_search` / `fetch_url` ツール実装

## 目的

Pi Agent に以下の2つの Web アクセスツールを追加する。

* `web_search`

  * Web検索を行い、検索結果を構造化データとLLM向けテキストの両方で返す
* `fetch_url`

  * 指定URLからコンテンツを取得し、LLMが扱いやすい形式へ変換して返す

初期実装では検索プロバイダーとして DuckDuckGo を使用する。

将来的に Brave、SearXNG、Tavily、Exa などの検索プロバイダーを追加しやすい構成とする。

Webアクセス機能そのものは Pi / Obsidian に依存させず、独立したモジュールとして実装する。

---

# 1. 設計方針

## 1.1 責務分離

以下の3層に分ける。

```text
Pi Tool Adapter
    ↓
Web Access Application
    ↓
Provider / Fetch Infrastructure
```

想定構成:

```text
src/
  web/
    search/
      search-provider.ts
      search-service.ts
      search-result.ts
      providers/
        duckduckgo-search-provider.ts

    fetch/
      fetch-service.ts
      content-extractor.ts
      readability-extractor.ts
      defuddle-extractor.ts

    security/
      ssrf-guard.ts

    config/
      web-access-config.ts

  pi/
    tools/
      web-search-tool.ts
      fetch-url-tool.ts
```

`src/web/` は Pi API や Obsidian API に依存しない。

これにより、将来的に以下から再利用できる構成にする。

* Obsidian Plugin
* Pi Extension
* CLI
* Node.jsアプリケーション
* テストコード

---

# 2. `web_search` 設計

## 2.1 SearchProvider インターフェース

検索エンジン固有処理を抽象化する。

```ts
interface SearchProvider {
  readonly id: string;

  search(
    query: string,
    options: SearchOptions,
  ): Promise<SearchResponse>;
}
```

想定型:

```ts
interface SearchOptions {
  maxResults?: number;
  domainFilters?: string[];
  signal?: AbortSignal;
}

interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
}

interface SearchResponse {
  provider: string;
  results: SearchResult[];
}
```

初期プロバイダー:

```text
DuckDuckGoSearchProvider
```

将来的には以下を追加できる。

```text
BraveSearchProvider
SearXNGSearchProvider
TavilySearchProvider
ExaSearchProvider
```

---

# 3. DuckDuckGo 検索

DuckDuckGo HTML Searchを利用する。

エンドポイント:

```text
https://html.duckduckgo.com/html/
```

検索クエリ:

```text
?q=...
```

HTML解析には `linkedom` を利用する。

抽出対象:

```text
.result
.result__a
.result__snippet
```

広告結果は除外する。

DuckDuckGoのリダイレクトURLについては `uddg` パラメータを解析し、実URLへ正規化する。

---

# 4. SearchService

検索プロバイダーを直接 Pi Tool から呼ばず、`SearchService` を介する。

```text
web_search
    ↓
SearchService
    ↓
SearchProviderRegistry
    ↓
SearchProvider
```

SearchService の責務:

* 利用プロバイダーの決定
* フォールバック
* provider指定の上書き
* エラー正規化

---

# 5. 検索プロバイダー選択

通常は設定された優先順位を使用する。

例:

```json
{
  "searchProviders": [
    "duckduckgo"
  ]
}
```

将来的には:

```json
{
  "searchProviders": [
    "brave",
    "duckduckgo",
    "searxng"
  ]
}
```

のように指定できるようにする。

処理:

```text
Brave
 ↓ failure
DuckDuckGo
 ↓ failure
SearXNG
```

ただし、初期実装では DuckDuckGo のみ存在する。

---

# 6. Pi からの provider 上書き

`web_search` Tool引数として provider を指定できるようにする。

例:

```json
{
  "query": "Pi coding agent",
  "provider": "duckduckgo"
}
```

provider指定なし:

```text
設定された優先順位を使用
```

provider指定あり:

```text
指定providerのみ使用
```

指定された provider が未登録の場合は明示的なエラーを返す。

---

# 7. `web_search` の Tool API

入力例:

```ts
interface WebSearchInput {
  query: string;
  maxResults?: number;
  provider?: string;
  domainFilters?: string[];
}
```

`maxResults` の初期値:

```text
5
```

最大値:

```text
20
```

を想定する。

---

# 8. `web_search` の戻り値

構造化データを内部的に保持しつつ、Piには読みやすいテキストも返す。

内部結果:

```ts
interface WebSearchResult {
  query: string;
  provider: string;
  results: SearchResult[];
  text: string;
}
```

LLM向けテキスト例:

```text
1. Pi coding agent
https://example.com/pi

Pi coding agent is ...

2. Pi documentation
https://example.com/docs

Documentation for ...
```

Pi Tool Adapter側で、この `text` を Agent Tool Result として返す。

構造化結果は将来的に、

* UI表示
* ログ
* キャッシュ
* 検索結果再利用

へ利用できるようにする。

---

# 9. `web_search` と `fetch_url` は分離する

`web_search` は検索結果のみ返す。

自動で検索結果ページを取得しない。

処理イメージ:

```text
Pi
 ↓
web_search("Pi Agent")
 ↓
検索結果URL一覧
 ↓
Piが必要なURLを判断
 ↓
fetch_url(url)
```

これにより、

* 不要なHTTPアクセス削減
* トークン削減
* ツール責務の単純化
* Agent自身によるソース選択

が可能になる。

---

# 10. `fetch_url` 設計

初期対応コンテンツ:

```text
HTML
text/*
application/json
application/*+json
application/xml
application/*+xml
```

初期段階では対応しない:

```text
PDF
画像
動画
ZIP
その他バイナリ
```

これらは必要になった段階で別Extractorまたは専用ツールとして追加する。

---

# 11. FetchService

処理フロー:

```text
URL
 ↓
URL validation
 ↓
SSRF Guard
 ↓
HTTP fetch
 ↓
Content-Type 判定
 ↓
HTML?
 ├─ Yes → HTML extraction
 └─ No  → textとして返却
```

HTMLの場合:

```text
HTML
 ↓
Readability
 ↓
Markdown化
 ↓
500文字以上?
 ├─ Yes → 採用
 └─ No
      ↓
    Defuddle
      ↓
    Markdown
```

---

# 12. Readability

HTML本文抽出の第一候補として

```text
@mozilla/readability
```

を使用する。

DOM生成:

```text
linkedom
```

を使用する。

処理:

```ts
const { document } = parseHTML(html);

const reader = new Readability(
  document as unknown as Document
);

const article = reader.parse();
```

取得対象:

```text
title
content
```

`content` はHTMLなので Turndown でMarkdownへ変換する。

---

# 13. Turndown

ReadabilityのHTML結果をMarkdownへ変換する。

依存:

```text
turndown
```

初期設定:

```ts
new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});
```

---

# 14. Readability結果の品質判定

Readabilityが成功しても、本文が短すぎる場合は結果を採用しない。

基準:

```text
500文字
```

定数:

```ts
const MIN_USEFUL_CONTENT_LENGTH = 500;
```

判定:

```ts
if (markdown.length >= MIN_USEFUL_CONTENT_LENGTH) {
  return readabilityResult;
}
```

500文字未満の場合は Defuddle を試す。

初期実装ではこの値を設定ファイル化せず定数とする。

将来必要になった場合のみ設定化する。

---

# 15. Defuddle

Readabilityのフォールバックとして使用する。

依存:

```text
defuddle
```

実行:

```ts
const result = await Defuddle(document, url, {
  markdown: true,
  useAsync: false,
});
```

DefuddleはMarkdownを直接返すため Turndown は使用しない。

処理:

```text
Readability
 ↓
失敗 / 500文字未満
 ↓
Defuddle
```

ページ種別を事前判定して使い分けることはしない。

抽出結果の品質によってフォールバックする。

---

# 16. Defuddleも十分な結果を返さない場合

Defuddleの結果も500文字未満の場合は、最終結果としてより良い方を返す。

初期ルール:

```text
Readability結果あり
  → Readability結果を返す

Readability結果なし
  → Defuddle結果を返す

両方なし
  → extraction error
```

この場合、

```text
error:
Could not extract readable content from HTML
```

などの明示的な結果とする。

---

# 17. JavaScriptレンダリングページ

初期実装ではブラウザレンダリングを行わない。

以下のようなページ:

```text
<body>
  <div id="root"></div>
  <script ...>
```

では本文取得に失敗する可能性がある。

軽量なヒューリスティックを設ける。

例:

```text
本文テキスト < 500文字
かつ
<script> が複数存在
```

の場合:

```text
Page appears to require JavaScript rendering
```

と返す。

Playwright / Chromium 等は初期実装には含めない。

---

# 18. SSRF対策

`fetch_url` ではURLを直接 `fetch()` しない。

必ず `SsrfGuard` を通す。

禁止対象:

```text
localhost
127.0.0.0/8
::1

10.0.0.0/8
172.16.0.0/12
192.168.0.0/16

169.254.0.0/16

fc00::/7
fe80::/10
```

加えて AWS Metadata Endpoint:

```text
169.254.169.254
```

も禁止対象になる。

---

# 19. DNS rebinding対策

URLのhostname文字列だけでは判定しない。

例:

```text
https://example.internal-attacker.com
```

がDNS解決後、

```text
127.0.0.1
10.0.0.1
169.254.169.254
```

を返す可能性がある。

そのため、

```text
hostname
 ↓
DNS resolve
 ↓
IP address validation
 ↓
fetch
```

とする。

IPv4 / IPv6 の両方を検査する。

---

# 20. Redirect時のSSRFチェック

HTTP redirect時も遷移先を再検証する。

禁止:

```text
https://example.com
 ↓ 302
http://169.254.169.254/
```

最大redirect回数:

```text
5
```

程度とする。

redirect先ごとに:

```text
validateUrl()
 ↓
DNS resolve
 ↓
IP validation
```

を行う。

---

# 21. `fetch_url` Tool API

入力:

```ts
interface FetchUrlInput {
  url: string;
}
```

初期版では意図的にオプションを増やしすぎない。

将来的に必要になった場合のみ、

```text
mode
timeout
maxSize
```

などを追加する。

---

# 22. `fetch_url` 戻り値

内部型:

```ts
interface FetchResult {
  url: string;
  finalUrl: string;
  title?: string;
  contentType: string;
  content: string;
  extractor?: "readability" | "defuddle" | "text";
}
```

Pi向け表示:

```text
Title: Example

URL: https://example.com/

# Example

本文...
```

`extractor` は主にデバッグ・テスト用途とする。

---

# 23. HTTP制限

無制限の取得を防止する。

初期値:

```text
timeout: 30秒
max response size: 5MB
redirect: 5回
```

`Content-Length` が存在する場合は事前確認する。

存在しない場合もストリーム読み込み中にサイズ上限を確認する。

上限超過時:

```text
Response too large
```

として中断する。

---

# 24. User-Agent

最低限明示的なUser-Agentを設定する。

例:

```text
pidian-web-access/1.0
```

DuckDuckGo検索についても同様に独自User-Agentを設定する。

---

# 25. Provider Registry

将来の検索プロバイダー追加を簡単にするため Registry を設ける。

例:

```ts
class SearchProviderRegistry {
  private readonly providers =
    new Map<string, SearchProvider>();

  register(provider: SearchProvider): void;

  get(id: string): SearchProvider | undefined;

  has(id: string): boolean;
}
```

登録:

```ts
registry.register(
  new DuckDuckGoSearchProvider()
);
```

将来:

```ts
registry.register(
  new BraveSearchProvider(config.brave)
);

registry.register(
  new SearXNGSearchProvider(config.searxng)
);
```

SearchService側は各providerの詳細を知らない。

---

# 26. Provider固有設定

将来の追加を考慮し、設定はprovider単位で分離できる構造とする。

想定:

```json
{
  "search": {
    "providers": [
      "duckduckgo"
    ],
    "providerConfig": {
      "duckduckgo": {},
      "brave": {
        "apiKey": "..."
      },
      "searxng": {
        "baseUrl": "..."
      }
    }
  }
}
```

ただし初期実装では過度な設定システムを作らない。

DuckDuckGoは設定不要のため、

```text
provider優先順位
```

だけあれば動作する構成とする。

---

# 27. Pi Tool Adapter

`src/pi/tools/` では Web Access Application を Pi Tool API に変換するだけにする。

例:

```text
web-search-tool.ts
    ↓
SearchService

fetch-url-tool.ts
    ↓
FetchService
```

ここに、

```text
DuckDuckGo HTML解析
Readability
Defuddle
SSRF判定
```

などの実装を置かない。

---

# 28. Tool名

初期名称:

```text
web_search
fetch_url
```

`pi-web-access` の `fetch_content` ではなく `fetch_url` とすることで、

```text
URLを取得するツール
```

という責務を明確にする。

---

# 29. `web_search` Tool description

Agentが適切に利用できるよう、descriptionでは以下を明示する。

```text
Search the web and return matching pages with titles,
URLs, and snippets.

Use fetch_url when the contents of a result page are needed.
```

重要なのは、

```text
検索結果本文が必要なら fetch_url
```

と明示すること。

---

# 30. `fetch_url` Tool description

例:

```text
Fetch and extract readable content from an HTTP or HTTPS URL.

HTML pages are converted to Markdown.
Use this after web_search when full page content is needed.
```

---

# 31. エラー設計

Provider固有例外をPiまで露出しすぎない。

共通エラー:

```text
SearchProviderUnavailableError
SearchFailedError

InvalidUrlError
BlockedUrlError
FetchTimeoutError
ResponseTooLargeError
UnsupportedContentTypeError
ContentExtractionError
```

Pi Tool Adapterでユーザー向けメッセージへ変換する。

---

# 32. ログ

最低限以下を記録できるようにする。

検索:

```text
provider
query
result count
duration
success / failure
```

fetch:

```text
URL
final URL
HTTP status
content type
response size
extractor
duration
success / failure
```

本文そのものはログに残さない。

---

# 33. テスト方針

ネットワーク依存テストと純粋ロジックテストを分離する。

---

# 34. SearchProviderテスト

DuckDuckGo HTML fixture を用意する。

実ネットワークを使用せず、

```text
HTML fixture
 ↓
DuckDuckGoSearchProvider
 ↓
SearchResult[]
```

をテストする。

確認項目:

* title抽出
* URL抽出
* snippet抽出
* `uddg` decode
* 広告除外
* maxResults
* domain filter

---

# 35. SearchServiceテスト

Fake Providerを用意する。

```text
Provider A → failure
Provider B → success
```

として、

```text
fallbackが正しく行われる
```

ことを確認する。

また、

```text
provider指定時はfallbackしない
```

ことを確認する。

---

# 36. Readabilityテスト

記事形式HTML fixtureを用意する。

確認:

```text
navigationが除去される
本文が残る
Markdownになる
```

---

# 37. Defuddleフォールバックテスト

Readabilityが、

```text
null
```

または

```text
500文字未満
```

になるfixtureを用意する。

その場合、

```text
Defuddle結果が採用される
```

ことを確認する。

---

# 38. Text Contentテスト

以下をfixture化する。

```text
text/plain
application/json
application/xml
```

これらについて本文抽出処理を通さず、テキストとして返却されることを確認する。

---

# 39. SSRFテスト

最低限以下を拒否する。

```text
http://localhost/
http://127.0.0.1/
http://10.0.0.1/
http://172.16.0.1/
http://192.168.0.1/
http://169.254.169.254/
http://[::1]/
```

DNS resolverはDependency Injectionできるようにし、

```text
example.com
 ↓
127.0.0.1
```

を返すFake DNS resolverでDNS rebinding対策をテストする。

---

# 40. Redirect SSRFテスト

Fake HTTP serverまたはfetch mockを使い、

```text
public URL
 ↓
302
 ↓
private IP
```

を再現する。

redirect先でブロックされることを確認する。

---

# 41. サイズ制限テスト

以下を確認する。

```text
Content-Length > limit
```

および

```text
Content-Lengthなし
stream途中でlimit超過
```

の両方。

---

# 42. タイムアウトテスト

AbortSignalを利用し、

```text
30秒タイムアウト
```

を実装する。

テストでは短いtimeoutを注入して確認する。

---

# 43. 実装順序

## Phase 1: ドメイン型

以下を作成する。

```text
SearchProvider
SearchOptions
SearchResult
SearchResponse
FetchResult
```

Pi依存を含めない。

---

## Phase 2: DuckDuckGo Provider

実装:

```text
DuckDuckGoSearchProvider
```

fixtureベースの単体テストを完成させる。

---

## Phase 3: Provider Registry / SearchService

実装:

```text
SearchProviderRegistry
SearchService
```

以下を完成させる。

```text
provider lookup
priority selection
fallback
explicit provider override
```

---

## Phase 4: SSRF Guard

実装:

```text
URL validation
DNS resolution
IP classification
redirect validation
```

FetchServiceより先に完成させる。

---

## Phase 5: HTTP Fetch

実装:

```text
timeout
redirect
max response size
content type
text response
```

この段階ではHTML本文抽出を行わなくてもよい。

---

## Phase 6: Readability

追加:

```text
linkedom
@mozilla/readability
turndown
```

HTMLをMarkdownへ変換する。

---

## Phase 7: Defuddle

追加:

```text
defuddle
```

Readabilityが、

```text
失敗
または
500文字未満
```

の場合のみ実行する。

---

## Phase 8: FetchService統合

以下をまとめる。

```text
HTTP
 ↓
Content Type
 ↓
Readability
 ↓
Defuddle
 ↓
FetchResult
```

---

## Phase 9: Pi Tool Adapter

Pi側へ

```text
web_search
fetch_url
```

を登録する。

Pi固有型やTool schemaはここだけに閉じ込める。

---

## Phase 10: 結合テスト

実際のPi Agentから以下を確認する。

```text
web_search
 ↓
検索結果取得
 ↓
URL選択
 ↓
fetch_url
 ↓
本文取得
 ↓
回答
```

---

# 44. 初期依存パッケージ

想定:

```text
@mozilla/readability
defuddle
linkedom
turndown
```

必要に応じて型定義:

```text
@types/turndown
```

IP/CIDR判定については、まずNode.js標準APIで十分に実装可能か確認する。

複雑化する場合のみ軽量なIP判定ライブラリを追加する。

不要な依存追加は避ける。

---

# 45. 初期スコープ外

以下は今回実装しない。

```text
PDF解析
画像解析
YouTube解析
Playwright / Chromium
認証済みWebページ
Cookie取得
検索結果キャッシュ
検索履歴
検索結果ストレージ
LLMによる検索クエリ書き換え
検索結果要約
source_check
robots.txt処理
```

必要になった段階で追加する。

---

# 46. 将来拡張

## 検索Provider

以下を `SearchProvider` 実装として追加できる。

```text
Brave
SearXNG
Tavily
Exa
Perplexity
Google
```

既存のSearchServiceやPi Toolを変更せず、

```ts
registry.register(...)
```

だけで追加できる状態を目標とする。

---

## Fetch Extractor

将来的にはコンテンツタイプ単位で、

```text
HtmlExtractor
PdfExtractor
JsonExtractor
ImageExtractor
```

へ分割可能にする。

ただし、初期実装から過度に抽象化しない。

現時点では、

```text
FetchService
ContentExtractor
Readability
Defuddle
```

程度に留める。

---

# 47. 完了条件

以下をすべて満たした時点で完了とする。

### `web_search`

* DuckDuckGo検索ができる
* title / URL / snippetを取得できる
* 最大結果数を指定できる
* domain filterを指定できる
* providerを明示指定できる
* provider未指定時は設定順に選択される
* provider追加時にSearchServiceの変更が不要

### `fetch_url`

* HTTP / HTTPS URLを取得できる
* HTMLをMarkdownへ変換できる
* Readabilityを第一候補として使用する
* Readabilityが500文字未満ならDefuddleへフォールバックする
* text / JSON / XMLを取得できる
* timeoutが機能する
* response size limitが機能する
* private / loopback / link-local IPを拒否する
* DNS解決後のIPも検証する
* redirect先もSSRF検証する

### アーキテクチャ

* Web Access層がPiに依存していない
* Pi Tool AdapterのみPi APIへ依存する
* DuckDuckGo固有ロジックがSearchServiceに漏れていない
* 検索プロバイダー追加が `SearchProvider` 実装の追加を中心に完結する

---

# 48. 実装時の原則

この実装では、将来拡張可能性を確保しつつも、初期段階から汎用フレームワーク化しすぎない。

特に以下を守る。

```text
SearchProvider は抽象化する
Fetch Provider はまだ抽象化しない
Content Extractor は必要最小限にする
設定項目を増やしすぎない
Pi依存だけは明確に分離する
```

将来検索Providerが増えることは既に想定できているため `SearchProvider` は初期段階から抽象化する。

一方、

```text
PDF
ブラウザレンダリング
認証Fetch
複数Fetch Provider
```

については、現時点では具体的な要求がないため抽象化・実装しない。

YAGNIを維持しながら、検索Provider追加だけは明確な拡張ポイントとして確保する。
