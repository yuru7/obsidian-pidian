/** AgentSession imports bash execution even when built-in tools are disabled. */
export async function executeBashWithOperations() {
  throw new Error("Pidian does not execute shell commands");
}
