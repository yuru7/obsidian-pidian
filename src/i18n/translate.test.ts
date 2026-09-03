import { describe, expect, it } from "vitest";
import { interpolate, lookup, resolveLocale } from "./translate";

describe("resolveLocale", () => {
  it("keeps supported language codes", () => {
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale("ja")).toBe("ja");
  });

  it("uses the language prefix when the region is unknown", () => {
    expect(resolveLocale("ja-JP")).toBe("ja");
  });

  it("falls back to English for unsupported languages", () => {
    expect(resolveLocale("zh")).toBe("en");
    expect(resolveLocale("")).toBe("en");
  });
});

describe("lookup", () => {
  it("returns Japanese strings for ja", () => {
    expect(lookup("ja", "uiSend")).toBe("送信");
    expect(lookup("ja", "uiPlaceholderStop")).toBe("Esc キーで停止");
    expect(lookup("en", "uiPlaceholderStop")).toBe("Esc to stop");
    expect(lookup("ja", "uiLoadingSessions")).toBe("セッションを読み込み中...");
    expect(lookup("en", "uiLoadingSessions")).toBe("Loading sessions...");
    expect(lookup("ja", "uiForked")).toBe("会話を分岐しました");
    expect(lookup("ja", "uiTotalTokens")).toBe("合計トークン量");
    expect(lookup("en", "uiTotalTokens")).toBe("Total tokens");
    expect(lookup("ja", "settingsTabGeneral")).toBe("全般");
    expect(lookup("ja", "settingsTabFavorites")).toBe("お気に入り");
    expect(lookup("ja", "settingsTabPermissions")).toBe("権限");
    expect(lookup("ja", "settingsTabApiAuth")).toBe("API認証");
    expect(lookup("ja", "settingsSubscriptions")).toBe("サブスクリプション");
    expect(lookup("en", "settingsSubscriptions")).toBe("Subscriptions");
    expect(lookup("ja", "settingsApiKeys")).toBe("API キー設定");
    expect(lookup("en", "settingsApiKeys")).toBe("API keys");
    expect(lookup("ja", "settingsSubscriptionLoggedOut")).toBe("未ログイン");
    expect(lookup("ja", "settingsSubscriptionLoggedIn")).toBe("ログイン済み");
    expect(lookup("ja", "settingsTabSession")).toBe("セッション");
    expect(lookup("ja", "settingsThinkingLevel")).toBe("思考量");
    expect(lookup("en", "settingsThinkingLevel")).toBe("Thinking");
    expect(lookup("ja", "uiNewChat")).toBe("新しいチャット");
    expect(lookup("ja", "uiOpenActiveSession")).toBe("開いているセッションファイルからセッションを開く");
    expect(lookup("ja", "uiVisionSupported")).toBe("Vision 対応");
    expect(lookup("en", "uiVisionSupported")).toBe("Vision compatible");
    expect(lookup("en", "uiOpenActiveSession")).toBe("Open session from the open session file");
    expect(lookup("ja", "uiSessionFileInvalid")).toBe("このセッションファイルは不正な形式のため読み取れません。");
  });

  it("interpolates placeholders", () => {
    expect(lookup("en", "noticeError", { error: "timeout" })).toBe("Pidian: timeout");
    expect(lookup("ja", "noticeError", { error: "timeout" })).toBe("Pidian: timeout");
    expect(lookup("en", "settingsEnvSet", { name: "OPENAI_API_KEY" })).toBe(
      'Environment variable "OPENAI_API_KEY" is set',
    );
    expect(lookup("ja", "settingsEnvSet", { name: "OPENAI_API_KEY" })).toBe(
      '環境変数 "OPENAI_API_KEY" が設定済み',
    );
    expect(lookup("en", "settingsEnvAvailable", { names: '"OPENAI_API_KEY"' })).toBe(
      'Environment variable "OPENAI_API_KEY" is available',
    );
    expect(lookup("ja", "settingsEnvAvailable", { names: '"OPENAI_API_KEY"' })).toBe(
      '環境変数 "OPENAI_API_KEY" が使用可能',
    );
    expect(lookup("en", "uiWorkedFor", { seconds: 8 })).toBe("Worked for 8s");
    expect(lookup("ja", "uiWorkedFor", { seconds: 8 })).toBe("Worked for 8s");
    expect(lookup("ja", "uiWorking")).toBe("Working");
    expect(lookup("ja", "uiThinking")).toBe("思考");
  });

  it("leaves the template unchanged when vars are omitted", () => {
    expect(interpolate("Hello {name}")).toBe("Hello {name}");
  });
});
