import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { registerPomodoroCli } from "./cli/index.js";
import * as domain from "./src/domain.js";
import type { PomodoroCtx } from "./src/domain.js";
import { migrations } from "./src/db.js";
import { createSettingsStore } from "./src/settings.js";
import { createTasksClient } from "./src/tasks-client.js";
import { sleep, sleepUntil, waitForWakeOrAbort } from "./src/wake.js";
import { pomodoroRpcContract } from "./shared/contract.js";

export const POMODORO_PLUGIN_NAME = "Pomodoro";
export const POMODORO_PLUGIN_VERSION = "0.1.0";

export default async function plugin(bb: BbPluginApi) {
  bb.log.info(`${POMODORO_PLUGIN_NAME} ${POMODORO_PLUGIN_VERSION} loaded`);

  const db = bb.storage.database();
  bb.storage.migrate(db, migrations);

  // Built once per factory invocation (never module-top-level) so a plugin
  // reload gets a fresh emitter instead of stale closures from a prior load.
  const wake = new EventTarget();
  const tasksClient = createTasksClient();

  const ctx: PomodoroCtx = {
    bb: { log: bb.log, realtime: bb.realtime },
    kv: bb.storage.kv,
    db,
    settings: createSettingsStore(bb.storage.kv),
    wake,
    tasksClient,
  };

  bb.rpc.register(pomodoroRpcContract, {
    getState: () => domain.getState(ctx),
    start: (input) => domain.start(ctx, input),
    pause: () => domain.pause(ctx),
    resume: () => domain.resume(ctx),
    skip: () => domain.skip(ctx),
    reset: () => domain.reset(ctx),
    setTask: (input) => domain.setTask(ctx, input),
    clearTask: () => domain.clearTask(ctx),
    completeTask: (input) => domain.completeTask(ctx, input),
    async listSessions(input) {
      return { sessions: await domain.listSessions(ctx, input) };
    },
    async listCandidateTasks(input) {
      return { tasks: await domain.listCandidateTasks(ctx, input) };
    },
    getSettings: () => domain.getSettings(ctx),
    updateSettings: (patch) => domain.updateSettings(ctx, patch),
  });

  registerPomodoroCli(bb, ctx);

  // The phase clock: the only writer of a NATURAL phase transition. Every
  // RPC/CLI mutation writes its own state change immediately (see
  // src/domain.ts's `persist`) and wakes this loop so it re-evaluates
  // promptly instead of waiting out a stale timer.
  bb.background.service("pomodoro-clock", {
    async start(signal) {
      while (!signal.aborted) {
        try {
          const state = await domain.readState(ctx);
          if (!state.running || state.phaseEndAt === null) {
            await waitForWakeOrAbort(wake, signal);
            continue;
          }
          const remainingMs = state.phaseEndAt - Date.now();
          if (remainingMs > 0) {
            await sleepUntil(remainingMs, signal, wake);
            continue;
          }
          await domain.advanceOnElapse(ctx, "elapsed");
        } catch (error) {
          bb.log.error(
            `pomodoro-clock: ${error instanceof Error ? error.message : String(error)}`,
          );
          await sleep(5_000, signal);
        }
      }
    },
  });
}
