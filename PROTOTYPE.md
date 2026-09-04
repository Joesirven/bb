# Onboarding auto-connect prototype

A runnable prototype of a proposed bb onboarding flow: sign in once with your
getbb account, and let bb do the four things a new machine needs instead of
asking you to type a server URL.

This backs a feature request against [get-bb/bb](https://github.com/get-bb/bb).
It is **prototype quality**: it runs end to end and demonstrates the flow, but
every service call is mocked and nothing here is wired into the real app. The
diff is additive; no existing file changes except one added script in
`package.json`.

## Run it

```sh
node prototype/onboarding-autoconnect/demo.mjs --shim-hermes --tailscale=missing
```

or, through the repo's package manager:

```sh
pnpm dev:onboarding-proto -- --shim-hermes --tailscale=missing
```

No `pnpm install` is required. The demo is dependency-free Node (the repo
requires Node >= 22.19.0), lives outside the pnpm workspace, and touches
nothing but `which`, `tailscale status --json`, and stdout.

### Flags

| Flag                                    | Effect                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `--interactive`                         | Prompt at each offer instead of auto-answering. Works with a terminal or piped stdin.                                                      |
| `--shim-hermes`                         | Prepend a fake `hermes` to `PATH` so step 2 finds something on a machine that has no Hermes Agent. Always labelled in the output.          |
| `--tailscale=auto\|missing\|logged-out` | `auto` (default) uses the real probe. The other two override it so the offer branch is demoable on a machine that is already on a tailnet. |
| `--decline-all`                         | Answer no to every offer (scripted mode).                                                                                                  |
| `--email=`, `--handle=`                 | Account identity shown in step 1.                                                                                                          |
| `--fast`                                | Skip the simulated network latency.                                                                                                        |
| `--help`                                | Usage.                                                                                                                                     |

The two suggested runs:

```sh
# The full happy path, on a machine that has neither Hermes nor Tailscale.
node prototype/onboarding-autoconnect/demo.mjs --shim-hermes --tailscale=missing

# What the flow does on a machine that is already set up: real probes, no offers.
node prototype/onboarding-autoconnect/demo.mjs
```

## The four steps

### 1. Account-first machine adding

Today, adding a machine means carrying a server URL by hand. The
`AddMachineDialog` prints
`curl -fL ... <serverUrl>/install.sh | sh -s -- --join-code <code> --host-id <id> --server <serverUrl>`
(`apps/app/src/components/dialogs/AddMachineDialog.tsx`), and the getbb.app
dashboard prints `bb connect --code <code> --server https://<handle>.getbb.app`
(`plugins/connect/src/cli.ts`). The server URL is something the account already
knows; the human is being used as a clipboard.

The prototype signs in to the account first, then mints and redeems the machine
code on the account's behalf, and reads the machine list back so the user sees
their new machine land next to the ones they already had.

### 2. Companion-agent detection

bb already knows how to run Hermes Agent: `acp-hermes-agent` is a registered
Agent Client Protocol provider in `plugins/provider-acp/src/known-agents.ts`
(added upstream in PR #552), launched as `hermes acp`, and already marked
`visibility: "installed"` so bb only surfaces it where it is present. bb also
already resolves agent executables on `PATH` (`resolveExecutablePath` in
`packages/provider-bridge-protocol/src/bridge-kit/provider-maintenance-kit.ts`).
What is missing is the first-run moment that puts the two together. This step
probes `PATH` and offers a one-click connect for anything it finds.

`instinct` is also probed. **It is not a bb provider today** — there is no
`acp-instinct` in the registry. The demo marks it `proposed` and says so on
every run rather than implying bb already ships it.

### 3. Tailscale offer

Step 1 puts the machine on the account; being reachable from a phone is a
separate problem. bb's own documentation already reaches for Tailscale
(`docs/multiple-devices.md` suggests `tailscale serve --bg --https=443
http://127.0.0.1:38886`), which means the flow currently depends on a doc the
new user has not read yet. This step detects the state during onboarding and
offers the fix.

Detection is real and distinguishes two cases that need different offers:
`which tailscale` for presence, and `tailscale status --json` for
`BackendState` (`Running` means logged in; `NeedsLogin` / `Stopped` mean
installed but unusable).

### 4. Personal-agent registration

The proposal is that a new bb comes with one persistent agent that is yours,
reachable from any device from minute one. bb has no "personal agent" concept
today, so the prototype models it as the closest thing bb does have: a
long-lived visible thread created against a project and environment.

## What is real vs mocked

**Real — actually measured on the machine you run it on:**

- `which hermes` / `which instinct` companion-agent detection, using the same
  probe shape bb uses (`which`, or `where` on Windows, five second timeout,
  first non-empty line).
- `which tailscale` and `tailscale status --json`, including parsing
  `BackendState`, the tailnet name, and the MagicDNS name.
- Host facts: hostname, platform, architecture, Node version.
- The Hermes Agent registry entry (id, display name, `hermes acp` launch spec)
  is copied verbatim from the shipped registry.

**Mocked — no network call leaves the machine:**

| Mocked                           | Real shape it mirrors                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| getbb.app account sign-in        | **Nothing.** This endpoint does not exist in bb today; it is what the feature request asks for.                                 |
| `POST /api/connect/machine-code` | `machineCodeResponseSchema` in `plugins/connect/src/machine-code.ts`                                                            |
| `POST /api/connect/redeem`       | `RedeemedCredential` in `plugins/connect/src/redeem.ts`                                                                         |
| `connect.listAccountServers`     | `listAccountServersResultSchema` in `plugins/connect/src/rpc.ts`                                                                |
| Agent Client Protocol handshake  | Real bb launches `hermes acp` over stdio through the ACP bridge                                                                 |
| Tailscale install / login        | Dry run only. The commands are printed, never executed.                                                                         |
| `POST /api/v1/threads`           | `createThreadRequestSchema` in `packages/server-contract/src/api/threads.ts` — the mocked body is checked against it, see below |

Two more things to be clear about:

- The `hermes` that `--shim-hermes` puts on `PATH` is a stub shell script in
  `prototype/onboarding-autoconnect/shims/hermes`. It is not Hermes Agent. The
  detection finding it is genuine; what it finds is fake.
- `--tailscale=missing` and `--tailscale=logged-out` override the real probe.
  When they are used, the demo prints what the real probe actually said.

### The payload check

The one mocked payload with a real schema behind it is checked rather than
asserted:

```sh
node --conditions=source --import tsx prototype/onboarding-autoconnect/check-contract.mts
# -> Mocked thread-create payload matches createThreadRequestSchema.
```

That command is the only part of this prototype that needs `pnpm install`,
because it imports the real workspace schema. The demo itself does not.

## Layout

```
prototype/onboarding-autoconnect/
  demo.mjs             entry point: flags, mode, step order
  check-contract.mts   validates the mocked thread payload against the real schema
  src/ui.mjs           terminal formatting; the [REAL] / [MOCK] labels
  src/detect.mjs       REAL host detection (PATH probes, tailscale status)
  src/mock-cloud.mjs   MOCK getbb.app + bb server API, with real payload shapes
  src/steps.mjs        the four steps
  shims/hermes         fake `hermes` binary for the demo
```

## Design notes

This repo forbids code comments (`bb/no-comments` in `.oxlintrc.json`, and
`AGENTS.md`), so the provenance that would normally sit above each function is
here instead.

**`src/detect.mjs`** — `whichExecutable` mirrors bb's own probe,
`resolveExecutablePath` in
`packages/provider-bridge-protocol/src/bridge-kit/provider-maintenance-kit.ts`:
shell out to `which` (`where` on Windows), five second timeout, take the first
non-empty line, treat any failure as "not installed". Treating a failed probe
as absence is the conservative choice — the flow then offers to install rather
than claiming an agent that cannot run.

The Hermes Agent entry in `COMPANION_AGENTS` is copied from the real registry:
id `acp-hermes-agent`, launch `hermes acp`, sign-in command `hermes login`. The
registry already marks it `visibility: "installed"`, so bb only surfaces it
where it is present — which is the same signal this step needs.

`detectTailscale` reads `BackendState` from `tailscale status --json` because
presence alone does not tell you whether the machine is reachable. `Running`
means logged in; `NeedsLogin` and `Stopped` mean installed but unusable, and
those two cases need different offers. `tailscale status` can exit non-zero
while still being informative, so a parse failure is read as "installed, not
logged in".

**`src/mock-cloud.mjs`** — every function is fake and no network call leaves
the machine. The request and response shapes are copied from real code so the
flow can be checked against the contracts it would have to fit; see the table
above for the file each one mirrors. `signInWithGetbbAccount` is the exception
with no upstream counterpart, because it is the endpoint this feature request
is asking for.

**`shims/hermes`** — a stub that answers `--version` and refuses `acp`, since
the prototype mocks the protocol handshake rather than running one.

**`demo.mjs`** — the interactive confirm pulls from a single line iterator
rather than `readline.question()`, so `printf 'y\nn\n' | ... --interactive`
works; `question()` rejects with "readline was closed" once a pipe has reached
EOF, while the iterator still yields the lines that arrived before it.

## Not done

This is a demo of a flow, not an implementation of it. Not included: any UI,
any server route, any host daemon command, any persistence, and any test
coverage.

Worth stating plainly: **there is no onboarding flow in `main` for this to plug
into.** The previous first-run flow was deleted in
[#2001](https://github.com/get-bb/bb/pull/2001) ("Delete the newOnboarding
experiment and the first-run flow"), so this prototype describes a flow that
would have to be built, not a step list to be inserted into an existing one.
The nearest shipped surfaces are `AddMachineDialog` and
`ProjectMachineSetupDialog`.

Wiring this into the product would also need a real account sign-in endpoint on
getbb.app. That is the load-bearing unknown: everything else in step 1 already
exists as an endpoint.

## Transcript

`node prototype/onboarding-autoconnect/demo.mjs --shim-hermes --tailscale=missing --email=you@example.com --handle=you`

This is a real run. The machine name and the checkout path have been replaced
with `demo-laptop.local` and `/home/you/bb`; nothing else is edited.

```

## bb onboarding auto-connect prototype
   Four proposed steps, run end to end. Prototype quality: mocked where a real service is out of scope.

   Mode: scripted  (+ hermes shim on PATH)
      --shim-hermes is active: the hermes that step 2 finds is a fake binary in prototype/onboarding-autoconnect/shims.

┌──────────────────────────────────────────────────────────────────────────┐
│ STEP 1/4  Account-first machine adding                                   │
└──────────────────────────────────────────────────────────────────────────┘

   Today
     - Open the getbb.app dashboard in a browser.
     - Copy a join code AND a server URL out of the page.
     - Paste both into the terminal on the new machine:
     -   bb connect --code <code> --server https://<handle>.getbb.app
     - A typo in the URL fails after the install script has already run.
   This prototype
     + Sign in to your getbb account from the setup step.
     + bb mints and redeems the machine code for you.
     + The server URL comes from the account - never typed by hand.
     + The machine shows up under the account before the step ends.

   Signing in as you@example.com ...
   [MOCK] getbb.app account sign-in (no such endpoint in bb today)
   PASS Signed in. Account resolved its own server URL: https://you.getbb.app

   Minting a machine code for this host, on the account's behalf ...
   [MOCK] POST /api/connect/machine-code
   shape from plugins/connect/src/machine-code.ts: { code, expiresInMs, serverUrl }
   response
     {
       "code": "6BBF2122D3",
       "expiresInMs": 600000,
       "serverUrl": "https://you.getbb.app"
     }

   Redeeming it for a durable tunnel credential ...
   [MOCK] POST /api/connect/redeem
   shape from plugins/connect/src/redeem.ts: { credential, handle }
   PASS Machine paired. The user typed a password, not a URL.

   [REAL] This host is demo-laptop.local (linux/x64, node v24.19.0)
   Reading the account's machine list back, the way the dashboard would ...
   [MOCK] connect.listAccountServers RPC
   shape from plugins/connect/src/rpc.ts

   Machines on this account
            macbook-pro (already on the account)   https://you.getbb.app live
     NEW -> demo-laptop.local             https://you-demo-laptop.getbb.app live

   PASS The machine the user is standing at is now on their account.

┌──────────────────────────────────────────────────────────────────────────┐
│ STEP 2/4  Companion-agent detection                                      │
└──────────────────────────────────────────────────────────────────────────┘
   Probing PATH for known Agent Client Protocol agents ...
   $ which hermes
   $ which instinct

   [REAL] Hermes Agent found at /home/you/bb/prototype/onboarding-autoconnect/shims/hermes
      provider id acp-hermes-agent - plugins/provider-acp/src/known-agents.ts (shipped)
   MISS Instinct not on PATH
      provider id acp-instinct - proposed by this feature request (not in bb today)
      this agent is a proposal; bb has no acp-instinct provider today

   ----------------------------------------------------------------------
   Offer: "Hermes Agent is installed on this machine. Connect it to bb?"
   ? Connect Hermes Agent over the Agent Client Protocol? [scripted: yes]
   $ hermes acp
   [MOCK] Agent Client Protocol handshake (real bb runs this over stdio)
   provider registered
     {
       "providerId": "acp-hermes-agent",
       "displayName": "Hermes Agent",
       "kind": "acp",
       "launch": {
         "command": "hermes",
         "args": [
           "acp"
         ]
       },
       "executablePath": "/home/you/bb/prototype/onboarding-autoconnect/shims/hermes",
       "signInCommand": "hermes login",
       "status": "connected"
     }
   PASS Hermes Agent is now a usable provider: acp-hermes-agent

┌──────────────────────────────────────────────────────────────────────────┐
│ STEP 3/4  Tailscale offer - reachable from phone and laptop              │
└──────────────────────────────────────────────────────────────────────────┘
   Detecting Tailscale on this machine ...
   $ which tailscale
   $ tailscale status --json

   [MOCK] --tailscale=missing overrides the real probe so the offer branch is demoable on a machine that is already set up
      real probe said: installed=true backendState=Running
   MISS tailscale is not on PATH

   Offer: "This machine is not reachable from your phone yet. Set up Tailscale?"
      tailscale is not on PATH
   ? Set up Tailscale now? [scripted: yes]
   Would run:
   $ curl -fsSL https://tailscale.com/install.sh | sh
   $ sudo tailscale up --ssh
   [MOCK] install / login is NOT executed - this is a dry run
      A shipped version would run these in a pty and stream the output, the
      way bb already streams managed provider-CLI installs.
   PASS Dry run complete.

┌──────────────────────────────────────────────────────────────────────────┐
│ STEP 4/4  Personal-agent registration                                    │
└──────────────────────────────────────────────────────────────────────────┘
   Registering a persistent personal agent on provider acp-hermes-agent ...
      provider carried over from the agent connected in step 2

   ? Create a persistent personal agent for this bb? [scripted: yes]
   [MOCK] POST /api/v1/threads
      request body is a real createThreadRequestSchema shape, checked by check-contract.mts
   request
     {
       "projectId": "proj_demo_bb_src",
       "providerId": "acp-hermes-agent",
       "origin": "app",
       "visibility": "visible",
       "title": "Personal agent",
       "input": [
         {
           "type": "text",
           "text": "You are the personal agent for this bb. You persist across sessions and are reachable from any device on this account.",
           "mentions": []
         }
       ],
       "environment": {
         "type": "reuse",
         "environmentId": "env_demo_default"
       },
       "startedOnBehalfOf": null,
       "originKind": null
     }
   response
     {
       "threadId": "thr_186174a1d769",
       "projectId": "proj_demo_bb_src",
       "providerId": "acp-hermes-agent",
       "title": "Personal agent",
       "status": "idle",
       "url": "https://you.getbb.app/threads/thr_186174a1d769"
     }
   PASS Personal agent registered: thr_186174a1d769
   Reachable at https://you.getbb.app/threads/thr_186174a1d769 from any device signed in to the account.

## Flow complete
   What the user got, without typing a server URL

   1  Machine on the account        https://you-demo-laptop.getbb.app
   2  Companion agents connected    acp-hermes-agent
   3  Reachable from phone          offered and accepted (dry run: install-and-login)
   4  Personal agent                thr_186174a1d769

   ----------------------------------------------------------------------
      [REAL] lines above were measured on this machine. [MOCK] lines are fake
      services with real request/response shapes. See PROTOTYPE.md for the split.
```
