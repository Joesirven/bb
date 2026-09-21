import { z } from "zod";

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

export const bbDesktopTrayActivatedEventSchema = z
  .object({
    itemId: z.string().min(1).nullable(),
  })
  .strict();
export type BbDesktopTrayActivatedEvent = z.infer<
  typeof bbDesktopTrayActivatedEventSchema
>;

export type BbDesktopTrayActivateHandler = (itemId: string | null) => void;
export type BbDesktopTrayUnsubscribe = () => void;

export interface BbDesktopTrayApi {
  setState(request: BbDesktopTraySetStateRequest): void;
  clear(): void;
  onActivate(listener: BbDesktopTrayActivateHandler): BbDesktopTrayUnsubscribe;
}
