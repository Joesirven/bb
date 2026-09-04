#!/usr/bin/env node
import { execFile } from "node:child_process";
import { hostname } from "node:os";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const OUTPUT = resolve(REPO_ROOT, "docs/onboarding-proto-demo.html");

const DEMO_ARGS = ["--shim-hermes", "--tailscale=missing"];

const PALETTE = {
  31: "#e2686f",
  32: "#7fb975",
  33: "#d9a441",
  34: "#5b9dd9",
  35: "#b07cc6",
  36: "#4fa8a8",
};

const REDACTIONS = [
  [hostname(), "workstation.local"],
  [hostname().split(".")[0], "workstation"],
  [REPO_ROOT, "/home/you/bb"],
];

function redact(text) {
  let out = text;
  for (const [from, to] of REDACTIONS) {
    if (from.length > 0) out = out.split(from).join(to);
  }
  return out;
}

function escapeHtml(text) {
  return text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}

function styleFor(state) {
  const parts = [];
  if (state.color !== null) parts.push(`color:${PALETTE[state.color]}`);
  if (state.bold) parts.push("font-weight:700");
  if (state.dim) parts.push("opacity:.62");
  return parts.join(";");
}

function applyCodes(state, codes) {
  for (const code of codes) {
    if (code === 0) {
      state.bold = false;
      state.dim = false;
      state.color = null;
    } else if (code === 1) state.bold = true;
    else if (code === 2) state.dim = true;
    else if (code === 22) {
      state.bold = false;
      state.dim = false;
    } else if (code === 39) state.color = null;
    else if (PALETTE[code] !== undefined) state.color = code;
  }
}

function ansiToHtml(input) {
  const pattern = new RegExp(`${String.fromCharCode(27)}\\[([0-9;]*)m`, "gu");
  const state = { bold: false, dim: false, color: null };
  let html = "";
  let cursor = 0;

  const emit = (text) => {
    if (text.length === 0) return;
    const escaped = escapeHtml(text);
    const css = styleFor(state);
    html += css === "" ? escaped : `<span style="${css}">${escaped}</span>`;
  };

  for (const match of input.matchAll(pattern)) {
    emit(input.slice(cursor, match.index));
    const codes = (match[1] === "" ? "0" : match[1])
      .split(";")
      .map((part) => Number.parseInt(part, 10))
      .filter((value) => Number.isFinite(value));
    applyCodes(state, codes);
    cursor = match.index + match[0].length;
  }
  emit(input.slice(cursor));
  return html;
}

function page(body, commandLine) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>bb onboarding auto-connect prototype — demo run</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0;
    padding: 2.5rem 1.25rem 4rem;
    background: #14161b;
    color: #d5d8de;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    line-height: 1.55;
  }
  main { max-width: 62rem; margin: 0 auto; }
  h1 { font-size: 1.45rem; margin: 0 0 .35rem; color: #f0f2f5; }
  p.lede { margin: 0 0 1.5rem; color: #9aa1ad; max-width: 48rem; }
  .cmd {
    display: block;
    background: #0e1014;
    border: 1px solid #2a2e37;
    border-radius: .4rem;
    padding: .65rem .85rem;
    margin: 0 0 1.5rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: .85rem;
    color: #9fc7ea;
    overflow-x: auto;
  }
  .legend { display: flex; flex-wrap: wrap; gap: 1.1rem; margin: 0 0 1.5rem; font-size: .85rem; }
  .legend span.tag {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-weight: 700;
  }
  .legend .real { color: #7fb975; }
  .legend .mock { color: #d9a441; }
  .term {
    background: #0e1014;
    border: 1px solid #2a2e37;
    border-radius: .5rem;
    padding: 1.15rem 1.35rem;
    overflow-x: auto;
  }
  .term pre {
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: .8rem;
    line-height: 1.5;
    color: #d5d8de;
    white-space: pre;
  }
  footer { margin: 2rem 0 0; font-size: .82rem; color: #7f8794; max-width: 48rem; }
  footer code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: #9aa1ad;
  }
</style>
</head>
<body>
<main>
  <h1>bb onboarding auto-connect prototype</h1>
  <p class="lede">
    One scripted run of the proposed four-step setup flow, captured from a real
    terminal. Nothing on this page is a screenshot: it is the demo's own output,
    with its colors converted to markup.
  </p>
  <code class="cmd">${escapeHtml(commandLine)}</code>
  <div class="legend">
    <div><span class="tag real">[REAL]</span> measured on the machine that ran the demo</div>
    <div><span class="tag mock">[MOCK]</span> fake service, real request/response shape</div>
  </div>
  <div class="term"><pre>${body}</pre></div>
  <footer>
    Regenerate with
    <code>node prototype/onboarding-autoconnect/render-demo-html.mjs</code>,
    then <code>pnpm format</code>.
    The machine name and checkout path are replaced with
    <code>workstation.local</code> and <code>/home/you/bb</code>; nothing else
    is edited. See <code>PROTOTYPE.md</code> for what is real, what is mocked,
    and why.
  </footer>
</main>
</body>
</html>
`;
}

const { stdout } = await run(process.execPath, ["demo.mjs", ...DEMO_ARGS], {
  cwd: HERE,
  env: { ...process.env, FORCE_COLOR: "1", NO_COLOR: undefined },
  maxBuffer: 8 * 1024 * 1024,
});

const commandLine = `node prototype/onboarding-autoconnect/demo.mjs ${DEMO_ARGS.join(" ")}`;
const html = page(ansiToHtml(redact(stdout)).replace(/^\n+/u, ""), commandLine);
await writeFile(OUTPUT, html, "utf8");
console.log(
  `Wrote ${OUTPUT} (${html.length} bytes). Run \`pnpm format\` to reindent it.`,
);
