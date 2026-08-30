/** Pi extensions exec arbitrary commands. Pidian does not load extensions. */
export async function execCommand() {
  throw new Error("Pidian does not execute shell commands");
}
