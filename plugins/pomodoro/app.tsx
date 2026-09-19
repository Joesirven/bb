// bb-plugin-pomodoro — the frontend bundle.
//
// One navPanel ("Pomodoro") for the full page, one experimental_floatingWindow
// for the compact always-on-top view bb's desktop shell can pop out, a
// sidebarFooterAction as a quick entry point, and a content script that keeps
// bb's macOS menu-bar Tray showing a live countdown regardless of which page
// is open. All four read the same `StatusView` shape the `bb pomodoro` CLI
// returns (see shared/contract.ts) so the UI, the CLI, and Iroh never drift.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  definePluginApp,
  experimental_desktopFloatingWindow,
  experimental_desktopTray,
  useRealtime,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { Button } from "@bb/shared-ui/button";
import { Card, CardContent } from "@bb/shared-ui/card";
import { Input } from "@bb/shared-ui/input";
import type { pomodoroRpcContract } from "./shared/contract.js";
import type {
  CandidateTask,
  SessionRow,
  StatusView,
} from "./shared/contract.js";

const PANEL_PATH = "pomodoro";
const FLOATING_WINDOW_ID = "timer";
const REALTIME_CHANNEL = "pomodoro/state";
const TRAY_POLL_INTERVAL_MS = 2_500;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function phaseLabel(phase: StatusView["phase"]): string {
  switch (phase) {
    case "idle":
      return "Idle";
    case "work":
      return "Work";
    case "short-break":
      return "Short break";
    case "long-break":
      return "Long break";
  }
}

// ---------------------------------------------------------------------------
// Shared status hook: RPC + realtime for authoritative updates, a local 1s
// ticker for a smooth countdown between them (no per-second server traffic).
// ---------------------------------------------------------------------------

function useLiveStatus(): {
  status: StatusView | null;
  error: string | null;
  refetch: () => void;
} {
  const rpc = useRpc<typeof pomodoroRpcContract>();
  const [status, setStatus] = useState<StatusView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    rpc.call("getState", null).then(
      (next) => {
        setStatus(next);
        setError(null);
      },
      (rpcError: unknown) => setError(errorText(rpcError)),
    );
  }, [rpc]);

  useEffect(() => {
    refetch();
  }, [refetch]);
  useRealtime(REALTIME_CHANNEL, (payload) => {
    setStatus(payload as StatusView);
    setError(null);
  });

  // Local ticker: while running, recompute remainingSeconds every second
  // from phaseEndAt rather than waiting on the next realtime signal.
  useEffect(() => {
    if (status === null || !status.running || status.phaseEndAt === null) {
      return;
    }
    const phaseEndAt = status.phaseEndAt;
    const interval = setInterval(() => {
      setStatus((current) => {
        if (current === null || !current.running) return current;
        const remainingSeconds = Math.max(
          0,
          Math.round((phaseEndAt - Date.now()) / 1000),
        );
        if (remainingSeconds === current.remainingSeconds) return current;
        return { ...current, remainingSeconds };
      });
    }, 1_000);
    return () => clearInterval(interval);
  }, [status?.running, status?.phaseEndAt]);

  return { status, error, refetch };
}

// ---------------------------------------------------------------------------
// Controls shared by the panel and the floating view.
// ---------------------------------------------------------------------------

