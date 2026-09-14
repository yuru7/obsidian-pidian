# コードチェックのワーニング実績

Obsidian プラグイン審査と eslint-plugin-obsidianmd / typescript-eslint で出た警告の書き方。実装時は同じ警告を出さない。

## CSS: `multicolumn` が部分対応

`column-gap` / `row-gap` はフレックスでも CSS Multi-column と判定される。`gap` を使う。縦横が違うなら `gap: <row> <column>`。

## CSS: `obsidianmd/no-static-styles-assignment`

`el.style.color = "red"` や `el.style.setProperty("color", "red")` などリテラル代入は使わない。静的な見た目は CSS クラス。動的な値は `setCssStyles`。`--custom` 変数は `setCssProps`。

## DOM: `obsidianmd/prefer-create-el`

`document.createElement` は使わない。`createEl` / `createDiv` / `createSpan` / `createSvg` / `createFragment` を使う。`createEl("span")` は `createSpan()`、`createEl("div")` は `createDiv()`。親に付けない要素はグローバルの `createEl("canvas")` など。

## タイマー: popout 互換

`setTimeout` / `clearTimeout` ではなく `window.setTimeout` / `window.clearTimeout`。

## TypeScript: `any` / `unknown`

`JSON.parse` の結果は `unknown` で受ける（`const parsed: unknown = JSON.parse(text)`、または `as unknown` を返すヘルパ）。`unknown | T` は書かない。`unknown` が他型を飲み込む。

## TypeScript: `no-unnecessary-type-assertion`

戻り先が元の型を受け取れる `as T` は書かない。`unknown` をオブジェクトへ狭めるときは `as T` ではなく `value is T` の型ガード。

## CSS: `:has`

`:has` はセレクタ無効化が広く、審査で性能警告になる。子の有無で親を変えたいときは、子側の既存クラスへスタイルを置くか、条件時にクラスを付ける。
