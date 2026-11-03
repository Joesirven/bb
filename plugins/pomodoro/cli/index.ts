import type { BbPluginApi, PluginCliContext, PluginCliResult } from "@get-bb/plugin-sdk";
import * as domain from "../src/domain.js";
import type { PomodoroCtx } from "../src/domain.js";
import type { PomodoroSettings, SessionRow, StatusView } from "../shared/contract.js";
import {
  assertAllowed,
  CliError,
  option,
  optionalPositional,
  parseArgs,
  requirePositionals,
  type ParsedArgs,
} from "./args.js";
import { detail, json, table } from "./format.js";

const ROOT_HELP = `Usage: bb pomodoro <command> [options]

Commands:
  status                          Show the current timer state
  start [TASK-KEY]                Start (or resume) the timer
  pause                           Pause the running phase
  resume                          Resume a paused phase
  skip                            Skip to the next phase
  reset                           Abandon the timer and return to idle
  task set|clear|complete         Manage the task tied to the timer
  sessions list                   List work/break session history
  settings get|set                Read or update timer settings

Run bb pomodoro <command> --help for command usage.`;

const STATUS_HELP = "Usage: bb pomodoro status [--json]";
const START_HELP =
  "Usage: bb pomodoro start [TASK-KEY] [--work-minutes <1-180>] [--json]";
const PAUSE_HELP = "Usage: bb pomodoro pause [--json]";
const RESUME_HELP = "Usage: bb pomodoro resume [--json]";
const SKIP_HELP = "Usage: bb pomodoro skip [--json]";
const RESET_HELP = "Usage: bb pomodoro reset [--json]";
const TASK_HELP = `Usage:
  bb pomodoro task set <TASK-KEY> [--json]
  bb pomodoro task clear [--json]
  bb pomodoro task complete [TASK-KEY] [--json]`;
const SESSIONS_HELP =
  "Usage: bb pomodoro sessions list [--task <TASK-KEY>] [--since <ISO-8601-or-date>] [--json]";
const SETTINGS_HELP = `Usage:
  bb pomodoro settings get [--json]
  bb pomodoro settings set [--work-minutes <1-180>] [--short-break-minutes <1-60>]
    [--long-break-minutes <1-120>] [--cycles-before-long-break <1-12>]
    [--auto-start-next-phase true|false] [--json]`;

function statusDetail(view: StatusView): string {
  return detail([
    ["Phase", view.phase],
    ["Running", view.running ? "yes" : "no"],
    ["Remaining", `${view.remainingSeconds}s`],
    ["Task", view.taskKey ? `${view.taskKey} — ${view.taskTitle}` : "-"],
    ["Cycles completed", view.cyclesCompleted],
    ["Session", view.sessionId ?? "-"],
    [
      "Phase ends",
      view.phaseEndAt !== null ? new Date(view.phaseEndAt).toISOString() : "-",
    ],
    ["Updated", new Date(view.updatedAt).toISOString()],
  ]);
}

function settingsDetail(settings: PomodoroSettings): string {
  return detail([
    ["Work minutes", settings.workMinutes],
    ["Short break minutes", settings.shortBreakMinutes],
    ["Long break minutes", settings.longBreakMinutes],
    ["Cycles before long break", settings.cyclesBeforeLongBreak],
    ["Auto-start next phase", settings.autoStartNextPhase ? "true" : "false"],
  ]);
}

function sessionsTable(sessions: readonly SessionRow[]): string {
  return table(
    ["ID", "PHASE", "TASK", "STARTED", "ENDED", "STATUS"],
    sessions.map((session) => [
      session.id,
      session.phase,
      session.taskKey ?? "-",
      session.startedAt,
      session.endedAt ?? "-",
      session.status,
    ]),
    "No sessions.",
  );
}

function parseIntOption(
  args: ParsedArgs,
  name: string,
  range: { min: number; max: number },
): number | undefined {
  const raw = option(args, name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < range.min || value > range.max) {
    throw new CliError(
      `--${name} must be an integer from ${range.min} to ${range.max}`,
    );
  }
  return value;
}

