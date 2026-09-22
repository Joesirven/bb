import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { settingsResponseSchema, type PomodoroSettings } from "../shared/contract.js";


const SETTINGS_KEY = "pomodoro:settings";

const DEFAULT_SETTINGS: PomodoroSettings = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
  autoStartNextPhase: false,
};

export interface PomodoroSettingsStore {
  get(): Promise<PomodoroSettings>;
  set(patch: Partial<PomodoroSettings>): Promise<PomodoroSettings>;
}

function compactPatch<T extends Record<string, unknown>>(
  patch: Partial<T>,
): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(patch) as Array<keyof T>) {
    if (patch[key] !== undefined) result[key] = patch[key];
  }
  return result;
}

export function createSettingsStore(
  kv: Pick<BbPluginApi["storage"]["kv"], "get" | "set">,
): PomodoroSettingsStore {
  async function get(): Promise<PomodoroSettings> {
    const stored = await kv.get<Partial<PomodoroSettings>>(SETTINGS_KEY);
    return settingsResponseSchema.parse({ ...DEFAULT_SETTINGS, ...stored });
  }
  async function set(
    patch: Partial<PomodoroSettings>,
  ): Promise<PomodoroSettings> {
    const current = await get();
    const next = settingsResponseSchema.parse({
      ...current,
      ...compactPatch(patch),
    });
    await kv.set(SETTINGS_KEY, next);
    return next;
  }
  return { get, set };
}
