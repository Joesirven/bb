---
name: pomodoro
description: Use when asked to start, check, or manage a Pomodoro work/break timer, when a message references the Pomodoro plugin or its timer state, or when a personal agent (e.g. Iroh) needs to read or drive the timer on the user's behalf.
---

# Pomodoro

Use the `bb pomodoro` CLI to read and drive a single work/break timer tied to
the Tasks plugin. The timer is a pure state/event source: it never sends
notifications or messages on its own — that is a consuming agent's job.

Every command supports `--json` for a stable, machine-readable response. All
JSON outputs share one status shape (see "Status shape" below), except
`sessions list` and `settings get|set`, which return their own documented
shapes. Every operation is idempotent: calling `start` while already running,
`pause` while already paused, `task set` for the currently-set task, and so
on returns the current state unchanged rather than erroring.

## Status shape

```json
{
  "phase": "idle" | "work" | "short-break" | "long-break",
  "running": boolean,
  "remainingSeconds": number,
  "taskId": string | null,
  "taskKey": string | null,
  "taskTitle": string | null,
  "sessionId": string | null,
  "cyclesCompleted": number,
  "phaseEndAt": number | null,
  "updatedAt": number
}
```

`phaseEndAt` is an epoch-millisecond timestamp while running, `null`
otherwise. Do not poll faster than every few seconds — `remainingSeconds` is
authoritative at response time, not a live stream.

## Commands

```sh
bb pomodoro status --json
```

Read the current phase, whether it's running, and the remaining time.

```sh
bb pomodoro start [TASK-KEY] --json
bb pomodoro start [TASK-KEY] --work-minutes 45 --json
```

Start a fresh work phase from idle (or resume a paused/ready phase). An
optional task key or internal id attaches the timer to that task for this
session; `--work-minutes` overrides only the length of a brand-new work
phase started from idle — it does not resize an in-progress or paused phase.
No-op (returns current state) if already running.

```sh
bb pomodoro pause --json
bb pomodoro resume --json
bb pomodoro skip --json
bb pomodoro reset --json
```

`pause`/`resume` are no-ops in the wrong state rather than errors. `skip`
abandons the remaining time in the current phase and advances immediately
(a skipped work phase is recorded as `"skipped"`, not `"completed"`, and
does **not** log a Tasks comment). `reset` abandons the timer entirely and
returns to `idle`, keeping the selected task.

```sh
bb pomodoro task set TASK-KEY
bb pomodoro task clear
bb pomodoro task complete [TASK-KEY] --json
```

`task set`/`task clear` change which task the timer is tied to without
touching the running countdown. `task complete` marks a task done in Tasks
(`bb tasks update <key> --status done`) — defaulting to the currently
selected task when no key is given — and is **only ever explicit**: the
timer never marks a task done on its own, no matter how many work intervals
complete.

Each completed **work** phase (never a break, and never a skipped phase)
automatically posts one comment to the attached task via `bb tasks comment`
recording the finished interval — this is record-keeping, not task
completion.

```sh
bb pomodoro sessions list [--task TASK-KEY] [--since 2026-09-01] --json
```

Returns `{ "sessions": [{ id, phase, taskId, taskKey, taskTitle, startedAt,
endedAt, status, createdAt }] }`, newest first. `status` is one of
`running`, `completed`, `skipped`, `abandoned`.

```sh
bb pomodoro settings get --json
bb pomodoro settings set --work-minutes 25 --short-break-minutes 5 \
  --long-break-minutes 15 --cycles-before-long-break 4 \
  --auto-start-next-phase false --json
```

Returns/updates `{ workMinutes, shortBreakMinutes, longBreakMinutes,
cyclesBeforeLongBreak, autoStartNextPhase }`. `settings set` accepts any
subset of flags; unspecified fields are left unchanged.

**`autoStartNextPhase` defaults to `false`.** With it off, a phase that
elapses or is skipped lands "ready but not running" (the next phase is
selected, `remainingSeconds` holds its full length, but nothing counts down
until an explicit `start`/`resume`) — the timer never silently keeps
running through a break or into the next work interval unless this setting
is explicitly turned on.

## What this plugin does not do

- No nudge, reminder, or notification command of any kind. A consuming agent
  that wants to tell the user "your break is over" must watch `status` (or
  the plugin's `pomodoro/state` realtime channel from the UI side) and send
  that message itself — this plugin only exposes state.
- No automatic task completion, ever, regardless of settings.
- No automatic phase auto-start unless `autoStartNextPhase` is explicitly
  enabled.
