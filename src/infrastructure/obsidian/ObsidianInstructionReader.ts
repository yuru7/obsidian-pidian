import { normalizePath, type App } from "obsidian";
import { agentsFilePath } from "../../application/notePath";

export class ObsidianInstructionReader {
  constructor(private readonly app: App) {}

  async read(): Promise<string | undefined> {
    const path = normalizePath(agentsFilePath());
    const file = this.app.vault.getFileByPath(path);
    if (file) {
      return this.app.vault.read(file);
    }
    if (!(await this.app.vault.adapter.exists(path))) {
      return undefined;
    }
    return this.app.vault.adapter.read(path);
  }
}
