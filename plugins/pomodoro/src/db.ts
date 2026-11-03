import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { PomodoroPhase, SessionRow, SessionStatus } from "../shared/contract.js";

/** Avoids a direct `better-sqlite3` type dependency — see plugins/memory. */
export type PluginDatabase = ReturnType<BbPluginApi["storage"]["database"]>;

// bb.storage.migrate is append-only by statement index: never reorder or
// edit a shipped statement, only push new ones.
export const migrations: string[] = [
  `CREATE TABLE IF NOT EXISTS sessions (
     id TEXT PRIMARY KEY,
     phase TEXT NOT NULL CHECK (phase IN ('work','short-break','long-break')),
     task_id TEXT,
     task_key TEXT,
     task_title TEXT,
     started_at TEXT NOT NULL,
     ended_at TEXT,
     status TEXT NOT NULL CHECK (status IN ('running','completed','skipped','abandoned')),
     created_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS sessions_task_started_idx ON sessions(task_id, started_at)`,
  `CREATE INDEX IF NOT EXISTS sessions_started_idx ON sessions(started_at)`,
];

interface SessionRowRaw {
  id: string;
  phase: PomodoroPhase;
  task_id: string | null;
  task_key: string | null;
  task_title: string | null;
  started_at: string;
  ended_at: string | null;
  status: SessionStatus;
  created_at: string;
}

function fromRaw(raw: SessionRowRaw): SessionRow {
  return {
    id: raw.id,
    phase: raw.phase,
    taskId: raw.task_id,
    taskKey: raw.task_key,
    taskTitle: raw.task_title,
    startedAt: raw.started_at,
    endedAt: raw.ended_at,
    status: raw.status,
    createdAt: raw.created_at,
  };
}

export function createSession(
  db: PluginDatabase,
  input: {
    id: string;
    phase: PomodoroPhase;
    taskId: string | null;
    taskKey: string | null;
    taskTitle: string | null;
    startedAt: string;
  },
): SessionRow {
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO sessions (id, phase, task_id, task_key, task_title, started_at, ended_at, status, created_at)
     VALUES (@id, @phase, @taskId, @taskKey, @taskTitle, @startedAt, NULL, 'running', @createdAt)`,
  ).run({
    id: input.id,
    phase: input.phase,
    taskId: input.taskId,
    taskKey: input.taskKey,
    taskTitle: input.taskTitle,
    startedAt: input.startedAt,
    createdAt,
  });
  const row = getSession(db, input.id);
  if (!row) throw new Error(`failed to create session ${input.id}`);
  return row;
}

export function getSession(db: PluginDatabase, id: string): SessionRow | null {
  const row = db
    .prepare(
      `SELECT id, phase, task_id, task_key, task_title, started_at, ended_at, status, created_at
       FROM sessions WHERE id = ?`,
    )
    .get(id) as SessionRowRaw | undefined;
  return row ? fromRaw(row) : null;
}

export function closeSession(
  db: PluginDatabase,
  id: string,
  input: { endedAt: string; status: Exclude<SessionStatus, "running"> },
): void {
  db.prepare(
    `UPDATE sessions SET ended_at = @endedAt, status = @status WHERE id = @id`,
  ).run({ id, endedAt: input.endedAt, status: input.status });
}

const LIST_SESSIONS_LIMIT = 200;

export function listSessions(
  db: PluginDatabase,
  input: { taskRef?: string; since?: string },
): SessionRow[] {
  // Targeted WHERE clause (task_id/task_key are indexed alongside
  // started_at) rather than loading every row and filtering in JS.
  const rows = db
    .prepare(
      `SELECT id, phase, task_id, task_key, task_title, started_at, ended_at, status, created_at
       FROM sessions
       WHERE (@taskRef IS NULL OR task_id = @taskRef OR task_key = @taskRefUpper)
         AND (@since IS NULL OR started_at >= @since)
       ORDER BY started_at DESC
       LIMIT ${LIST_SESSIONS_LIMIT}`,
    )
    .all({
      taskRef: input.taskRef ?? null,
      taskRefUpper: input.taskRef ? input.taskRef.toUpperCase() : null,
      since: input.since ?? null,
    }) as SessionRowRaw[];
  return rows.map(fromRaw);
}
