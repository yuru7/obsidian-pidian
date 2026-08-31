import { Fragment, useEffect, useImperativeHandle, useRef, type JSX, type Ref } from "react";
import type { App } from "obsidian";
import { t } from "../i18n";
import type { PidianMessage } from "../domain/sessions/PidianSession";
import { Message } from "./Message";

const STICK_TO_BOTTOM_THRESHOLD_PX = 16;

function isAtBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_TO_BOTTOM_THRESHOLD_PX;
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
  ref?: Ref<ChatHandle>;
}): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const lastScrollTopRef = useRef(0);

  useImperativeHandle(ref, () => ({
    scrollToBottom() {
      const root = rootRef.current;
      if (!root) {
        return;
      }
      stickToBottomRef.current = true;
      root.scrollTop = root.scrollHeight;
      lastScrollTopRef.current = root.scrollTop;
    },
  }));

  useEffect(() => {
    const root = rootRef.current;
    const content = contentRef.current;
    if (!root || !content) {
      return;
    }

    lastScrollTopRef.current = root.scrollTop;

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
    };

    const followIfStuck = () => {
      if (!stickToBottomRef.current) {
        return;
      }
      root.scrollTop = root.scrollHeight;
      lastScrollTopRef.current = root.scrollTop;
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
