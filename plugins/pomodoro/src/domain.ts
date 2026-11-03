import { randomUUID } from "node:crypto";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  type CandidateTask,
  type PomodoroPhase,
  type PomodoroSettings,
  type PomodoroState,
  type SessionRow,
  type StatusView,
} from "../shared/contract.js";
import {
  closeSession,
  createSession,
  getSession,
  listSessions as listSessionRows,
  type PluginDatabase,
} from "./db.js";
import type { TasksClient } from "./tasks-client.js";

export const STATE_KEY = "pomodoro:state";
export const REALTIME_CHANNEL = "pomodoro/state";

export interface PomodoroCtx {
  bb: Pick<BbPluginApi, "log" | "realtime">;
  kv: Pick<BbPluginApi["storage"]["kv"], "get" | "set">;
  db: PluginDatabase;
  settings: {
    get(): Promise<PomodoroSettings>;
    set(patch: Partial<PomodoroSettings>): Promise<PomodoroSettings>;
  };
  /** Built once per factory invocation; see src/wake.ts. */
  wake: EventTarget;
  tasksClient: TasksClient;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function defaultState(settings: PomodoroSettings, now: number): PomodoroState {
  return {
    phase: "idle",
    running: false,
    phaseEndAt: null,
    remainingSeconds: settings.workMinutes * 60,
    taskId: null,
    taskKey: null,
    taskTitle: null,
    cyclesCompleted: 0,
    currentSessionId: null,
    updatedAt: now,
  };
}

export async function readState(ctx: PomodoroCtx): Promise<PomodoroState> {
  const stored = await ctx.kv.get<PomodoroState>(STATE_KEY);
  if (stored) return stored;
  const settings = await ctx.settings.get();
  return defaultState(settings, Date.now());
}

export function toStatusView(state: PomodoroState, now: number): StatusView {
  return {
    phase: state.phase,
    running: state.running,
    remainingSeconds:
      state.running && state.phaseEndAt !== null
        ? Math.max(0, Math.round((state.phaseEndAt - now) / 1000))
        : state.remainingSeconds,
    taskId: state.taskId,
    taskKey: state.taskKey,
    taskTitle: state.taskTitle,
    sessionId: state.currentSessionId,
    cyclesCompleted: state.cyclesCompleted,
    phaseEndAt: state.phaseEndAt,
    updatedAt: state.updatedAt,
  };
}

async function persist(ctx: PomodoroCtx, state: PomodoroState): Promise<void> {
  await ctx.kv.set(STATE_KEY, state);
  ctx.bb.realtime.publish(REALTIME_CHANNEL, toStatusView(state, Date.now()));
  ctx.wake.dispatchEvent(new Event("change"));
}

function sessionIsOpenForPhase(
  db: PluginDatabase,
  sessionId: string,
  phase: PomodoroPhase,
): boolean {
  const row = getSession(db, sessionId);
  return row !== null && row.status === "running" && row.phase === phase;
}

/**
 * Where a work phase (`work`) leads to `short-break` (or `long-break` every
 * `cyclesBeforeLongBreak`th completion) and any break leads back to `work`.
 * `cyclesCompleted` counts finished work phases since the last long break.
 */
function computeNextPhase(
  currentPhase: PomodoroPhase,
  cyclesCompleted: number,
  settings: PomodoroSettings,
): { phase: PomodoroPhase; cyclesCompleted: number; durationSeconds: number } {
  if (currentPhase === "idle" || currentPhase === "work") {
    const nextCycles = cyclesCompleted + 1;
    if (nextCycles >= settings.cyclesBeforeLongBreak) {
      return {
        phase: "long-break",
        cyclesCompleted: 0,
        durationSeconds: settings.longBreakMinutes * 60,
      };
    }
    return {
      phase: "short-break",
      cyclesCompleted: nextCycles,
      durationSeconds: settings.shortBreakMinutes * 60,
    };
  }
  return {
    phase: "work",
    cyclesCompleted,
    durationSeconds: settings.workMinutes * 60,
  };
}

function buildWorkCompletionComment(durationMinutes: number): string {
  return `Completed a ${durationMinutes}-minute Pomodoro work interval.`;
}

/**
 * Advances from the current phase to the next one, whether it naturally
 * elapsed (background service) or was explicitly skipped. Closes the open
 * session (if any) with the matching terminal status, logs the completed
 * work-interval comment ONLY on a natural `"elapsed"` completion of a `work`
 * phase (a skip abandons the interval rather than completing it — it is
 * record-keeping, not the user's explicit `task complete` action), then
 * writes the next phase. `autoStartNextPhase` gates whether the next phase
 * starts counting down immediately (`running: true`, fresh `phaseEndAt`,
 * plus its own session row since a phase's session begins when it starts
 * counting down) or lands "ready but not running" (full duration in
 * `remainingSeconds`, `phaseEndAt: null`, no session row yet).
 */
export async function advanceOnElapse(
  ctx: PomodoroCtx,
  reason: "elapsed" | "skipped",
): Promise<StatusView> {
  const state = await readState(ctx);
  if (state.phase === "idle") return toStatusView(state, Date.now());

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const settings = await ctx.settings.get();

  if (state.currentSessionId !== null) {
    closeSession(ctx.db, state.currentSessionId, {
      endedAt: nowIso,
      status: reason === "elapsed" ? "completed" : "skipped",
    });
  }

  if (reason === "elapsed" && state.phase === "work" && state.taskId) {
    try {
      await ctx.tasksClient.comment(
        state.taskId,
        buildWorkCompletionComment(settings.workMinutes),
      );
    } catch (error) {
      ctx.bb.log.warn(
        `pomodoro: failed to log completed work interval on task ${state.taskId}: ${errorMessage(error)}`,
      );
    }
  }

  const next = computeNextPhase(state.phase, state.cyclesCompleted, settings);
  const autoStart = settings.autoStartNextPhase;
  const sessionId = autoStart
    ? createSession(ctx.db, {
        id: `ses_${randomUUID()}`,
        phase: next.phase,
        taskId: state.taskId,
        taskKey: state.taskKey,
        taskTitle: state.taskTitle,
        startedAt: nowIso,
      }).id
    : null;

  const nextState: PomodoroState = {
    phase: next.phase,
    running: autoStart,
    phaseEndAt: autoStart ? now + next.durationSeconds * 1000 : null,
    remainingSeconds: next.durationSeconds,
    taskId: state.taskId,
    taskKey: state.taskKey,
    taskTitle: state.taskTitle,
    cyclesCompleted: next.cyclesCompleted,
    currentSessionId: sessionId,
    updatedAt: now,
  };
  await persist(ctx, nextState);
  return toStatusView(nextState, now);
}

async function beginCountdown(
  ctx: PomodoroCtx,
  state: PomodoroState,
  overrides: { taskRef?: string; workMinutesOverride?: number },
): Promise<StatusView> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const settings = await ctx.settings.get();

