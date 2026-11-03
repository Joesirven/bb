import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Domain types. This is the ONE shared shape used by RPC handlers, CLI
// handlers, storage, and the frontend — keeping the UI and the agent-facing
// CLI from ever drifting apart (see domain.ts).
// ---------------------------------------------------------------------------

export const POMODORO_PHASES = [
  "idle",
  "work",
  "short-break",
  "long-break",
] as const;
export type PomodoroPhase = (typeof POMODORO_PHASES)[number];

export const SESSION_STATUSES = [
  "running",
  "completed",
  "skipped",
  "abandoned",
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/**
 * The single JSON blob persisted at kv key `"pomodoro:state"`. `phaseEndAt`
 * is the ground truth while running; `remainingSeconds` is the ground truth
 * while paused, idle, or "ready but not started" (ready state produced by an
 * elapsed/skipped phase when `autoStartNextPhase` is false).
 */
export interface PomodoroState {
  phase: PomodoroPhase;
  running: boolean;
  phaseEndAt: number | null;
  remainingSeconds: number;
  taskId: string | null;
  taskKey: string | null;
  taskTitle: string | null;
  cyclesCompleted: number;
  currentSessionId: string | null;
  updatedAt: number;
}

export interface PomodoroSettings {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cyclesBeforeLongBreak: number;
  autoStartNextPhase: boolean;
}

export interface SessionRow {
  id: string;
  phase: PomodoroPhase;
  taskId: string | null;
  taskKey: string | null;
  taskTitle: string | null;
  startedAt: string;
  endedAt: string | null;
  status: SessionStatus;
  createdAt: string;
}

export interface ResolvedTaskRef {
  id: string;
  key: string;
  title: string;
}

export interface CandidateTask {
  id: string;
  key: string;
  title: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Zod schemas — the RPC wire contract. `--json` CLI output uses the exact
// same shapes (see cli/format.ts callers), so the stable status view never
// drifts between the UI, the CLI, and Iroh (the agent consuming the CLI).
// ---------------------------------------------------------------------------

const phaseSchema = z.enum(POMODORO_PHASES);
const sessionStatusSchema = z.enum(SESSION_STATUSES);
const taskRefOptionSchema = z.string().trim().min(1);

export const statusViewSchema = z
  .object({
    phase: phaseSchema,
    running: z.boolean(),
    remainingSeconds: z.number().int().nonnegative(),
    taskId: z.string().nullable(),
    taskKey: z.string().nullable(),
    taskTitle: z.string().nullable(),
    sessionId: z.string().nullable(),
    cyclesCompleted: z.number().int().nonnegative(),
    phaseEndAt: z.number().int().nullable(),
    updatedAt: z.number().int(),
  })
  .strict();
export type StatusView = z.infer<typeof statusViewSchema>;

export const settingsResponseSchema = z
  .object({
    workMinutes: z.number().int().min(1).max(180),
    shortBreakMinutes: z.number().int().min(1).max(60),
    longBreakMinutes: z.number().int().min(1).max(120),
    cyclesBeforeLongBreak: z.number().int().min(1).max(12),
    autoStartNextPhase: z.boolean(),
  })
  .strict();

export const sessionSchema = z
  .object({
    id: z.string(),
    phase: phaseSchema,
    taskId: z.string().nullable(),
    taskKey: z.string().nullable(),
    taskTitle: z.string().nullable(),
    startedAt: z.string(),
    endedAt: z.string().nullable(),
    status: sessionStatusSchema,
    createdAt: z.string(),
  })
  .strict();

export const candidateTaskSchema = z
  .object({
    id: z.string(),
    key: z.string(),
    title: z.string(),
    status: z.string(),
  })
  .strict();

const startInputSchema = z
  .object({
    taskKeyOrId: taskRefOptionSchema.optional(),
    workMinutes: z.number().int().min(1).max(180).optional(),
  })
  .strict();

const setTaskInputSchema = z
  .object({ taskKeyOrId: taskRefOptionSchema })
  .strict();

const completeTaskInputSchema = z
  .object({ taskKeyOrId: taskRefOptionSchema.optional() })
  .strict();

const listSessionsInputSchema = z
  .object({
    taskKeyOrId: taskRefOptionSchema.optional(),
    since: z.string().trim().min(1).optional(),
  })
  .strict();

const listCandidateTasksInputSchema = z
  .object({ query: z.string().trim().min(1).optional() })
  .strict();

const updateSettingsInputSchema = z
  .object({
    workMinutes: z.number().int().min(1).max(180).optional(),
    shortBreakMinutes: z.number().int().min(1).max(60).optional(),
    longBreakMinutes: z.number().int().min(1).max(120).optional(),
    cyclesBeforeLongBreak: z.number().int().min(1).max(12).optional(),
    autoStartNextPhase: z.boolean().optional(),
  })
  .strict();

export const pomodoroRpcContract = defineRpcContract({
  getState: {
    input: z.null(),
    output: statusViewSchema,
  },
  start: {
    input: startInputSchema,
    output: statusViewSchema,
  },
  pause: {
    input: z.null(),
    output: statusViewSchema,
  },
  resume: {
    input: z.null(),
    output: statusViewSchema,
  },
  skip: {
    input: z.null(),
    output: statusViewSchema,
  },
  reset: {
    input: z.null(),
    output: statusViewSchema,
  },
  setTask: {
    input: setTaskInputSchema,
    output: statusViewSchema,
  },
  clearTask: {
    input: z.null(),
    output: statusViewSchema,
  },
  completeTask: {
    input: completeTaskInputSchema,
    output: statusViewSchema,
  },
  listSessions: {
    input: listSessionsInputSchema,
    output: z.object({ sessions: z.array(sessionSchema) }).strict(),
  },
  listCandidateTasks: {
    input: listCandidateTasksInputSchema,
    output: z.object({ tasks: z.array(candidateTaskSchema) }).strict(),
  },
  getSettings: {
    input: z.null(),
    output: settingsResponseSchema,
  },
  updateSettings: {
    input: updateSettingsInputSchema,
    output: settingsResponseSchema,
  },
});

export type PomodoroRpcContract = typeof pomodoroRpcContract;
