import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as domain from "./domain.js";
import type { PomodoroCtx } from "./domain.js";
import { migrations } from "./db.js";
import type {
  CandidateTask,
  PomodoroSettings,
  ResolvedTaskRef,
} from "../shared/contract.js";
import type { TasksClient } from "./tasks-client.js";

const DEFAULT_SETTINGS: PomodoroSettings = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
  autoStartNextPhase: false,
};

function createFakeTasksClient(
  overrides: Partial<TasksClient> = {},
): TasksClient {
  const show = vi.fn(
    async (taskKeyOrId: string): Promise<ResolvedTaskRef> => ({
      id: `task_${taskKeyOrId}`,
      key: taskKeyOrId.toUpperCase(),
      title: `Task ${taskKeyOrId}`,
    }),
  );
  const comment = vi.fn(async () => {});
  const complete = vi.fn(async () => {});
  const listCandidates = vi.fn(async (): Promise<CandidateTask[]> => []);
  return { show, comment, complete, listCandidates, ...overrides };
}

function createCtx(options: {
  settings?: Partial<PomodoroSettings>;
  tasksClient?: TasksClient;
}) {
  const { bb, harness } = createFakePluginHost({
    pluginId: "pomodoro-domain-test",
  });
  const db = bb.storage.database();
  bb.storage.migrate(db, migrations);
  let settings: PomodoroSettings = {
    ...DEFAULT_SETTINGS,
    ...options.settings,
  };
  const tasksClient = options.tasksClient ?? createFakeTasksClient();
  const ctx: PomodoroCtx = {
    bb: { log: bb.log, realtime: bb.realtime },
    kv: bb.storage.kv,
    db,
    settings: {
      get: async () => settings,
      set: async (patch) => {
        settings = { ...settings, ...patch };
        return settings;
      },
    },
    wake: new EventTarget(),
    tasksClient,
  };
  return { ctx, harness, tasksClient };
}

