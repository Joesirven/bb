import { describe, expect, it } from "vitest";
import { MAX_PANES, countPanes, listPanes } from "@/lib/split-layout";
import {
  SIDEBAR_FIXED_DIFF_TAB_ID,
  SIDEBAR_FIXED_INFO_TAB_ID,
  closeSidebarPane,
  createSidebarSplitState,
  getSidebarGroupForPane,
  moveSidebarPaneToSide,
  moveSidebarTab,
  parseSidebarSplitState,
  reconcileSidebarSplitState,
  reorderSidebarTab,
  resizeSidebarSplit,
  selectSidebarTab,
  serializeSidebarSplitState,
  swapSidebarPanes,
  toggleSidebarPaneMaximize,
} from "./sidebarSplitLayout";

const TABS = [SIDEBAR_FIXED_INFO_TAB_ID, SIDEBAR_FIXED_DIFF_TAB_ID, "file-a"];

function splitOff(
  state: ReturnType<typeof createSidebarSplitState>,
  tabId: string,
  side: "left" | "right" | "top" | "bottom" = "right",
) {
  return moveSidebarTab(
    state,
    state.layout.focusedPaneId,
    tabId,
    { paneId: state.layout.focusedPaneId, zone: side },
    { groupId: `group-${tabId}` },
  );
}

