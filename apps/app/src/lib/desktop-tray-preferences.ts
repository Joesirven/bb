import { createSyncedPreferenceAtom } from "@/lib/ui-preferences/synced-preference-atom";

export const hiddenMenuBarPluginIdsAtom = createSyncedPreferenceAtom(
  "desktop.hiddenMenuBarPlugins",
);
