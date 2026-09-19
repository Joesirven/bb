import { BrowserWindow } from "electron";

export interface DesktopFloatingWindowManager {
  open(request: {
    pluginId: string;
    windowId: string;
    path: string;
    width?: number;
    height?: number;
  }): void;
  close(request: { pluginId: string; windowId: string }): void;
  disposeAll(): void;
}

export interface CreateDesktopFloatingWindowManagerArgs {
  /** The main window's own preload script — reused so the floating window's
   * page (the same web app, a chrome-free route) gets the identical
   * `window.bbDesktop` bridge and the plugin's normal RPC/realtime just
   * work, unmodified. */
  preloadPath: string;
  /** The active server's own base URL (origin), or null before one loads. */
  getServerBaseUrl(): string | null;
}

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 240;

function registryKey(pluginId: string, windowId: string): string {
  return `${pluginId}:${windowId}`;
}

/**
 * Registry of secondary, always-on-top `BrowserWindow`s hosting one plugin's
 * `experimental_floatingWindow` component each, keyed by
 * `${pluginId}:${windowId}`. Modeled on `existing-server-dialog.ts`'s
 * secondary-window pattern, minus the modal/parent behavior — a floating
 * window is independent and stays on top of every other window, including
 * bb's own main window.
 */
export function createDesktopFloatingWindowManager(
  args: CreateDesktopFloatingWindowManagerArgs,
): DesktopFloatingWindowManager {
  const windows = new Map<string, BrowserWindow>();

  return {
    open({ pluginId, windowId, path, width, height }) {
      const key = registryKey(pluginId, windowId);
      const existing = windows.get(key);
      if (existing !== undefined && !existing.isDestroyed()) {
        existing.show();
        existing.focus();
        return;
      }
      const baseUrl = args.getServerBaseUrl();
      if (baseUrl === null) return;
      const url = new URL(`/plugins/${pluginId}/floating/${path}`, baseUrl);
      const window = new BrowserWindow({
        width: width ?? DEFAULT_WIDTH,
        height: height ?? DEFAULT_HEIGHT,
        alwaysOnTop: true,
        frame: false,
        resizable: true,
        skipTaskbar: true,
        show: false,
        webPreferences: {
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          preload: args.preloadPath,
        },
      });
      window.once("ready-to-show", () => {
        window.show();
      });
      window.on("closed", () => {
        windows.delete(key);
      });
      void window.loadURL(url.toString());
      windows.set(key, window);
    },
    close({ pluginId, windowId }) {
      const key = registryKey(pluginId, windowId);
      const existing = windows.get(key);
      if (existing === undefined) return;
      windows.delete(key);
      if (!existing.isDestroyed()) existing.close();
    },
    disposeAll() {
      for (const window of windows.values()) {
        if (!window.isDestroyed()) window.close();
      }
      windows.clear();
    },
  };
}