  let taskId = state.taskId;
  let taskKey = state.taskKey;
  let taskTitle = state.taskTitle;
  if (overrides.taskRef !== undefined) {
    // Explicit user/agent action: a resolution failure must surface, never
    // be swallowed.
    const task = await ctx.tasksClient.show(overrides.taskRef);
    taskId = task.id;
    taskKey = task.key;
    taskTitle = task.title;
  }

  const phase: PomodoroPhase = state.phase === "idle" ? "work" : state.phase;
  // --work-minutes only applies to a brand-new work phase starting fresh
  // from idle: a paused or "ready" phase already has a concrete
  // remainingSeconds (the actual remaining duration, possibly partial), and
  // overriding it there would silently discard progress or misrepresent the
  // ready phase's real length.
  const durationSeconds =
    state.phase === "idle"
      ? (overrides.workMinutesOverride ?? settings.workMinutes) * 60
      : state.remainingSeconds;

  const reuseSession =
    state.currentSessionId !== null &&
    sessionIsOpenForPhase(ctx.db, state.currentSessionId, phase);
  const sessionId = reuseSession
    ? state.currentSessionId!
    : createSession(ctx.db, {
        id: `ses_${randomUUID()}`,
        phase,
        taskId,
        taskKey,
        taskTitle,
        startedAt: nowIso,
      }).id;

  const nextState: PomodoroState = {
    phase,
    running: true,
    phaseEndAt: now + durationSeconds * 1000,
    remainingSeconds: durationSeconds,
    taskId,
    taskKey,
    taskTitle,
    cyclesCompleted: state.cyclesCompleted,
    currentSessionId: sessionId,
    updatedAt: now,
  };
  await persist(ctx, nextState);
  return toStatusView(nextState, now);
}

export async function getState(ctx: PomodoroCtx): Promise<StatusView> {
  return toStatusView(await readState(ctx), Date.now());
}

export async function start(
  ctx: PomodoroCtx,
  input: { taskKeyOrId?: string; workMinutes?: number },
): Promise<StatusView> {
  const state = await readState(ctx);
  if (state.running) return toStatusView(state, Date.now());
  return beginCountdown(ctx, state, {
    taskRef: input.taskKeyOrId,
    workMinutesOverride: input.workMinutes,
  });
}

