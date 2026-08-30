/** Pi's bash tool spawns a shell. Pidian never enables it. */
export function createLocalBashOperations() {
  return {
    async exec() {
      throw new Error("Pidian does not execute shell commands");
    },
  };
}

export function createLocalShellOperations() {
  return createLocalBashOperations();
}

export const bashToolSystemPromptContribution = {
  snippet: "",
  guidelines: [],
};

export function createBashToolDefinition() {
  throw new Error("Pidian does not expose the bash tool");
}

export function createBashTool() {
  throw new Error("Pidian does not expose the bash tool");
}
