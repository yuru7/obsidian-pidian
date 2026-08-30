import { useEffect, useReducer, useRef, useState, type JSX } from "react";
import { t } from "../i18n";
import type PidianPlugin from "../main";
import { sortCatalogModels, type CatalogModel, type CatalogProvider } from "../domain/agent/ModelCatalog";
import {
  clampThinkingLevel,
  DEFAULT_THINKING_LEVEL,
  formatModelSelectionLabel,
  hasSelectableThinkingLevels,
} from "../domain/agent/thinkingLevel";
import { favoriteSelectionKey, isFavoriteSelection, toggleFavorite, type ModelFavorite } from "../settings/modelFavorites";
import { useOverflowMarquee } from "./useOverflowMarquee";

type MenuItem = { id: string; name: string };
type OpenList = "provider" | "model" | "thinking" | "favorite" | null;

export function ModelSelector({
  plugin,
  onChange,
}: {
  plugin: PidianPlugin;
  onChange: () => void;
}): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [openList, setOpenList] = useState<OpenList>(null);
  const [providers, setProviders] = useState<CatalogProvider[]>([]);
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, CatalogModel[]>>({});
  const [settingsRev, bumpSettings] = useReducer((value: number) => value + 1, 0);
  const session = plugin.agentService?.getSession();
  const provider = session?.provider ?? plugin.settings.provider;
  const model = session?.model ?? plugin.settings.model;
  const favorites = plugin.settings.modelFavorites;
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
  const favorited = isFavoriteSelection(favorites, { provider, model, thinkingLevel });

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
    const catalog = plugin.modelCatalog;
    if (!open || !catalog) {
      return;
    }
    const ids = new Set(favorites.map((item) => item.provider));
    if (provider) {
      ids.add(provider);
    }
    if (ids.size === 0) {
      setModelsByProvider({});
      return;
    }
    let cancelled = false;
    void Promise.all(
      [...ids].map(async (id) => {
        const list = await catalog.listModels(id).catch(() => []);
        return [id, sortCatalogModels(list)] as const;
      }),
    ).then((entries) => {
      if (!cancelled) {
        setModelsByProvider(Object.fromEntries(entries));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [plugin, open, favorites, provider, settingsRev]);

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

  const toggleCurrentFavorite = () => {
    if (!selected) {
      return;
    }
    plugin.settings.modelFavorites = toggleFavorite(favorites, { provider, model, thinkingLevel });
    bumpSettings();
    void plugin.saveSettings();
  };

  const selectFavorite = (id: string) => {
    setOpenList(null);
    const favorite = favorites.find((item) => item.id === id);
    if (!favorite) {
      return;
    }
    applySelection(favorite.provider, favorite.model, favorite.thinkingLevel);
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
          <div className="pidian-model-balloon-toolbar">
            <FavoritePicker
              favorites={favorites}
              providers={providers}
              modelsByProvider={modelsByProvider}
              current={{ provider, model, thinkingLevel }}
              open={openList === "favorite"}
              onToggle={() => setOpenList((current) => (current === "favorite" ? null : "favorite"))}
              onSelect={selectFavorite}
            />
            <button
              type="button"
              className={`pidian-favorite-star${favorited ? " is-active" : ""}`}
              disabled={!selected}
              aria-pressed={favorited}
              aria-label={favorited ? t("uiFavoriteRemove") : t("uiFavoriteAdd")}
              title={favorited ? t("uiFavoriteRemove") : t("uiFavoriteAdd")}
              onClick={toggleCurrentFavorite}
            >
              <StarIcon filled={favorited} />
            </button>
          </div>
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

function FavoritePicker({
  favorites,
  providers,
  modelsByProvider,
  current,
  open,
  onToggle,
  onSelect,
}: {
  favorites: ModelFavorite[];
  providers: CatalogProvider[];
  modelsByProvider: Record<string, CatalogModel[]>;
  current: { provider: string; model: string; thinkingLevel?: string };
  open: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
}): JSX.Element {
  const label = t("uiSelectFromFavorites");
  const marquee = useOverflowMarquee(label);
  const currentKey = favoriteSelectionKey(current);
  const empty = favorites.length === 0;
  return (
    <span className={`pidian-select pidian-favorite-picker${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="pidian-select-trigger pidian-favorite-picker-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={empty}
        title={label}
        onClick={onToggle}
        onPointerEnter={marquee.onPointerEnter}
        onPointerLeave={marquee.onPointerLeave}
      >
        <span ref={marquee.viewportRef} className="pidian-model-trigger-label">
          <span ref={marquee.textRef} className="pidian-model-trigger-text">{label}</span>
        </span>
        <span className="pidian-caret" aria-hidden="true" />
      </button>
      {open && !empty ? (
        <div className="pidian-model-menu pidian-favorite-menu" role="menu">
          {favorites.map((favorite) => {
            const itemLabel = favoriteLabel(favorite, providers, modelsByProvider);
            return (
              <MarqueeMenuItem
                key={favorite.id}
                id={favorite.id}
                name={itemLabel}
                selected={favoriteSelectionKey(favorite) === currentKey}
                onSelect={onSelect}
              />
            );
          })}
        </div>
      ) : null}
    </span>
  );
}

function MarqueeMenuItem({
  id,
  name,
  selected,
  onSelect,
}: {
  id: string;
  name: string;
  selected: boolean;
  onSelect: (id: string) => void;
}): JSX.Element {
  const marquee = useOverflowMarquee(name);
  return (
    <button
      type="button"
      role="menuitem"
      className={`pidian-model-menu-item pidian-favorite-menu-item${selected ? " is-selected" : ""}`}
      title={name}
      onClick={() => onSelect(id)}
      onPointerEnter={marquee.onPointerEnter}
      onPointerLeave={marquee.onPointerLeave}
    >
      <span ref={marquee.viewportRef} className="pidian-model-trigger-label">
        <span ref={marquee.textRef} className="pidian-model-trigger-text">{name}</span>
      </span>
    </button>
  );
}

function favoriteLabel(
  favorite: ModelFavorite,
  providers: CatalogProvider[],
  modelsByProvider: Record<string, CatalogModel[]>,
): string {
  const providerName = providers.find((item) => item.id === favorite.provider)?.name ?? favorite.provider;
  const modelName =
    modelsByProvider[favorite.provider]?.find((item) => item.id === favorite.model)?.name ?? favorite.model;
  return formatModelSelectionLabel(providerName, modelName, favorite.thinkingLevel);
}

function StarIcon({ filled }: { filled: boolean }): JSX.Element {
  return (
    <svg
      className="pidian-icon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
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
