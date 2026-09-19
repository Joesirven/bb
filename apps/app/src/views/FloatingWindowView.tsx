import { useParams } from "react-router-dom";
import { usePluginSlots } from "@/lib/plugin-slots";

/**
 * Chrome-free host for one plugin's `experimental_floatingWindow` component
 * (plugin design: desktop tray/floating-window capability). Rendered by a
 * dedicated top-level `<Routes>` entry in App.tsx, the same way
 * AuthCallbackView is — no AppLayout, no sidebar, no header.
 *
 * This route is only ever loaded directly by bb's own desktop shell into a
 * secondary always-on-top BrowserWindow (see apps/desktop's
 * desktop-floating-window.ts); it is never a user-facing in-app navigation
 * target, so an unmatched registration renders a minimal blank state rather
 * than a styled error page.
 */
export function FloatingWindowView() {
  const { pluginId, windowId } = useParams<{
    pluginId: string;
    windowId: string;
  }>();
  const { floatingWindows } = usePluginSlots();
  const registration = floatingWindows.find(
    (candidate) => candidate.pluginId === pluginId && candidate.path === windowId,
  );

  if (registration === undefined) {
    return <div className="h-screen w-screen bg-background" />;
  }

  const Component = registration.component;
  return (
    <div className="h-screen w-screen overflow-hidden bg-background">
      <Component />
    </div>
  );
}