export async function pause(ctx: PomodoroCtx): Promise<StatusView> {
  const state = await readState(ctx);
  if (!state.running) return toStatusView(state, Date.now());
  const now = Date.now();
  const remainingSeconds =
    state.phaseEndAt !== null
      ? Math.max(0, Math.round((state.phaseEndAt - now) / 1000))
      : state.remainingSeconds;
  const nextState: PomodoroState = {
    ...state,
    running: false,
    phaseEndAt: null,
    remainingSeconds,
    updatedAt: now,
  };
  await persist(ctx, nextState);
  return toStatusView(nextState, now);
}

export async function resume(ctx: PomodoroCtx): Promise<StatusView> {
  const state = await readState(ctx);
  if (state.running) return toStatusView(state, Date.now());
  // Nothing to resume from idle; a fresh countdown is `start`'s job.
  if (state.phase === "idle") return toStatusView(state, Date.now());
  return beginCountdown(ctx, state, {});
}

export async function skip(ctx: PomodoroCtx): Promise<StatusView> {
  const state = await readState(ctx);
  if (state.phase === "idle") return toStatusView(state, Date.now());
  return advanceOnElapse(ctx, "skipped");
}

export async function reset(ctx: PomodoroCtx): Promise<StatusView> {
  const state = await readState(ctx);
  if (state.phase === "idle" && !state.running && state.currentSessionId === null) {
    return toStatusView(state, Date.now());
  }
  const now = Date.now();
  if (state.currentSessionId !== null) {
    closeSession(ctx.db, state.currentSessionId, {
      endedAt: new Date(now).toISOString(),
      status: "abandoned",
    });
  }
  const settings = await ctx.settings.get();
  const nextState: PomodoroState = {
    phase: "idle",
    running: false,
    phaseEndAt: null,
    remainingSeconds: settings.workMinutes * 60,
    // Reset abandons the timer, not the task selection: the same task is
    // almost always what comes next.
    taskId: state.taskId,
    taskKey: state.taskKey,
    taskTitle: state.taskTitle,
    cyclesCompleted: 0,
    currentSessionId: null,
    updatedAt: now,
  };
  await persist(ctx, nextState);
  return toStatusView(nextState, now);
}

export async function setTask(
  ctx: PomodoroCtx,
  input: { taskKeyOrId: string },
): Promise<StatusView> {
  const state = await readState(ctx);
  const ref = input.taskKeyOrId.trim();
  if (ref === state.taskId || ref.toUpperCase() === state.taskKey) {
    return toStatusView(state, Date.now());
  }
  const task = await ctx.tasksClient.show(ref);
  const now = Date.now();
  const nextState: PomodoroState = {
    ...state,
    taskId: task.id,
    taskKey: task.key,
    taskTitle: task.title,
    updatedAt: now,
  };
  await persist(ctx, nextState);
  return toStatusView(nextState, now);
}

export async function clearTask(ctx: PomodoroCtx): Promise<StatusView> {
  const state = await readState(ctx);
  if (state.taskId === null) return toStatusView(state, Date.now());
  const now = Date.now();
  const nextState: PomodoroState = {
    ...state,
    taskId: null,
    taskKey: null,
    taskTitle: null,
    updatedAt: now,
  };
  await persist(ctx, nextState);
  return toStatusView(nextState, now);
}

export async function completeTask(
  ctx: PomodoroCtx,
  input: { taskKeyOrId?: string },
): Promise<StatusView> {
  const state = await readState(ctx);
  const ref = input.taskKeyOrId ?? state.taskId;
  if (!ref) {
    throw new Error(
      "no task selected; pass a task key/id or run `bb pomodoro task set` first",
    );
  }
  // Explicit action: a failure must surface, never be swallowed.
  await ctx.tasksClient.complete(ref);
  return toStatusView(state, Date.now());
}

export async function listSessions(
  ctx: PomodoroCtx,
  input: { taskKeyOrId?: string; since?: string },
): Promise<SessionRow[]> {
  return listSessionRows(ctx.db, {
    taskRef: input.taskKeyOrId,
    since: input.since,
  });
}

export async function listCandidateTasks(
  ctx: PomodoroCtx,
  input: { query?: string },
): Promise<CandidateTask[]> {
  return ctx.tasksClient.listCandidates(input.query);
}

export async function getSettings(ctx: PomodoroCtx): Promise<PomodoroSettings> {
  return ctx.settings.get();
}

export async function updateSettings(
  ctx: PomodoroCtx,
  patch: Partial<PomodoroSettings>,
): Promise<PomodoroSettings> {
  const next = await ctx.settings.set(patch);
  // A live work-minutes change while a work phase is already ticking down
  // does not retroactively resize the in-flight countdown — only settings
  // fetched by the NEXT phase transition use the new value. Nothing else
  // about state needs to change here.
  return next;
}
