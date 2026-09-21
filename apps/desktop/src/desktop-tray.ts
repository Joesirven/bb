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
  iconPath: string;
  onActivated(itemId: string | null): void;
}

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
