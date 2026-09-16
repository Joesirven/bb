import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => {
  class FakeBrowserWindow {
    static instances: FakeBrowserWindow[] = [];
    shown = false;
    focused = false;
    destroyedFlag = false;
    closedListeners: (() => void)[] = [];
    readyToShowListeners: (() => void)[] = [];
    loadedUrl: string | null = null;
    constructor(public options: Record<string, unknown>) {
      FakeBrowserWindow.instances.push(this);
    }
    once(event: string, listener: () => void): void {
      if (event === "ready-to-show") this.readyToShowListeners.push(listener);
    }
    on(event: string, listener: () => void): void {
      if (event === "closed") this.closedListeners.push(listener);
    }
    show(): void {
      this.shown = true;
    }
    focus(): void {
      this.focused = true;
    }
    close(): void {
      this.destroyedFlag = true;
      for (const listener of this.closedListeners) listener();
    }
    isDestroyed(): boolean {
      return this.destroyedFlag;
    }
    async loadURL(url: string): Promise<void> {
      this.loadedUrl = url;
      for (const listener of this.readyToShowListeners) listener();
    }
  }

  return { FakeBrowserWindow, BrowserWindow: FakeBrowserWindow };
});

vi.mock("electron", () => electronMock);

describe("createDesktopFloatingWindowManager", () => {
  beforeEach(() => {
    electronMock.FakeBrowserWindow.instances = [];
  });

  it("does nothing when no server URL is known yet", async () => {
    const { createDesktopFloatingWindowManager } = await import(
      "../src/desktop-floating-window.js"
    );
    const manager = createDesktopFloatingWindowManager({
      preloadPath: "/tmp/preload.js",
      getServerBaseUrl: () => null,
    });
    manager.open({ pluginId: "pomodoro", windowId: "timer", path: "timer" });
    expect(electronMock.FakeBrowserWindow.instances).toHaveLength(0);
  });

  it("opens a window at the plugin's floating route, reusing the main preload", async () => {
    const { createDesktopFloatingWindowManager } = await import(
      "../src/desktop-floating-window.js"
    );
    const manager = createDesktopFloatingWindowManager({
      preloadPath: "/tmp/preload.js",
      getServerBaseUrl: () => "http://127.0.0.1:38886",
    });
    manager.open({
      pluginId: "pomodoro",
      windowId: "timer",
      path: "timer",
      width: 300,
      height: 200,
    });
    expect(electronMock.FakeBrowserWindow.instances).toHaveLength(1);
    const window = electronMock.FakeBrowserWindow.instances[0];
    expect(window.loadedUrl).toBe(
      "http://127.0.0.1:38886/plugins/pomodoro/floating/timer",
    );
    expect(window.options.alwaysOnTop).toBe(true);
    expect(window.options.frame).toBe(false);
    expect(
      (window.options.webPreferences as Record<string, unknown>).preload,
    ).toBe("/tmp/preload.js");
    expect(window.shown).toBe(true);
  });

  it("focuses the existing window instead of opening a duplicate", async () => {
    const { createDesktopFloatingWindowManager } = await import(
      "../src/desktop-floating-window.js"
    );
    const manager = createDesktopFloatingWindowManager({
      preloadPath: "/tmp/preload.js",
      getServerBaseUrl: () => "http://127.0.0.1:38886",
    });
    const request = {
      pluginId: "pomodoro",
      windowId: "timer",
      path: "timer",
    };
    manager.open(request);
    manager.open(request);
    expect(electronMock.FakeBrowserWindow.instances).toHaveLength(1);
    expect(electronMock.FakeBrowserWindow.instances[0].focused).toBe(true);
  });

  it("closes and forgets a window, and reopens it fresh afterwards", async () => {
    const { createDesktopFloatingWindowManager } = await import(
      "../src/desktop-floating-window.js"
    );
    const manager = createDesktopFloatingWindowManager({
      preloadPath: "/tmp/preload.js",
      getServerBaseUrl: () => "http://127.0.0.1:38886",
    });
    const request = {
      pluginId: "pomodoro",
      windowId: "timer",
      path: "timer",
    };
    manager.open(request);
    manager.close(request);
    expect(electronMock.FakeBrowserWindow.instances[0].destroyedFlag).toBe(
      true,
    );

    manager.open(request);
    expect(electronMock.FakeBrowserWindow.instances).toHaveLength(2);
  });

  it("disposeAll closes every tracked window", async () => {
    const { createDesktopFloatingWindowManager } = await import(
      "../src/desktop-floating-window.js"
    );
    const manager = createDesktopFloatingWindowManager({
      preloadPath: "/tmp/preload.js",
      getServerBaseUrl: () => "http://127.0.0.1:38886",
    });
    manager.open({ pluginId: "pomodoro", windowId: "a", path: "a" });
    manager.open({ pluginId: "pomodoro", windowId: "b", path: "b" });
    manager.disposeAll();
    expect(
      electronMock.FakeBrowserWindow.instances.every((w) => w.destroyedFlag),
    ).toBe(true);
  });
});
