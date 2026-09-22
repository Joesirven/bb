import type {
  BbDesktopFloatingWindowApi,
  BbDesktopTrayApi,
} from "@bb/desktop-contract";
import { getBbDesktopInfo } from "./bb-desktop";

export function getDesktopTrayApi(): BbDesktopTrayApi | null {
  return getBbDesktopInfo()?.experimental_tray ?? null;
}

export function getDesktopFloatingWindowApi(): BbDesktopFloatingWindowApi | null {
  return getBbDesktopInfo()?.experimental_floatingWindow ?? null;
}
