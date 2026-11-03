import { Menu, Tray, nativeImage, type MenuItemConstructorOptions } from "electron";
import type { BbDesktopTrayMenuItem } from "@bb/desktop-contract";

export interface DesktopTrayManager {
  setState(state: {
    title?: string;
    tooltip?: string;
    menuItems?: readonly BbDesktopTrayMenuItem[];
  }): void;
  clear(): void;
  dispose(): void;
}

export interface CreateDesktopTrayManagerArgs {
  /** Path to an image bb resizes down to menu-bar size on first use. */
  iconPath: string;
  /** Fires on a plain icon click (`itemId: null`) or a menu item click. */
  onActivated(itemId: string | null): void;
}

/**
 * Manages bb's single macOS menu-bar tray icon on behalf of whichever plugin
 * last called `experimental_desktopTray().setState(...)`. No-op off darwin —
 * callers should still construct it (simplifies main.ts), it just never
 * creates a real `Tray`.
 *
 * TODO(desktop): the resized app icon is a stand-in for a proper monochrome
 * template image; a real menu-bar asset should replace it before this ships
 * broadly (see docs/api_to_audit.md).
 */
export function createDesktopTrayManager(
  args: CreateDesktopTrayManagerArgs,
): DesktopTrayManager {
  if (process.platform !== "darwin") {
    return { setState: () => {}, clear: () => {}, dispose: () => {} };
  }

  let tray: Tray | null = null;

  function ensureTray(): Tray {
    if (tray !== null) return tray;
    const image = nativeImage
      .createFromPath(args.iconPath)
      .resize({ width: 16, height: 16 });
    image.setTemplateImage(true);
    const created = new Tray(image);
    created.on("click", () => {
      args.onActivated(null);
    });
    tray = created;
    return created;
  }

  return {
    setState(state) {
      const instance = ensureTray();
      if (state.title !== undefined) instance.setTitle(state.title);
      if (state.tooltip !== undefined) instance.setToolTip(state.tooltip);
      if (state.menuItems !== undefined) {
        if (state.menuItems.length === 0) {
          instance.setContextMenu(null);
        } else {
          const template: MenuItemConstructorOptions[] = state.menuItems.map(
            (item) => ({
              label: item.label,
              click: () => {
                args.onActivated(item.id);
              },
            }),
          );
          instance.setContextMenu(Menu.buildFromTemplate(template));
        }
      }
    },
    clear() {
      tray?.destroy();
      tray = null;
    },
    dispose() {
      tray?.destroy();
      tray = null;
    },
  };
}
