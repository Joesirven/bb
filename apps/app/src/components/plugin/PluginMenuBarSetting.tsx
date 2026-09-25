import { useAtom } from "jotai";
import { Switch } from "@bb/shared-ui/switch";
import { SettingsWithControl } from "@/components/ui/settings-section";
import { getDesktopTrayApi } from "@/lib/bb-desktop-tray";
import { hiddenMenuBarPluginIdsAtom } from "@/lib/desktop-tray-preferences";
import { useDesktopTrayPluginIds } from "@/lib/desktop-tray-plugins";

export const MENU_BAR_SETTING_LABEL = "Show in menu bar";

export function usePluginHasMenuBarSetting(pluginId: string): boolean {
  const trayPluginIds = useDesktopTrayPluginIds();
  return getDesktopTrayApi() !== null && trayPluginIds.includes(pluginId);
}

export function PluginMenuBarSetting({ pluginId }: { pluginId: string }) {
  const [hiddenPluginIds, setHiddenPluginIds] = useAtom(
    hiddenMenuBarPluginIdsAtom,
  );
  const shown = !hiddenPluginIds.includes(pluginId);

  return (
    <SettingsWithControl
      label={MENU_BAR_SETTING_LABEL}
      description="Show this plugin's own item in the macOS menu bar. macOS hides items that do not fit beside the notch, so an item can be on yet not visible."
    >
      <Switch
        checked={shown}
        onCheckedChange={(next) =>
          setHiddenPluginIds((previous) =>
            next
              ? previous.filter((id) => id !== pluginId)
              : previous.includes(pluginId)
                ? previous
                : [...previous, pluginId],
          )
        }
        aria-label={MENU_BAR_SETTING_LABEL}
      />
    </SettingsWithControl>
  );
}
