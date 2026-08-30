import { useCallback, useEffect, useRef } from "react";

const MARQUEE_START_PAUSE_MS = 600;
const MARQUEE_END_PAUSE_MS = 1000;
const MARQUEE_PX_PER_SECOND = 36;

export function useOverflowMarquee(content: string) {
  const viewportRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const animationRef = useRef<Animation | null>(null);
  const overflowRef = useRef(0);
  const hoveringRef = useRef(false);

  const stopMarquee = useCallback(() => {
    animationRef.current?.cancel();
    animationRef.current = null;
    overflowRef.current = 0;
    viewportRef.current?.classList.remove("is-marquee");
  }, []);

  const startMarquee = useCallback(() => {
    const viewport = viewportRef.current;
    const text = textRef.current;
    if (!viewport || !text || !hoveringRef.current) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const overflowing = viewport.classList.contains("is-marquee")
      ? text.offsetWidth - viewport.clientWidth
      : text.scrollWidth - text.clientWidth;
    if (overflowing < 2) {
      stopMarquee();
      return;
    }

    viewport.classList.add("is-marquee");
    const overflow = text.offsetWidth - viewport.clientWidth;
    if (overflow < 2) {
      stopMarquee();
      return;
    }
    if (animationRef.current && overflowRef.current === overflow) {
      return;
    }

    overflowRef.current = overflow;
    animationRef.current?.cancel();
    const scrollMs = (overflow / MARQUEE_PX_PER_SECOND) * 1000;
    const total = MARQUEE_START_PAUSE_MS + scrollMs + MARQUEE_END_PAUSE_MS;
    animationRef.current = text.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(0)", offset: MARQUEE_START_PAUSE_MS / total },
        { transform: `translateX(${-overflow}px)`, offset: (MARQUEE_START_PAUSE_MS + scrollMs) / total },
        { transform: `translateX(${-overflow}px)` },
      ],
      { duration: total, iterations: Infinity, easing: "linear" },
    );
  }, [stopMarquee]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (hoveringRef.current) {
        startMarquee();
      }
    });
    observer.observe(viewport);
    if (hoveringRef.current) {
      startMarquee();
    }

    return () => {
      observer.disconnect();
      stopMarquee();
    };
  }, [content, startMarquee, stopMarquee]);

  return {
    viewportRef,
    textRef,
    onPointerEnter: () => {
      hoveringRef.current = true;
      startMarquee();
    },
    onPointerLeave: () => {
      hoveringRef.current = false;
      stopMarquee();
    },
  };
}
