import { afterEach, describe, expect, it, vi } from "vitest";
import { listenClipboardContentChange } from "./clipboardContentChange";

type Listener = EventListenerOrEventListenerObject;

type FakeEl = {
  listeners: Map<string, Set<Listener>>;
  addEventListener: (type: string, listener: Listener, options?: boolean | AddEventListenerOptions) => void;
  removeEventListener: (type: string, listener: Listener, options?: boolean | AddEventListenerOptions) => void;
  ownerDocument?: { defaultView: Window | null };
};

function createFakeEl(): FakeEl {
  const el: FakeEl = {
    listeners: new Map(),
    addEventListener(type, listener) {
      const set = el.listeners.get(type) ?? new Set();
      set.add(listener);
      el.listeners.set(type, set);
    },
    removeEventListener(type, listener) {
      el.listeners.get(type)?.delete(listener);
    },
  };
  return el;
}

function emit(el: FakeEl, type: string, event: Event = new Event(type)): void {
  for (const listener of el.listeners.get(type) ?? []) {
    if (typeof listener === "function") {
      listener(event);
    }
  }
}

describe("listenClipboardContentChange", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits on the next task after paste or cut", () => {
    vi.useFakeTimers();
    const el = createFakeEl();
    const onChange = vi.fn();
    listenClipboardContentChange(el as unknown as HTMLElement, onChange);
    emit(el, "paste");
    expect(onChange).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(onChange).toHaveBeenCalledTimes(1);
    emit(el, "cut");
    vi.runAllTimers();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("emits immediately on Backspace or Delete keyup so an empty placeholder can restore", () => {
    const el = createFakeEl();
    const onChange = vi.fn();
    listenClipboardContentChange(el as unknown as HTMLElement, onChange);
    emit(el, "keyup", Object.assign(new Event("keyup"), { key: "Backspace" }));
    emit(el, "keyup", Object.assign(new Event("keyup"), { key: "Delete" }));
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("does not emit on arrow-key keyup", () => {
    const el = createFakeEl();
    const onChange = vi.fn();
    listenClipboardContentChange(el as unknown as HTMLElement, onChange);
    emit(el, "keyup", Object.assign(new Event("keyup"), { key: "ArrowDown" }));
    emit(el, "keyup", Object.assign(new Event("keyup"), { key: "ArrowUp" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears a pending emit and listeners on unsubscribe", () => {
    vi.useFakeTimers();
    const el = createFakeEl();
    const onChange = vi.fn();
    const stop = listenClipboardContentChange(el as unknown as HTMLElement, onChange);
    emit(el, "paste");
    stop();
    vi.runAllTimers();
    expect(onChange).not.toHaveBeenCalled();
    expect(el.listeners.get("paste")?.size ?? 0).toBe(0);
    expect(el.listeners.get("cut")?.size ?? 0).toBe(0);
    expect(el.listeners.get("keyup")?.size ?? 0).toBe(0);
  });
});
