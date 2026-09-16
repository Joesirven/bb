import type {
  BbDesktopFloatingWindowApi,
  BbDesktopTrayApi,
} from "@bb/desktop-contract";
import { getBbDesktopInfo } from "./bb-desktop";

/**
 * Thin accessors over `window.bbDesktop.experimental_tray` /
 * `experimental_floatingWindow` (added by apps/desktop's preload), following
 * `getBbDesktopInfo()`'s pattern: `null` on the web build, an older desktop
 * build whose preload predates the bridge, or any non-desktop context.
 *
 * These back the `experimental_desktopTray()` / `experimental_desktopFloatingWindow()`
 * plugin SDK members (plugin-sdk-app-impl.tsx), which degrade to
 * `available: false` + no-op methods when the accessor returns `null`.
 */

export function getDesktopTrayApi(): BbDesktopTrayApi | null {
  return getBbDesktopInfo()?.experimental_tray ?? null;
}

export function getDesktopFloatingWindowApi(): BbDesktopFloatingWindowApi | null {
  return getBbDesktopInfo()?.experimental_floatingWindow ?? null;
}
