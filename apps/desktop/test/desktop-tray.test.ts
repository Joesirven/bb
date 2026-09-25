import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => {
  class FakeTray {
    static instances: FakeTray[] = [];
    title = "";
    tooltip = "";
    contextMenu: unknown = null;
    destroyed = false;
    listeners = new Map<string, () => void>();
    constructor(public image: unknown) {
      FakeTray.instances.push(this);
    }
    on(event: string, listener: () => void): void {
      this.listeners.set(event, listener);
    }
    setTitle(title: string): void {
      this.title = title;
    }
    setToolTip(tooltip: string): void {
      this.tooltip = tooltip;
    }
    setContextMenu(menu: unknown): void {
      this.contextMenu = menu;
    }
    destroy(): void {
      this.destroyed = true;
    }
  }

  const fakeImage = {
    resize: vi.fn(function resize(this: unknown) {
      return this;
    }),
    setTemplateImage: vi.fn(),
  };

  return {
    FakeTray,
    Tray: FakeTray,
    Menu: {
      buildFromTemplate: vi.fn((template: unknown) => ({ template })),
    },
    nativeImage: {
      createFromPath: vi.fn(() => fakeImage),
    },
  };
});

vi.mock("electron", () => electronMock);

describe("createDesktopTrayManager", () => {
  const originalPlatform = process.platform;
  const logger = { warn: vi.fn() };

  async function createManager() {
    Object.defineProperty(process, "platform", { value: "darwin" });
    const { createDesktopTrayManager } = await import("../src/desktop-tray.js");
    const onActivated = vi.fn();
    const manager = createDesktopTrayManager({
      iconPath: "/tmp/icon.png",
      logger,
      onActivated,
    });
    return { manager, onActivated };
  }

  beforeEach(() => {
    electronMock.FakeTray.instances = [];
    electronMock.Menu.buildFromTemplate.mockClear();
    logger.warn.mockClear();
    vi.resetModules();
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("is a no-op off darwin", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    const { createDesktopTrayManager } = await import("../src/desktop-tray.js");
    const manager = createDesktopTrayManager({
      iconPath: "/tmp/icon.png",
      logger,
      onActivated: vi.fn(),
    });
    manager.setState("pomodoro", { title: "23:59" });
    expect(electronMock.FakeTray.instances).toHaveLength(0);
  });

  it("lazily creates one Tray per plugin and applies title, tooltip, and menu", async () => {
    const { manager, onActivated } = await createManager();

    manager.setState("pomodoro", { title: "23:59", tooltip: "Pomodoro" });
    expect(electronMock.FakeTray.instances).toHaveLength(1);
    const tray = electronMock.FakeTray.instances[0];
    expect(tray.title).toBe("23:59");
    expect(tray.tooltip).toBe("Pomodoro");

    manager.setState("pomodoro", { title: "22:59" });
    expect(electronMock.FakeTray.instances).toHaveLength(1);
    expect(tray.title).toBe("22:59");
    expect(tray.tooltip).toBe("Pomodoro");

    manager.setState("pomodoro", {
      menuItems: [{ id: "pause", label: "Pause" }],
    });
    const template = electronMock.Menu.buildFromTemplate.mock.calls[0][0] as {
      label: string;
      click: () => void;
    }[];
    expect(template[0].label).toBe("Pause");
    template[0].click();
    expect(onActivated).toHaveBeenCalledWith("pomodoro", "pause");

    tray.listeners.get("click")?.();
    expect(onActivated).toHaveBeenCalledWith("pomodoro", null);

    manager.clear("pomodoro");
    expect(tray.destroyed).toBe(true);

    manager.setState("pomodoro", { title: "resumed" });
    expect(electronMock.FakeTray.instances).toHaveLength(2);
    expect(electronMock.FakeTray.instances[1].tooltip).toBe("");
  });

  it("gives two plugins independent items, state, and activation routing", async () => {
    const { manager, onActivated } = await createManager();

    manager.setState("pomodoro", { title: "24:00" });
    manager.setState("timers", {
      title: "00:10",
      menuItems: [{ id: "stop", label: "Stop" }],
    });
    expect(electronMock.FakeTray.instances).toHaveLength(2);
    const [pomodoroTray, timersTray] = electronMock.FakeTray.instances;
    expect(pomodoroTray.title).toBe("24:00");
    expect(timersTray.title).toBe("00:10");

    manager.setState("pomodoro", { title: "23:59" });
    expect(pomodoroTray.title).toBe("23:59");
    expect(timersTray.title).toBe("00:10");

    timersTray.listeners.get("click")?.();
    expect(onActivated).toHaveBeenLastCalledWith("timers", null);
    const template = electronMock.Menu.buildFromTemplate.mock.calls[0][0] as {
      click: () => void;
    }[];
    template[0].click();
    expect(onActivated).toHaveBeenLastCalledWith("timers", "stop");

    manager.clear("pomodoro");
    expect(pomodoroTray.destroyed).toBe(true);
    expect(timersTray.destroyed).toBe(false);
  });

  it("destroys a disabled plugin's item, ignores its updates, and restores the latest state on re-enable", async () => {
    const { manager } = await createManager();

    manager.setState("pomodoro", { title: "24:00", tooltip: "Work" });
    manager.setState("timers", { title: "00:10" });
    const [pomodoroTray, timersTray] = electronMock.FakeTray.instances;

    manager.setEnabled("pomodoro", false);
    expect(pomodoroTray.destroyed).toBe(true);
    expect(timersTray.destroyed).toBe(false);

    manager.setState("pomodoro", { title: "20:00" });
    manager.setState("pomodoro", { menuItems: [{ id: "a", label: "A" }] });
    expect(electronMock.FakeTray.instances).toHaveLength(2);
    expect(electronMock.Menu.buildFromTemplate).not.toHaveBeenCalled();

    manager.setEnabled("pomodoro", true);
    expect(electronMock.FakeTray.instances).toHaveLength(3);
    const restored = electronMock.FakeTray.instances[2];
    expect(restored.title).toBe("20:00");
    expect(restored.tooltip).toBe("Work");
    expect(electronMock.Menu.buildFromTemplate).toHaveBeenCalledTimes(1);
  });

  it("applies a disabled preference that arrives before the plugin's first state", async () => {
    const { manager } = await createManager();

    manager.setEnabled("pomodoro", false);
    manager.setState("pomodoro", { title: "24:00" });
    expect(electronMock.FakeTray.instances).toHaveLength(0);

    manager.setEnabled("pomodoro", true);
    expect(electronMock.FakeTray.instances).toHaveLength(1);
    expect(electronMock.FakeTray.instances[0].title).toBe("24:00");
  });

  it("does not resurrect an item for a plugin that cleared while disabled", async () => {
    const { manager } = await createManager();

    manager.setState("pomodoro", { title: "24:00" });
    manager.setEnabled("pomodoro", false);
    manager.clear("pomodoro");
    manager.setEnabled("pomodoro", true);
    expect(electronMock.FakeTray.instances).toHaveLength(1);
    expect(electronMock.FakeTray.instances[0].destroyed).toBe(true);
  });

  it("enabling a plugin that was never disabled does not create a duplicate item", async () => {
    const { manager } = await createManager();

    manager.setState("pomodoro", { title: "24:00" });
    manager.setEnabled("pomodoro", true);
    expect(electronMock.FakeTray.instances).toHaveLength(1);
  });

  it("caps live items at eight and warns for extras without consuming a slot", async () => {
    const { manager } = await createManager();

    for (let index = 0; index < 8; index += 1) {
      manager.setState(`plugin-${index}`, { title: String(index) });
    }
    expect(electronMock.FakeTray.instances).toHaveLength(8);

    manager.setState("plugin-8", { title: "extra" });
    expect(electronMock.FakeTray.instances).toHaveLength(8);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toContain("plugin-8");

    manager.setState("plugin-3", { title: "still updates" });
    expect(electronMock.FakeTray.instances[3].title).toBe("still updates");

    manager.clear("plugin-0");
    manager.setState("plugin-8", { title: "now fits" });
    expect(electronMock.FakeTray.instances).toHaveLength(9);
    expect(electronMock.FakeTray.instances[8].title).toBe("now fits");
  });

  it("does not remember state for a plugin ignored at the cap", async () => {
    const { manager } = await createManager();

    for (let index = 0; index < 8; index += 1) {
      manager.setState(`plugin-${index}`, { title: String(index) });
    }
    manager.setState("plugin-8", { title: "ignored" });
    manager.clear("plugin-0");
    manager.setState("plugin-8", { tooltip: "later" });
    const created = electronMock.FakeTray.instances[8];
    expect(created.title).toBe("");
    expect(created.tooltip).toBe("later");
  });

  it("does not count a disabled plugin's item toward the cap", async () => {
    const { manager } = await createManager();

    for (let index = 0; index < 8; index += 1) {
      manager.setState(`plugin-${index}`, { title: String(index) });
    }
    manager.setEnabled("plugin-0", false);
    manager.setState("plugin-8", { title: "fits" });
    expect(electronMock.FakeTray.instances).toHaveLength(9);
    expect(logger.warn).not.toHaveBeenCalled();

    manager.setEnabled("plugin-0", true);
    expect(electronMock.FakeTray.instances).toHaveLength(9);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("destroys every item on dispose", async () => {
    const { manager } = await createManager();

    manager.setState("a", { title: "a" });
    manager.setState("b", { title: "b" });
    manager.dispose();
    expect(
      electronMock.FakeTray.instances.every((tray) => tray.destroyed),
    ).toBe(true);

    manager.setState("a", { title: "again" });
    expect(electronMock.FakeTray.instances).toHaveLength(3);
    expect(electronMock.FakeTray.instances[2].title).toBe("again");
  });
});
