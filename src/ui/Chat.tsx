import { Fragment, useEffect, useRef, type JSX } from "react";
import type { App } from "obsidian";
import { t } from "../i18n";
import type { PidianMessage } from "../domain/sessions/PidianSession";
import { Message } from "./Message";

const STICK_TO_BOTTOM_THRESHOLD_PX = 16;

function isAtBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_TO_BOTTOM_THRESHOLD_PX;
}

export function Chat({
  app,
  messages,
  forkedMessageCount,
  onFork,
  forkDisabled,
  streaming = false,
}: {
  app: App;
  messages: PidianMessage[];
  forkedMessageCount?: number;
  onFork?: (messageId: string) => void;
  forkDisabled?: boolean;
  streaming?: boolean;
}): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const root = rootRef.current;
    const content = contentRef.current;
    if (!root || !content) {
      return;
    }

    let lastScrollTop = root.scrollTop;

    const unstickIfScrolledUp = () => {
      if (root.scrollTop < lastScrollTop) {
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
      if (scrollTop < lastScrollTop) {
        stickToBottomRef.current = false;
      } else if (isAtBottom(root)) {
        stickToBottomRef.current = true;
      }
      lastScrollTop = scrollTop;
    };

    const followIfStuck = () => {
      if (!stickToBottomRef.current) {
        return;
      }
      root.scrollTop = root.scrollHeight;
      lastScrollTop = root.scrollTop;
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
      </div>
    </div>
  );
}
