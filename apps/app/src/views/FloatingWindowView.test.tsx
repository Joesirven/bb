// @vitest-environment jsdom

import { MemoryRouter, Route, Routes } from "react-router-dom";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePluginId } from "@/components/plugin/plugin-context";
import { resetAllCrashedPluginSlotsForTest } from "@/components/plugin/PluginSlotMount";
import {
  resetPluginSlotStoreForTest,
  setPluginSlotRegistrations,
} from "@/lib/plugin-slots";
import { FLOATING_WINDOW_ROUTE_PATH } from "@/lib/route-paths";
import { makePluginRegistrationSet } from "@/test/fixtures/plugins";
import { FloatingWindowView } from "./FloatingWindowView";

function renderFloatingWindowRoute(pluginId: string, windowId: string) {
  return render(
    <MemoryRouter
      initialEntries={[`/plugins/${pluginId}/floating/${windowId}`]}
    >
      <Routes>
        <Route
          path={FLOATING_WINDOW_ROUTE_PATH}
          element={<FloatingWindowView />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  resetPluginSlotStoreForTest();
  resetAllCrashedPluginSlotsForTest();
  vi.restoreAllMocks();
});

describe("FloatingWindowView", () => {
  it("provides the plugin context to the registered floating window component", () => {
    function PluginIdProbe() {
      return <div>plugin id: {usePluginId()}</div>;
    }
    setPluginSlotRegistrations(
      "pomodoro",
      makePluginRegistrationSet({
        floatingWindows: [
          { id: "timer", path: "timer", component: PluginIdProbe },
        ],
      }),
    );

    renderFloatingWindowRoute("pomodoro", "timer");

    expect(screen.getByText("plugin id: pomodoro")).toBeDefined();
  });

  it("contains a crashing floating window component behind the slot boundary", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    function Crashes(): never {
      throw new Error("floating window crashed");
    }
    setPluginSlotRegistrations(
      "pomodoro",
      makePluginRegistrationSet({
        floatingWindows: [{ id: "timer", path: "timer", component: Crashes }],
      }),
    );

    renderFloatingWindowRoute("pomodoro", "timer");

    expect(screen.getByText("plugin pomodoro crashed")).toBeDefined();
  });

  it("renders a blank fallback for an unknown window id", () => {
    function Unreachable() {
      return <div>should not render</div>;
    }
    setPluginSlotRegistrations(
      "pomodoro",
      makePluginRegistrationSet({
        floatingWindows: [
          { id: "timer", path: "timer", component: Unreachable },
        ],
      }),
    );

    const { container } = renderFloatingWindowRoute("pomodoro", "missing");

    expect(screen.queryByText("should not render")).toBeNull();
    expect(container.textContent).toBe("");
    expect(container.firstElementChild?.childElementCount).toBe(0);
  });
});
