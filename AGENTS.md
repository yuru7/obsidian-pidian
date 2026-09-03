## このリポジトリ

実装・変更の前に [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) を読む。依存方向、ツール追加手順、Pi 隔離、パス制限、禁止事項をそこに固定する。ビルド・テスト・リリースは [CONTRIBUTING.md](CONTRIBUTING.md)。コードチェックで出た警告の書き方は [docs/CODE_CHECK_WARNINGS.md](docs/CODE_CHECK_WARNINGS.md)。実装時はそこに載っている警告を繰り返さない。

---

## Obsidian 開発リファレンス

Obsidian 固有の仕様・API・推奨実装について判断する場合は、以下を優先して参照する。

### 優先順位

1. **Obsidian Developer Documentation**

   * https://docs.obsidian.md/
   * プラグイン開発、API、UI、Vault 操作などの公式ドキュメントとして最優先する。

2. **`obsidian` パッケージの型定義**

   * `node_modules/obsidian/obsidian.d.ts`
   * API の引数、戻り値、deprecated 指定、TSDoc を確認する。
   * 実装時点でインストールされているバージョンの型定義を、API の具体的な仕様確認に利用する。

3. **Obsidian Sample Plugin**

   * https://github.com/obsidianmd/obsidian-sample-plugin
   * Plugin lifecycle、command、settings、event registration などの公式実装例として参照する。

4. **既存の Community Plugin**

   * 公式資料だけでは実装方法が判断できない場合に参考にする。
   * Community Plugin の実装は正解とは限らないため、そのまま模倣せず、公式 API と照合する。

5. **フォーラム・Issue・その他 Web 情報**

   * 仕様が不明な場合の補助資料として利用する。
   * 古い情報である可能性を考慮し、可能なら公式ドキュメント・型定義・現在の Obsidian で確認する。

### 調査・実装時のルール

* Obsidian API を使用する前に、必要に応じて公式ドキュメントまたは `obsidian.d.ts` を確認する。
* API 名、引数、イベント名などを推測で作らない。
* deprecated API が存在する場合は、原則として現在推奨されている API を使用する。
* インターネット上のコード例より、このリポジトリにインストールされている `obsidian` パッケージの型定義を優先する。
* Obsidian の内部実装や非公開 API に依存する場合は、公開 API では実現できないことを確認したうえで使用する。
* 非公開 API や DOM 内部構造へ依存する場合は、コードコメントまたは関連ドキュメントに理由と互換性リスクを残す。
* 既存 Community Plugin を参考にする場合も、その実装が現在の Obsidian API と整合しているか確認する。

### 不明な仕様への対応

仕様や API の挙動が明確でない場合は、推測で実装を進めない。

可能な限り次の順で確認する。

1. リポジトリ内の既存実装
2. `node_modules/obsidian/obsidian.d.ts`
3. Obsidian Developer Documentation
4. Obsidian Sample Plugin
5. Community Plugin の実装
6. Obsidian Forum / GitHub Issue 等

確認しても判断できない場合は、不明点と想定される選択肢をユーザーへ提示する。