function parseBoolOption(args: ParsedArgs, name: string): boolean | undefined {
  const raw = option(args, name);
  if (raw === undefined) return undefined;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new CliError(`--${name} must be "true" or "false"`);
}

async function runTask(
  ctx: PomodoroCtx,
  argv: string[],
): Promise<string> {
  const [action, ...rest] = argv;
  if (!action || action === "--help") return TASK_HELP;
  const args = parseArgs(rest);
  if (args.flags.has("help")) return TASK_HELP;

  if (action === "set") {
    assertAllowed(args, []);
    const [taskKeyOrId] = requirePositionals(
      args,
      1,
      "bb pomodoro task set <TASK-KEY> [--json]",
    );
    const view = await domain.setTask(ctx, { taskKeyOrId: taskKeyOrId! });
    return args.flags.has("json") ? json(view) : statusDetail(view);
  }

  if (action === "clear") {
    assertAllowed(args, []);
    requirePositionals(args, 0, "bb pomodoro task clear [--json]");
    const view = await domain.clearTask(ctx);
    return args.flags.has("json") ? json(view) : statusDetail(view);
  }

  if (action === "complete") {
    assertAllowed(args, []);
    const taskKeyOrId = optionalPositional(
      args,
      "bb pomodoro task complete [TASK-KEY] [--json]",
    );
    const view = await domain.completeTask(ctx, { taskKeyOrId });
    return args.flags.has("json") ? json(view) : statusDetail(view);
  }

  throw new CliError(`unknown task subcommand: ${action}`);
}

async function runSessions(
  ctx: PomodoroCtx,
  argv: string[],
): Promise<string> {
  const [action, ...rest] = argv;
  if (!action || action === "--help") return SESSIONS_HELP;
  const args = parseArgs(rest);
  if (args.flags.has("help")) return SESSIONS_HELP;

  if (action === "list") {
    assertAllowed(args, ["task", "since"]);
    requirePositionals(args, 0, SESSIONS_HELP);
    const sessions = await domain.listSessions(ctx, {
      taskKeyOrId: option(args, "task"),
      since: option(args, "since"),
    });
    return args.flags.has("json")
      ? json({ sessions })
      : sessionsTable(sessions);
  }

  throw new CliError(`unknown sessions subcommand: ${action}`);
}

async function runSettings(
  ctx: PomodoroCtx,
  argv: string[],
): Promise<string> {
  const [action, ...rest] = argv;
  if (!action || action === "--help") return SETTINGS_HELP;
  const args = parseArgs(rest);
  if (args.flags.has("help")) return SETTINGS_HELP;

  if (action === "get") {
    assertAllowed(args, []);
    requirePositionals(args, 0, "bb pomodoro settings get [--json]");
    const settings = await domain.getSettings(ctx);
    return args.flags.has("json") ? json(settings) : settingsDetail(settings);
  }

  if (action === "set") {
    assertAllowed(args, [
      "work-minutes",
      "short-break-minutes",
      "long-break-minutes",
      "cycles-before-long-break",
      "auto-start-next-phase",
    ]);
    requirePositionals(args, 0, SETTINGS_HELP);
    const patch = {
      workMinutes: parseIntOption(args, "work-minutes", { min: 1, max: 180 }),
      shortBreakMinutes: parseIntOption(args, "short-break-minutes", {
        min: 1,
        max: 60,
      }),
      longBreakMinutes: parseIntOption(args, "long-break-minutes", {
        min: 1,
        max: 120,
      }),
      cyclesBeforeLongBreak: parseIntOption(
        args,
        "cycles-before-long-break",
        { min: 1, max: 12 },
      ),
      autoStartNextPhase: parseBoolOption(args, "auto-start-next-phase"),
    };
    if (Object.values(patch).every((value) => value === undefined)) {
      throw new CliError("no settings changes were provided");
    }
    const settings = await domain.updateSettings(ctx, patch);
    return args.flags.has("json") ? json(settings) : settingsDetail(settings);
  }

  throw new CliError(`unknown settings subcommand: ${action}`);
}