function TimerControls({
  status,
  onChanged,
  compact,
}: {
  status: StatusView;
  onChanged: (next: StatusView) => void;
  compact: boolean;
}) {
  const rpc = useRpc<typeof pomodoroRpcContract>();
  const [pending, setPending] = useState(false);

  function settle(promise: Promise<StatusView>, label: string): void {
    setPending(true);
    promise
      .then(onChanged, (rpcError: unknown) =>
        toast.error(`Failed to ${label}: ${errorText(rpcError)}`),
      )
      .finally(() => setPending(false));
  }
  const onStart = useCallback(
    () => settle(rpc.call("start", {}), "start"),
    [rpc],
  );
  const onPause = useCallback(
    () => settle(rpc.call("pause", null), "pause"),
    [rpc],
  );
  const onResume = useCallback(
    () => settle(rpc.call("resume", null), "resume"),
    [rpc],
  );
  const onSkip = useCallback(
    () => settle(rpc.call("skip", null), "skip to the next phase"),
    [rpc],
  );
  const onReset = useCallback(
    () => settle(rpc.call("reset", null), "reset"),
    [rpc],
  );

  const size = compact ? "sm" : "default";
  return (
    <div className="flex flex-wrap gap-2">
      {status.phase === "idle" ? (
        <Button size={size} disabled={pending} onClick={onStart}>
          Start
        </Button>
      ) : status.running ? (
        <Button size={size} variant="outline" disabled={pending} onClick={onPause}>
          Pause
        </Button>
      ) : (
        <Button size={size} disabled={pending} onClick={onResume}>
          Resume
        </Button>
      )}
      <Button size={size} variant="outline" disabled={pending} onClick={onSkip}>
        Skip
      </Button>
      {!compact ? (
        <Button size={size} variant="ghost" disabled={pending} onClick={onReset}>
          Reset
        </Button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Floating window: compact, chrome-free, always-on-top on bb desktop.
// ---------------------------------------------------------------------------

function PomodoroFloatingView() {
  const { status, error } = useLiveStatus();

  if (error !== null) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background p-3 text-center text-xs text-muted-foreground">
        {error}
      </div>
    );
  }
  if (status === null) return null;

  return (
    <div className="flex h-full w-full flex-col justify-between gap-2 bg-background p-3">
      <div>
        <div className="text-xs font-medium text-muted-foreground">
          {phaseLabel(status.phase)}
        </div>
        <div className="text-3xl font-semibold tabular-nums">
          {formatClock(status.remainingSeconds)}
        </div>
        {status.taskTitle !== null ? (
          <div className="truncate text-xs text-muted-foreground">
            {status.taskKey} — {status.taskTitle}
          </div>
        ) : null}
      </div>
      <TimerControls status={status} onChanged={() => {}} compact />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task picker: search-as-you-type over listCandidateTasks.
// ---------------------------------------------------------------------------

function TaskPicker({
  status,
  onChanged,
}: {
  status: StatusView;
  onChanged: (next: StatusView) => void;
}) {
  const rpc = useRpc<typeof pomodoroRpcContract>();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<CandidateTask[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => {
      rpc
        .call("listCandidateTasks", {
          ...(query.trim().length > 0 ? { query: query.trim() } : {}),
        })
        .then(
          (result) => setCandidates(result.tasks),
          () => setCandidates([]),
        );
    }, 200);
    return () => clearTimeout(handle);
  }, [rpc, query]);

  const select = useCallback(
    (taskKeyOrId: string) => {
      setBusy(true);
      rpc
        .call("setTask", { taskKeyOrId })
        .then(onChanged, (rpcError: unknown) =>
          toast.error(`Failed to select task: ${errorText(rpcError)}`),
        )
        .finally(() => setBusy(false));
    },
    [rpc, onChanged],
  );

  const clear = useCallback(() => {
    setBusy(true);
    rpc
      .call("clearTask", null)
      .then(onChanged, (rpcError: unknown) =>
        toast.error(`Failed to clear task: ${errorText(rpcError)}`),
      )
      .finally(() => setBusy(false));
  }, [rpc, onChanged]);

  const complete = useCallback(() => {
    setBusy(true);
    rpc
      .call("completeTask", {})
      .then(
        (next) => {
          onChanged(next);
          toast.success("Task marked done");
        },
        (rpcError: unknown) =>
          toast.error(`Failed to complete task: ${errorText(rpcError)}`),
      )
      .finally(() => setBusy(false));
  }, [rpc, onChanged]);

  if (status.taskId !== null) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">
          {status.taskKey} — {status.taskTitle}
        </span>
        <Button size="sm" variant="outline" disabled={busy} onClick={complete}>
          Mark done
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={clear}>
          Clear
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        placeholder="Search tasks…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        disabled={busy}
      />
      {candidates.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {candidates.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => select(task.key)}
                className="w-full rounded-md border border-border px-2 py-1 text-left text-sm hover:bg-accent"
              >
                <span className="font-medium">{task.key}</span> {task.title}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session history.
// ---------------------------------------------------------------------------

function SessionHistory({ refreshKey }: { refreshKey: number }) {
  const rpc = useRpc<typeof pomodoroRpcContract>();
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  useEffect(() => {
    rpc.call("listSessions", {}).then(
      (result) => setSessions(result.sessions),
      () => setSessions([]),
    );
  }, [rpc, refreshKey]);

  if (sessions.length === 0) {
    return <p className="text-sm text-muted-foreground">No sessions yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-1 text-sm">
      {sessions.map((session) => (
        <li
          key={session.id}
          className="flex items-center justify-between gap-2 border-b border-border py-1 last:border-0"
        >
          <span>{phaseLabel(session.phase)}</span>
          <span className="text-muted-foreground">
            {session.taskKey ?? "—"}
          </span>
          <span className="text-muted-foreground">{session.status}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Full page.
// ---------------------------------------------------------------------------

function PomodoroPage() {
  const { status, error, refetch } = useLiveStatus();
  const [historyKey, setHistoryKey] = useState(0);

  const onChanged = useCallback(
    (next: StatusView) => {
      void next;
      refetch();
      setHistoryKey((key) => key + 1);
    },
    [refetch],
  );

  const openFloating = useCallback(() => {
    const floating = experimental_desktopFloatingWindow();
    if (floating.available) {
      floating.open(FLOATING_WINDOW_ID);
    } else {
      toast.info("The floating timer is only available in bb's desktop app.");
    }
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 md:p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Pomodoro</h1>
        <Button size="sm" variant="outline" onClick={openFloating}>
          Open floating timer
        </Button>
      </div>
      {error !== null ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : status === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-3 pt-6">
              <div>
                <div className="text-sm font-medium text-muted-foreground">
                  {phaseLabel(status.phase)}
                  {status.running ? " · running" : status.phase !== "idle" ? " · paused" : ""}
                </div>
                <div className="text-5xl font-semibold tabular-nums">
                  {formatClock(status.remainingSeconds)}
                </div>
              </div>
              <TimerControls status={status} onChanged={onChanged} compact={false} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <h2 className="mb-2 text-sm font-semibold">Task</h2>
              <TaskPicker status={status} onChanged={onChanged} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <h2 className="mb-2 text-sm font-semibold">History</h2>
              <SessionHistory refreshKey={historyKey} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "pomodoro",
    title: "Pomodoro",
    icon: "Timer",
    path: PANEL_PATH,
    component: PomodoroPage,
  });
  app.slots.experimental_floatingWindow({
    id: FLOATING_WINDOW_ID,
    path: FLOATING_WINDOW_ID,
    component: PomodoroFloatingView,
    defaultSize: { width: 260, height: 160 },
  });
  app.slots.sidebarFooterAction({
    id: "pomodoro-open",
    title: "Pomodoro",
    icon: "Timer",
    run({ openSettings }) {
      const floating = experimental_desktopFloatingWindow();
      if (floating.available) {
        floating.open(FLOATING_WINDOW_ID);
      } else {
        openSettings();
      }
    },
  });
  // The always-mounted driver that keeps bb's macOS menu-bar Tray showing a
  // live countdown regardless of which page is open — there is no app-wide
  // overlay slot to lean on for this, so a content script is the right tool.
  app.contentScripts.register({
    id: "pomodoro-tray-driver",
    mount({ signal }) {
      const tray = experimental_desktopTray();
      if (!tray.available) return;

      let lastKnown: StatusView | null = null;

      function render() {
        if (lastKnown === null) return;
        const remainingSeconds =
          lastKnown.running && lastKnown.phaseEndAt !== null
            ? Math.max(0, Math.round((lastKnown.phaseEndAt - Date.now()) / 1000))
            : lastKnown.remainingSeconds;
        if (lastKnown.phase === "idle") {
          tray.clear();
          return;
        }
        tray.setState({
          title: formatClock(remainingSeconds),
          tooltip: `${phaseLabel(lastKnown.phase)}${
            lastKnown.taskTitle !== null ? ` — ${lastKnown.taskTitle}` : ""
          }`,
        });
      }

      async function poll() {
        try {
          const response = await fetch("/api/v1/plugins/pomodoro/rpc/getState", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "null",
            signal,
          });
          if (!response.ok) return;
          const body: unknown = await response.json();
          if (
            typeof body === "object" &&
            body !== null &&
            "ok" in body &&
            (body as { ok: unknown }).ok === true &&
            "result" in body
          ) {
            lastKnown = (body as { result: StatusView }).result;
            render();
          }
        } catch {
          // Transient network/plugin-not-ready hiccup — try again next tick.
        }
      }

      void poll();
      const pollInterval = setInterval(() => void poll(), TRAY_POLL_INTERVAL_MS);
      const tickInterval = setInterval(render, 1_000);

      return () => {
        clearInterval(pollInterval);
        clearInterval(tickInterval);
        tray.clear();
      };
    },
  });
});
