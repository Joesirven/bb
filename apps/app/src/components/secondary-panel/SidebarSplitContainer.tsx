import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useAtomValue } from "jotai";
import { Button } from "@bb/shared-ui/button";
import { Icon } from "@bb/shared-ui/icon";
import { cn } from "@bb/shared-ui/lib/utils";
import {
  AppPageHeader,
  HEADER_PANE_ACTION_ICON_BUTTON_CLASS,
} from "@/components/layout/AppPageHeader";
import { CHROME_SUBTLE_ICON_BUTTON_FOREGROUND_CLASS } from "@/components/ui/chromeStyleTokens";
import {
  CONTEXT_INACTIVE_TEXT_CLASS,
  CONTEXT_SELECTION_SURFACE_CLASS,
} from "@/components/ui/context-selection";
import {
  beginSplitDrag,
  decidePaneDrop,
  SPLIT_PANE_DATA_ATTR,
  type SplitDropTarget,
} from "@/lib/split-drag";
import {
  clampSplitPairFraction,
  computePaneRects,
  countPanes,
  listPanes,
  MAX_PANES,
  type LayoutNode,
  type SplitPath,
  type SplitSide,
} from "@/lib/split-layout";
import { dimInactiveSplitsAtom } from "@/lib/split-layout/atoms";
import { applyResizeCursor, clearResizeCursor } from "@/lib/resizeCursor";
import {
  PaneContext,
  type PaneContextValue,
} from "@/views/thread-detail/PaneContext";
import { PaneMaximizeButton } from "@/views/thread-detail/PaneMaximizeButton";
import { SplitDimmingButton } from "@/views/thread-detail/SplitDimmingButton";
import {
  closeSidebarPane,
  createSidebarSplitState,
  focusSidebarPane,
  getSidebarGroupForPane,
  moveSidebarPaneToSide,
  moveSidebarTab,
  parseSidebarSplitState,
  reconcileSidebarSplitState,
  reorderSidebarTab,
  resizeSidebarSplit,
  selectSidebarTab,
  serializeSidebarSplitState,
  sidebarPaneGroupId,
  sidebarSplitStorageKey,
  swapSidebarPanes,
  toggleSidebarPaneMaximize,
  type SidebarSplitState,
  type SidebarTabGroup,
} from "./sidebarSplitLayout";
import type { SecondaryPanelTabReorderRequest } from "./secondaryPanelFileTab";

const PANE_DRAG_ENGAGE_DISTANCE_PX = 7;

export interface SidebarSplitTabDescriptor {
  id: string;
  label: string;
  leadingVisual: ReactNode;
}

