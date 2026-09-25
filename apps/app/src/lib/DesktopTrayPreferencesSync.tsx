import { useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import { getDesktopTrayApi } from "./bb-desktop-tray";
import { hiddenMenuBarPluginIdsAtom } from "./desktop-tray-preferences";
import { useDesktopTrayPluginIds } from "./desktop-tray-plugins";
import { useUiPreferencesReady } from "./ui-preferences/UiPreferencesSync";

export function DesktopTrayPreferencesSync() {
  const ready = useUiPreferencesReady();
  const hiddenPluginIds = useAtomValue(hiddenMenuBarPluginIdsAtom);
  const trayPluginIds = useDesktopTrayPluginIds();
  const pushedRef = useRef(new Map<string, boolean>());

  useEffect(() => {
    if (!ready) return;
    const api = getDesktopTrayApi();
    if (api === null) return;
    const hidden = new Set(hiddenPluginIds);
    const pushed = pushedRef.current;
    const pluginIds = new Set([...hidden, ...trayPluginIds, ...pushed.keys()]);
    for (const pluginId of pluginIds) {
      const enabled = !hidden.has(pluginId);
      if (pushed.get(pluginId) === enabled) continue;
      pushed.set(pluginId, enabled);
      api.setEnabled({ pluginId, enabled });
    }
  }, [ready, hiddenPluginIds, trayPluginIds]);

  return null;
}
