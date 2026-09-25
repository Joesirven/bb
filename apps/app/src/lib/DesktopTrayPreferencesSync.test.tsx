// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createStore, Provider as JotaiProvider } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClientTestHarness } from "@/test/queryClientTestHarness";
import { uiPreferencesQueryKey } from "@/hooks/queries/query-keys";
import {
  createFakeDesktopTrayApi,
  installBbDesktopWithTray,
} from "@/test/bb-desktop-test-utils";
import { DesktopTrayPreferencesSync } from "./DesktopTrayPreferencesSync";
import { hiddenMenuBarPluginIdsAtom } from "./desktop-tray-preferences";
import { registerDesktopTrayPlugin } from "./desktop-tray-plugins";

afterEach(() => {
  cleanup();
  delete window.bbDesktop;
});

describe("DesktopTrayPreferencesSync", () => {
  it("waits for the saved preferences, then pushes only changed enabled states to the shell", () => {
    const fake = createFakeDesktopTrayApi();
    installBbDesktopWithTray("macos", fake);
    const harness = createQueryClientTestHarness();
    const store = createStore();
    registerDesktopTrayPlugin("sync-shown");
    registerDesktopTrayPlugin("sync-hidden");
    store.set(hiddenMenuBarPluginIdsAtom, ["sync-hidden", "sync-unseen"]);
    vi.spyOn(harness.queryClient, "getQueryState");

    const view = render(
      <QueryClientProvider client={harness.queryClient}>
        <JotaiProvider store={store}>
          <DesktopTrayPreferencesSync />
        </JotaiProvider>
      </QueryClientProvider>,
    );
    expect(fake.setEnabledCalls).toEqual([]);

    harness.queryClient.setQueryData(uiPreferencesQueryKey(), {
      preferences: {},
    });
    view.rerender(
      <QueryClientProvider client={harness.queryClient}>
        <JotaiProvider store={store}>
          <DesktopTrayPreferencesSync />
        </JotaiProvider>
      </QueryClientProvider>,
    );
    expect(fake.setEnabledCalls).toEqual(
      expect.arrayContaining([
        { pluginId: "sync-hidden", enabled: false },
        { pluginId: "sync-unseen", enabled: false },
        { pluginId: "sync-shown", enabled: true },
      ]),
    );
    expect(fake.setEnabledCalls).toHaveLength(3);

    store.set(hiddenMenuBarPluginIdsAtom, ["sync-unseen"]);
    view.rerender(
      <QueryClientProvider client={harness.queryClient}>
        <JotaiProvider store={store}>
          <DesktopTrayPreferencesSync />
        </JotaiProvider>
      </QueryClientProvider>,
    );
    expect(fake.setEnabledCalls.slice(3)).toEqual([
      { pluginId: "sync-hidden", enabled: true },
    ]);
  });
});