describe("sidebar split layout", () => {
  it("defaults old or invalid persisted state to the unchanged single pane", () => {
    const state = parseSidebarSplitState(
      JSON.stringify({ version: 0 }),
      TABS,
      SIDEBAR_FIXED_INFO_TAB_ID,
    );
    expect(countPanes(state.layout.root)).toBe(1);
    expect(
      getSidebarGroupForPane(state, state.layout.focusedPaneId)?.tabIds,
    ).toEqual(TABS);
  });

  it("round-trips a split and reconciles newly opened tabs into the focused pane", () => {
    const split = splitOff(
      createSidebarSplitState(TABS, SIDEBAR_FIXED_INFO_TAB_ID),
      "file-a",
    );
    const restored = parseSidebarSplitState(
      serializeSidebarSplitState(split),
      [...TABS, "terminal-a"],
      "terminal-a",
    );
    expect(countPanes(restored.layout.root)).toBe(2);
    expect(
      getSidebarGroupForPane(restored, restored.layout.focusedPaneId)?.tabIds,
    ).toContain("terminal-a");
  });

  it("preserves browser, terminal, and plugin tab ownership across persistence and recombination", () => {
    const liveTabIds = [
      SIDEBAR_FIXED_INFO_TAB_ID,
      "browser:docs:env-a",
      "terminal:term-a:none",
      "plugin-panel:side-chat:thread-a",
    ];
    let state = splitOff(
      createSidebarSplitState(liveTabIds, liveTabIds[1] ?? ""),
      liveTabIds[1] ?? "",
      "bottom",
    );
    const browserPaneId = state.layout.focusedPaneId;
    const sourcePane = listPanes(state.layout.root).find(
      (pane) => pane.paneId !== browserPaneId,
    );
    expect(sourcePane).toBeDefined();
    if (sourcePane === undefined) return;
    state = moveSidebarTab(
      state,
      sourcePane.paneId,
      liveTabIds[2] ?? "",
      { paneId: browserPaneId, zone: "right" },
      { groupId: "group-terminal" },
    );

    const restored = parseSidebarSplitState(
      serializeSidebarSplitState(state),
      liveTabIds,
      liveTabIds[2] ?? "",
    );
    let recombined = restored;
    while (countPanes(recombined.layout.root) > 1) {
      const closingPane = listPanes(recombined.layout.root).at(-1);
      if (closingPane === undefined) break;
      recombined = closeSidebarPane(recombined, closingPane.paneId);
    }
    const survivor = getSidebarGroupForPane(
      recombined,
      recombined.layout.focusedPaneId,
    );
    expect(new Set(survivor?.tabIds)).toEqual(new Set(liveTabIds));
    expect(survivor?.tabIds).toHaveLength(liveTabIds.length);
  });

  it("keeps fixed tabs singleton while removing closed tabs", () => {
    const split = splitOff(
      createSidebarSplitState(TABS, SIDEBAR_FIXED_INFO_TAB_ID),
      SIDEBAR_FIXED_DIFF_TAB_ID,
    );
    const duplicate = {
      ...split,
      groups: Object.fromEntries(
        Object.entries(split.groups).map(([id, group]) => [
          id,
          { ...group, tabIds: [...group.tabIds, SIDEBAR_FIXED_INFO_TAB_ID] },
        ]),
      ),
    };
    const reconciled = reconcileSidebarSplitState(
      duplicate,
      [SIDEBAR_FIXED_INFO_TAB_ID, SIDEBAR_FIXED_DIFF_TAB_ID],
      SIDEBAR_FIXED_INFO_TAB_ID,
    );
    const allIds = listPanes(reconciled.layout.root).flatMap(
      (pane) => getSidebarGroupForPane(reconciled, pane.paneId)?.tabIds ?? [],
    );
    expect(
      allIds.filter((id) => id === SIDEBAR_FIXED_INFO_TAB_ID),
    ).toHaveLength(1);
    expect(allIds).not.toContain("file-a");
    const activeTabId = getSidebarGroupForPane(
      reconciled,
      reconciled.layout.focusedPaneId,
    )?.activeTabId;
    expect(allIds).toContain(activeTabId);
  });

  it("repairs the surviving active tab after a stale focused pane is pruned", () => {
    const split = splitOff(
      createSidebarSplitState(TABS, SIDEBAR_FIXED_INFO_TAB_ID),
      "file-a",
    );
    const reconciled = reconcileSidebarSplitState(
      split,
      [SIDEBAR_FIXED_INFO_TAB_ID, SIDEBAR_FIXED_DIFF_TAB_ID],
      SIDEBAR_FIXED_INFO_TAB_ID,
    );
    const survivor = getSidebarGroupForPane(
      reconciled,
      reconciled.layout.focusedPaneId,
    );
    expect(countPanes(reconciled.layout.root)).toBe(1);
    expect(survivor?.activeTabId).toBe(SIDEBAR_FIXED_INFO_TAB_ID);
  });

  it("moves one tab, groups on center, and preserves pane-local reorder", () => {
    let state = splitOff(
      createSidebarSplitState([...TABS, "file-b"], SIDEBAR_FIXED_INFO_TAB_ID),
      "file-b",
    );
    const destinationPaneId = state.layout.focusedPaneId;
    const sourcePaneId = listPanes(state.layout.root).find(
      (pane) => pane.paneId !== destinationPaneId,
    )?.paneId;
    expect(sourcePaneId).toBeDefined();
    if (sourcePaneId === undefined) return;
    state = moveSidebarTab(
      state,
      sourcePaneId,
      "file-a",
      { paneId: destinationPaneId, zone: "center" },
      { groupId: "unused" },
    );
    state = reorderSidebarTab(state, destinationPaneId, "file-a", "file-b");
    expect(getSidebarGroupForPane(state, destinationPaneId)?.tabIds).toEqual([
      "file-a",
      "file-b",
    ]);
  });

  it("does not overwrite a restored group when a split id collides", () => {
    const state = splitOff(
      createSidebarSplitState([...TABS, "file-b"], SIDEBAR_FIXED_INFO_TAB_ID),
      "file-a",
    );
    const sourcePane = listPanes(state.layout.root).find((pane) =>
      getSidebarGroupForPane(state, pane.paneId)?.tabIds.includes("file-b"),
    );
    expect(sourcePane).toBeDefined();
    if (sourcePane === undefined) return;
    const collided = moveSidebarTab(
      state,
      sourcePane.paneId,
      "file-b",
      { paneId: sourcePane.paneId, zone: "bottom" },
      { groupId: "group-file-a" },
    );
    expect(collided).toBe(state);
  });

  it("recombines a focused closed pane deterministically without losing tabs", () => {
    let state = splitOff(
      createSidebarSplitState(TABS, SIDEBAR_FIXED_INFO_TAB_ID),
      "file-a",
    );
    const closingPaneId = state.layout.focusedPaneId;
    state = selectSidebarTab(state, closingPaneId, "file-a");
    const closed = closeSidebarPane(state, closingPaneId);
    const survivor = getSidebarGroupForPane(
      closed,
      closed.layout.focusedPaneId,
    );
    expect(countPanes(closed.layout.root)).toBe(1);
    expect(survivor?.tabIds).toEqual([
      SIDEBAR_FIXED_INFO_TAB_ID,
      SIDEBAR_FIXED_DIFF_TAB_ID,
      "file-a",
    ]);
    expect(survivor?.activeTabId).toBe("file-a");
  });

  it("moves, swaps, and maximizes panes through the shared split operations", () => {
    const split = splitOff(
      createSidebarSplitState(TABS, SIDEBAR_FIXED_INFO_TAB_ID),
      "file-a",
    );
    const panes = listPanes(split.layout.root);
    const sourcePaneId = panes[0]?.paneId;
    const targetPaneId = panes[1]?.paneId;
    expect(sourcePaneId).toBeDefined();
    expect(targetPaneId).toBeDefined();
    if (sourcePaneId === undefined || targetPaneId === undefined) return;

    const moved = moveSidebarPaneToSide(
      split,
      sourcePaneId,
      targetPaneId,
      "top",
    );
    expect(moved.layout.root.type).toBe("split");
    if (moved.layout.root.type !== "split") return;
    expect(moved.layout.root.dir).toBe("col");

    const sourceTabsBeforeSwap = getSidebarGroupForPane(
      moved,
      sourcePaneId,
    )?.tabIds;
    const targetTabsBeforeSwap = getSidebarGroupForPane(
      moved,
      targetPaneId,
    )?.tabIds;
    const swapped = swapSidebarPanes(moved, sourcePaneId, targetPaneId);
    expect(getSidebarGroupForPane(swapped, sourcePaneId)?.tabIds).toEqual(
      targetTabsBeforeSwap,
    );
    expect(getSidebarGroupForPane(swapped, targetPaneId)?.tabIds).toEqual(
      sourceTabsBeforeSwap,
    );

    const maximized = toggleSidebarPaneMaximize(swapped, targetPaneId);
    expect(maximized.maximizedPaneId).toBe(targetPaneId);
    expect(
      toggleSidebarPaneMaximize(maximized, targetPaneId).maximizedPaneId,
    ).toBe(null);
  });

  it("uses the existing split cap and clamps divider fractions", () => {
    let state = createSidebarSplitState(
      Array.from({ length: MAX_PANES + 1 }, (_, index) => `tab-${index}`),
      "tab-0",
    );
    for (let index = 1; index <= MAX_PANES; index += 1) {
      const sourcePane = listPanes(state.layout.root).find((pane) =>
        getSidebarGroupForPane(state, pane.paneId)?.tabIds.includes(
          `tab-${index}`,
        ),
      );
      if (sourcePane === undefined) continue;
      state = moveSidebarTab(
        state,
        sourcePane.paneId,
        `tab-${index}`,
        { paneId: state.layout.focusedPaneId, zone: "bottom" },
        { groupId: `group-${index}` },
      );
    }
    expect(countPanes(state.layout.root)).toBe(MAX_PANES);
    const resized = resizeSidebarSplit(state, [], 0, 0.01);
    if (resized.layout.root.type !== "split") throw new Error("expected split");
    const pairTotal =
      (resized.layout.root.sizes[0] ?? 0) + (resized.layout.root.sizes[1] ?? 0);
    expect(
      (resized.layout.root.sizes[0] ?? 0) / pairTotal,
    ).toBeGreaterThanOrEqual(0.15);
  });
});
