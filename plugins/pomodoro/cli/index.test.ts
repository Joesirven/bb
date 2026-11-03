import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import { registerPomodoroCli } from "./index.js";
import type { PomodoroCtx } from "../src/domain.js";
import { migrations } from "../src/db.js";
import { createSettingsStore } from "../src/settings.js";
import type { PomodoroSettings, ResolvedTaskRef } from "../shared/contract.js";
import type { TasksClient } from "../src/tasks-client.js";

function createCtxAndHarness() {
  const { bb, harness } = createFakePluginHost({ pluginId: "pomodoro-cli-test" });
  const db = bb.storage.database();
  bb.storage.migrate(db, migrations);
  const tasksClient: TasksClient = {
    show: vi.fn(
      async (taskKeyOrId: string): Promise<ResolvedTaskRef> => ({
        id: `task_${taskKeyOrId}`,
        key: taskKeyOrId.toUpperCase(),
        title: `Task ${taskKeyOrId}`,
      }),
    ),
    comment: vi.fn(async () => {}),
    complete: vi.fn(async () => {}),
    listCandidates: vi.fn(async () => []),
  };
  const ctx: PomodoroCtx = {
    bb: { log: bb.log, realtime: bb.realtime },
    kv: bb.storage.kv,
    db,
    settings: createSettingsStore(bb.storage.kv),
    wake: new EventTarget(),
    tasksClient,
  };
  registerPomodoroCli(bb, ctx);
  return { harness, tasksClient };
}

async function runJson(
  harness: ReturnType<typeof createFakePluginHost>["harness"],
  argv: string[],
): Promise<unknown> {
  const result = await harness.runCli(argv);
  expect(result.exitCode).toBe(0);
  return JSON.parse(result.stdout ?? "");
}

describe("bb pomodoro CLI", () => {
  it("bb pomodoro status --json returns the stable status shape", async () => {
    const { harness } = createCtxAndHarness();
    const view = (await runJson(harness, ["status", "--json"])) as {
      phase: string;
      running: boolean;
    };
    expect(view.phase).toBe("idle");
    expect(view.running).toBe(false);
  });

  it("bb pomodoro start TASK-KEY --json attaches the task and starts", async () => {
    const { harness, tasksClient } = createCtxAndHarness();
    const view = (await runJson(harness, ["start", "abc-1", "--json"])) as {
      phase: string;
      taskKey: string;
    };
    expect(view.phase).toBe("work");
    expect(view.taskKey).toBe("ABC-1");
    expect(tasksClient.show).toHaveBeenCalledWith("abc-1");
  });

  it("bb pomodoro task set/clear/complete round-trip", async () => {
    const { harness, tasksClient } = createCtxAndHarness();
    await harness.runCli(["task", "set", "abc-1"]);
    const completed = await harness.runCli(["task", "complete", "--json"]);
    expect(completed.exitCode).toBe(0);
    expect(tasksClient.complete).toHaveBeenCalledWith("task_abc-1");

    const cleared = await harness.runCli(["task", "clear"]);
    expect(cleared.exitCode).toBe(0);
  });

  it("rejects an unknown top-level command", async () => {
    const { harness } = createCtxAndHarness();
    const result = await harness.runCli(["frobnicate"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/unknown command/);
  });

  it("rejects a task set with no positional and an unknown option", async () => {
    const { harness } = createCtxAndHarness();
    const missingArg = await harness.runCli(["task", "set"]);
    expect(missingArg.exitCode).toBe(1);

    const unknownOption = await harness.runCli(["status", "--bogus", "x"]);
    expect(unknownOption.exitCode).toBe(1);
    expect(unknownOption.stderr).toMatch(/unknown option/);
  });

  it("bb pomodoro settings get/set round-trip and reject an empty set", async () => {
    const { harness } = createCtxAndHarness();
    const initial = (await runJson(harness, ["settings", "get", "--json"])) as PomodoroSettings;
    expect(initial.workMinutes).toBe(25);

    const updated = (await runJson(harness, [
      "settings",
      "set",
      "--work-minutes",
      "30",
      "--json",
    ])) as PomodoroSettings;
    expect(updated.workMinutes).toBe(30);
    expect(updated.shortBreakMinutes).toBe(5);

    const emptySet = await harness.runCli(["settings", "set"]);
    expect(emptySet.exitCode).toBe(1);
    expect(emptySet.stderr).toMatch(/no settings changes/);
  });

  it("bb pomodoro sessions list returns session rows as JSON", async () => {
    const { harness } = createCtxAndHarness();
    await harness.runCli(["start", "--json"]);
    await harness.runCli(["skip", "--json"]);
    const page = (await runJson(harness, ["sessions", "list", "--json"])) as {
      sessions: { status: string }[];
    };
    expect(page.sessions).toHaveLength(1);
    expect(page.sessions[0]?.status).toBe("skipped");
  });
});
