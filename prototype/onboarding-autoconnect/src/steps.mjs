import {
  banner,
  blank,
  command,
  contrast,
  json,
  mock,
  no,
  note,
  ok,
  real,
  rule,
  say,
  stepHeader,
  style,
} from "./ui.mjs";
import {
  detectCompanionAgents,
  detectTailscale,
  loggedOutTailscaleState,
  missingTailscaleState,
} from "./detect.mjs";
import {
  connectAcpAgent,
  listAccountServers,
  mintMachineCode,
  planTailscaleSetup,
  redeemMachineCode,
  registerPersonalAgent,
  signInWithGetbbAccount,
} from "./mock-cloud.mjs";

const TOTAL_STEPS = 4;

export async function stepAccountFirstMachine(ctx) {
  stepHeader(1, TOTAL_STEPS, "Account-first machine adding");

  contrast(
    [
      "Open the getbb.app dashboard in a browser.",
      "Copy a join code AND a server URL out of the page.",
      "Paste both into the terminal on the new machine:",
      "  bb connect --code <code> --server https://<handle>.getbb.app",
      "A typo in the URL fails after the install script has already run.",
    ],
    [
      "Sign in to your getbb account from the setup step.",
      "bb mints and redeems the machine code for you.",
      "The server URL comes from the account - never typed by hand.",
      "The machine shows up under the account before the step ends.",
    ],
  );

  say(`Signing in as ${style.bold(ctx.email)} ...`);
  const session = await signInWithGetbbAccount({
    email: ctx.email,
    handle: ctx.handle,
    fast: ctx.fast,
  });
  mock("getbb.app account sign-in (no such endpoint in bb today)");
  ok(
    `Signed in. Account resolved its own server URL: ${style.bold(session.serverUrl)}`,
  );
  blank();

  say("Minting a machine code for this host, on the account's behalf ...");
  const machineCode = await mintMachineCode({ session, fast: ctx.fast });
  mock("POST /api/connect/machine-code");
  note(
    "shape from plugins/connect/src/machine-code.ts: { code, expiresInMs, serverUrl }",
  );
  json("response", {
    code: machineCode.code,
    expiresInMs: machineCode.expiresInMs,
    serverUrl: machineCode.serverUrl,
  });
  blank();

  say("Redeeming it for a durable tunnel credential ...");
  const credential = await redeemMachineCode({
    session,
    code: machineCode.code,
    fast: ctx.fast,
  });
  mock("POST /api/connect/redeem");
  note("shape from plugins/connect/src/redeem.ts: { credential, handle }");
  ok("Machine paired. The user typed a password, not a URL.");
  blank();

  real(
    `This host is ${style.bold(ctx.host.hostname)} (${ctx.host.platform}/${ctx.host.arch}, node ${ctx.host.nodeVersion})`,
  );
  say(
    "Reading the account's machine list back, the way the dashboard would ...",
  );
  const servers = await listAccountServers({
    session,
    machineLabel: ctx.machineLabel,
    machineName: ctx.host.hostname,
    fast: ctx.fast,
  });
  mock("connect.listAccountServers RPC");
  note("shape from plugins/connect/src/rpc.ts");
  blank();
  say(style.bold("Machines on this account"));
  for (const server of servers.servers) {
    const isNew = server.name === ctx.host.hostname;
    const marker = isNew ? style.green("NEW ->") : style.dim("      ");
    console.log(
      `     ${marker} ${server.name.padEnd(38)} ${style.dim(server.url)} ${server.live ? style.green("live") : style.dim("offline")}`,
    );
  }
  blank();
  ok("The machine the user is standing at is now on their account.");

  return { session, credential, servers, machineCode };
}

export async function stepCompanionAgents(ctx) {
  stepHeader(2, TOTAL_STEPS, "Companion-agent detection");

  say("Probing PATH for known Agent Client Protocol agents ...");
  command("which hermes");
  command("which instinct");
  blank();

  const agents = await detectCompanionAgents({ env: ctx.env });
  for (const agent of agents) {
    if (agent.installed) {
      real(`${style.bold(agent.displayName)} found at ${agent.executablePath}`);
    } else {
      no(`${agent.displayName} not on PATH`);
    }
    note(`   provider id ${agent.id} - ${agent.registrySource}`);
    if (agent.proposed) {
      note(
        `   ${style.yellow("this agent is a proposal; bb has no acp-instinct provider today")}`,
      );
    }
  }
  blank();

  const detected = agents.filter((agent) => agent.installed);
  if (detected.length === 0) {
    note(
      "Nothing on PATH, so this step would show nothing. Re-run with --shim-hermes to see the offer.",
    );
    return { agents, connected: [] };
  }

  const connected = [];
  for (const agent of detected) {
    rule();
    say(
      `${style.bold("Offer:")} "${agent.displayName} is installed on this machine. Connect it to bb?"`,
    );
    const accepted = await ctx.confirm(
      `Connect ${agent.displayName} over the Agent Client Protocol?`,
    );
    if (!accepted) {
      note("Declined. Setup continues; the agent stays available later.");
      continue;
    }
    command(`${agent.command} ${agent.args.join(" ")}`);
    const provider = await connectAcpAgent({ agent, fast: ctx.fast });
    mock("Agent Client Protocol handshake (real bb runs this over stdio)");
    json("provider registered", provider);
    ok(`${agent.displayName} is now a usable provider: ${provider.providerId}`);
    connected.push(provider);
  }

  return { agents, connected };
}

