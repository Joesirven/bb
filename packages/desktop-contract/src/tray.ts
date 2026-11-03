import { z } from "zod";

/**
 * Hard caps on plugin-supplied tray strings so a misbehaving plugin cannot
 * force an oversized title/tooltip/menu onto bb's single macOS menu-bar icon.
 */
export const BB_DESKTOP_TRAY_MAX_TITLE_LENGTH = 40;
export const BB_DESKTOP_TRAY_MAX_TOOLTIP_LENGTH = 200;
export const BB_DESKTOP_TRAY_MAX_MENU_ITEM_LABEL_LENGTH = 100;
export const BB_DESKTOP_TRAY_MAX_MENU_ITEMS = 20;

export const bbDesktopTrayMenuItemSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1).max(BB_DESKTOP_TRAY_MAX_MENU_ITEM_LABEL_LENGTH),
  })
  .strict();
export type BbDesktopTrayMenuItem = z.infer<typeof bbDesktopTrayMenuItemSchema>;

/**
 * Desired state of bb's single macOS menu-bar tray icon. It is a shared,
 * app-wide resource: whichever plugin last called `setState` owns its
 * contents until it calls `clear` or another plugin overwrites it.
 */
export const bbDesktopTraySetStateRequestSchema = z
  .object({
    title: z.string().max(BB_DESKTOP_TRAY_MAX_TITLE_LENGTH).optional(),
    tooltip: z.string().max(BB_DESKTOP_TRAY_MAX_TOOLTIP_LENGTH).optional(),
    menuItems: z
      .array(bbDesktopTrayMenuItemSchema)
      .max(BB_DESKTOP_TRAY_MAX_MENU_ITEMS)
      .optional(),
  })
  .strict();
export type BbDesktopTraySetStateRequest = z.infer<
  typeof bbDesktopTraySetStateRequestSchema
>;

/** Pushed main → renderer when the user clicks the tray icon or a menu item. */
export const bbDesktopTrayActivatedEventSchema = z
  .object({
    /** The clicked menu item's `id`, or null for a plain icon click. */
    itemId: z.string().min(1).nullable(),
  })
  .strict();
export type BbDesktopTrayActivatedEvent = z.infer<
  typeof bbDesktopTrayActivatedEventSchema
>;

export type BbDesktopTrayActivateHandler = (itemId: string | null) => void;
export type BbDesktopTrayUnsubscribe = () => void;

/**
 * Renderer-facing control surface for bb's single macOS menu-bar tray icon,
 * exposed as `window.bbDesktop.experimental_tray`. Optional on
 * {@link BbDesktopApi} for version skew: an older desktop shell's preload
 * predates this bridge, so callers must feature-detect.
 */
export interface BbDesktopTrayApi {
  setState(request: BbDesktopTraySetStateRequest): void;
  clear(): void;
  onActivate(listener: BbDesktopTrayActivateHandler): BbDesktopTrayUnsubscribe;
}
