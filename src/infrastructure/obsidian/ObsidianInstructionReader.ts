import type { App } from "obsidian";
import { AGENTS_FILE_PATH } from "../../application/notePath";

export class ObsidianInstructionReader {
  constructor(private readonly app: App) {}

  async read(): Promise<string | undefined> {
    if (!(await this.app.vault.adapter.exists(AGENTS_FILE_PATH))) {
      return undefined;
    }
    return this.app.vault.adapter.read(AGENTS_FILE_PATH);
  }
}