export interface SidebarSplitPaneRenderArgs {
  group: SidebarTabGroup;
  isSplitPane: boolean;
  onBeginTabDrag: (
    tabId: string,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
  onReorderTab: (request: SecondaryPanelTabReorderRequest) => void;
  onSelectTab: (tabId: string) => void;
  paneId: string;
}

interface SidebarSplitContainerProps {
  activeTabId: string;
  onActivateTab: (tabId: string) => void;
  onGlobalTabReorder: (request: SecondaryPanelTabReorderRequest) => void;
  panelStateId: string;
  renderHideControl: () => ReactNode;
  renderPane: (args: SidebarSplitPaneRenderArgs) => ReactNode;
  tabs: readonly SidebarSplitTabDescriptor[];
}

export function SidebarSplitContainer({
  activeTabId,
  onActivateTab,
  onGlobalTabReorder,
  panelStateId,
  renderHideControl,
  renderPane,
  tabs,
}: SidebarSplitContainerProps) {
  const availableTabIds = useMemo(() => tabs.map((tab) => tab.id), [tabs]);
  const storageKey = sidebarSplitStorageKey(panelStateId);
  const [state, setState] = useState<SidebarSplitState>(() =>
    typeof window === "undefined"
      ? createSidebarSplitState(availableTabIds, activeTabId)
      : parseSidebarSplitState(
          window.localStorage.getItem(storageKey),
          availableTabIds,
          activeTabId,
        ),
  );
  const nextGroupSequence = useRef(1);
  const previousActiveTabId = useRef(activeTabId);
  const dimsInactiveSplits = useAtomValue(dimInactiveSplitsAtom);
  const paneCount = countPanes(state.layout.root);
  const hasMultiplePanes = paneCount > 1;

  useEffect(() => {
    const shouldFollowExternalSelection =
      previousActiveTabId.current !== activeTabId;
    previousActiveTabId.current = activeTabId;
    setState((current) => {
      const reconciled = reconcileSidebarSplitState(
        current,
        availableTabIds,
        activeTabId,
      );
      if (!shouldFollowExternalSelection) return reconciled;
      const activePane = listPanes(reconciled.layout.root).find((pane) =>
        getSidebarGroupForPane(reconciled, pane.paneId)?.tabIds.includes(
          activeTabId,
        ),
      );
      return activePane === undefined
        ? reconciled
        : selectSidebarTab(reconciled, activePane.paneId, activeTabId);
    });
  }, [activeTabId, availableTabIds]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, serializeSidebarSplitState(state));
  }, [state, storageKey]);

  const activateFocusedGroup = useCallback(
    (next: SidebarSplitState) => {
      const group = getSidebarGroupForPane(next, next.layout.focusedPaneId);
      if (group !== null) onActivateTab(group.activeTabId);
    },
    [onActivateTab],
  );

  const selectTab = useCallback(
    (paneId: string, tabId: string) => {
      setState((current) => selectSidebarTab(current, paneId, tabId));
      onActivateTab(tabId);
    },
    [onActivateTab],
  );

  const focusPane = useCallback(
    (paneId: string) => {
      setState((current) => {
        const next = focusSidebarPane(current, paneId);
        if (next !== current) activateFocusedGroup(next);
        return next;
      });
    },
    [activateFocusedGroup],
  );

  const closePane = useCallback(
    (paneId: string) => {
      setState((current) => {
        const next = closeSidebarPane(current, paneId);
        if (next !== current) activateFocusedGroup(next);
        return next;
      });
    },
    [activateFocusedGroup],
  );

  const toggleMaximize = useCallback((paneId: string) => {
    setState((current) => toggleSidebarPaneMaximize(current, paneId));
  }, []);

  const movePaneToSide = useCallback((paneId: string, side: SplitSide) => {
    setState((current) => {
      const rects = computePaneRects(current.layout.root);
      const target = listPanes(current.layout.root)
        .filter((pane) => pane.paneId !== paneId)
        .sort((first, second) => {
          const a = rects.get(first.paneId);
          const b = rects.get(second.paneId);
          if (a === undefined || b === undefined) return 0;
          const edge = (rect: typeof a) => {
            switch (side) {
              case "left":
                return rect.x;
              case "right":
                return -(rect.x + rect.w);
              case "top":
                return rect.y;
              case "bottom":
                return -(rect.y + rect.h);
            }
          };
          return edge(a) - edge(b);
        })[0];
      return target === undefined
        ? current
        : moveSidebarPaneToSide(current, paneId, target.paneId, side);
    });
  }, []);

  const moveTab = useCallback(
    (sourcePaneId: string, tabId: string, target: SplitDropTarget) => {
      setState((current) => {
        let groupId: string;
        do {
          groupId = `group-split-${nextGroupSequence.current++}`;
        } while (current.groups[groupId] !== undefined);
        const next = moveSidebarTab(current, sourcePaneId, tabId, target, {
          groupId,
        });
        if (next !== current) activateFocusedGroup(next);
        return next;
      });
    },
    [activateFocusedGroup],
  );

  const beginTabDrag = useCallback(
    (
      sourcePaneId: string,
      tabId: string,
      event: ReactPointerEvent<HTMLElement>,
    ) => {
      if (event.button !== 0) return;
      const sourceGroup = getSidebarGroupForPane(state, sourcePaneId);
      const sourceElement = event.currentTarget;
      const chrome = sourceElement.closest<HTMLElement>(
        '[data-testid="thread-secondary-panel-top-chrome"]',
      );
      const chromeRect = chrome?.getBoundingClientRect() ?? null;
      const startX = event.clientX;
      const startY = event.clientY;
      const label = tabs.find((tab) => tab.id === tabId)?.label ?? "Panel tab";
      beginSplitDrag(startX, startY, {
        ghostLabel: label,
        sourceEl: sourceElement,
        fallback: {
          paneId: sourcePaneId,
          container: sourceElement.closest<HTMLElement>("aside"),
        },
        cancelSidebarReorderOnEngage: true,
        shouldEngage: (x, y) => {
          const dx = x - startX;
          const dy = y - startY;
          if (Math.hypot(dx, dy) <= PANE_DRAG_ENGAGE_DISTANCE_PX) return false;
          // Horizontal motion inside the tab row remains the existing reorder
          // gesture. Pulling the tab into pane content hands off to split drag.
          return (
            Math.abs(dy) > Math.abs(dx) ||
            chromeRect === null ||
            y < chromeRect.top ||
            y > chromeRect.bottom
          );
        },
        decide: (targetPaneId, zone) => {
          if (targetPaneId === sourcePaneId) {
            if (zone === "center" || (sourceGroup?.tabIds.length ?? 0) <= 1) {
              return null;
            }
          }
          if (
            zone !== "center" &&
            (sourceGroup?.tabIds.length ?? 0) > 1 &&
            countPanes(state.layout.root) >= MAX_PANES
          ) {
            return null;
          }
          return {
            zone,
            label: zone === "center" ? "Group tab here" : `Split ${zone}`,
          };
        },
        onDrop: (target) => moveTab(sourcePaneId, tabId, target),
      });
    },
    [moveTab, state, tabs],
  );

  const beginPaneDrag = useCallback(
    (paneId: string, event: ReactPointerEvent, label: string) => {
      if (countPanes(state.layout.root) < 2 || event.button !== 0) return;
      const startX = event.clientX;
      const startY = event.clientY;
      const restoreMaximize = state.maximizedPaneId === paneId;
      beginSplitDrag(startX, startY, {
        ghostLabel: label,
        sourceEl:
          event.currentTarget instanceof Element
            ? event.currentTarget.closest<HTMLElement>(
                `[${SPLIT_PANE_DATA_ATTR}]`,
              )
            : null,
        shouldEngage: (x, y) =>
          Math.hypot(x - startX, y - startY) > PANE_DRAG_ENGAGE_DISTANCE_PX,
        onEngage: restoreMaximize
          ? () => setState((current) => ({ ...current, maximizedPaneId: null }))
          : undefined,
        decide: (targetPaneId, zone) =>
          decidePaneDrop({ zone, isSelf: targetPaneId === paneId }),
        onDrop: (target) => {
          setState((current) => {
            const next =
              target.zone === "center"
                ? swapSidebarPanes(current, paneId, target.paneId)
                : moveSidebarPaneToSide(
                    current,
                    paneId,
                    target.paneId,
                    target.zone,
                  );
            if (next !== current) activateFocusedGroup(next);
            return next;
          });
        },
        onEnd: restoreMaximize
          ? () =>
              setState((current) => ({
                ...current,
                maximizedPaneId: current.layout.focusedPaneId,
              }))
          : undefined,
      });
    },
    [activateFocusedGroup, state.layout.root, state.maximizedPaneId],
  );

  const reorderTab = useCallback(
    (paneId: string, request: SecondaryPanelTabReorderRequest) => {
      setState((current) =>
        reorderSidebarTab(
          current,
          paneId,
          request.activeTabId,
          request.overTabId,
        ),
      );
      onGlobalTabReorder(request);
    },
    [onGlobalTabReorder],
  );

  const resize = useCallback(
    (path: SplitPath, childIndex: number, fraction: number) => {
      setState((current) =>
        resizeSidebarSplit(current, path, childIndex, fraction),
      );
    },
    [],
  );

  const firstPane = listPanes(state.layout.root)[0];
  if (!hasMultiplePanes && firstPane !== undefined) {
    const group = getSidebarGroupForPane(state, firstPane.paneId);
    if (group === null) return null;
    // renderPane is a synchronous React render callback; its handlers read refs only after pointer events.
    // eslint-disable-next-line react-hooks/refs
    return renderPane({
      group,
      isSplitPane: false,
      onBeginTabDrag: (tabId, event) =>
        beginTabDrag(firstPane.paneId, tabId, event),
      onReorderTab: (request) => reorderTab(firstPane.paneId, request),
      onSelectTab: (tabId) => selectTab(firstPane.paneId, tabId),
      paneId: firstPane.paneId,
    });
  }

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <SidebarSplitTree
        node={state.layout.root}
        path={[]}
        isTopRow
        isRightEdge
        dimsInactiveSplits={dimsInactiveSplits}
        focusedPaneId={state.layout.focusedPaneId}
        maximizedPaneId={state.maximizedPaneId}
        renderHideControl={renderHideControl}
        renderPane={renderPane}
        state={state}
        tabs={tabs}
        onBeginPaneDrag={beginPaneDrag}
        onBeginTabDrag={beginTabDrag}
        onClosePane={closePane}
        onFocusPane={focusPane}
        onMovePaneToSide={movePaneToSide}
        onReorderTab={reorderTab}
        onResize={resize}
        onSelectTab={selectTab}
        onToggleMaximize={toggleMaximize}
      />
    </div>
  );
}

