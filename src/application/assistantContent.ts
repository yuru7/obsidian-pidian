import type {
  PidianContentBlock,
  PidianMessage,
  PidianToolCall,
  PidianWorkBlock,
  PidianWorkItem,
} from "../domain/sessions/PidianSession";

interface StreamState {
  thinkingOpen: boolean;
  idleClosed: boolean;
  newThinkingSegment: boolean;
}

const streamState = new WeakMap<PidianMessage, StreamState>();

/** OpenAI-compatible streams often emit thinking_end only after the whole reply. */
export const THINKING_IDLE_MS = 200;

function getStreamState(message: PidianMessage): StreamState {
  let current = streamState.get(message);
  if (!current) {
    current = { thinkingOpen: false, idleClosed: false, newThinkingSegment: false };
    streamState.set(message, current);
  }
  return current;
}

export function isThinkingOpen(message: PidianMessage): boolean {
  return getStreamState(message).thinkingOpen;
}

export function applyThinkingStart(message: PidianMessage): PidianWorkBlock {
  getStreamState(message).thinkingOpen = true;
  return ensureWorkBlock(message);
}

export function applyThinkingDelta(message: PidianMessage, text: string): void {
  const state = getStreamState(message);
  const work = applyThinkingStart(message);
  if (!text) {
    return;
  }
  const items = work.items ?? (work.items = []);
  const last = items.at(-1);
  if (last?.type === "thinking" && !state.newThinkingSegment) {
    last.text += text;
  } else {
    items.push({ type: "thinking", text });
    state.newThinkingSegment = false;
  }
  syncWorkFields(work);
  syncAggregates(message);
}

export function applyThinkingEnd(message: PidianMessage): void {
  sealThinking(message, hasVisibleText(message));
}

export function applyThinkingIdle(message: PidianMessage): void {
  const state = getStreamState(message);
  if (!state.thinkingOpen) {
    return;
  }
  closeWorkIfOpen(message);
  state.idleClosed = true;
}

export function applyToolStarted(
  message: PidianMessage,
  toolCall: Pick<PidianToolCall, "id" | "name" | "args">,
): void {
  const work = ensureWorkBlock(message);
  const item: PidianWorkItem = {
    type: "tool",
    id: toolCall.id,
    name: toolCall.name,
    args: toolCall.args,
  };
  const items = work.items ?? (work.items = []);
  items.push(item);
  syncWorkFields(work);
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
    const item = block.items?.find((entry) => entry.type === "tool" && entry.id === toolCallId);
    const toolCall = item?.type === "tool" ? item : block.toolCalls?.find((entry) => entry.id === toolCallId);
    if (toolCall) {
      toolCall.result = result;
      toolCall.isError = isError;
      syncWorkFields(block);
      syncAggregates(message);
      return;
    }
  }
}

export function applyTextDelta(message: PidianMessage, text: string): void {
  appendVisibleText(message, text, { closeWork: !getStreamState(message).thinkingOpen });
}

export function applyAssistantError(message: PidianMessage, error: string): void {
  applyThinkingEnd(message);
  if (message.text.includes(error)) {
    return;
  }
  appendVisibleText(message, message.text ? `\n\n${error}` : error, { closeWork: true });
}

export function closeOpenWork(message: PidianMessage): void {
  sealThinking(message, true);
}

function sealThinking(message: PidianMessage, closeWork: boolean): void {
  const state = getStreamState(message);
  state.thinkingOpen = false;
  state.idleClosed = false;
  state.newThinkingSegment = true;
  if (closeWork) {
    closeWorkIfOpen(message);
  }
}

function appendVisibleText(
  message: PidianMessage,
  text: string,
  options: { closeWork: boolean },
): void {
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
  if (options.closeWork) {
    closeWorkIfOpen(message);
  }
  blocks.push({ type: "text", text });
  syncAggregates(message);
}

function closeWorkIfOpen(message: PidianMessage): void {
  const work = findOpenWork(message.blocks ?? []);
  if (!work) {
    return;
  }
  const started = Date.parse(work.startedAt ?? "");
  work.workedMs = Number.isFinite(started) ? Math.max(0, Date.now() - started) : 0;
  syncAggregates(message);
}

function ensureWorkBlock(message: PidianMessage): PidianWorkBlock {
  const blocks = message.blocks ?? (message.blocks = []);
  const discardedBlankText = discardTrailingBlankText(blocks);
  const last = blocks.at(-1);
  if (last?.type === "work") {
    if (discardedBlankText || last.workedMs !== undefined) {
      delete last.workedMs;
    }
    return last;
  }
  if (getStreamState(message).thinkingOpen) {
    const openWork = findOpenWork(blocks);
    if (openWork) {
      return openWork;
    }
    const idleWork = reopenIdleWork(message, blocks);
    if (idleWork) {
      return idleWork;
    }
  }
  const work: PidianWorkBlock = {
    type: "work",
    startedAt: last ? new Date().toISOString() : message.createdAt,
  };
  blocks.push(work);
  return work;
}

function findOpenWork(blocks: readonly PidianContentBlock[]): PidianWorkBlock | undefined {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block?.type === "work" && block.workedMs === undefined) {
      return block;
    }
  }
  return undefined;
}

function reopenIdleWork(
  message: PidianMessage,
  blocks: readonly PidianContentBlock[],
): PidianWorkBlock | undefined {
  const state = getStreamState(message);
  if (!state.idleClosed) {
    return undefined;
  }
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block?.type === "text") {
      continue;
    }
    if (block?.type === "work") {
      delete block.workedMs;
      state.idleClosed = false;
      return block;
    }
    break;
  }
  return undefined;
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

function hasVisibleText(message: PidianMessage): boolean {
  return (message.blocks ?? []).some((block) => block.type === "text" && block.text.trim());
}

function syncWorkFields(work: PidianWorkBlock): void {
  if (!work.items) {
    return;
  }
  let thinking = "";
  const toolCalls: PidianToolCall[] = [];
  for (const item of work.items) {
    if (item.type === "thinking") {
      thinking += item.text;
      continue;
    }
    toolCalls.push(toolCallFromItem(item));
  }
  work.thinking = thinking || undefined;
  work.toolCalls = toolCalls.length > 0 ? toolCalls : undefined;
}

function toolCallFromItem(item: Extract<PidianWorkItem, { type: "tool" }>): PidianToolCall {
  return {
    id: item.id,
    name: item.name,
    args: item.args,
    ...(item.result !== undefined ? { result: item.result } : {}),
    ...(item.isError !== undefined ? { isError: item.isError } : {}),
  };
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
  if (workedMs === undefined) {
    delete message.workedMs;
  } else {
    message.workedMs = workedMs;
  }
}
