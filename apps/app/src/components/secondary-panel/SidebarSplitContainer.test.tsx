// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { TooltipProvider } from "@bb/shared-ui/tooltip";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { usePaneContext } from "@/views/thread-detail/PaneContext";
import {
  SidebarSplitContainer,
  type SidebarSplitPaneRenderArgs,
  type SidebarSplitTabDescriptor,
} from "./SidebarSplitContainer";
import {
  createSidebarSplitState,
  focusSidebarPane,
  moveSidebarTab,
  serializeSidebarSplitState,
  sidebarSplitStorageKey,
  type SidebarSplitState,
} from "./sidebarSplitLayout";
import { getFixedPanelTabsStateStorageKey } from "@/lib/fixed-panel-tabs-state";

vi.mock("@/views/thread-detail/PaneMaximizeButton", () => ({
  PaneMaximizeButton: () => null,
}));

vi.mock("@/views/thread-detail/SplitDimmingButton", () => ({
  SplitDimmingButton: () => null,
}));

const TABS: readonly SidebarSplitTabDescriptor[] = [
  { id: "tab-a", label: "A", leadingVisual: null },
  { id: "tab-b", label: "B", leadingVisual: null },
];
const PANEL_STATE_ID = "sidebar-split-container-test";
let nextPaneInstance = 0;

function createTwoPaneState(): SidebarSplitState {
  const initial = createSidebarSplitState(
    TABS.map((tab) => tab.id),
    "tab-a",
  );
  return moveSidebarTab(
    initial,
    initial.layout.focusedPaneId,
    "tab-b",
    { paneId: initial.layout.focusedPaneId, zone: "right" },
    { groupId: "group-b" },
  );
}

function persistState(state: SidebarSplitState): void {
  window.localStorage.setItem(
    sidebarSplitStorageKey(PANEL_STATE_ID),
    serializeSidebarSplitState(state),
  );
}

function renderContainer({
  activeTabId = "tab-a",
  onActivateTab = vi.fn(),
  renderPane,
  tabs = TABS,
}: {
  activeTabId?: string;
  onActivateTab?: (tabId: string) => void;
  renderPane: (args: SidebarSplitPaneRenderArgs) => ReactNode;
  tabs?: readonly SidebarSplitTabDescriptor[];
}) {
  return render(
    <SidebarProvider>
      <TooltipProvider>
        <SidebarSplitContainer
          activeTabId={activeTabId}
          onActivateTab={onActivateTab}
          onGlobalTabReorder={vi.fn()}
          panelStateId={PANEL_STATE_ID}
          renderConversationControl={() => (
            <button data-testid="conversation-control">Conversation</button>
          )}
          renderHideControl={() => (
            <button data-testid="hide-control">Hide</button>
          )}
          renderPane={renderPane}
          tabs={tabs}
        />
      </TooltipProvider>
    </SidebarProvider>,
  );
}

function StatefulPane({ paneId }: { paneId: string }) {
  const pane = usePaneContext();
  const [instanceId] = useState(() => `${paneId}-${nextPaneInstance++}`);
  return (
    <div data-testid={`pane-content-${paneId}`}>
      <span data-testid={`pane-instance-${paneId}`}>{instanceId}</span>
      <button type="button" onClick={() => pane.onMoveToSide?.("left")}>
        Move {paneId} left
      </button>
    </div>
  );
}

