import { useParams } from "react-router-dom";
import { PluginSlotMount } from "@/components/plugin/PluginSlotMount";
import { usePluginSlots } from "@/lib/plugin-slots";

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
      <PluginSlotMount
        key={`${registration.pluginId}/${registration.id}/${registration.generation}`}
        pluginId={registration.pluginId}
        slotKind="floatingWindow"
        slotId={registration.id}
      >
        <Component />
      </PluginSlotMount>
    </div>
  );
}
