/** Pi locates bash/PowerShell with child_process. Pidian does not run a shell. */
export function getShellConfig() {
  throw new Error("Pidian does not execute shell commands");
}

export function getPowerShellConfig() {
  throw new Error("Pidian does not execute shell commands");
}

export function getShellEnv() {
  return {};
}

export function killProcessTree() {}
export function trackDetachedChildPid() {}
export function untrackDetachedChildPid() {}
export function sanitizeBinaryOutput(value) {
  return value ?? "";
}