export async function stepTailscale(ctx) {
  stepHeader(
    3,
    TOTAL_STEPS,
    "Tailscale offer - reachable from phone and laptop",
  );

  say("Detecting Tailscale on this machine ...");
  command("which tailscale");
  command("tailscale status --json");
  blank();

  const probed = await detectTailscale({ env: ctx.env });
  let detection = probed;
  if (ctx.tailscaleOverride !== "auto") {
    detection =
      ctx.tailscaleOverride === "missing"
        ? missingTailscaleState()
        : loggedOutTailscaleState(probed);
    mock(
      `--tailscale=${ctx.tailscaleOverride} overrides the real probe so the offer branch is demoable on a machine that is already set up`,
    );
    note(
      `   real probe said: installed=${probed.installed} backendState=${probed.backendState ?? "null"}`,
    );
  }

  if (detection.installed) {
    real(`tailscale binary at ${detection.executablePath}`);
    real(`BackendState = ${detection.backendState ?? "unknown"}`);
    if (detection.loggedIn) {
      real(`tailnet ${detection.tailnetName ?? "unknown"}`);
      real(`MagicDNS name ${detection.magicDnsName ?? "unknown"}`);
    }
  } else {
    no("tailscale is not on PATH");
  }
  blank();

  const plan = planTailscaleSetup(detection);
  if (plan.action === "none") {
    ok(`Nothing to offer: ${plan.reason}.`);
    say(
      `bb can point straight at ${style.bold(`http://${detection.magicDnsName ?? "<magic-dns-name>"}:38886`)} from a phone on the same tailnet.`,
    );
    return { detection, plan, accepted: false, executed: false };
  }

  say(
    `${style.bold("Offer:")} "This machine is not reachable from your phone yet. Set up Tailscale?"`,
  );
  note(`   ${plan.reason}`);
  const accepted = await ctx.confirm("Set up Tailscale now?");
  if (!accepted) {
    note("Declined. Setup continues; bb stays reachable on localhost only.");
    return { detection, plan, accepted: false, executed: false };
  }

  say("Would run:");
  for (const line of plan.commands) command(line);
  mock("install / login is NOT executed - this is a dry run");
  note(
    "   A shipped version would run these in a pty and stream the output, the",
  );
  note("   way bb already streams managed provider-CLI installs.");
  ok("Dry run complete.");

  return { detection, plan, accepted: true, executed: false };
}

export async function stepPersonalAgent(ctx, previous) {
  stepHeader(4, TOTAL_STEPS, "Personal-agent registration");

  const provider =
    previous.companions.connected[0]?.providerId ?? ctx.fallbackProviderId;
  say(
    `Registering a persistent personal agent on provider ${style.bold(provider)} ...`,
  );
  if (previous.companions.connected.length > 0) {
    note("   provider carried over from the agent connected in step 2");
  } else {
    note(
      `   no companion agent was connected in step 2, so falling back to ${ctx.fallbackProviderId}`,
    );
  }
  blank();

  const accepted = await ctx.confirm(
    "Create a persistent personal agent for this bb?",
  );
  if (!accepted) {
    note("Declined. The user can create one later from the app.");
    return { registered: false };
  }

  const result = await registerPersonalAgent({
    projectId: ctx.projectId,
    environmentId: ctx.environmentId,
    providerId: provider,
    title: "Personal agent",
    systemPrompt:
      "You are the personal agent for this bb. You persist across sessions and are reachable from any device on this account.",
    serverUrl: previous.account.session.serverUrl,
    fast: ctx.fast,
  });
  mock("POST /api/v1/threads");
  note(
    "   request body is a real createThreadRequestSchema shape, checked by check-contract.mts",
  );
  json("request", result.request);
  json("response", result.response);
  ok(`Personal agent registered: ${result.response.threadId}`);
  say(
    `Reachable at ${style.bold(result.response.url)} from any device signed in to the account.`,
  );

  return { registered: true, ...result };
}

export function summary(results) {
  banner("Flow complete", "What the user got, without typing a server URL");
  blank();
  const lines = [
    [
      "1  Machine on the account",
      results.account.servers.servers.at(-1)?.url ?? "-",
    ],
    [
      "2  Companion agents connected",
      results.companions.connected.length > 0
        ? results.companions.connected.map((p) => p.providerId).join(", ")
        : "none (nothing detected or offer declined)",
    ],
    [
      "3  Reachable from phone",
      results.tailscale.plan.action === "none"
        ? `yes - ${results.tailscale.detection.magicDnsName ?? "tailnet"}`
        : results.tailscale.accepted
          ? `offered and accepted (dry run: ${results.tailscale.plan.action})`
          : `offered, declined (${results.tailscale.plan.action})`,
    ],
    [
      "4  Personal agent",
      results.personalAgent.registered
        ? results.personalAgent.response.threadId
        : "declined",
    ],
  ];
  for (const [label, value] of lines) {
    console.log(`   ${style.bold(label.padEnd(32))} ${value}`);
  }
  blank();
  rule();
  note(
    "   [REAL] lines above were measured on this machine. [MOCK] lines are fake",
  );
  note(
    "   services with real request/response shapes. See PROTOTYPE.md for the split.",
  );
  blank();
}
