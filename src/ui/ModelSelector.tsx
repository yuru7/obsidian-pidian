import { useEffect, useReducer, useRef, useState } from "react";
import { t } from "../i18n";
import type PidianPlugin from "../main";
import { sortCatalogModels, type CatalogModel, type CatalogProvider } from "../domain/agent/ModelCatalog";

type MenuItem = { id: string; name: string };

export function ModelSelector({
  plugin,
  onChange,
}: {
  plugin: PidianPlugin;
  onChange: () => void;
}): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [openList, setOpenList] = useState<"provider" | "model" | null>(null);
  const [providers, setProviders] = useState<CatalogProvider[]>([]);
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [settingsRev, bumpSettings] = useReducer((value: number) => value + 1, 0);
  const session = plugin.agentService?.getSession();
  const provider = session?.provider ?? plugin.settings.provider;
  const model = session?.model ?? plugin.settings.model;
  const providerName = providers.find((item) => item.id === provider)?.name ?? "";
  const modelName = models.find((item) => item.id === model)?.name ?? "";
  const selected = Boolean(provider && model);
  const label = selected
    ? [providerName || provider, modelName || model].filter(Boolean).join(" ")
    : t("uiNoModel");

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
      const first = sorted[0]?.id ?? "";
      return plugin.changeModel(nextProvider, first);
    }).then(onChange);
  };

  const changeModel = (nextModel: string) => {
    setOpenList(null);
    if (nextModel === model) {
      return;
    }
    void plugin.changeModel(provider, nextModel).then(onChange);
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
      >
        <span className="pidian-model-trigger-label">{label}</span>
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
