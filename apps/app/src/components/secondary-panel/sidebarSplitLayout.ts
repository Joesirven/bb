import { z } from "zod";
import {
  MAX_PANES,
  countPanes,
  findPane,
  listPanes,
  movePane,
  removePane,
  resizeSplit,
  setFocus,
  splitPane,
  swapPanes,
  type LayoutNode,
  type PaneContent,
  type PaneNode,
  type SplitLayout,
  type SplitPath,
  type SplitSide,
} from "@/lib/split-layout";
import type { SplitDropTarget } from "@/lib/split-drag";

export const SIDEBAR_SPLIT_LAYOUT_STORAGE_VERSION = 1;
export const SIDEBAR_SPLIT_LAYOUT_STORAGE_PREFIX =
  "bb.thread.secondaryPanelSplitLayout";
export const SIDEBAR_FIXED_INFO_TAB_ID = "thread-info:thread-info:none";
export const SIDEBAR_FIXED_DIFF_TAB_ID = "git-diff:git-diff:none";

const SIDEBAR_SPLIT_PLUGIN_ID = "bb-secondary-panel-split";

export interface SidebarTabGroup {
  id: string;
  tabIds: string[];
  activeTabId: string;
}

export interface SidebarSplitState {
  version: typeof SIDEBAR_SPLIT_LAYOUT_STORAGE_VERSION;
  groups: Record<string, SidebarTabGroup>;
  layout: SplitLayout;
  maximizedPaneId: string | null;
}

export interface SidebarSplitIds {
  groupId: string;
  paneId: string;
}

function groupContent(groupId: string): PaneContent {
  return {
    kind: "plugin-panel",
    pluginId: SIDEBAR_SPLIT_PLUGIN_ID,
    panelPath: groupId,
    subPath: "",
  };
}

export function sidebarPaneNode(paneId: string, groupId: string): PaneNode {
  return { type: "pane", paneId, content: groupContent(groupId) };
}

export function sidebarPaneGroupId(pane: PaneNode): string | null {
  return pane.content.kind === "plugin-panel" &&
    pane.content.pluginId === SIDEBAR_SPLIT_PLUGIN_ID
    ? pane.content.panelPath
    : null;
}

export function createSidebarSplitState(
  tabIds: readonly string[],
  activeTabId: string,
  ids: SidebarSplitIds = { groupId: "group-primary", paneId: "pane-primary" },
): SidebarSplitState {
  const normalizedTabs = [...new Set(tabIds)];
  const resolvedActive = normalizedTabs.includes(activeTabId)
    ? activeTabId
    : (normalizedTabs[0] ?? SIDEBAR_FIXED_INFO_TAB_ID);
  return {
    version: SIDEBAR_SPLIT_LAYOUT_STORAGE_VERSION,
    groups: {
      [ids.groupId]: {
        id: ids.groupId,
        tabIds: normalizedTabs,
        activeTabId: resolvedActive,
      },
    },
    layout: {
      root: sidebarPaneNode(ids.paneId, ids.groupId),
      focusedPaneId: ids.paneId,
    },
    maximizedPaneId: null,
  };
}

export function getSidebarGroupForPane(
  state: SidebarSplitState,
  paneId: string,
): SidebarTabGroup | null {
  const pane = findPane(state.layout.root, paneId);
  const groupId = pane === null ? null : sidebarPaneGroupId(pane);
  return groupId === null ? null : (state.groups[groupId] ?? null);
}

export function selectSidebarTab(
  state: SidebarSplitState,
  paneId: string,
  tabId: string,
): SidebarSplitState {
  const pane = findPane(state.layout.root, paneId);
  const groupId = pane === null ? null : sidebarPaneGroupId(pane);
  const group = groupId === null ? undefined : state.groups[groupId];
  if (
    groupId === null ||
    group === undefined ||
    !group.tabIds.includes(tabId)
  ) {
    return state;
  }
  return {
    ...state,
    groups: {
      ...state.groups,
      [groupId]: { ...group, activeTabId: tabId },
    },
    layout: setFocus(state.layout, paneId),
    maximizedPaneId: state.maximizedPaneId === null ? null : paneId,
  };
}