interface SidebarSplitTreeProps {
  dimsInactiveSplits: boolean;
  focusedPaneId: string;
  isRightEdge: boolean;
  isTopRow: boolean;
  maximizedPaneId: string | null;
  node: LayoutNode;
  onBeginPaneDrag: (
    paneId: string,
    event: ReactPointerEvent,
    label: string,
  ) => void;
  onBeginTabDrag: (
    paneId: string,
    tabId: string,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
  onClosePane: (paneId: string) => void;
  onFocusPane: (paneId: string) => void;
  onMovePaneToSide: (paneId: string, side: SplitSide) => void;
  onReorderTab: (
    paneId: string,
    request: SecondaryPanelTabReorderRequest,
  ) => void;
  onResize: (path: SplitPath, childIndex: number, fraction: number) => void;
  onSelectTab: (paneId: string, tabId: string) => void;
  onToggleMaximize: (paneId: string) => void;
  path: number[];
  renderHideControl: () => ReactNode;
  renderPane: (args: SidebarSplitPaneRenderArgs) => ReactNode;
  state: SidebarSplitState;
  tabs: readonly SidebarSplitTabDescriptor[];
}

function SidebarSplitTree(props: SidebarSplitTreeProps) {
  if (props.node.type === "pane") {
    return <SidebarSplitLeaf {...props} pane={props.node} />;
  }
  const node = props.node;
  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1",
        node.dir === "row" ? "flex-row" : "flex-col",
      )}
    >
      {node.children.map((child, index) => (
        <Fragment key={`${props.path.join("-")}-${index}`}>
          {index > 0 ? (
            <SidebarSplitDivider
              dir={node.dir}
              hidden={props.maximizedPaneId !== null}
              onResize={(fraction) =>
                props.onResize(props.path, index - 1, fraction)
              }
            />
          ) : null}
          <div
            className="flex min-h-0 min-w-0"
            style={{ flex: `${node.sizes[index] ?? 1} 1 0px` }}
          >
            <SidebarSplitTree
              {...props}
              node={child}
              path={[...props.path, index]}
              isTopRow={props.isTopRow && (node.dir === "row" || index === 0)}
              isRightEdge={
                props.isRightEdge &&
                (node.dir === "col" || index === node.children.length - 1)
              }
            />
          </div>
        </Fragment>
      ))}
    </div>
  );
}