describe("SidebarSplitContainer", () => {
  beforeEach(() => {
    window.localStorage.clear();
    nextPaneInstance = 0;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.body.style.userSelect = "";
  });

  it("activates a focused pane outside React's state updater", async () => {
    const split = createTwoPaneState();
    const firstPaneId =
      split.layout.root.type === "split"
        ? split.layout.root.children[0]?.type === "pane"
          ? split.layout.root.children[0].paneId
          : null
        : null;
    const secondPaneId =
      split.layout.root.type === "split"
        ? split.layout.root.children[1]?.type === "pane"
          ? split.layout.root.children[1].paneId
          : null
        : null;
    expect(firstPaneId).not.toBeNull();
    expect(secondPaneId).not.toBeNull();
    if (firstPaneId === null || secondPaneId === null) return;
    persistState(focusSidebarPane(split, firstPaneId));

    const activate = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    function Harness() {
      const [activeTabId, setActiveTabId] = useState("tab-a");
      return (
        <SidebarSplitContainer
          activeTabId={activeTabId}
          onActivateTab={(tabId) => {
            activate(tabId);
            setActiveTabId(tabId);
          }}
          onGlobalTabReorder={vi.fn()}
          panelStateId={PANEL_STATE_ID}
          renderConversationControl={() => null}
          renderHideControl={() => null}
          renderPane={({ paneId }) => (
            <div data-testid={`pane-content-${paneId}`}>{paneId}</div>
          )}
          tabs={TABS}
        />
      );
    }

    render(
      <SidebarProvider>
        <TooltipProvider>
          <Harness />
        </TooltipProvider>
      </SidebarProvider>,
    );
    fireEvent.pointerDown(screen.getByTestId(`pane-content-${secondPaneId}`));

    await waitFor(() => expect(activate).toHaveBeenCalledWith("tab-b"));
    expect(activate).toHaveBeenCalledTimes(1);
    expect(
      consoleError.mock.calls.some((call) =>
        call.some(
          (value) =>
            typeof value === "string" &&
            value.includes("Cannot update a component while rendering"),
        ),
      ),
    ).toBe(false);
  });

  it("reports pane focus and visibility and reserves outer controls once", () => {
    const split = createTwoPaneState();
    const maximizedPaneId =
      split.layout.root.type === "split" &&
      split.layout.root.children[0]?.type === "pane"
        ? split.layout.root.children[0].paneId
        : split.layout.focusedPaneId;
    persistState({
      ...focusSidebarPane(split, maximizedPaneId),
      maximizedPaneId,
    });

    renderContainer({
      renderPane: ({ isFocused, isVisible, paneId }) => (
        <div data-testid={`pane-state-${paneId}`}>
          {`${isFocused}:${isVisible}`}
        </div>
      ),
    });

    expect(
      screen.getByTestId(`pane-state-${maximizedPaneId}`).textContent,
    ).toBe("true:true");
    const hiddenPane = Array.from(
      document.querySelectorAll<HTMLElement>("[data-split-pane-id]"),
    ).find((pane) => pane.dataset.splitPaneId !== maximizedPaneId);
    expect(hiddenPane).toBeDefined();
    if (hiddenPane === undefined) return;
    expect(
      screen.getByTestId(`pane-state-${hiddenPane.dataset.splitPaneId}`)
        .textContent,
    ).toBe("false:false");
    expect(screen.getAllByTestId("conversation-control")).toHaveLength(1);
    expect(screen.getAllByTestId("hide-control")).toHaveLength(1);
  });

  it("keeps stateful pane content attached to pane identity after a move", () => {
    const split = createTwoPaneState();
    persistState(split);

    renderContainer({
      renderPane: ({ paneId }) => <StatefulPane paneId={paneId} />,
    });

    const paneIds = Array.from(
      document.querySelectorAll<HTMLElement>("[data-split-pane-id]"),
      (pane) => pane.dataset.splitPaneId,
    ).filter((paneId): paneId is string => paneId !== undefined);
    expect(paneIds).toHaveLength(2);
    const before = new Map(
      paneIds.map((paneId) => [
        paneId,
        screen.getByTestId(`pane-instance-${paneId}`).textContent,
      ]),
    );
    const paneToMove = paneIds[1];
    expect(paneToMove).toBeDefined();
    if (paneToMove === undefined) return;

    fireEvent.click(
      screen.getByRole("button", { name: `Move ${paneToMove} left` }),
    );

    for (const paneId of paneIds) {
      expect(screen.getByTestId(`pane-instance-${paneId}`).textContent).toBe(
        before.get(paneId) ?? "missing-instance",
      );
    }
  });

  it("restores both adjacent flex values after pointer cancellation", () => {
    persistState(createTwoPaneState());
    renderContainer({
      renderPane: ({ paneId }) => <div>{paneId}</div>,
    });

    const separator = screen.getByRole("separator");
    const hitTarget = separator.firstElementChild;
    const previous = separator.previousElementSibling;
    const next = separator.nextElementSibling;
    expect(hitTarget).toBeInstanceOf(HTMLElement);
    expect(previous).toBeInstanceOf(HTMLElement);
    expect(next).toBeInstanceOf(HTMLElement);
    if (
      !(hitTarget instanceof HTMLElement) ||
      !(previous instanceof HTMLElement) ||
      !(next instanceof HTMLElement)
    ) {
      return;
    }
    Object.defineProperty(hitTarget, "setPointerCapture", { value: vi.fn() });
    Object.defineProperty(previous, "getBoundingClientRect", {
      value: () => ({ left: 0, right: 400, top: 0, bottom: 600 }),
    });
    Object.defineProperty(next, "getBoundingClientRect", {
      value: () => ({ left: 401, right: 800, top: 0, bottom: 600 }),
    });
    const previousFlex = previous.style.flex;
    const nextFlex = next.style.flex;

    fireEvent.pointerDown(hitTarget, { clientX: 400, pointerId: 1 });
    fireEvent.pointerMove(hitTarget, { clientX: 560, pointerId: 1 });
    expect(previous.style.flex).not.toBe(previousFlex);
    expect(next.style.flex).not.toBe(nextFlex);

    fireEvent.pointerCancel(hitTarget, { clientX: 560, pointerId: 1 });
    expect(previous.style.flex).toBe(previousFlex);
    expect(next.style.flex).toBe(nextFlex);
    expect(document.body.style.userSelect).toBe("");
  });

  it("does not write a canonical layout or rewrite a focused-pane no-op", () => {
    const storageKey = sidebarSplitStorageKey(PANEL_STATE_ID);
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    renderContainer({
      renderPane: ({ paneId }) => (
        <button data-testid="only-pane" type="button">
          {paneId}
        </button>
      ),
      tabs: [TABS[0] as SidebarSplitTabDescriptor],
    });

    fireEvent.pointerDown(screen.getByTestId("only-pane"));
    expect(
      setItem.mock.calls.filter(([key]) => key === storageKey),
    ).toHaveLength(0);
    expect(window.localStorage.getItem(storageKey)).toBeNull();
  });

  it("does not rewrite an unchanged restored split", () => {
    persistState(createTwoPaneState());
    window.localStorage.setItem(
      getFixedPanelTabsStateStorageKey({ threadId: PANEL_STATE_ID }),
      JSON.stringify({ lastUsedAt: Date.now() }),
    );
    const storageKey = sidebarSplitStorageKey(PANEL_STATE_ID);
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    renderContainer({
      renderPane: ({ paneId }) => <div>{paneId}</div>,
    });

    expect(
      setItem.mock.calls.filter(([key]) => key === storageKey),
    ).toHaveLength(0);
  });
});