export function focusSidebarPane(
  state: SidebarSplitState,
  paneId: string,
): SidebarSplitState {
  if (findPane(state.layout.root, paneId) === null) return state;
  return {
    ...state,
    layout: setFocus(state.layout, paneId),
    maximizedPaneId: state.maximizedPaneId === null ? null : paneId,
  };
}

export function reorderSidebarTab(
  state: SidebarSplitState,
  paneId: string,
  activeTabId: string,
  overTabId: string,
): SidebarSplitState {
  const pane = findPane(state.layout.root, paneId);
  const groupId = pane === null ? null : sidebarPaneGroupId(pane);
  const group = groupId === null ? undefined : state.groups[groupId];
  if (
    groupId === null ||
    group === undefined ||
    !group.tabIds.includes(activeTabId) ||
    !group.tabIds.includes(overTabId) ||
    activeTabId === overTabId
  ) {
    return state;
  }
  const from = group.tabIds.indexOf(activeTabId);
  const to = group.tabIds.indexOf(overTabId);
  const tabIds = [...group.tabIds];
  const [moved] = tabIds.splice(from, 1);
  if (moved === undefined) return state;
  tabIds.splice(to, 0, moved);
  return {
    ...state,
    groups: { ...state.groups, [groupId]: { ...group, tabIds } },
  };
}

export function moveSidebarTab(
  state: SidebarSplitState,
  sourcePaneId: string,
  tabId: string,
  target: SplitDropTarget,
  ids: Pick<SidebarSplitIds, "groupId">,
): SidebarSplitState {
  const sourcePane = findPane(state.layout.root, sourcePaneId);
  const targetPane = findPane(state.layout.root, target.paneId);
  if (sourcePane === null || targetPane === null) return state;
  const sourceGroupId = sidebarPaneGroupId(sourcePane);
  const targetGroupId = sidebarPaneGroupId(targetPane);
  const sourceGroup =
    sourceGroupId === null ? undefined : state.groups[sourceGroupId];
  const targetGroup =
    targetGroupId === null ? undefined : state.groups[targetGroupId];
  if (
    sourceGroupId === null ||
    targetGroupId === null ||
    sourceGroup === undefined ||
    targetGroup === undefined ||
    !sourceGroup.tabIds.includes(tabId)
  ) {
    return state;
  }

  if (target.zone === "center") {
    if (sourcePaneId === target.paneId) return state;
    const groups = { ...state.groups };
    groups[targetGroupId] = {
      ...targetGroup,
      tabIds: [...targetGroup.tabIds.filter((id) => id !== tabId), tabId],
      activeTabId: tabId,
    };
    if (sourceGroup.tabIds.length === 1) {
      delete groups[sourceGroupId];
      const layout = removePane(state.layout, sourcePaneId);
      return {
        ...state,
        groups,
        layout: setFocus(layout, target.paneId),
        maximizedPaneId: null,
      };
    }
    const remainingTabs = sourceGroup.tabIds.filter((id) => id !== tabId);
    groups[sourceGroupId] = {
      ...sourceGroup,
      tabIds: remainingTabs,
      activeTabId:
        sourceGroup.activeTabId === tabId
          ? (remainingTabs[0] ?? targetGroup.activeTabId)
          : sourceGroup.activeTabId,
    };
    return {
      ...state,
      groups,
      layout: setFocus(state.layout, target.paneId),
    };
  }

  if (sourceGroup.tabIds.length === 1) {
    const layout = movePane(
      state.layout,
      sourcePaneId,
      target.paneId,
      target.zone,
    );
    return layout === state.layout
      ? state
      : { ...state, layout, maximizedPaneId: null };
  }
  if (countPanes(state.layout.root) >= MAX_PANES) return state;
  if (state.groups[ids.groupId] !== undefined) return state;

  const remainingTabs = sourceGroup.tabIds.filter((id) => id !== tabId);
  return {
    ...state,
    groups: {
      ...state.groups,
      [sourceGroupId]: {
        ...sourceGroup,
        tabIds: remainingTabs,
        activeTabId:
          sourceGroup.activeTabId === tabId
            ? (remainingTabs[0] ?? sourceGroup.activeTabId)
            : sourceGroup.activeTabId,
      },
      [ids.groupId]: {
        id: ids.groupId,
        tabIds: [tabId],
        activeTabId: tabId,
      },
    },
    layout: splitPane(
      state.layout,
      target.paneId,
      target.zone,
      groupContent(ids.groupId),
    ),
    maximizedPaneId: null,
  };
}

