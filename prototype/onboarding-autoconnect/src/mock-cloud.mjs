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

export function maskToken(token) {
  const trimmed = token.trim();
  if (trimmed.length <= 4) return "*".repeat(trimmed.length);
  return `${"*".repeat(Math.min(trimmed.length - 4, 12))}${trimmed.slice(-4)}`;
}

export async function registerExternalAgent(args) {
  const request = {
    displayName: args.displayName,
    kind: "external",
    endpointUrl: args.url,
    auth: { type: "bearer", token: maskToken(args.token) },
  };
  await roundTrip(args.fast);
  const providerId = `external-${args.displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")}`;
  return {
    request,
    response: {
      providerId,
      displayName: args.displayName,
      kind: "external",
      endpointUrl: args.url,
      status: "connected",
      credentialRef: `secret://${shortId("cred")}`,
    },
  };
}

export async function mintPairingToken(args) {
  await roundTrip(args.fast);
  const token = `bbpair_${randomUUID().replace(/-/gu, "").slice(0, 20)}`;
  return {
    token,
    expiresInMs: 15 * 60 * 1000,
    dialBackUrl: `https://${args.handle}.getbb.app/api/connect/agent-dial-back`,
    tailnetHint: args.magicDnsName,
  };
}

export function pairingInstructions(pairing, agentName) {
  return [
    `Run this where ${agentName} lives, or paste it into its console:`,
    "",
    `  bb-agent pair --token ${maskToken(pairing.token)} \\`,
    `             --dial-back ${pairing.dialBackUrl}`,
    "",
    "The token is single-use and expires in 15 minutes. It travels over your",
    "tailnet, so it is never exposed to the public internet.",
  ];
}

export async function awaitAgentDialBack(args) {
  await roundTrip(args.fast);
  await roundTrip(args.fast);
  const providerId = `paired-${args.displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")}`;
  return {
    providerId,
    displayName: args.displayName,
    kind: "paired",
    transport: "tailnet",
    peer: args.magicDnsName ?? "unknown-tailnet-peer",
    status: "connected",
    credentialRef: `secret://${shortId("cred")}`,
  };
}
