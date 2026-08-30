import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { t } from "../i18n";
import type PidianPlugin from "../main";
import { sortCatalogModels, type CatalogModel, type CatalogProvider } from "../domain/agent/ModelCatalog";
import {
  clampThinkingLevel,
  DEFAULT_THINKING_LEVEL,
  formatModelSelectionLabel,
  hasSelectableThinkingLevels,
} from "../domain/agent/thinkingLevel";

type MenuItem = { id: string; name: string };

const MARQUEE_START_PAUSE_MS = 600;
const MARQUEE_END_PAUSE_MS = 1000;
const MARQUEE_PX_PER_SECOND = 36;

function useOverflowMarquee(content: string) {
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

export function ModelSelector({
  plugin,
  onChange,
}: {
  plugin: PidianPlugin;
  onChange: () => void;
}): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [openList, setOpenList] = useState<"provider" | "model" | "thinking" | null>(null);
  const [providers, setProviders] = useState<CatalogProvider[]>([]);
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [settingsRev, bumpSettings] = useReducer((value: number) => value + 1, 0);
  const session = plugin.agentService?.getSession();
  const provider = session?.provider ?? plugin.settings.provider;
  const model = session?.model ?? plugin.settings.model;
  const providerName = providers.find((item) => item.id === provider)?.name ?? "";
  const catalogModel = models.find((item) => item.id === model);
  const modelName = catalogModel?.name ?? "";
  const thinkingLevels = catalogModel?.thinkingLevels ?? [];
  const showThinking = hasSelectableThinkingLevels(thinkingLevels);
  const requestedThinking = session
    ? (session.thinkingLevel ?? DEFAULT_THINKING_LEVEL)
    : plugin.settings.thinkingLevel;
  const thinkingLevel = showThinking
    ? clampThinkingLevel(requestedThinking, thinkingLevels)
    : undefined;
  const selected = Boolean(provider && model);
  const label = selected
    ? formatModelSelectionLabel(providerName || provider, modelName || model, thinkingLevel)
    : t("uiNoModel");
  const marquee = useOverflowMarquee(label);

  useEffect(() => {
    return plugin.subscribeSettings(() => bumpSettings());
  }, [plugin]);

  useEffect(() => {
    const catalog = plugin.modelCatalog;
    if (!catalog) {
      setProviders([]);
      return;
    }
    void catalog.listProviders().then(setProviders).catch(() => setProviders([]));
  }, [plugin, open, settingsRev]);

  useEffect(() => {
    const catalog = plugin.modelCatalog;
    if (!provider || !catalog) {
      setModels([]);
      return;
    }
    void catalog.listModels(provider).then((list) => setModels(sortCatalogModels(list))).catch(() => setModels([]));
  }, [plugin, provider, open, settingsRev]);

  useEffect(() => {
    if (!open) {
      setOpenList(null);
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target)) {
        setOpen(false);
        return;
      }
      if (!rootRef.current.querySelector(".pidian-select.is-open")?.contains(target)) {
        setOpenList(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const applySelection = (nextProvider: string, nextModel: string, nextThinking?: string) => {
    void plugin.changeModel(nextProvider, nextModel, nextThinking).then(onChange);
  };

  const changeProvider = (nextProvider: string) => {
    setOpenList(null);
    if (nextProvider === provider) {
      return;
    }
    const catalog = plugin.modelCatalog;
    if (!catalog) {
      return;
    }
    void catalog.listModels(nextProvider).then((nextModels) => {
      const sorted = sortCatalogModels(nextModels);
      const first = sorted[0];
      const nextThinking = clampThinkingLevel(thinkingLevel ?? plugin.settings.thinkingLevel, first?.thinkingLevels ?? []);
      applySelection(nextProvider, first?.id ?? "", nextThinking);
    });
  };

  const changeModel = (nextModel: string) => {
    setOpenList(null);
    if (nextModel === model) {
      return;
    }
    const nextThinking = clampThinkingLevel(
      thinkingLevel ?? plugin.settings.thinkingLevel,
      models.find((item) => item.id === nextModel)?.thinkingLevels ?? [],
    );
    applySelection(provider, nextModel, nextThinking);
  };

  const changeThinking = (nextThinking: string) => {
    setOpenList(null);
    if (nextThinking === thinkingLevel) {
      return;
    }
    applySelection(provider, model, nextThinking);
  };

  return (
    <div
      ref={rootRef}
      className={`pidian-model-selector${open ? " is-open" : ""}`}
    >
      <button
        type="button"
        className="pidian-model-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        onPointerEnter={marquee.onPointerEnter}
        onPointerLeave={marquee.onPointerLeave}
      >
        <span ref={marquee.viewportRef} className="pidian-model-trigger-label">
          <span ref={marquee.textRef} className="pidian-model-trigger-text">{label}</span>
        </span>
        <span className="pidian-caret" aria-hidden="true" />
      </button>
      {open ? (
        <div className="pidian-model-balloon" role="dialog">
          <div className="pidian-model-row">
            <span>{t("settingsProvider")}</span>
            <ChoiceDropdown
              items={providers}
              value={provider}
              placeholder={t("uiNoModel")}
              open={openList === "provider"}
              onToggle={() => setOpenList((current) => (current === "provider" ? null : "provider"))}
              onSelect={changeProvider}
            />
          </div>
          <div className="pidian-model-row">
            <span>{t("settingsModel")}</span>
            <ChoiceDropdown
              items={sortCatalogModels(models)}
              value={model}
              placeholder={t("uiNoModel")}
              open={openList === "model"}
              onToggle={() => setOpenList((current) => (current === "model" ? null : "model"))}
              onSelect={changeModel}
            />
          </div>
          {showThinking ? (
            <div className="pidian-model-row">
              <span>{t("uiThinkingLevel")}</span>
              <ChoiceDropdown
                items={thinkingLevels.map((level) => ({ id: level, name: level }))}
                value={thinkingLevel ?? ""}
                placeholder={t("uiNoModel")}
                open={openList === "thinking"}
                onToggle={() => setOpenList((current) => (current === "thinking" ? null : "thinking"))}
                onSelect={changeThinking}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ChoiceDropdown({
  items,
  value,
  placeholder,
  open,
  onToggle,
  onSelect,
}: {
  items: MenuItem[];
  value: string;
  placeholder: string;
  open: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
}): JSX.Element {
  const selected = items.find((item) => item.id === value)?.name ?? (value || placeholder);
  return (
    <span className={`pidian-select${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="pidian-select-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={onToggle}
      >
        <span className="pidian-select-label">{selected}</span>
        <span className="pidian-caret" aria-hidden="true" />
      </button>
      {open ? (
        <div className="pidian-model-menu" role="menu">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={`pidian-model-menu-item${item.id === value ? " is-selected" : ""}`}
              onClick={() => onSelect(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}
