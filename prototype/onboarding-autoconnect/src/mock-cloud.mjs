import { randomUUID } from "node:crypto";

const LATENCY_MS = 260;

async function roundTrip(fast) {
  if (fast === true) return;
  await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
}

function shortId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/gu, "").slice(0, 12)}`;
}

export async function signInWithGetbbAccount(args) {
  await roundTrip(args.fast);
  return {
    accountId: shortId("acct"),
    email: args.email,
    handle: args.handle,
    serverUrl: `https://${args.handle}.getbb.app`,
    sessionToken: `mock-session-${shortId("tok")}`,
  };
}

export async function mintMachineCode(args) {
  await roundTrip(args.fast);
  return {
    code: randomUUID().replace(/-/gu, "").slice(0, 10).toUpperCase(),
    expiresInMs: 10 * 60 * 1000,
    serverUrl: args.session.serverUrl,
  };
}

export async function redeemMachineCode(args) {
  await roundTrip(args.fast);
  return {
    credential: `mock-connect-credential-${shortId("cred")}`,
    handle: args.session.handle,
  };
}

export async function listAccountServers(args) {
  await roundTrip(args.fast);
  const selfHandle = args.session.handle;
  return {
    selfHandle,
    servers: [
      {
        handle: selfHandle,
        name: "macbook-pro (already on the account)",
        live: true,
        url: `https://${selfHandle}.getbb.app`,
      },
      {
        handle: `${selfHandle}-${args.machineLabel}`,
        name: args.machineName,
        live: true,
        url: `https://${selfHandle}-${args.machineLabel}.getbb.app`,
      },
    ],
  };
}

export async function connectAcpAgent(args) {
  await roundTrip(args.fast);
  return {
    providerId: args.agent.id,
    displayName: args.agent.displayName,
    kind: "acp",
    launch: { command: args.agent.command, args: args.agent.args },
    executablePath: args.agent.executablePath,
    signInCommand: args.agent.signInCommand ?? null,
    status: "connected",
  };
}

export function planTailscaleSetup(detection) {
  if (!detection.installed) {
    return {
      action: "install-and-login",
      commands: [
        "curl -fsSL https://tailscale.com/install.sh | sh",
        "sudo tailscale up --ssh",
      ],
      reason: "tailscale is not on PATH",
    };
  }
  if (!detection.loggedIn) {
    return {
      action: "login",
      commands: ["sudo tailscale up --ssh"],
      reason: `tailscale is installed but BackendState is ${detection.backendState ?? "unknown"}`,
    };
  }
  return {
    action: "none",
    commands: [],
    reason: "tailscale is installed and this machine is already on a tailnet",
  };
}

export async function registerPersonalAgent(args) {
  const request = {
    projectId: args.projectId,
    providerId: args.providerId,
    origin: "app",
    visibility: "visible",
    title: args.title,
    input: [{ type: "text", text: args.systemPrompt, mentions: [] }],
    environment: { type: "reuse", environmentId: args.environmentId },
    startedOnBehalfOf: null,
    originKind: null,
  };
  await roundTrip(args.fast);
  const threadId = shortId("thr");
  return {
    request,
    response: {
      threadId,
      projectId: args.projectId,
      providerId: args.providerId,
      title: args.title,
      status: "idle",
      url: `${args.serverUrl}/threads/${threadId}`,
    },
  };
}
