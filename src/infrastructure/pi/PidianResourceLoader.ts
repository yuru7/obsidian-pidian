export interface PidianAgentsFile {
  path: string;
  content: string;
}

export interface PidianResourceLoaderOptions {
  systemPrompt?: string;
  agentsFiles?: PidianAgentsFile[];
}

function emptyDiagnostics() {
  return { diagnostics: [] as Array<{ path: string; message: string }> };
}

function emptyRuntime() {
  return {
    flagValues: new Map<string, string | boolean>(),
    pendingProviderRegistrations: [] as Array<unknown>,
    pendingNativeProviderRegistrations: [] as Array<unknown>,
    refreshTools: () => {},
    sendMessage: () => {},
    sendUserMessage: () => {},
    appendEntry: () => {},
    setSessionName: () => {},
    getSessionName: () => undefined,
    setLabel: () => {},
    getActiveTools: () => [] as string[],
    getAllTools: () => [] as string[],
    setActiveTools: () => {},
    getCommands: () => [] as unknown[],
    setModel: async () => {},
    getThinkingLevel: () => "off",
    setThinkingLevel: () => {},
    assertActive: () => {},
    invalidate: () => {},
    trackEventBusSubscription: (unsubscribe: () => void) => unsubscribe,
    registerProvider: () => {},
    registerNativeProvider: () => {},
    unregisterProvider: () => {},
  };
}

/**
 * Supplies only the system prompt and AGENTS.md content Pi needs.
 * DefaultResourceLoader pulls the extension loader, TUI themes, and jiti even
 * when those features are disabled at runtime.
 */
export class PidianResourceLoader {
  private readonly systemPrompt: string | undefined;
  private readonly agentsFiles: PidianAgentsFile[];

  constructor(options: PidianResourceLoaderOptions = {}) {
    this.systemPrompt = options.systemPrompt;
    this.agentsFiles = options.agentsFiles ?? [];
  }

  getExtensions() {
    return { extensions: [], errors: [], runtime: emptyRuntime() };
  }

  getSkills() {
    return { skills: [], ...emptyDiagnostics() };
  }

  getPrompts() {
    return { prompts: [], ...emptyDiagnostics() };
  }

  getThemes() {
    return { themes: [], ...emptyDiagnostics() };
  }

  getAgentsFiles() {
    return { agentsFiles: this.agentsFiles };
  }

  getSystemPrompt() {
    return this.systemPrompt;
  }

  getSystemPromptSource() {
    return undefined;
  }

  getAppendSystemPrompt() {
    return [] as string[];
  }

  getAppendSystemPromptSources() {
    return [] as Array<{ path: string }>;
  }

  extendResources(_paths?: unknown) {}

  async reload(_options?: unknown) {}
}

/** sdk.js falls back to `new DefaultResourceLoader(...)` if no loader is passed. */
export { PidianResourceLoader as DefaultResourceLoader };

export function loadProjectContextFiles(_options?: unknown) {
  return [] as PidianAgentsFile[];
}
