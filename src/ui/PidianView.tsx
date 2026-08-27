import { ItemView, WorkspaceLeaf } from "obsidian";
import { createRoot, type Root } from "react-dom/client";
import type PidianPlugin from "../main";
import { PidianApp } from "./PidianApp";
import { PIDIAN_ICON_ID } from "./pidianIcon";

export const VIEW_TYPE_PIDIAN = "pidian-view";

export class PidianView extends ItemView {
  private root: Root | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: PidianPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_PIDIAN;
  }

  getDisplayText(): string {
    return "Pidian";
  }

  getIcon(): string {
    return PIDIAN_ICON_ID;
  }

  async onOpen(): Promise<void> {
    const content = (this.containerEl.children[1] ?? this.contentEl) as HTMLElement;
    content.empty();
    content.addClass("pidian-view");
    this.root = createRoot(content);
    this.root.render(<PidianApp plugin={this.plugin} />);
  }

  async onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
  }
}
