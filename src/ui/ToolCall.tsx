import { useState } from "react";
import type { PidianToolCall } from "../domain/sessions/PidianSession";

export function ToolCall({ toolCall }: { toolCall: PidianToolCall }): JSX.Element {
  const [open, setOpen] = useState(false);
  const args = toolCall.args && typeof toolCall.args === "object" ? (toolCall.args as Record<string, unknown>) : {};
  const path = typeof args.path === "string" ? args.path : "";
  const tabId = typeof args.tabId === "string" ? args.tabId : "";
  const detail = path || tabId;

  return (
    <div className={`pidian-tool${toolCall.isError ? " is-error" : ""}`}>
      <button className="pidian-disclosure" onClick={() => setOpen((value) => !value)}>
        <span>{open ? "▾" : "▸"}</span>
        <span>{toolCall.name}</span>
        {detail ? <span className="pidian-tool-path">{detail}</span> : null}
      </button>
      {open ? (
        <pre className="pidian-tool-body">
          {JSON.stringify({ args: toolCall.args, result: toolCall.result }, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
