import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { settingsResponseSchema, type PomodoroSettings } from "../shared/contract.js";

/**
 * `bb.settings.define` only supports string/boolean/select/project values
 * (see `packages/plugin-sdk/src/backend-contract.ts`'s `PluginSettingDescriptor`
 * — there is no numeric descriptor), and its handle exposes no server-side
 * write method at all: values only change through the host settings route or
 * `bb plugin config`, neither of which fits `bb pomodoro settings set` (an
 * agent-facing, numeric, always-available surface). So Pomodoro's durations
 * and cadence live as ordinary plugin-owned state in `bb.storage.kv` instead,
 * validated by the same `settingsResponseSchema` the RPC/CLI already share.
 */

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

/**
 * Drops `undefined` entries so a patch never overwrites a field the caller
 * omitted. Both `updateSettings` RPC input and the CLI's `settings set`
 * (whose unset `--flag` options come through as explicit `undefined`
 * properties, not omitted ones — see `cli/index.ts`'s `runSettings`) rely on
 * this to update only the fields actually requested.
 */
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
