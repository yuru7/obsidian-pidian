import { FileView, type App } from "obsidian";
import { useEffect, useReducer, useState, type JSX } from "react";
import { normalizeNotePath } from "../application/notePath";
import { isStoredSessionFile } from "../application/sessionFilePath";
import { t } from "../i18n";
import type PidianPlugin from "../main";

export function OpenActiveSessionButton({ plugin }: { plugin: PidianPlugin }): JSX.Element | null {
  const [, rerender] = useReducer((value: number) => value + 1, 0);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    const onChange = () => {
      setInvalid(false);
      rerender();
    };
    const workspace = plugin.app.workspace;
    const vault = plugin.app.vault;
    const leafChangeRef = workspace.on("active-leaf-change", onChange);
    const fileOpenRef = workspace.on("file-open", onChange);
    const renameRef = vault.on("rename", onChange);
    const deleteRef = vault.on("delete", onChange);
    return () => {
      workspace.offref(leafChangeRef);
      workspace.offref(fileOpenRef);
      vault.offref(renameRef);
      vault.offref(deleteRef);
    };
  }, [plugin]);

  const path = activeFilePath(plugin.app);
  if (!path || !isStoredSessionFile(path, plugin.settings.pluginDirectory)) {
    return null;
  }

  return (
    <div className={`pidian-open-session${invalid ? " is-error" : ""}`}>
      <button
        type="button"
        className="pidian-icon-button"
        aria-label={t("uiOpenActiveSession")}
        aria-invalid={invalid || undefined}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          void plugin.openSessionFile(path).then(
            () => setInvalid(false),
            () => setInvalid(true),
          );
        }}
      >
        <svg
          className="pidian-icon"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          <path d="M2 15h10" />
          <path d="m9 18 3-3-3-3" />
        </svg>
      </button>
      {invalid ? (
        <div className="pidian-open-session-error" role="tooltip">
          {t("uiSessionFileInvalid")}
        </div>
      ) : null}
    </div>
  );
}

function activeFilePath(app: App): string | undefined {
  const active = app.workspace.getActiveFile()?.path;
  if (active) {
    return normalizeNotePath(active);
  }
  const leaf =
    app.workspace.getMostRecentLeaf(app.workspace.rootSplit) ?? app.workspace.getMostRecentLeaf();
  if (!leaf) {
    return undefined;
  }
  const stateFile = leaf.getViewState().state?.file;
  if (typeof stateFile === "string" && stateFile.length > 0) {
    return normalizeNotePath(stateFile);
  }
  const view = leaf.view;
  if (view instanceof FileView && view.file) {
    return view.file.path;
  }
  return undefined;
}
