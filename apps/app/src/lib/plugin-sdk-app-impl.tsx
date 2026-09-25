import { ProviderIcon } from "@/components/plugin/ProviderIcon";
import { Icon } from "@bb/shared-ui/icon";
import { useCallback, useMemo } from "react";
import type {
  MarkdownProps,
  PluginDesktopFloatingWindow,
  PluginContentScriptContext,
  PluginDesktopTray,
  PluginSdkApp,
} from "@get-bb/plugin-sdk";
import { PluginDiff } from "@/components/plugin/PluginDiff";
import { PluginBranchPicker } from "@/components/plugin/PluginBranchPicker";
import {
  usePluginBranches,
  usePluginCheckoutState,
} from "@/components/plugin/usePluginBranchPickerState";
import { PluginNewThreadComposer } from "@/components/plugin/PluginNewThreadComposer";
import { PluginProviderModelPicker } from "@/components/plugin/PluginProviderModelPicker";
import { PluginPermissionModePicker } from "@/components/plugin/PluginPermissionModePicker";
import { PluginSourceCode } from "@/components/plugin/PluginSourceCode";
import { PluginThreadChat } from "@/components/plugin/PluginThreadChat";
import { PluginUrlLink } from "@/components/plugin/PluginUrlLink";
import { ExperimentalFileLink } from "@/components/plugin/ExperimentalFileLink";
import { MarkdownPreview } from "@/components/ui/markdown-preview";
import type { MarkdownLinkRouting } from "@/components/ui/markdown-link-routing";
import { buildMarkdownDocumentLinkRouting } from "@/components/ui/markdown-document-link-routing";
import { buildMarkdownMessageLinkRouting } from "@/components/ui/markdown-message-link-routing";
import type { MarkdownPreviewLinkHandler } from "@/components/ui/markdown-link";
import { useThreadTimelineNavigation } from "@/components/thread/timeline/ThreadTimelineNavigationContext";
import {
  getDesktopFloatingWindowApi,
  getDesktopTrayApi,
} from "./bb-desktop-tray";
import { registerDesktopTrayPlugin } from "./desktop-tray-plugins";
import { definePluginApp } from "./plugin-app-definition";
import { installDeprecatedAliases } from "./plugin-sdk-deprecated-aliases";
import { getPluginSlotSnapshot } from "./plugin-slots";
import {
  useBbContext,
  useBbNavigate,
  useComposer,
  useComposerView,
  useProviders,
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
  useSettings,
  experimental_useAppPanel,
  experimental_useFixedTabTarget,
} from "./plugin-sdk-hooks";
import {
  useSidebarThreadActions,
  useSidebarThreadPullRequest,
  useSidebarThreads,
} from "./plugin-sidebar-hooks";
import { useSidebarThreadSplit } from "./plugin-sidebar-split";
import { useAppNavigationHost } from "./app-navigation-host";
import { useCodeTheme } from "./plugin-code-theme";

function createUnavailableDesktopTray(): PluginDesktopTray {
  return {
    available: false,
    setState: () => {},
    clear: () => {},
    onActivate: () => () => {},
  };
}

function createDesktopTray(
  context: Pick<PluginContentScriptContext, "pluginId"> | undefined,
): PluginDesktopTray {
  const api = getDesktopTrayApi();
  const pluginId: unknown = context?.pluginId;
  if (api === null || typeof pluginId !== "string" || pluginId === "") {
    return createUnavailableDesktopTray();
  }
  registerDesktopTrayPlugin(pluginId);
  return {
    available: true,
    setState: (state) => {
      api.setState({
        ...state,
        pluginId,
        menuItems: state.menuItems ? [...state.menuItems] : undefined,
      });
    },
    clear: () => {
      api.clear({ pluginId });
    },
    onActivate: (handler) =>
      api.onActivate((activatedPluginId, itemId) => {
        if (activatedPluginId === pluginId) handler(itemId);
      }),
  };
}