describe("pomodoro domain", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("starts idle with the full work duration", async () => {
    const { ctx } = createCtx({});
    const view = await domain.getState(ctx);
    expect(view.phase).toBe("idle");
    expect(view.running).toBe(false);
    expect(view.remainingSeconds).toBe(DEFAULT_SETTINGS.workMinutes * 60);
  });

  it("start() begins a work phase and is idempotent while running", async () => {
    const { ctx } = createCtx({});
    const started = await domain.start(ctx, {});
    expect(started.phase).toBe("work");
    expect(started.running).toBe(true);
    expect(started.sessionId).not.toBeNull();

    const startedAgain = await domain.start(ctx, { taskKeyOrId: "ignored" });
    expect(startedAgain).toEqual(started);
  });

  it("attaches a task on start and resolves it via the tasks client", async () => {
    const { ctx, tasksClient } = createCtx({});
    const view = await domain.start(ctx, { taskKeyOrId: "abc-12" });
    expect(view.taskKey).toBe("ABC-12");
    expect(view.taskTitle).toBe("Task abc-12");
    expect(tasksClient.show).toHaveBeenCalledWith("abc-12");
  });

  it("--work-minutes only applies to a fresh work phase from idle", async () => {
    const { ctx } = createCtx({});
    const view = await domain.start(ctx, { workMinutes: 1 });
    expect(view.remainingSeconds).toBe(60);
  });

  it("pause/resume round-trips the remaining time and is idempotent", async () => {
    const { ctx } = createCtx({});
    await domain.start(ctx, {});

    const paused = await domain.pause(ctx);
    expect(paused.running).toBe(false);
    expect(paused.remainingSeconds).toBeGreaterThan(0);

    const pausedAgain = await domain.pause(ctx);
    expect(pausedAgain).toEqual(paused);

    const resumed = await domain.resume(ctx);
    expect(resumed.running).toBe(true);
    expect(resumed.remainingSeconds).toBe(paused.remainingSeconds);

    const resumedAgain = await domain.resume(ctx);
    expect(resumedAgain).toEqual(resumed);
  });

  it("resume() from idle is a no-op — start() is required to begin", async () => {
    const { ctx } = createCtx({});
    const view = await domain.resume(ctx);
    expect(view.phase).toBe("idle");
    expect(view.running).toBe(false);
  });

  it("skip() from idle is a safe no-op", async () => {
    const { ctx } = createCtx({});
    const view = await domain.skip(ctx);
    expect(view.phase).toBe("idle");
  });

  it("skip() abandons the phase without logging a task comment", async () => {
    const { ctx, tasksClient } = createCtx({});
    await domain.start(ctx, { taskKeyOrId: "abc-1" });
    const view = await domain.skip(ctx);
    expect(view.phase).toBe("short-break");
    expect(view.running).toBe(false); // autoStartNextPhase defaults to false
    expect(view.remainingSeconds).toBe(DEFAULT_SETTINGS.shortBreakMinutes * 60);
    expect(tasksClient.comment).not.toHaveBeenCalled();

    const sessions = await domain.listSessions(ctx, {});
    expect(sessions[0]?.status).toBe("skipped");
  });

  it("an elapsed work phase logs one comment and lands ready-but-not-running by default", async () => {
    const { ctx, tasksClient } = createCtx({});
    await domain.start(ctx, { taskKeyOrId: "abc-1" });
    const view = await domain.advanceOnElapse(ctx, "elapsed");

    expect(view.phase).toBe("short-break");
    expect(view.running).toBe(false);
    expect(view.phaseEndAt).toBeNull();
    expect(view.remainingSeconds).toBe(DEFAULT_SETTINGS.shortBreakMinutes * 60);
    expect(tasksClient.comment).toHaveBeenCalledTimes(1);
    expect(tasksClient.comment).toHaveBeenCalledWith(
      "task_abc-1",
      expect.stringContaining("25-minute"),
    );

    const sessions = await domain.listSessions(ctx, {});
    expect(sessions[0]?.status).toBe("completed");
  });

  it("autoStartNextPhase=true immediately counts down the next phase", async () => {
    const { ctx } = createCtx({ settings: { autoStartNextPhase: true } });
    await domain.start(ctx, {});
    const view = await domain.advanceOnElapse(ctx, "elapsed");
    expect(view.running).toBe(true);
    expect(view.phaseEndAt).not.toBeNull();
    expect(view.sessionId).not.toBeNull();
  });

  it("a break never logs a task comment even when elapsed", async () => {
    const { ctx, tasksClient } = createCtx({
      settings: { autoStartNextPhase: true },
    });
    await domain.start(ctx, { taskKeyOrId: "abc-1" });
    await domain.advanceOnElapse(ctx, "elapsed"); // work -> short-break
    (tasksClient.comment as ReturnType<typeof vi.fn>).mockClear();
    await domain.advanceOnElapse(ctx, "elapsed"); // short-break -> work
    expect(tasksClient.comment).not.toHaveBeenCalled();
  });

  it("rolls to a long break every cyclesBeforeLongBreak completions and resets the counter", async () => {
    const { ctx } = createCtx({
      settings: { autoStartNextPhase: true, cyclesBeforeLongBreak: 2 },
    });
    await domain.start(ctx, {});
    const afterFirstWork = await domain.advanceOnElapse(ctx, "elapsed");
    expect(afterFirstWork.phase).toBe("short-break");
    expect(afterFirstWork.cyclesCompleted).toBe(1);

    await domain.advanceOnElapse(ctx, "elapsed"); // short-break -> work
    const afterSecondWork = await domain.advanceOnElapse(ctx, "elapsed");
    expect(afterSecondWork.phase).toBe("long-break");
    expect(afterSecondWork.cyclesCompleted).toBe(0);
  });

  it("reset() abandons the open session, keeps the task, and is idempotent when idle", async () => {
    const { ctx } = createCtx({});
    await domain.start(ctx, { taskKeyOrId: "abc-1" });
    const view = await domain.reset(ctx);
    expect(view.phase).toBe("idle");
    expect(view.taskKey).toBe("ABC-1");
    expect(view.sessionId).toBeNull();

    const sessions = await domain.listSessions(ctx, {});
    expect(sessions[0]?.status).toBe("abandoned");

    const resetAgain = await domain.reset(ctx);
    expect(resetAgain).toEqual(view);
  });

  it("setTask/clearTask are idempotent and completeTask defaults to the selected task", async () => {
    const { ctx, tasksClient } = createCtx({});
    const set = await domain.setTask(ctx, { taskKeyOrId: "abc-1" });
    expect(set.taskKey).toBe("ABC-1");
    (tasksClient.show as ReturnType<typeof vi.fn>).mockClear();

    const setAgain = await domain.setTask(ctx, { taskKeyOrId: "abc-1" });
    expect(setAgain).toEqual(set);
    expect(tasksClient.show).not.toHaveBeenCalled();

    await domain.completeTask(ctx, {});
    expect(tasksClient.complete).toHaveBeenCalledWith("task_abc-1");

    const cleared = await domain.clearTask(ctx);
    expect(cleared.taskId).toBeNull();
    const clearedAgain = await domain.clearTask(ctx);
    expect(clearedAgain).toEqual(cleared);

    await expect(domain.completeTask(ctx, {})).rejects.toThrow(
      /no task selected/,
    );
  });
});
