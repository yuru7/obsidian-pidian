import { Fragment, useEffect, useImperativeHandle, useRef, useState, type JSX, type Ref } from "react";
import type { App } from "obsidian";
import { t } from "../i18n";
import type { PidianMessage } from "../domain/sessions/PidianSession";
import { Message } from "./Message";

const STICK_TO_BOTTOM_THRESHOLD_PX = 16;
const JUMP_TO_BOTTOM_VIEWPORT_RATIO = 1 / 3;

function distanceFromBottom(el: HTMLElement): number {
  return el.scrollHeight - el.scrollTop - el.clientHeight;
}

function isAtBottom(el: HTMLElement): boolean {
  return distanceFromBottom(el) <= STICK_TO_BOTTOM_THRESHOLD_PX;
}

function isNearBottom(el: HTMLElement): boolean {
  return distanceFromBottom(el) <= el.clientHeight * JUMP_TO_BOTTOM_VIEWPORT_RATIO;
}

export type ChatHandle = {
  scrollToBottom: () => void;
};

export function Chat({
  app,
  messages,
  forkedMessageCount,
  compactionFirstKeptMessageId,
  compacting = false,
  onFork,
  forkDisabled,
  streaming = false,
  sendWithCtrlEnter = false,
  editDisabled = false,
  editToolbar,
  onResend,
  onNearBottomChange,
  ref,
}: {
  app: App;
  messages: PidianMessage[];
  forkedMessageCount?: number;
  compactionFirstKeptMessageId?: string;
  compacting?: boolean;
  onFork?: (messageId: string) => void;
  forkDisabled?: boolean;
  streaming?: boolean;
  sendWithCtrlEnter?: boolean;
  editDisabled?: boolean;
  editToolbar?: JSX.Element;
  onResend?: (messageId: string, text: string) => void;
  onNearBottomChange?: (nearBottom: boolean) => void;
  ref?: Ref<ChatHandle>;
}): JSX.Element {
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const lastScrollTopRef = useRef(0);
  const lastNearBottomRef = useRef<boolean | null>(null);
  const onNearBottomChangeRef = useRef(onNearBottomChange);
  onNearBottomChangeRef.current = onNearBottomChange;

  useEffect(() => {
    if (editDisabled || (editingMessageId && !messages.some((message) => message.id === editingMessageId))) {
      setEditingMessageId(null);
    }
  }, [editDisabled, editingMessageId, messages]);

  useImperativeHandle(ref, () => ({
    scrollToBottom() {
      const root = rootRef.current;
      if (!root) {
        return;
      }
      stickToBottomRef.current = true;
      root.scrollTop = root.scrollHeight;
      lastScrollTopRef.current = root.scrollTop;
      lastNearBottomRef.current = true;
      onNearBottomChangeRef.current?.(true);
    },
  }));

  useEffect(() => {
    const root = rootRef.current;
    const content = contentRef.current;
    if (!root || !content) {
      return;
    }

    lastScrollTopRef.current = root.scrollTop;

    const reportNearBottom = () => {
      const nearBottom = isNearBottom(root);
      if (lastNearBottomRef.current === nearBottom) {
        return;
      }
      lastNearBottomRef.current = nearBottom;
      onNearBottomChangeRef.current?.(nearBottom);
    };

    const unstickIfScrolledUp = () => {
      if (root.scrollTop < lastScrollTopRef.current) {
        stickToBottomRef.current = false;
      }
    };

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) {
        stickToBottomRef.current = false;
      }
    };

    const onScroll = () => {
      const scrollTop = root.scrollTop;
      if (scrollTop < lastScrollTopRef.current) {
        stickToBottomRef.current = false;
      } else if (isAtBottom(root)) {
        stickToBottomRef.current = true;
      }
      lastScrollTopRef.current = scrollTop;
      reportNearBottom();
    };

    const followIfStuck = () => {
      if (stickToBottomRef.current) {
        root.scrollTop = root.scrollHeight;
        lastScrollTopRef.current = root.scrollTop;
      }
      reportNearBottom();
    };

    root.addEventListener("wheel", onWheel, { passive: true });
    root.addEventListener("touchmove", unstickIfScrolledUp, { passive: true });
    root.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(followIfStuck);
    observer.observe(root);
    observer.observe(content);
    followIfStuck();

    return () => {
      root.removeEventListener("wheel", onWheel);
      root.removeEventListener("touchmove", unstickIfScrolledUp);
      root.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={messages.length === 0 ? "pidian-chat pidian-chat-empty" : "pidian-chat"}
    >
      <div ref={contentRef}>
        {messages.length === 0
          ? t("uiEmptyChat")
          : messages.map((message, index) => (
              <Fragment key={message.id}>
                {compactionFirstKeptMessageId === message.id ? (
                  <p className="pidian-compaction-notice">{t("uiCompacted")}</p>
                ) : null}
                <Message
                  app={app}
                  message={message}
                  onFork={onFork}
                  forkDisabled={forkDisabled}
                  streaming={
                    streaming && message.role === "assistant" && index === messages.length - 1
                  }
                  editing={editingMessageId === message.id}
                  editDisabled={editDisabled}
                  sendWithCtrlEnter={sendWithCtrlEnter}
                  editToolbar={editingMessageId === message.id ? editToolbar : undefined}
                  onStartEdit={setEditingMessageId}
                  onCancelEdit={() => setEditingMessageId(null)}
                  onResend={onResend}
                />
                {forkedMessageCount === index + 1 ? (
                  <p className="pidian-fork-notice">{t("uiForked")}</p>
                ) : null}
              </Fragment>
            ))}
        {compacting ? <p className="pidian-compaction-notice">{t("uiCompacting")}</p> : null}
      </div>
    </div>
  );
}
