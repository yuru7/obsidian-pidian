export class InstructionProvider {
  constructor(private readonly reader: () => Promise<string | undefined>) {}

  async getInstructions(): Promise<string | undefined> {
    const text = await this.reader();
    const trimmed = text?.trim();
    return trimmed ? trimmed : undefined;
  }
}
