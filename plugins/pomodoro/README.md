# Pomodoro

A Pomodoro-style work/break timer tied to the Tasks plugin, driven from the
in-app UI, an RPC contract, and the agent-facing `bb pomodoro` CLI.

- Custom work/short-break/long-break durations and cycle cadence
  (`bb pomodoro settings get|set`).
- Attach the timer to a task; each completed work interval logs a comment on
  it, and `bb pomodoro task complete` marks it done explicitly.
- A macOS menu-bar countdown and an always-on-top floating window on bb's
  desktop app (falls back gracefully everywhere else). The countdown is
  Pomodoro's own menu-bar item, on by default; turn it off with the Show in
  menu bar switch on Pomodoro's Settings page or
  `bb settings ui set desktop.hiddenMenuBarPlugins '["pomodoro"]'`. macOS hides
  menu-bar items that do not fit beside the notch.
- Full agent access via `bb pomodoro …` — see `skills/pomodoro/SKILL.md`.
