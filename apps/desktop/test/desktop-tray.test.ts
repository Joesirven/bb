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

  beforeEach(() => {
    electronMock.FakeTray.instances = [];
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
      onActivated: vi.fn(),
    });
    manager.setState({ title: "23:59" });
    expect(electronMock.FakeTray.instances).toHaveLength(0);
  });

  it("lazily creates one Tray and applies title/tooltip/menu on darwin", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    const { createDesktopTrayManager } = await import("../src/desktop-tray.js");
    const onActivated = vi.fn();
    const manager = createDesktopTrayManager({
      iconPath: "/tmp/icon.png",
      onActivated,
    });

    manager.setState({ title: "23:59", tooltip: "Pomodoro" });
    expect(electronMock.FakeTray.instances).toHaveLength(1);
    const tray = electronMock.FakeTray.instances[0];
    expect(tray.title).toBe("23:59");
    expect(tray.tooltip).toBe("Pomodoro");

    // A second setState reuses the same Tray instance.
    manager.setState({ title: "22:59" });
    expect(electronMock.FakeTray.instances).toHaveLength(1);
    expect(tray.title).toBe("22:59");

    manager.setState({
      menuItems: [{ id: "pause", label: "Pause" }],
    });
    expect(electronMock.Menu.buildFromTemplate).toHaveBeenCalledTimes(1);
    const template = electronMock.Menu.buildFromTemplate.mock.calls[0][0] as {
      label: string;
      click: () => void;
    }[];
    expect(template[0].label).toBe("Pause");
    template[0].click();
    expect(onActivated).toHaveBeenCalledWith("pause");

    tray.listeners.get("click")?.();
    expect(onActivated).toHaveBeenCalledWith(null);

    manager.clear();
    expect(tray.destroyed).toBe(true);

    // clear() then setState() creates a fresh Tray instance.
    manager.setState({ title: "resumed" });
    expect(electronMock.FakeTray.instances).toHaveLength(2);
  });
});