export function closeSidebarPane(
  state: SidebarSplitState,
  paneId: string,
): SidebarSplitState {
  if (countPanes(state.layout.root) <= 1) return state;
  const pane = findPane(state.layout.root, paneId);
  const closedGroupId = pane === null ? null : sidebarPaneGroupId(pane);
  const closedGroup =
    closedGroupId === null ? undefined : state.groups[closedGroupId];
  if (closedGroupId === null || closedGroup === undefined) return state;

  const wasFocused = state.layout.focusedPaneId === paneId;
  const layout = removePane(state.layout, paneId);
  const survivorPane = findPane(layout.root, layout.focusedPaneId);
  const survivorGroupId =
    survivorPane === null ? null : sidebarPaneGroupId(survivorPane);
  const survivorGroup =
    survivorGroupId === null ? undefined : state.groups[survivorGroupId];
  if (survivorGroupId === null || survivorGroup === undefined) return state;

  const groups = { ...state.groups };
  delete groups[closedGroupId];
  groups[survivorGroupId] = {
    ...survivorGroup,
    tabIds: [
      ...survivorGroup.tabIds,
      ...closedGroup.tabIds.filter((id) => !survivorGroup.tabIds.includes(id)),
    ],
    activeTabId: wasFocused
      ? closedGroup.activeTabId
      : survivorGroup.activeTabId,
  };
  return { ...state, groups, layout, maximizedPaneId: null };
}

export function toggleSidebarPaneMaximize(
  state: SidebarSplitState,
  paneId: string,
): SidebarSplitState {
  if (
    countPanes(state.layout.root) < 2 ||
    findPane(state.layout.root, paneId) === null
  ) {
    return state;
  }
  return {
    ...state,
    layout: setFocus(state.layout, paneId),
    maximizedPaneId: state.maximizedPaneId === paneId ? null : paneId,
  };
}

export function moveSidebarPaneToSide(
  state: SidebarSplitState,
  paneId: string,
  targetPaneId: string,
  side: SplitSide,
): SidebarSplitState {
  const layout = movePane(state.layout, paneId, targetPaneId, side);
  return layout === state.layout
    ? state
    : { ...state, layout, maximizedPaneId: null };
}

export function swapSidebarPanes(
  state: SidebarSplitState,
  paneId: string,
  targetPaneId: string,
): SidebarSplitState {
  const layout = swapPanes(state.layout, paneId, targetPaneId);
  return layout === state.layout ? state : { ...state, layout };
}

export function resizeSidebarSplit(
  state: SidebarSplitState,
  path: SplitPath,
  childIndex: number,
  fraction: number,
): SidebarSplitState {
  const layout = resizeSplit(state.layout, path, childIndex, fraction);
  return layout === state.layout ? state : { ...state, layout };
}

/**
 * Reconciles persisted pane membership with the currently open sidebar tabs.
 * Existing ownership/order wins; newly opened tabs join the focused pane;
 * closed or duplicated ids disappear. A stale/invalid layout falls back to the
 * unchanged single-pane treatment instead of stranding content.
 */
