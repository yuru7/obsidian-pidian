import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import type PidianPlugin from "../main";
import type { CatalogModel, CatalogProvider } from "../domain/agent/ModelCatalog";

export function ModelSelector({
  plugin,
  onChange,
}: {
  plugin: PidianPlugin;
  onChange: () => void;
}): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<CatalogProvider[]>([]);
  const [models, setModels] = useState<CatalogModel[]>([]);
  const session = plugin.agentService?.getSession();
  const provider = session?.provider ?? plugin.settings.provider;
  const model = session?.model ?? plugin.settings.model;
  const providerName = providers.find((item) => item.id === provider)?.name ?? provider;
  const modelName = models.find((item) => item.id === model)?.name ?? model;
  const label = [providerName, modelName].filter(Boolean).join(" ");

  useEffect(() => {
    const catalog = plugin.modelCatalog;
    if (!catalog) {
      setProviders([]);
      return;
    }
    void catalog.listProviders().then(setProviders).catch(() => setProviders([]));
  }, [plugin]);

  useEffect(() => {
    const catalog = plugin.modelCatalog;
    if (!provider || !catalog) {
      setModels([]);
      return;
    }
    void catalog.listModels(provider).then(setModels).catch(() => setModels([]));
  }, [plugin, provider]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const changeProvider = (nextProvider: string) => {
    const catalog = plugin.modelCatalog;
    if (!catalog) {
      return;
    }
    void catalog.listModels(nextProvider).then((nextModels) => {
      const first = nextModels[0]?.id ?? "";
      return plugin.changeModel(nextProvider, first);
    }).then(onChange);
  };

  const changeModel = (nextModel: string) => {
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
          <label className="pidian-model-row">
            <span>{t("settingsProvider")}</span>
            <span className="pidian-select">
              <select
                value={provider}
                onChange={(event) => changeProvider(event.target.value)}
              >
                {providers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <span className="pidian-caret" aria-hidden="true" />
            </span>
          </label>
          <label className="pidian-model-row">
            <span>{t("settingsModel")}</span>
            <span className="pidian-select">
              <select
                value={model}
                onChange={(event) => changeModel(event.target.value)}
              >
                {models.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <span className="pidian-caret" aria-hidden="true" />
            </span>
          </label>
        </div>
      ) : null}
    </div>
  );
}
