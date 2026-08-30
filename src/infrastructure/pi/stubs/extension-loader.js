/**
 * Pi's extension loader imports the package barrel, which pulls the CLI,
 * self-update, and ZIP extraction into the Obsidian bundle. Pidian never loads
 * Pi extensions.
 */
export function clearExtensionCache() {}

export function createExtensionRuntime() {
  return {
    flagValues: new Map(),
    pendingProviderRegistrations: [],
    pendingNativeProviderRegistrations: [],
    refreshTools() {},
    sendMessage() {},
    sendUserMessage() {},
    appendEntry() {},
    setSessionName() {},
    getSessionName() {},
    setLabel() {},
    getActiveTools() {
      return [];
    },
    getAllTools() {
      return [];
    },
    setActiveTools() {},
    getCommands() {
      return [];
    },
    async setModel() {},
    getThinkingLevel() {
      return "off";
    },
    setThinkingLevel() {},
    assertActive() {},
    invalidate() {},
    trackEventBusSubscription(unsubscribe) {
      return unsubscribe;
    },
    registerProvider() {},
    registerNativeProvider() {},
    unregisterProvider() {},
  };
}

function emptyResult() {
  return { extensions: [], errors: [], runtime: createExtensionRuntime() };
}

export async function loadExtensionFromFactory() {
  throw new Error("Pidian does not load Pi extensions");
}

export async function loadExtensions() {
  return emptyResult();
}

export async function loadExtensionsCached() {
  return emptyResult();
}

export async function discoverAndLoadExtensions() {
  return emptyResult();
}
