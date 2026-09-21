import { z } from "zod";

const PLUGIN_SLOT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/u;

export const BB_DESKTOP_FLOATING_WINDOW_MAX_ID_LENGTH = 200;

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

export interface BbDesktopFloatingWindowApi {
  open(request: BbDesktopFloatingWindowOpenRequest): void;
  close(request: BbDesktopFloatingWindowCloseRequest): void;
}
