#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { banner, blank, note, say, style } from "./src/ui.mjs";
import { describeHost } from "./src/detect.mjs";
import {
  stepAccountFirstMachine,
  stepCompanionAgents,
  stepPersonalAgent,
  stepTailscale,
  summary,
} from "./src/steps.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const USAGE = `bb onboarding auto-connect prototype

Walks the four proposed setup steps end to end. Scripted by default, so the
output is a transcript you can paste into an issue.

Usage:
  node prototype/onboarding-autoconnect/demo.mjs [flags]
  pnpm dev:onboarding-proto -- [flags]

Flags:
  --interactive          Prompt at each offer instead of auto-answering.
  --shim-hermes          Prepend a fake \`hermes\` to PATH so step 2 has
                         something to detect on a machine without it.
  --tailscale=<mode>     auto (default) | missing | logged-out
                         Override step 3's real probe to demo the offer branch.
  --decline-all          Answer no to every offer (scripted mode only).
  --email=<address>      Account email shown in step 1. Default demo@example.com
  --handle=<handle>      Account handle. Default demo
  --fast                 Skip the simulated network latency.
  --help                 Print this.

Everything marked [REAL] is measured on this machine. Everything marked [MOCK]
is a fake service with a real request/response shape. See PROTOTYPE.md.
`;

function parseArgs(argv) {
  const options = {
    interactive: false,
    shimHermes: false,
    tailscale: "auto",
    declineAll: false,
    email: "demo@example.com",
    handle: "demo",
    fast: false,
  };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--") continue;
    if (arg === "--interactive") options.interactive = true;
    else if (arg === "--shim-hermes") options.shimHermes = true;
    else if (arg === "--decline-all") options.declineAll = true;
    else if (arg === "--fast") options.fast = true;
    else if (arg.startsWith("--tailscale=")) {
      const mode = arg.slice("--tailscale=".length);
      if (!["auto", "missing", "logged-out"].includes(mode)) {
        throw new Error(
          `--tailscale must be auto, missing, or logged-out (got "${mode}")`,
        );
      }
      options.tailscale = mode;
    } else if (arg.startsWith("--email=")) options.email = arg.slice(8);
    else if (arg.startsWith("--handle=")) options.handle = arg.slice(9);
    else throw new Error(`Unknown flag "${arg}"\n\n${USAGE}`);
  }
  return { help: false, options };
}

function createScriptedConfirm(answer) {
  return async (question) => {
    console.log(
      `   ${style.dim("?")} ${question} ${style.dim(`[scripted: ${answer ? "yes" : "no"}]`)}`,
    );
    return answer;
  };
}

function createInteractiveConfirm(rl) {
  const lines = rl[Symbol.asyncIterator]();
  return async (question) => {
    process.stdout.write(`   ? ${question} [Y/n] `);
    const next = await lines.next();
    if (next.done === true) {
      process.stdout.write("(stdin ended; taking the default)\n");
      return true;
    }
    if (process.stdin.isTTY !== true) process.stdout.write(`${next.value}\n`);
    return !next.value.trim().toLowerCase().startsWith("n");
  };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    console.log(USAGE);
    return;
  }
  const options = parsed.options;

  const env = options.shimHermes
    ? {
        ...process.env,
        PATH: `${join(HERE, "shims")}:${process.env.PATH ?? ""}`,
      }
    : process.env;

  const rl = options.interactive
    ? createInterface({ input: process.stdin, output: process.stdout })
    : null;

  const host = await describeHost();
  const ctx = {
    email: options.email,
    handle: options.handle,
    machineLabel: host.hostname.split(".")[0]?.toLowerCase() ?? "machine",
    host,
    env,
    fast: options.fast,
    tailscaleOverride: options.tailscale,
    projectId: "proj_demo_bb_src",
    environmentId: "env_demo_default",
    fallbackProviderId: "claude-code",
    confirm:
      rl === null
        ? createScriptedConfirm(!options.declineAll)
        : createInteractiveConfirm(rl),
  };

  banner(
    "bb onboarding auto-connect prototype",
    "Four proposed steps, run end to end. Prototype quality: mocked where a real service is out of scope.",
  );
  blank();
  say(
    `Mode: ${style.bold(options.interactive ? "interactive" : "scripted")}${options.shimHermes ? style.yellow("  (+ hermes shim on PATH)") : ""}`,
  );
  if (options.shimHermes) {
    note(
      `   ${style.yellow("--shim-hermes is active: the hermes that step 2 finds is a fake binary in prototype/onboarding-autoconnect/shims.")}`,
    );
  }

  try {
    const account = await stepAccountFirstMachine(ctx);
    const companions = await stepCompanionAgents(ctx);
    const tailscale = await stepTailscale(ctx);
    const personalAgent = await stepPersonalAgent(ctx, {
      account,
      companions,
      tailscale,
    });
    summary({ account, companions, tailscale, personalAgent });
  } finally {
    rl?.close();
  }
}

main().catch((error) => {
  console.error(`\n${style.red("Demo failed:")} ${error.message}`);
  process.exitCode = 1;
});