function SidebarSplitLeaf(
  props: SidebarSplitTreeProps & {
    pane: Extract<LayoutNode, { type: "pane" }>;
  },
) {
  const { pane } = props;
  const groupId = sidebarPaneGroupId(pane);
  const group = groupId === null ? undefined : props.state.groups[groupId];
  if (group === undefined) return null;
  const isFocused = pane.paneId === props.focusedPaneId;
  const isMaximized = pane.paneId === props.maximizedPaneId;
  const hiddenByMaximize =
    props.maximizedPaneId !== null && props.maximizedPaneId !== pane.paneId;
  const activeDescriptor =
    props.tabs.find((tab) => tab.id === group.activeTabId) ?? props.tabs[0];
  if (activeDescriptor === undefined) return null;
  const reserveOuterControl =
    isMaximized || (props.isTopRow && props.isRightEdge);
  const context: PaneContextValue = {
    paneId: pane.paneId,
    isFocused,
    isSplitPane: true,
    secondaryPanelHost: null,
    reservesWindowPanelToggle: reserveOuterControl,
    onRequestClose: () => props.onClosePane(pane.paneId),
    isMaximized,
    onToggleMaximize: () => props.onToggleMaximize(pane.paneId),
    onMoveToSide: (side) => props.onMovePaneToSide(pane.paneId, side),
    isBoundedPane: true,
    isTopRow: isMaximized || props.isTopRow,
    ownsWindowTopLeft: false,
    navigateInPane: () => {},
    beginPaneDrag: (event, label) =>
      props.onBeginPaneDrag(pane.paneId, event, label),
  };
  return (
    <PaneContext.Provider value={context}>
      <div
        onPointerDown={() => props.onFocusPane(pane.paneId)}
        aria-hidden={hiddenByMaximize || undefined}
        style={hiddenByMaximize ? { contentVisibility: "hidden" } : undefined}
        className={cn(
          "relative flex min-h-0 min-w-0 flex-1 overflow-hidden",
          hiddenByMaximize && "invisible pointer-events-none",
          isMaximized && "absolute inset-0 z-30",
        )}
        data-split-pane-id={pane.paneId}
        data-focused={isFocused ? "true" : "false"}
        data-maximized={isMaximized ? "true" : undefined}
      >
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-sidebar">
          <AppPageHeader
            isWindowDragRegion={isMaximized || props.isTopRow}
            ownsWindowTopLeft={false}
            className="z-[21]"
            center={
              <div
                data-pane-header-focus-tab={isFocused ? "" : undefined}
                className={cn(
                  "relative -mx-2 -my-1 flex min-w-0 cursor-grab touch-none select-none items-center gap-1.5 rounded-md px-2 py-1",
                  isFocused && CONTEXT_SELECTION_SURFACE_CLASS,
                )}
                onPointerDown={(event) => {
                  if (event.button === 0) {
                    props.onBeginPaneDrag(
                      pane.paneId,
                      event,
                      activeDescriptor.label,
                    );
                  }
                }}
              >
                <span
                  className={cn(
                    "flex size-3.5 shrink-0 items-center justify-center transition-colors [&_svg]:size-3.5",
                    !isFocused &&
                      props.dimsInactiveSplits &&
                      CONTEXT_INACTIVE_TEXT_CLASS,
                  )}
                >
                  {activeDescriptor.leadingVisual}
                </span>
                <p
                  className={cn(
                    "truncate text-sm font-normal transition-colors",
                    !isFocused &&
                      props.dimsInactiveSplits &&
                      CONTEXT_INACTIVE_TEXT_CLASS,
                  )}
                >
                  {activeDescriptor.label}
                </p>
              </div>
            }
            actions={
              <>
                <SplitDimmingButton />
                <PaneMaximizeButton />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    HEADER_PANE_ACTION_ICON_BUTTON_CLASS,
                    CHROME_SUBTLE_ICON_BUTTON_FOREGROUND_CLASS,
                  )}
                  aria-label="Close pane"
                  onClick={() => props.onClosePane(pane.paneId)}
                >
                  <Icon name="ClosePluginPane" />
                </Button>
                {reserveOuterControl ? props.renderHideControl() : null}
              </>
            }
          />
          {props.renderPane({
            group,
            isSplitPane: true,
            onBeginTabDrag: (tabId, event) =>
              props.onBeginTabDrag(pane.paneId, tabId, event),
            onReorderTab: (request) => props.onReorderTab(pane.paneId, request),
            onSelectTab: (tabId) => props.onSelectTab(pane.paneId, tabId),
            paneId: pane.paneId,
          })}
        </section>
        <div
          aria-hidden
          data-pane-focus-scrim=""
          className={cn(
            "pointer-events-none absolute inset-0 z-20 transition-colors",
            isFocused || !props.dimsInactiveSplits
              ? "bg-transparent"
              : "bg-background/30",
          )}
        />
      </div>
    </PaneContext.Provider>
  );
}

