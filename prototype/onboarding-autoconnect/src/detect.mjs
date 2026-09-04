import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const PROBE_TIMEOUT_MS = 5_000;

export async function whichExecutable(executableName, options = {}) {
  const env = options.env ?? process.env;
  const lookup = process.platform === "win32" ? "where" : "which";
  try {
    const { stdout } = await run(lookup, [executableName], {
      timeout: PROBE_TIMEOUT_MS,
      env,
    });
    const first =
      stdout.split(/\r?\n/u).find((line) => line.trim().length > 0) ?? "";
    return first.trim().length > 0 ? first.trim() : null;
  } catch {
    return null;
  }
}

export const COMPANION_AGENTS = [
  {
    id: "acp-hermes-agent",
    displayName: "Hermes Agent",
    executableName: "hermes",
    command: "hermes",
    args: ["acp"],
    signInCommand: "hermes login",
    registrySource: "plugins/provider-acp/src/known-agents.ts (shipped)",
  },
];

export async function detectCompanionAgents(options = {}) {
  const resolved = await Promise.all(
    COMPANION_AGENTS.map(async (agent) => ({
      ...agent,
      executablePath: await whichExecutable(agent.executableName, options),
    })),
  );
  return resolved.map((agent) => ({
    ...agent,
    installed: agent.executablePath !== null,
  }));
}

const TAILSCALE_NOT_INSTALLED = {
  installed: false,
  executablePath: null,
  backendState: null,
  loggedIn: false,
  tailnetName: null,
  magicDnsName: null,
};

export async function detectTailscale(options = {}) {
  const env = options.env ?? process.env;
  const executablePath = await whichExecutable("tailscale", { env });
  if (executablePath === null) return { ...TAILSCALE_NOT_INSTALLED };

  let status = null;
  try {
    const { stdout } = await run("tailscale", ["status", "--json"], {
      timeout: PROBE_TIMEOUT_MS,
      env,
      maxBuffer: 8 * 1024 * 1024,
    });
    status = JSON.parse(stdout);
  } catch {
    status = null;
  }

  const backendState =
    typeof status?.BackendState === "string" ? status.BackendState : null;

  return {
    installed: true,
    executablePath,
    backendState,
    loggedIn: backendState === "Running",
    tailnetName:
      typeof status?.CurrentTailnet?.Name === "string"
        ? status.CurrentTailnet.Name
        : null,
    magicDnsName:
      typeof status?.Self?.DNSName === "string"
        ? status.Self.DNSName.replace(/\.$/u, "")
        : null,
  };
}

export function loggedOutTailscaleState(detection) {
  return { ...detection, backendState: "NeedsLogin", loggedIn: false };
}

export function missingTailscaleState() {
  return { ...TAILSCALE_NOT_INSTALLED };
}

export async function describeHost() {
  const os = await import("node:os");
  return {
    hostname: os.hostname(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
  };
}
