// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import { afterEach, describe, expect, it } from "vitest";
import { hiddenMenuBarPluginIdsAtom } from "@/lib/desktop-tray-preferences";
import { registerDesktopTrayPlugin } from "@/lib/desktop-tray-plugins";
import {
  createFakeDesktopTrayApi,
  installBbDesktopWithTray,
} from "@/test/bb-desktop-test-utils";
import {
  MENU_BAR_SETTING_LABEL,
  PluginMenuBarSetting,
  usePluginHasMenuBarSetting,
} from "./PluginMenuBarSetting";

afterEach(() => {
  cleanup();
  delete window.bbDesktop;
});

function Probe({ pluginId }: { pluginId: string }) {
  const visible = usePluginHasMenuBarSetting(pluginId);
  return visible ? <PluginMenuBarSetting pluginId={pluginId} /> : null;
}

function renderProbe(pluginId: string) {
  const store = createStore();
  render(
    <JotaiProvider store={store}>
      <Probe pluginId={pluginId} />
    </JotaiProvider>,
  );
  return store;
}

describe("PluginMenuBarSetting", () => {
  it("stays hidden in the browser and on non-macOS desktops even for a plugin that used the tray", () => {
    registerDesktopTrayPlugin("visibility-a");
    renderProbe("visibility-a");
    expect(screen.queryByRole("switch")).toBeNull();
    cleanup();

    installBbDesktopWithTray("linux", createFakeDesktopTrayApi());
    renderProbe("visibility-a");
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("stays hidden on macOS for a plugin that has never used the tray", () => {
    installBbDesktopWithTray("macos", createFakeDesktopTrayApi());
    renderProbe("visibility-never-used");
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("appears on macOS once the plugin has used the tray, on by default, and toggles the hidden list", () => {
    installBbDesktopWithTray("macos", createFakeDesktopTrayApi());
    const store = createStore();
    function Harness() {
      return (
        <JotaiProvider store={store}>
          <Probe pluginId="visibility-b" />
        </JotaiProvider>
      );
    }
    const view = render(<Harness />);
    expect(screen.queryByRole("switch")).toBeNull();

    registerDesktopTrayPlugin("visibility-b");
    view.rerender(<Harness />);
    const toggle = screen.getByRole("switch", { name: MENU_BAR_SETTING_LABEL });
    expect(toggle.getAttribute("aria-checked")).toBe("true");

    store.set(hiddenMenuBarPluginIdsAtom, ["other-plugin"]);
    fireEvent.click(toggle);
    expect(store.get(hiddenMenuBarPluginIdsAtom)).toEqual([
      "other-plugin",
      "visibility-b",
    ]);
    expect(toggle.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(toggle);
    expect(store.get(hiddenMenuBarPluginIdsAtom)).toEqual(["other-plugin"]);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });
});
