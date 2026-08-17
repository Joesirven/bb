// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
// Re-exported from @bb/shared-ui/lib/clipboard, which has no Vitest project of
// its own; covering it here keeps the shared implementation under test.
import { copyToClipboard } from "./clipboard";

const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", {
    value,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  if (originalClipboard) {
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  } else {
    setClipboard(undefined);
  }
  vi.restoreAllMocks();
});

describe("copyToClipboard", () => {
  // The bug this guards: on a plain-http non-localhost origin (bb reached over a
  // local network address) `navigator.clipboard` is undefined, so every copy
  // button reported "Failed to copy".
  it("falls back to execCommand when the Clipboard API is missing", async () => {
    setClipboard(undefined);
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      value: execCommand,
      configurable: true,
    });

    await expect(copyToClipboard("hello from bb")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("falls back to execCommand when writeText rejects", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      value: execCommand,
      configurable: true,
    });

    await expect(copyToClipboard("hello from bb")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("reports failure when both paths fail, leaving no textarea behind", async () => {
    setClipboard(undefined);
    Object.defineProperty(document, "execCommand", {
      value: vi.fn().mockReturnValue(false),
      configurable: true,
    });

    await expect(copyToClipboard("hello from bb")).resolves.toBe(false);
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
  });

  it("prefers the Clipboard API when it is available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      value: execCommand,
      configurable: true,
    });

    await expect(copyToClipboard("hello from bb")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello from bb");
    expect(execCommand).not.toHaveBeenCalled();
  });
});