function SidebarSplitDivider({
  dir,
  hidden,
  onResize,
}: {
  dir: "row" | "col";
  hidden: boolean;
  onResize: (fraction: number) => void;
}) {
  const horizontal = dir === "row";
  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const hitTarget = event.currentTarget;
      const divider = hitTarget.parentElement;
      const previous = divider?.previousElementSibling;
      const next = divider?.nextElementSibling;
      if (
        !(divider instanceof HTMLElement) ||
        !(previous instanceof HTMLElement) ||
        !(next instanceof HTMLElement)
      ) {
        return;
      }
      const previousRect = previous.getBoundingClientRect();
      const nextRect = next.getBoundingClientRect();
      const start = horizontal ? previousRect.left : previousRect.top;
      const end = horizontal ? nextRect.right : nextRect.bottom;
      const span = end - start;
      if (span <= 0) return;
      hitTarget.setPointerCapture(event.pointerId);
      divider.dataset.dragging = "true";
      applyResizeCursor(horizontal ? "horizontal" : "vertical");
      document.body.style.userSelect = "none";
      const previousGrow = Number.parseFloat(
        window.getComputedStyle(previous).flexGrow,
      );
      const nextGrow = Number.parseFloat(
        window.getComputedStyle(next).flexGrow,
      );
      const pairTotal =
        Number.isFinite(previousGrow) &&
        Number.isFinite(nextGrow) &&
        previousGrow + nextGrow > 0
          ? previousGrow + nextGrow
          : 1;
      let pendingFraction: number | null = null;
      const move = (moveEvent: PointerEvent) => {
        const pointer = horizontal ? moveEvent.clientX : moveEvent.clientY;
        const fraction = clampSplitPairFraction((pointer - start) / span);
        pendingFraction = fraction;
        previous.style.flex = `${pairTotal * fraction} 1 0px`;
        next.style.flex = `${pairTotal * (1 - fraction)} 1 0px`;
      };
      const finish = () => {
        delete divider.dataset.dragging;
        hitTarget.removeEventListener("pointermove", move);
        hitTarget.removeEventListener("pointerup", finish);
        hitTarget.removeEventListener("pointercancel", cancel);
        clearResizeCursor();
        document.body.style.userSelect = "";
        if (pendingFraction !== null) onResize(pendingFraction);
      };
      const cancel = () => {
        pendingFraction = null;
        finish();
      };
      hitTarget.addEventListener("pointermove", move);
      hitTarget.addEventListener("pointerup", finish);
      hitTarget.addEventListener("pointercancel", cancel);
    },
    [horizontal, onResize],
  );
  return (
    <div
      role="separator"
      aria-label={
        horizontal
          ? "Resize right panel panes"
          : "Resize stacked right panel panes"
      }
      aria-orientation={horizontal ? "vertical" : "horizontal"}
      className={cn(
        "group relative z-[25] shrink-0 bg-border-seam transition-colors hover:bg-ring/40 data-[dragging]:bg-ring/40",
        hidden && "invisible pointer-events-none",
        horizontal ? "w-px cursor-col-resize" : "h-px cursor-row-resize",
      )}
    >
      <div
        aria-hidden
        onPointerDown={handlePointerDown}
        className={cn(
          "absolute z-10 touch-none bg-transparent",
          horizontal
            ? "-left-1.5 top-0 h-full w-3 cursor-col-resize"
            : "left-0 -top-1.5 h-3 w-full cursor-row-resize",
        )}
      />
    </div>
  );
}
