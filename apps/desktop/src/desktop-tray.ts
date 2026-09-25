import { Menu, Tray, nativeImage, type MenuItemConstructorOptions } from "electron";
import type { BbDesktopTrayMenuItem } from "@bb/desktop-contract";

export const DESKTOP_TRAY_MAX_ITEMS = 8;

export interface DesktopTrayState {
  title?: string;
  tooltip?: string;
  menuItems?: readonly BbDesktopTrayMenuItem[];
}

export interface DesktopTrayManager {
  setState(pluginId: string, state: DesktopTrayState): void;
  clear(pluginId: string): void;
  setEnabled(pluginId: string, enabled: boolean): void;
  dispose(): void;
}

export interface DesktopTrayLogger {
  warn(message: string): void;
}

export interface CreateDesktopTrayManagerArgs {
  iconPath: string;
  logger: DesktopTrayLogger;
  onActivated(pluginId: string, itemId: string | null): void;
}

export function createDesktopTrayManager(
  args: CreateDesktopTrayManagerArgs,
): DesktopTrayManager {
  if (process.platform !== "darwin") {
    return {
      setState: () => {},
      clear: () => {},
      setEnabled: () => {},
      dispose: () => {},
    };
  }

  const trays = new Map<string, Tray>();
  const latestStates = new Map<string, DesktopTrayState>();
  const disabledPluginIds = new Set<string>();

  function createTray(pluginId: string): Tray | null {
    if (trays.size >= DESKTOP_TRAY_MAX_ITEMS) {
      args.logger.warn(
        `Ignoring the menu bar item for plugin ${JSON.stringify(pluginId)}: ${DESKTOP_TRAY_MAX_ITEMS} plugin items are already showing.`,
      );
      return null;
    }
    const image = nativeImage
      .createFromPath(args.iconPath)
      .resize({ width: 16, height: 16 });
    image.setTemplateImage(true);
    const created = new Tray(image);
    created.on("click", () => {
      args.onActivated(pluginId, null);
    });
    trays.set(pluginId, created);
    return created;
  }

  function applyState(
    pluginId: string,
    instance: Tray,
    state: DesktopTrayState,
  ): void {
    if (state.title !== undefined) instance.setTitle(state.title);
    if (state.tooltip !== undefined) instance.setToolTip(state.tooltip);
    if (state.menuItems === undefined) return;
    if (state.menuItems.length === 0) {
      instance.setContextMenu(null);
      return;
    }
    const template: MenuItemConstructorOptions[] = state.menuItems.map(
      (item) => ({
        label: item.label,
        click: () => {
          args.onActivated(pluginId, item.id);
        },
      }),
    );
    instance.setContextMenu(Menu.buildFromTemplate(template));
  }

  function destroyTray(pluginId: string): void {
    trays.get(pluginId)?.destroy();
    trays.delete(pluginId);
  }

  return {
    setState(pluginId, state) {
      const merged = { ...latestStates.get(pluginId), ...state };
      if (disabledPluginIds.has(pluginId)) {
        latestStates.set(pluginId, merged);
        return;
      }
      const existing = trays.get(pluginId);
      if (existing !== undefined) {
        latestStates.set(pluginId, merged);
        applyState(pluginId, existing, state);
        return;
      }
      const created = createTray(pluginId);
      if (created === null) return;
      latestStates.set(pluginId, merged);
      applyState(pluginId, created, merged);
    },
    clear(pluginId) {
      latestStates.delete(pluginId);
      destroyTray(pluginId);
    },
    setEnabled(pluginId, enabled) {
      if (!enabled) {
        disabledPluginIds.add(pluginId);
        destroyTray(pluginId);
        return;
      }
      if (!disabledPluginIds.delete(pluginId)) return;
      const remembered = latestStates.get(pluginId);
      if (remembered === undefined) return;
      const created = createTray(pluginId);
      if (created !== null) applyState(pluginId, created, remembered);
    },
    dispose() {
      for (const instance of trays.values()) instance.destroy();
      trays.clear();
      latestStates.clear();
    },
  };
}
