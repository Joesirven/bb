import type {
  BbDesktopApi,
  BbDesktopBrowserApi,
  BbDesktopInfo,
  BbDesktopTrayActivateHandler,
  BbDesktopTrayApi,
  BbDesktopTraySetEnabledRequest,
  BbDesktopTraySetStateRequest,
} from "@bb/desktop-contract";

export function createNoopDesktopBrowserApi(): BbDesktopBrowserApi {
  return {
    attach() {},
    detach() {},
    navigate() {},
    goBack() {},
    goForward() {},
    reload() {},
    stop() {},
    focus() {},
    setBounds() {},
    setVisible() {},
    setVisibleWithoutFocus() {},
    onState() {
      return () => {};
    },
    onOpenTab() {
      return () => {};
    },
    onFocus() {
      return () => {};
    },
  };
}

export function createBbDesktopApi(
  info: BbDesktopInfo,
  browser: BbDesktopBrowserApi = createNoopDesktopBrowserApi(),
): BbDesktopApi {
  return {
    ...info,
    browser,
    async checkForUpdates() {
      return info;
    },
    async getInfo() {
      return info;
    },
    async installUpdate() {},
    onChange() {
      return () => {};
    },
    setTheme() {},
    openExternalUrl() {},
  };
}

export interface FakeDesktopTrayApi extends BbDesktopTrayApi {
  setStateCalls: BbDesktopTraySetStateRequest[];
  clearCalls: { pluginId: string }[];
  setEnabledCalls: BbDesktopTraySetEnabledRequest[];
  emitActivated(pluginId: string, itemId: string | null): void;
}

export function createFakeDesktopTrayApi(): FakeDesktopTrayApi {
  const handlers = new Set<BbDesktopTrayActivateHandler>();
  const fake: FakeDesktopTrayApi = {
    setStateCalls: [],
    clearCalls: [],
    setEnabledCalls: [],
    setState(request) {
      fake.setStateCalls.push(request);
    },
    clear(request) {
      fake.clearCalls.push(request);
    },
    setEnabled(request) {
      fake.setEnabledCalls.push(request);
    },
    onActivate(listener) {
      handlers.add(listener);
      return () => {
        handlers.delete(listener);
      };
    },
    emitActivated(pluginId, itemId) {
      for (const handler of handlers) handler(pluginId, itemId);
    },
  };
  return fake;
}

export function installBbDesktopWithTray(
  platform: BbDesktopInfo["platform"],
  tray: BbDesktopTrayApi,
): void {
  window.bbDesktop = {
    ...createBbDesktopApi({
      lastCheckedAt: null,
      latestVersion: null,
      pendingVersion: null,
      platform,
      updateAvailable: false,
      updateDownloaded: false,
      version: "0.0.0-test",
    }),
    experimental_tray: tray,
  };
}

export function installBbDesktopWithOlderTray(
  platform: BbDesktopInfo["platform"],
  tray: Omit<BbDesktopTrayApi, "setEnabled">,
): void {
  installBbDesktopWithTray(platform, tray as BbDesktopTrayApi);
}
