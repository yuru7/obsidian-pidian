import { useEffect, useReducer, useState } from "react";
import type { CatalogModelCost } from "../domain/agent/ModelCatalog";
import type PidianPlugin from "../main";

export function useModelCost(plugin: PidianPlugin): CatalogModelCost | undefined {
  const session = plugin.agentService?.getSession();
  const provider = session?.provider ?? plugin.settings.provider;
  const model = session?.model ?? plugin.settings.model;
  const [settingsRev, bumpSettings] = useReducer((value: number) => value + 1, 0);
  const [cost, setCost] = useState<CatalogModelCost | undefined>(undefined);

  useEffect(() => {
    return plugin.subscribeSettings(() => bumpSettings());
  }, [plugin]);

  useEffect(() => {
    const catalog = plugin.modelCatalog;
    if (!provider || !model || !catalog) {
      setCost(undefined);
      return;
    }
    let cancelled = false;
    void catalog
      .listModels(provider)
      .then((models) => {
        if (!cancelled) {
          setCost(models.find((item) => item.id === model)?.cost);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCost(undefined);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [plugin, provider, model, settingsRev]);

  return cost;
}
