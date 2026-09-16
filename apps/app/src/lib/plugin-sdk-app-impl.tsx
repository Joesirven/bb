import { useMemo } from "react";
import type {
  MarkdownProps,
  PluginDesktopFloatingWindow,
  PluginDesktopTray,
  PluginSdkApp,
} from "@bb/plugin-sdk";
import { PluginNewThreadComposer } from "@/components/plugin/PluginNewThreadComposer";
import { PluginThreadChat } from "@/components/plugin/PluginThreadChat";
import { MarkdownPreview } from "@/components/ui/markdown-preview";
import type {
  MarkdownLinkRouting,
  MarkdownLocalFileLinkRouting,
} from "@/components/ui/markdown-link-routing";
import { useThreadTimelineNavigation } from "@/components/thread/timeline/ThreadTimelineNavigationContext";
import {
  getDesktopFloatingWindowApi,
  getDesktopTrayApi,
} from "./bb-desktop-tray";
import { definePluginApp } from "./plugin-app-definition";
import { getPluginSlotSnapshot } from "./plugin-slots";
import {
  useBbContext,
  useBbNavigate,
  useComposer,
  useComposerView,
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
  useSettings,
} from "./plugin-sdk-hooks";
import {
  useSidebarThreadActions,
  useSidebarThreadPullRequest,
  useSidebarThreads,
} from "./plugin-sidebar-hooks";
import { useSidebarThreadSplit } from "./plugin-sidebar-split";

/**
 * `experimental_desktopTray()` — a plain factory (not a hook, per the SDK
 * contract), so plain JS content-script code can call it too. bb's tray is a
 * single, app-wide macOS menu-bar icon: there is no per-plugin scoping, only
 * "whoever last called setState owns it," which the desktop main process
 * enforces (desktop-tray.ts).
 */
function createDesktopTray(): PluginDesktopTray {
  const api = getDesktopTrayApi();
  if (api === null) {
    return {
      available: false,
      setState: () => {},
      clear: () => {},
      onActivate: () => () => {},
    };
  }
  return {
    available: true,
    setState: (state) => {
      api.setState(state);
    },
    clear: () => {
      api.clear();
    },
    onActivate: (handler) => api.onActivate(handler),
  };
}

/**
 * `experimental_desktopFloatingWindow()` — a plain factory (not a hook), so
 * plain JS content-script code can call it too. Resolves `windowId` against
 * the live `experimental_floatingWindow` slot snapshot (a plain data read, no
 * React) to find the registering plugin and its `path`/`defaultSize`, then
 * forwards to the desktop bridge. A `windowId` shared by two different
 * plugins is not disambiguated in this pass (see docs/api_to_audit.md).
 */
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

/**
 * The real `@bb/plugin-sdk/app` surface (plugin design §5.2), assigned to
 * `globalThis.__bbPluginRuntime.pluginSdkApp` by installPluginRuntime() so
 * `bb plugin build` shims resolve it inside plugin bundles. `satisfies
 * PluginSdkApp` keeps it in type-sync with the facade package; the plugin SDK
 * parity test compares the facade's actual runtime exports with its bundled
 * declarations so declaration-only values cannot leak into the contract.
 *
 * Deliberately hooks-only (the 65-component host-provided UI kit was removed
 * 2026-07-03, plugin design §5.5): plugins vendor shadcn-style component
 * source from the BB registry and own it; the shared-singleton packages
 * (portal radix families, sonner, vaul) reach plugins through their own
 * runtime shims in plugin-frontend.ts, so `import { toast } from "sonner"`
 * hits the host toaster without an SDK member.
 */
export const pluginSdkAppImplementation = {
  definePluginApp,
  useBbContext,
  useBbNavigate,
  useComposer,
  useComposerView,
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
  useSettings,
  // The host-owned components in the SDK (plugin design: deliberate
  // exception to §5.5) — stable product capabilities, not a UI kit.
  ThreadChat: PluginThreadChat,
  Markdown: PluginMarkdown,
  // Experimental (see docs/api_to_audit.md): the create-side counterpart to
  // ThreadChat.
  experimental_NewThreadComposer: PluginNewThreadComposer,
  // Experimental (see docs/api_to_audit.md): the sidebar thread-list data
  // plane, for plugins that replace the list itself.
  experimental_useSidebarThreads: useSidebarThreads,
  experimental_useSidebarThreadActions: useSidebarThreadActions,
  experimental_useSidebarThreadPullRequest: useSidebarThreadPullRequest,
  experimental_useSidebarThreadSplit: useSidebarThreadSplit,
  // Experimental (see docs/api_to_audit.md): bb's macOS menu-bar tray icon
  // and always-on-top floating windows.
  experimental_desktopTray: createDesktopTray,
  experimental_desktopFloatingWindow: createDesktopFloatingWindow,
} satisfies PluginSdkApp;

/**
 * The public chat-message markdown renderer: the host's MarkdownPreview with
 * only the stable content/className surface exposed. Renderer options
 * (lightbox, link routing, thread mentions) stay host-internal.
 */
function PluginMarkdown({ content, className }: MarkdownProps) {
  const timelineNavigation = useThreadTimelineNavigation();
  const onOpenLink = timelineNavigation?.onOpenLink;
  const onOpenLocalFileLink = timelineNavigation?.onOpenLocalFileLink;
  const workspaceRootPath = timelineNavigation?.workspaceRootPath;
  const linkRouting = useMemo<MarkdownLinkRouting | undefined>(() => {
    if (onOpenLink === undefined || onOpenLocalFileLink === undefined) {
      return undefined;
    }
    const localFile: MarkdownLocalFileLinkRouting = {
      absoluteLinks: { kind: "trusted-host" },
      onOpenLink: onOpenLocalFileLink,
    };
    if (workspaceRootPath !== undefined) {
      localFile.relativeLinks = {
        baseDir: workspaceRootPath,
        rootPath: workspaceRootPath,
      };
    }
    return { localFile, onOpenLink };
  }, [onOpenLink, onOpenLocalFileLink, workspaceRootPath]);

  return (
    <MarkdownPreview
      content={content}
      className={className}
      linkRouting={linkRouting}
    />
  );
}
