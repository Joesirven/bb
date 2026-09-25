import type {
  BbDesktopFloatingWindowApi,
  BbDesktopTrayApi,
} from "@bb/desktop-contract";
import { getBbDesktopInfo, shouldUseMacosDesktopChrome } from "./bb-desktop";

export function getDesktopTrayApi(): BbDesktopTrayApi | null {
  const info = getBbDesktopInfo();
  if (!shouldUseMacosDesktopChrome(info)) return null;
  const tray = info?.experimental_tray;
  if (tray === undefined || typeof tray.setEnabled !== "function") return null;
  return tray;
}

export function getDesktopFloatingWindowApi(): BbDesktopFloatingWindowApi | null {
  return getBbDesktopInfo()?.experimental_floatingWindow ?? null;
}
