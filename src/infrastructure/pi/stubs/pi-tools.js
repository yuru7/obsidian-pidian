/**
 * Pi's coding tools (bash, grep/find via downloaded ZIP binaries, write) are
 * unused: Pidian passes `noTools: "builtin"` and its own Obsidian tools.
 * Keep the factories so AgentSession can still construct an empty registry.
 */
function unavailable(name) {
  return {
    name,
    label: name,
    description: `Pidian does not expose the ${name} tool`,
    parameters: { type: "object", properties: {} },
    async execute() {
      throw new Error(`Pidian does not expose the ${name} tool`);
    },
  };
}

export const allToolNames = new Set();

export function withFileMutationQueue(_path, fn) {
  return fn();
}

export function createToolDefinition() {
  throw new Error("Pidian does not expose Pi built-in tools");
}

export function createTool() {
  throw new Error("Pidian does not expose Pi built-in tools");
}

export function createReadToolDefinition() {
  return unavailable("read");
}
export function createBashToolDefinition() {
  return unavailable("bash");
}
export function createPowerShellToolDefinition() {
  return unavailable("powershell");
}
export function createEditToolDefinition() {
  return unavailable("edit");
}
export function createWriteToolDefinition() {
  return unavailable("write");
}
export function createGrepToolDefinition() {
  return unavailable("grep");
}
export function createFindToolDefinition() {
  return unavailable("find");
}
export function createLsToolDefinition() {
  return unavailable("ls");
}

export function createReadTool() {
  return unavailable("read");
}
export function createBashTool() {
  return unavailable("bash");
}
export function createPowerShellTool() {
  return unavailable("powershell");
}
export function createEditTool() {
  return unavailable("edit");
}
export function createWriteTool() {
  return unavailable("write");
}
export function createGrepTool() {
  return unavailable("grep");
}
export function createFindTool() {
  return unavailable("find");
}
export function createLsTool() {
  return unavailable("ls");
}

export function createCodingToolDefinitions() {
  return [];
}
export function createReadOnlyToolDefinitions() {
  return [];
}
export function createAllToolDefinitions() {
  return {};
}
export function createCodingTools() {
  return [];
}
export function createReadOnlyTools() {
  return [];
}
export function createAllTools() {
  return {};
}