export function registerPomodoroCli(bb: BbPluginApi, ctx: PomodoroCtx): void {
  bb.cli.register({
    name: "pomodoro",
    summary: "Run a Pomodoro work/break timer tied to Tasks",
    commands: [
      { name: "status", summary: "Show the current timer state", usage: STATUS_HELP },
      { name: "start", summary: "Start (or resume) the timer", usage: START_HELP },
      { name: "pause", summary: "Pause the running phase", usage: PAUSE_HELP },
      { name: "resume", summary: "Resume a paused phase", usage: RESUME_HELP },
      { name: "skip", summary: "Skip to the next phase", usage: SKIP_HELP },
      {
        name: "reset",
        summary: "Abandon the timer and return to idle",
        usage: RESET_HELP,
      },
      {
        name: "task",
        summary: "Set, clear, or complete the task tied to the timer",
        usage: TASK_HELP,
      },
      {
        name: "sessions",
        summary: "List work/break session history",
        usage: SESSIONS_HELP,
      },
      {
        name: "settings",
        summary: "Read or update timer durations and cadence",
        usage: SETTINGS_HELP,
      },
    ],
    async run(argv: string[], _ctx: PluginCliContext): Promise<PluginCliResult> {
      try {
        const [command, ...rest] = argv;
        if (!command || command === "--help" || command === "help") {
          return { exitCode: 0, stdout: ROOT_HELP };
        }
        let stdout: string;
        switch (command) {
          case "status": {
            const args = parseArgs(rest);
            if (args.flags.has("help")) {
              stdout = STATUS_HELP;
              break;
            }
            assertAllowed(args, []);
            requirePositionals(args, 0, STATUS_HELP);
            const view = await domain.getState(ctx);
            stdout = args.flags.has("json") ? json(view) : statusDetail(view);
            break;
          }
          case "start": {
            const args = parseArgs(rest);
            if (args.flags.has("help")) {
              stdout = START_HELP;
              break;
            }
            assertAllowed(args, ["work-minutes"]);
            const taskKeyOrId = optionalPositional(args, START_HELP);
            const workMinutes = parseIntOption(args, "work-minutes", {
              min: 1,
              max: 180,
            });
            const view = await domain.start(ctx, { taskKeyOrId, workMinutes });
            stdout = args.flags.has("json") ? json(view) : statusDetail(view);
            break;
          }
          case "pause": {
            const args = parseArgs(rest);
            if (args.flags.has("help")) {
              stdout = PAUSE_HELP;
              break;
            }
            assertAllowed(args, []);
            requirePositionals(args, 0, PAUSE_HELP);
            const view = await domain.pause(ctx);
            stdout = args.flags.has("json") ? json(view) : statusDetail(view);
            break;
          }
          case "resume": {
            const args = parseArgs(rest);
            if (args.flags.has("help")) {
              stdout = RESUME_HELP;
              break;
            }
            assertAllowed(args, []);
            requirePositionals(args, 0, RESUME_HELP);
            const view = await domain.resume(ctx);
            stdout = args.flags.has("json") ? json(view) : statusDetail(view);
            break;
          }
          case "skip": {
            const args = parseArgs(rest);
            if (args.flags.has("help")) {
              stdout = SKIP_HELP;
              break;
            }
            assertAllowed(args, []);
            requirePositionals(args, 0, SKIP_HELP);
            const view = await domain.skip(ctx);
            stdout = args.flags.has("json") ? json(view) : statusDetail(view);
            break;
          }
          case "reset": {
            const args = parseArgs(rest);
            if (args.flags.has("help")) {
              stdout = RESET_HELP;
              break;
            }
            assertAllowed(args, []);
            requirePositionals(args, 0, RESET_HELP);
            const view = await domain.reset(ctx);
            stdout = args.flags.has("json") ? json(view) : statusDetail(view);
            break;
          }
          case "task":
            stdout = await runTask(ctx, rest);
            break;
          case "sessions":
            stdout = await runSessions(ctx, rest);
            break;
          case "settings":
            stdout = await runSettings(ctx, rest);
            break;
          default:
            throw new CliError(
              `unknown command: ${command}; run bb pomodoro --help`,
            );
        }
        return { exitCode: 0, stdout };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { exitCode: 1, stderr: message.replace(/\s+/gu, " ").trim() };
      }
    },
  });
}
