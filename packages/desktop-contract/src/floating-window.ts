import { z } from "zod";

/**
 * Mirrors `@bb/plugin-sdk`'s `PLUGIN_SLOT_ID_PATTERN` (letters, digits, `-`,
 * `_`). Duplicated here rather than imported so `@bb/desktop-contract` (shared
 * with the Electron main process) does not need a dependency on the plugin
 * SDK package.
 */
const PLUGIN_SLOT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/u;

export const BB_DESKTOP_FLOATING_WINDOW_MAX_ID_LENGTH = 200;

/**
 * Open (or focus, if already open) one plugin's `experimental_floatingWindow`
 * registration as a native always-on-top window. `windowId` is the stable
 * registry key (`${pluginId}:${windowId}`); `path` is the registration's URL
 * segment the desktop shell navigates the window to
 * (`/plugins/<pluginId>/floating/<path>`).
 */
export const bbDesktopFloatingWindowOpenRequestSchema = z
  .object({
    pluginId: z
      .string()
      .min(1)
      .max(BB_DESKTOP_FLOATING_WINDOW_MAX_ID_LENGTH),
    windowId: z
      .string()
      .regex(PLUGIN_SLOT_ID_PATTERN)
      .max(BB_DESKTOP_FLOATING_WINDOW_MAX_ID_LENGTH),
    path: z
      .string()
      .regex(PLUGIN_SLOT_ID_PATTERN)
      .max(BB_DESKTOP_FLOATING_WINDOW_MAX_ID_LENGTH),
    width: z.number().positive().finite().optional(),
    height: z.number().positive().finite().optional(),
  })
  .strict();
export type BbDesktopFloatingWindowOpenRequest = z.infer<
  typeof bbDesktopFloatingWindowOpenRequestSchema
>;

export const bbDesktopFloatingWindowCloseRequestSchema = z
  .object({
    pluginId: z
      .string()
      .min(1)
      .max(BB_DESKTOP_FLOATING_WINDOW_MAX_ID_LENGTH),
    windowId: z
      .string()
      .min(1)
      .max(BB_DESKTOP_FLOATING_WINDOW_MAX_ID_LENGTH),
  })
  .strict();
export type BbDesktopFloatingWindowCloseRequest = z.infer<
  typeof bbDesktopFloatingWindowCloseRequestSchema
>;

/**
 * Renderer-facing control surface for opening/closing plugin floating
 * windows, exposed as `window.bbDesktop.experimental_floatingWindow`.
 * Optional on {@link BbDesktopApi} for version skew: an older desktop shell's
 * preload predates this bridge, so callers must feature-detect.
 */
export interface BbDesktopFloatingWindowApi {
  open(request: BbDesktopFloatingWindowOpenRequest): void;
  close(request: BbDesktopFloatingWindowCloseRequest): void;
}
