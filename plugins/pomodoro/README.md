# Pomodoro

A Pomodoro-style work/break timer tied to the Tasks plugin, driven from the
in-app UI, an RPC contract, and the agent-facing `bb pomodoro` CLI.

- Custom work/short-break/long-break durations and cycle cadence
  (`bb pomodoro settings get|set`).
- Attach the timer to a task; each completed work interval logs a comment on
  it, and `bb pomodoro task complete` marks it done explicitly.
- A macOS menu-bar countdown and an always-on-top floating window on bb's
  desktop app (falls back gracefully everywhere else).
- Full agent access via `bb pomodoro …` — see `skills/pomodoro/SKILL.md`.
