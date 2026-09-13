import { useEffect, useReducer, useState } from "react";
import type PidianPlugin from "../main";

export function useModelSupportsImages(plugin: PidianPlugin): boolean {
  const session = plugin.agentService?.getSession();
  const provider = session?.provider ?? plugin.settings.provider;
  const model = session?.model ?? plugin.settings.model;
  const [settingsRev, bumpSettings] = useReducer((value: number) => value + 1, 0);
  const [supportsImages, setSupportsImages] = useState(false);

  useEffect(() => {
    return plugin.subscribeSettings(() => bumpSettings());
  }, [plugin]);

  useEffect(() => {
    const custom = plugin.settings.customProviders.find((item) => item.id === provider);
    if (custom) {
      setSupportsImages(Boolean(custom.models.find((item) => item.id === model)?.supportsImages));
      return;
    }
    const catalog = plugin.modelCatalog;
    if (!provider || !model || !catalog) {
      setSupportsImages(false);
      return;
    }
    let cancelled = false;
    void catalog
      .listModels(provider)
      .then((models) => {
        if (!cancelled) {
          setSupportsImages(Boolean(models.find((item) => item.id === model)?.supportsImages));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSupportsImages(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [plugin, provider, model, settingsRev]);

  return supportsImages;
}
