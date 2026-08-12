import type { LocalViewModel } from "./local-view.js";
import type { ServerProbeResult } from "./server-probe.js";

/**
 * How a remote bb server failed to answer. The desktop app sees these failures
 * twice over: once as a Node fetch error from the probe (`getaddrinfo
 * ENOTFOUND …`, reached through `error.cause`) and once as a Chromium net
 * error from `webContents.loadURL` (`ERR_NAME_NOT_RESOLVED (-105) loading …`).
 * Both spellings are matched here so the person reading the window gets the
 * same sentence either way.
 */
export type RemoteServerFailureKind =
  | "certificate"
  | "not-a-bb-server"
  | "offline"
  | "refused"
  | "timed-out"
  | "unknown"
  | "unresolved-host";

export interface DescribeRemoteServerFailureArgs {
  /** Raw error text: a probe reason or an Electron load-failure message. */
  detail: string;
  kind: RemoteServerFailureKind;
  serverUrl: string;
}

export interface RemoteServerFailureViewArgs {
  detail: string;
  serverUrl: string;
}

const RECOVERY_SENTENCE =
  "Use Window ▸ Server to pick another server or switch back to This Mac, " +
  "or Window ▸ Server ▸ Set Server URL… to correct the address.";

/** Host and port as typed, so the message names what the user actually entered. */
export function formatServerHost(serverUrl: string): string {
  try {
    return new URL(serverUrl).host;
  } catch {
    return serverUrl;
  }
}

export function classifyRemoteServerFailure(
  detail: string,
): RemoteServerFailureKind {
  const haystack = detail.toLowerCase();
  if (
    haystack.includes("err_name_not_resolved") ||
    haystack.includes("err_name_resolution_failed") ||
    haystack.includes("enotfound") ||
    haystack.includes("eai_again")
  ) {
    return "unresolved-host";
  }
  if (
    haystack.includes("err_connection_refused") ||
    haystack.includes("econnrefused")
  ) {
    return "refused";
  }
  if (
    haystack.includes("err_internet_disconnected") ||
    haystack.includes("err_network_changed") ||
    haystack.includes("enetunreach") ||
    haystack.includes("ehostunreach")
  ) {
    return "offline";
  }
  if (
    haystack.includes("err_cert") ||
    haystack.includes("err_ssl") ||
    haystack.includes("err_bad_ssl") ||
    haystack.includes("self-signed certificate") ||
    haystack.includes("unable to verify")
  ) {
    return "certificate";
  }
  if (
    haystack.includes("err_connection_timed_out") ||
    haystack.includes("err_timed_out") ||
    haystack.includes("etimedout") ||
    haystack.includes("timed out") ||
    haystack.includes("timeout") ||
    haystack.includes("was aborted") ||
    haystack.includes("aborterror")
  ) {
    return "timed-out";
  }
  return "unknown";
}

/** The explanatory sentence, without the recovery advice appended. */
export function describeRemoteServerFailure(
  args: DescribeRemoteServerFailureArgs,
): string {
  const host = formatServerHost(args.serverUrl);
  switch (args.kind) {
    case "unresolved-host":
      return (
        `bb could not look up ${host}. Check the address for typos, and check ` +
        "that you are on the network where it resolves — a private or VPN-only " +
        "name does not resolve from other networks."
      );
    case "refused":
      return (
        `Nothing is listening at ${host}. Check that bb is running there and ` +
        "that the port is right."
      );
    case "offline":
      return `This Mac looks offline, so ${host} could not be reached. Reconnect to a network and try again.`;
    case "certificate":
      return `bb could not open a secure connection to ${host}: its certificate was rejected.`;
    case "timed-out":
      return `${host} did not respond in time. It may be behind a firewall or a VPN you are not connected to.`;
    case "not-a-bb-server":
      return `${host} responded, but it does not look like a bb server.`;
    case "unknown":
      return `bb could not connect to ${args.serverUrl}.`;
  }
}

/**
 * The in-app failure page for a remote server. The raw error keeps its place in
 * the log block: it is the diagnosis, but it is not the headline, and it is
 * never the whole message the user gets.
 */
export function createRemoteServerFailureView(
  args: DescribeRemoteServerFailureArgs,
): LocalViewModel {
  const host = formatServerHost(args.serverUrl);
  return {
    details: `${describeRemoteServerFailure(args)} ${RECOVERY_SENTENCE}`,
    kind: "error",
    logText: args.detail,
    title:
      args.kind === "not-a-bb-server"
        ? `${host} is not a bb server`
        : `Could not reach ${host}`,
  };
}

/** Failure page for an Electron navigation that never committed. */
export function createRemoteServerLoadFailureView(
  args: RemoteServerFailureViewArgs,
): LocalViewModel {
  return createRemoteServerFailureView({
    detail: args.detail,
    kind: classifyRemoteServerFailure(args.detail),
    serverUrl: args.serverUrl,
  });
}

/** Failure page for a probe that did not find a compatible bb server. */
export function createServerProbeFailureView(
  probe: Exclude<ServerProbeResult, { kind: "compatible" }>,
): LocalViewModel {
  return createRemoteServerFailureView({
    detail: probe.reason,
    kind:
      probe.kind === "incompatible"
        ? "not-a-bb-server"
        : classifyRemoteServerFailure(probe.reason),
    serverUrl: probe.serverUrl,
  });
}

/** The view shown while a remote server is being contacted. */
export function createConnectingView(serverUrl: string): LocalViewModel {
  return {
    kind: "loading",
    message: "Checking that the server is reachable.",
    title: `Connecting to ${formatServerHost(serverUrl)}…`,
  };
}
