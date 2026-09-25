import type {
  BbDesktopFloatingWindowApi,
  BbDesktopTrayApi,
} from "@bb/desktop-contract";
import { getBbDesktopInfo, shouldUseMacosDesktopChrome } from "./bb-desktop";

export function getDesktopTrayApi(): BbDesktopTrayApi | null {
  const info = getBbDesktopInfo();
  if (!shouldUseMacosDesktopChrome(info)) return null;
  return info?.experimental_tray ?? null;
}

export function getDesktopFloatingWindowApi(): BbDesktopFloatingWindowApi | null {
  return getBbDesktopInfo()?.experimental_floatingWindow ?? null;
}
