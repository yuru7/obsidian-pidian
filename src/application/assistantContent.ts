import type {
  PidianContentBlock,
  PidianMessage,
  PidianToolCall,
  PidianWorkBlock,
} from "../domain/sessions/PidianSession";

export function applyThinkingDelta(message: PidianMessage, text: string): void {
  const work = ensureWorkBlock(message);
  work.thinking = `${work.thinking ?? ""}${text}`;
  syncAggregates(message);
}

export function applyToolStarted(
  message: PidianMessage,
  toolCall: Pick<PidianToolCall, "id" | "name" | "args">,
): void {
  const work = ensureWorkBlock(message);
  work.toolCalls = [
    ...(work.toolCalls ?? []),
    { id: toolCall.id, name: toolCall.name, args: toolCall.args },
  ];
  syncAggregates(message);
}

export function applyToolCompleted(
  message: PidianMessage,
  toolCallId: string,
  result: string,
  isError: boolean,
): void {
  for (const block of message.blocks ?? []) {
    if (block.type !== "work") {
      continue;
    }
    const toolCall = block.toolCalls?.find((item) => item.id === toolCallId);
    if (toolCall) {
      toolCall.result = result;
      toolCall.isError = isError;
      syncAggregates(message);
      return;
    }
  }
}

export function applyTextDelta(message: PidianMessage, text: string): void {
  const blocks = message.blocks ?? (message.blocks = []);
  const last = blocks.at(-1);
  if (last?.type === "text") {
    last.text += text;
    syncAggregates(message);
    return;
  }
  if (!text.trim()) {
    return;
  }
  closeOpenWork(message);
  blocks.push({ type: "text", text });
  syncAggregates(message);
}

export function applyAssistantError(message: PidianMessage, error: string): void {
  if (message.text.includes(error)) {
    return;
  }
  applyTextDelta(message, message.text ? `\n\n${error}` : error);
}

export function closeOpenWork(message: PidianMessage): void {
  const last = message.blocks?.at(-1);
  if (last?.type !== "work" || last.workedMs !== undefined) {
    return;
  }
  const started = Date.parse(last.startedAt ?? "");
  last.workedMs = Number.isFinite(started) ? Math.max(0, Date.now() - started) : 0;
  syncAggregates(message);
}

function ensureWorkBlock(message: PidianMessage): PidianWorkBlock {
  const blocks = message.blocks ?? (message.blocks = []);
  const discardedBlankText = discardTrailingBlankText(blocks);
  const last = blocks.at(-1);
  if (last?.type === "work") {
    if (discardedBlankText) {
      delete last.workedMs;
    }
    return last;
  }
  const work: PidianWorkBlock = {
    type: "work",
    startedAt: last ? new Date().toISOString() : message.createdAt,
  };
  blocks.push(work);
  return work;
}

function discardTrailingBlankText(blocks: PidianContentBlock[]): boolean {
  let discarded = false;
  while (blocks.length > 0) {
    const last = blocks.at(-1);
    if (last?.type !== "text" || last.text.trim()) {
      break;
    }
    blocks.pop();
    discarded = true;
  }
  return discarded;
}

function syncAggregates(message: PidianMessage): void {
  const blocks = message.blocks ?? [];
  let text = "";
  let thinking = "";
  const toolCalls: PidianToolCall[] = [];
  let workedMs: number | undefined;
  for (const block of blocks) {
    if (block.type === "text") {
      text += block.text;
      continue;
    }
    thinking += block.thinking ?? "";
    if (block.toolCalls) {
      toolCalls.push(...block.toolCalls);
    }
    if (workedMs === undefined && block.workedMs !== undefined) {
      workedMs = block.workedMs;
    }
  }
  message.text = text;
  message.thinking = thinking || undefined;
  message.toolCalls = toolCalls.length > 0 ? toolCalls : undefined;
  if (workedMs !== undefined) {
    message.workedMs = workedMs;
  }
}
