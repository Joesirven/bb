import { useSyncExternalStore } from "react";

const EMPTY_PLUGIN_IDS: readonly string[] = [];

let pluginIds: readonly string[] = EMPTY_PLUGIN_IDS;
const listeners = new Set<() => void>();

export function registerDesktopTrayPlugin(pluginId: string): void {
  if (pluginIds.includes(pluginId)) return;
  pluginIds = [...pluginIds, pluginId];
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): readonly string[] {
  return pluginIds;
}

export function useDesktopTrayPluginIds(): readonly string[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
