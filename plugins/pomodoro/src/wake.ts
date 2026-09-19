/**
 * Timer primitives for the pomodoro-clock background service. `wake` is a
 * plain `EventTarget` built once per plugin factory invocation (never
 * module-top-level, so a reload gets a fresh one) and shared with the RPC/CLI
 * mutation handlers: every mutation dispatches `"change"` on it after writing
 * new state, so a service blocked in `sleepUntil` re-evaluates immediately
 * instead of waiting out a stale timer.
 */

/** Resolves after `ms`, or immediately if `signal` is already aborted. */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

/** Resolves on the next `wake` "change" event, or immediately on abort. */
export function waitForWakeOrAbort(
  wake: EventTarget,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const onWake = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      resolve();
    };
    function cleanup() {
      wake.removeEventListener("change", onWake);
      signal.removeEventListener("abort", onAbort);
    }
    wake.addEventListener("change", onWake, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Resolves on whichever comes first: `ms` elapsing, a wake signal, or abort. */
export function sleepUntil(
  ms: number,
  signal: AbortSignal,
  wake: EventTarget,
): Promise<void> {
  return Promise.race([sleep(ms, signal), waitForWakeOrAbort(wake, signal)]);
}