function createDesktopFloatingWindow(): PluginDesktopFloatingWindow {
  const api = getDesktopFloatingWindowApi();
  if (api === null) {
    return {
      available: false,
      open: () => {},
      close: () => {},
    };
  }
  function findRegistration(windowId: string) {
    const registration = getPluginSlotSnapshot().floatingWindows.find(
      (candidate) => candidate.id === windowId,
    );
    if (registration === undefined) {
      console.warn(
        `experimental_desktopFloatingWindow: no experimental_floatingWindow registration with id ${JSON.stringify(
          windowId,
        )}`,
      );
    }
    return registration;
  }
  return {
    available: true,
    open: (windowId) => {
      const registration = findRegistration(windowId);
      if (registration === undefined) return;
      api.open({
        pluginId: registration.pluginId,
        windowId,
        path: registration.path,
        ...(registration.defaultSize !== undefined
          ? {
              width: registration.defaultSize.width,
              height: registration.defaultSize.height,
            }
          : {}),
      });
    },
    close: (windowId) => {
      const registration = findRegistration(windowId);
      if (registration === undefined) return;
      api.close({ pluginId: registration.pluginId, windowId });
    },
  };
}

export const pluginSdkAppImplementation = installDeprecatedAliases(
  {
    definePluginApp,
    experimental_Icon: Icon,
    experimental_ProviderIcon: ProviderIcon,
    useBbContext,
    useBbNavigate,
    experimental_useAppPanel,
    experimental_useFixedTabTarget,
    useComposer,
    useComposerView,
    useRealtime,
    useRealtimeConnectionState,
    useRpc,
    useSettings,
    ThreadChat: PluginThreadChat,
    Markdown: PluginMarkdown,
    experimental_FileLink: ExperimentalFileLink,
    UrlLink: PluginUrlLink,
    experimental_NewThreadComposer: PluginNewThreadComposer,
    experimental_ProviderModelPicker: PluginProviderModelPicker,
    experimental_PermissionModePicker: PluginPermissionModePicker,
    experimental_BranchPicker: PluginBranchPicker,
    experimental_useBranches: usePluginBranches,
    experimental_useCheckoutState: usePluginCheckoutState,
    experimental_SourceCode: PluginSourceCode,
    experimental_Diff: PluginDiff,
    experimental_useSidebarThreads: useSidebarThreads,
    experimental_useSidebarThreadActions: useSidebarThreadActions,
    experimental_useSidebarThreadPullRequest: useSidebarThreadPullRequest,
    experimental_useSidebarThreadSplit: useSidebarThreadSplit,
    experimental_useProviders: useProviders,
    experimental_useCodeTheme: useCodeTheme,
    experimental_desktopTray: createDesktopTray,
    experimental_desktopFloatingWindow: createDesktopFloatingWindow,
  } satisfies PluginSdkApp,
  { experimental_UrlLink: "UrlLink" },
);

function PluginMarkdown({
  content,
  className,
  experimental_document,
}: MarkdownProps) {
  const timelineNavigation = useThreadTimelineNavigation();
  const onOpenLocalFileLink = timelineNavigation?.onOpenLocalFileLink;
  const threadId = timelineNavigation?.threadId;
  const workspaceRootPath = timelineNavigation?.workspaceRootPath;
  const navigation = useAppNavigationHost();
  const onOpenLink = useCallback<MarkdownPreviewLinkHandler>(
    ({ href }) => navigation.openUrl({ url: href }),
    [navigation],
  );
  const linkRouting = useMemo<MarkdownLinkRouting>(() => {
    const messageRouting = buildMarkdownMessageLinkRouting({
      onOpenLink,
      onOpenLocalFileLink,
      threadId,
      workspaceRootPath,
    }) ?? { onOpenLink };
    return experimental_document === undefined
      ? messageRouting
      : buildMarkdownDocumentLinkRouting({
          document: experimental_document,
          messageRouting,
          openFilePreview: navigation.openFilePreview,
        });
  }, [
    experimental_document,
    navigation.openFilePreview,
    onOpenLink,
    onOpenLocalFileLink,
    threadId,
    workspaceRootPath,
  ]);

  return (
    <MarkdownPreview
      content={content}
      className={className}
      linkRouting={linkRouting}
    />
  );
}