export function reconcileSidebarSplitState(
  state: SidebarSplitState,
  availableTabIds: readonly string[],
  activeTabId: string,
): SidebarSplitState {
  const available = [...new Set(availableTabIds)];
  if (available.length === 0) return state;
  const allowed = new Set(available);
  const seen = new Set<string>();
  let next = state;
  const groups = { ...state.groups };

  for (const pane of listPanes(state.layout.root)) {
    const groupId = sidebarPaneGroupId(pane);
    const group = groupId === null ? undefined : groups[groupId];
    if (groupId === null || group === undefined) {
      return createSidebarSplitState(available, activeTabId);
    }
    const tabIds = group.tabIds.filter((id) => {
      if (!allowed.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    groups[groupId] = {
      ...group,
      tabIds,
      activeTabId: tabIds.includes(group.activeTabId)
        ? group.activeTabId
        : (tabIds[0] ?? activeTabId),
    };
  }

  next = { ...state, groups };
  for (const pane of listPanes(next.layout.root)) {
    const groupId = sidebarPaneGroupId(pane);
    const group = groupId === null ? undefined : next.groups[groupId];
    if (group !== undefined && group.tabIds.length === 0) {
      if (countPanes(next.layout.root) === 1) break;
      next = closeSidebarPane(next, pane.paneId);
    }
  }

  const missing = available.filter((id) => !seen.has(id));
  const focusedGroup = getSidebarGroupForPane(next, next.layout.focusedPaneId);
  if (focusedGroup === null)
    return createSidebarSplitState(available, activeTabId);
  if (missing.length > 0 || focusedGroup.tabIds.length === 0) {
    next = {
      ...next,
      groups: {
        ...next.groups,
        [focusedGroup.id]: {
          ...focusedGroup,
          tabIds: [...focusedGroup.tabIds, ...missing],
          activeTabId:
            focusedGroup.tabIds.length === 0
              ? activeTabId
              : focusedGroup.activeTabId,
        },
      },
    };
  }
  for (const pane of listPanes(next.layout.root)) {
    const groupId = sidebarPaneGroupId(pane);
    const group = groupId === null ? undefined : next.groups[groupId];
    if (
      groupId !== null &&
      group !== undefined &&
      !group.tabIds.includes(group.activeTabId)
    ) {
      const fallbackActiveTabId = group.tabIds[0];
      if (fallbackActiveTabId === undefined) {
        return createSidebarSplitState(available, activeTabId);
      }
      next = {
        ...next,
        groups: {
          ...next.groups,
          [groupId]: { ...group, activeTabId: fallbackActiveTabId },
        },
      };
    }
  }
  if (
    next.maximizedPaneId !== null &&
    findPane(next.layout.root, next.maximizedPaneId) === null
  ) {
    next = { ...next, maximizedPaneId: null };
  }
  return next;
}

const paneContentSchema = z
  .object({
    kind: z.literal("plugin-panel"),
    pluginId: z.literal(SIDEBAR_SPLIT_PLUGIN_ID),
    panelPath: z.string().min(1),
    subPath: z.literal(""),
  })
  .strict();
const paneNodeSchema = z
  .object({
    type: z.literal("pane"),
    paneId: z.string().min(1),
    content: paneContentSchema,
  })
  .strict();
const layoutNodeSchema: z.ZodType<LayoutNode> = z.lazy(() =>
  z.union([
    paneNodeSchema,
    z
      .object({
        type: z.literal("split"),
        dir: z.enum(["row", "col"]),
        sizes: z.array(z.number().positive()).min(2),
        children: z.array(layoutNodeSchema).min(2),
      })
      .strict()
      .refine((node) => node.sizes.length === node.children.length),
  ]),
);
const sidebarSplitStateSchema: z.ZodType<SidebarSplitState> = z
  .object({
    version: z.literal(SIDEBAR_SPLIT_LAYOUT_STORAGE_VERSION),
    groups: z.record(
      z.string(),
      z
        .object({
          id: z.string().min(1),
          tabIds: z.array(z.string().min(1)).min(1),
          activeTabId: z.string().min(1),
        })
        .strict(),
    ),
    layout: z
      .object({
        root: layoutNodeSchema,
        focusedPaneId: z.string().min(1),
      })
      .strict(),
    maximizedPaneId: z.string().min(1).nullable(),
  })
  .strict();

export function sidebarSplitStorageKey(panelStateId: string): string {
  return `${SIDEBAR_SPLIT_LAYOUT_STORAGE_PREFIX}.${panelStateId}`;
}

export function parseSidebarSplitState(
  storedValue: string | null,
  availableTabIds: readonly string[],
  activeTabId: string,
): SidebarSplitState {
  if (storedValue !== null) {
    try {
      const parsed = sidebarSplitStateSchema.safeParse(JSON.parse(storedValue));
      if (parsed.success) {
        return reconcileSidebarSplitState(
          parsed.data,
          availableTabIds,
          activeTabId,
        );
      }
    } catch {
      // Corrupt or pre-versioned state falls through to the compatible default.
    }
  }
  return createSidebarSplitState(availableTabIds, activeTabId);
}

export function serializeSidebarSplitState(state: SidebarSplitState): string {
  return JSON.stringify(state);
}
