import { useEffect, useState } from "react";
import type PidianPlugin from "../main";
import type { CatalogModel, CatalogProvider } from "../domain/agent/ModelCatalog";

export function ModelSelector({
  plugin,
  onChange,
}: {
  plugin: PidianPlugin;
  onChange: () => void;
}): JSX.Element {
  const [providers, setProviders] = useState<CatalogProvider[]>([]);
  const [models, setModels] = useState<CatalogModel[]>([]);
  const session = plugin.agentService?.getSession();
  const provider = session?.provider ?? plugin.settings.provider;
  const model = session?.model ?? plugin.settings.model;

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

  return (
    <div className="pidian-model-selector">
      <select
        value={provider}
        onChange={(event) => {
          const nextProvider = event.target.value;
          const catalog = plugin.modelCatalog;
          if (!catalog) {
            return;
          }
          void catalog.listModels(nextProvider).then((nextModels) => {
            const first = nextModels[0]?.id ?? "";
            return plugin.changeModel(nextProvider, first);
          }).then(onChange);
        }}
      >
        {providers.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <select
        value={model}
        onChange={(event) => {
          void plugin.changeModel(provider, event.target.value).then(onChange);
        }}
      >
        {models.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </div>
  );
}
