import { describe, expect, it } from "vitest";
import {
  classifyRemoteServerFailure,
  createConnectingView,
  createRemoteServerLoadFailureView,
  createServerProbeFailureView,
  formatServerHost,
} from "../src/remote-server-connection.js";

/** The exact text Electron rejects `loadURL` with, from the bug report. */
const ELECTRON_DNS_FAILURE =
  "ERR_NAME_NOT_RESOLVED (-105) loading 'https://ba-sing-se.example.internal/'";

describe("classifyRemoteServerFailure", () => {
  it("matches Chromium and Node spellings of the same failure", () => {
    expect(classifyRemoteServerFailure(ELECTRON_DNS_FAILURE)).toBe(
      "unresolved-host",
    );
    expect(
      classifyRemoteServerFailure(
        "fetch failed: getaddrinfo ENOTFOUND ba-sing-se.example.internal",
      ),
    ).toBe("unresolved-host");
    expect(
      classifyRemoteServerFailure(
        "ERR_CONNECTION_REFUSED (-102) loading 'http://127.0.0.1:38886/'",
      ),
    ).toBe("refused");
    expect(
      classifyRemoteServerFailure(
        "fetch failed: connect ECONNREFUSED 127.0.0.1:38886",
      ),
    ).toBe("refused");
    expect(classifyRemoteServerFailure("This operation was aborted")).toBe(
      "timed-out",
    );
    expect(
      classifyRemoteServerFailure("ERR_CERT_AUTHORITY_INVALID (-202)"),
    ).toBe("certificate");
    expect(
      classifyRemoteServerFailure("ERR_INTERNET_DISCONNECTED (-106)"),
    ).toBe("offline");
  });

  it("does not guess at a failure it cannot recognize", () => {
    expect(classifyRemoteServerFailure("ERR_FAILED (-2)")).toBe("unknown");
  });
});

describe("formatServerHost", () => {
  it("names host and port, and falls back to the raw text", () => {
    expect(formatServerHost("http://ba-sing-se.ts.net:38886")).toBe(
      "ba-sing-se.ts.net:38886",
    );
    expect(formatServerHost("https://bb.example.com/")).toBe("bb.example.com");
    expect(formatServerHost("not a url")).toBe("not a url");
  });
});

describe("createRemoteServerLoadFailureView", () => {
  it("replaces the Electron stack with a message naming the server", () => {
    const view = createRemoteServerLoadFailureView({
      detail: ELECTRON_DNS_FAILURE,
      serverUrl: "https://ba-sing-se.example.internal",
    });

    expect(view.kind).toBe("error");
    if (view.kind !== "error") return;
    expect(view.title).toBe("Could not reach ba-sing-se.example.internal");
    expect(view.details).toContain("could not look up");
    expect(view.details).toContain("Window ▸ Server");
    // The raw error stays available as the log block, not as the headline.
    expect(view.details).not.toContain("ERR_NAME_NOT_RESOLVED");
    expect(view.logText).toBe(ELECTRON_DNS_FAILURE);
  });
});

describe("createServerProbeFailureView", () => {
  it("distinguishes an unreachable server from one that is not bb", () => {
    const unreachable = createServerProbeFailureView({
      kind: "unavailable",
      reason: "fetch failed: connect ECONNREFUSED 10.0.0.4:38886",
      serverUrl: "http://10.0.0.4:38886",
    });
    expect(unreachable.kind === "error" && unreachable.title).toBe(
      "Could not reach 10.0.0.4:38886",
    );
    expect(unreachable.kind === "error" && unreachable.details).toContain(
      "Nothing is listening",
    );

    const notBb = createServerProbeFailureView({
      kind: "incompatible",
      reason: "/health returned HTTP 404",
      serverUrl: "https://example.com",
    });
    expect(notBb.kind === "error" && notBb.title).toBe(
      "example.com is not a bb server",
    );
  });
});

describe("createConnectingView", () => {
  it("names the server it is waiting on", () => {
    const view = createConnectingView("https://bb.example.com");
    expect(view).toMatchObject({
      kind: "loading",
      title: "Connecting to bb.example.com…",
    });
  });
});
