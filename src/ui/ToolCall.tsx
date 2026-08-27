import { useState } from "react";
import type { PidianToolCall } from "../domain/sessions/PidianSession";

export function ToolCall({ toolCall }: { toolCall: PidianToolCall }): JSX.Element {
  const [open, setOpen] = useState(false);
  const path =
    toolCall.args && typeof toolCall.args === "object" && "path" in toolCall.args
      ? String((toolCall.args as { path?: unknown }).path ?? "")
      : "";

  return (
    <div className={`pidian-tool${toolCall.isError ? " is-error" : ""}`}>
      <button className="pidian-disclosure" onClick={() => setOpen((value) => !value)}>
        <span>{open ? "▾" : "▸"}</span>
        <span>{toolCall.name}</span>
        {path ? <span className="pidian-tool-path">{path}</span> : null}
      </button>
      {open ? (
        <pre className="pidian-tool-body">
          {JSON.stringify({ args: toolCall.args, result: toolCall.result }, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
