import { describe, expect, it } from "vitest";
import {
  BB_DESKTOP_TRAY_MAX_MENU_ITEMS,
  bbDesktopTrayActivatedEventSchema,
  bbDesktopTrayClearRequestSchema,
  bbDesktopTraySetEnabledRequestSchema,
  bbDesktopTraySetStateRequestSchema,
} from "../src/tray.js";

describe("bbDesktopTraySetStateRequestSchema", () => {
  it("requires a non-empty plugin id", () => {
    expect(
      bbDesktopTraySetStateRequestSchema.safeParse({ title: "23:59" }).success,
    ).toBe(false);
    expect(
      bbDesktopTraySetStateRequestSchema.safeParse({
        pluginId: "",
        title: "23:59",
      }).success,
    ).toBe(false);
    expect(
      bbDesktopTraySetStateRequestSchema.safeParse({
        pluginId: "pomodoro",
        title: "23:59",
        tooltip: "Work",
        menuItems: [{ id: "pause", label: "Pause" }],
      }).success,
    ).toBe(true);
  });

  it("rejects unknown keys and oversized menus", () => {
    expect(
      bbDesktopTraySetStateRequestSchema.safeParse({
        pluginId: "pomodoro",
        owner: "someone",
      }).success,
    ).toBe(false);
    expect(
      bbDesktopTraySetStateRequestSchema.safeParse({
        pluginId: "pomodoro",
        menuItems: Array.from(
          { length: BB_DESKTOP_TRAY_MAX_MENU_ITEMS + 1 },
          (_, index) => ({ id: `item-${index}`, label: "Item" }),
        ),
      }).success,
    ).toBe(false);
  });
});

describe("bbDesktopTrayClearRequestSchema", () => {
  it("requires exactly a non-empty plugin id", () => {
    expect(bbDesktopTrayClearRequestSchema.safeParse({}).success).toBe(false);
    expect(
      bbDesktopTrayClearRequestSchema.safeParse({ pluginId: "" }).success,
    ).toBe(false);
    expect(
      bbDesktopTrayClearRequestSchema.safeParse({
        pluginId: "pomodoro",
        extra: true,
      }).success,
    ).toBe(false);
    expect(
      bbDesktopTrayClearRequestSchema.safeParse({ pluginId: "pomodoro" })
        .success,
    ).toBe(true);
  });
});

describe("bbDesktopTraySetEnabledRequestSchema", () => {
  it("requires a plugin id and a boolean", () => {
    expect(
      bbDesktopTraySetEnabledRequestSchema.safeParse({ pluginId: "pomodoro" })
        .success,
    ).toBe(false);
    expect(
      bbDesktopTraySetEnabledRequestSchema.safeParse({
        pluginId: "pomodoro",
        enabled: "no",
      }).success,
    ).toBe(false);
    expect(
      bbDesktopTraySetEnabledRequestSchema.safeParse({
        pluginId: "pomodoro",
        enabled: false,
      }).success,
    ).toBe(true);
  });
});

describe("bbDesktopTrayActivatedEventSchema", () => {
  it("carries the plugin id with a menu item id or null for an icon click", () => {
    expect(
      bbDesktopTrayActivatedEventSchema.safeParse({
        pluginId: "pomodoro",
        itemId: null,
      }).success,
    ).toBe(true);
    expect(
      bbDesktopTrayActivatedEventSchema.safeParse({
        pluginId: "pomodoro",
        itemId: "pause",
      }).success,
    ).toBe(true);
    expect(
      bbDesktopTrayActivatedEventSchema.safeParse({ itemId: null }).success,
    ).toBe(false);
  });
});
