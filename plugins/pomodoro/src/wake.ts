
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

export function sleepUntil(
  ms: number,
  signal: AbortSignal,
  wake: EventTarget,
): Promise<void> {
  return Promise.race([sleep(ms, signal), waitForWakeOrAbort(wake, signal)]);
}
