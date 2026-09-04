const forceColor = process.env.FORCE_COLOR;

const useColor =
  process.env.NO_COLOR === undefined &&
  (process.stdout.isTTY === true ||
    (forceColor !== undefined && forceColor !== "" && forceColor !== "0"));

const ESC = String.fromCharCode(27);

function wrap(open, close) {
  return (text) =>
    useColor ? `${ESC}[${open}m${text}${ESC}[${close}m` : String(text);
}

export const style = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
};

const WIDTH = 76;

export function stepHeader(index, total, title) {
  const label = `STEP ${index}/${total}  ${title}`;
  console.log("");
  console.log(style.cyan(`┌${"─".repeat(WIDTH - 2)}┐`));
  console.log(
    style.cyan("│ ") + style.bold(label.padEnd(WIDTH - 4)) + style.cyan(" │"),
  );
  console.log(style.cyan(`└${"─".repeat(WIDTH - 2)}┘`));
}

export function banner(title, subtitle) {
  console.log("");
  console.log(style.magenta(`## ${style.bold(title)}`));
  if (subtitle !== undefined) console.log(style.dim(`   ${subtitle}`));
}

export function say(text) {
  console.log(`   ${text}`);
}

export function real(text) {
  console.log(`   ${style.green("[REAL]")} ${text}`);
}

export function mock(text) {
  console.log(`   ${style.yellow("[MOCK]")} ${text}`);
}

export function ok(text) {
  console.log(`   ${style.green("PASS")} ${text}`);
}

export function no(text) {
  console.log(`   ${style.red("MISS")} ${text}`);
}

export function note(text) {
  console.log(`   ${style.dim(text)}`);
}

export function blank() {
  console.log("");
}

export function command(text) {
  console.log(`   ${style.dim("$")} ${style.blue(text)}`);
}

export function contrast(before, after) {
  console.log("");
  console.log(`   ${style.bold("Today")}`);
  for (const line of before) console.log(`     ${style.red("-")} ${line}`);
  console.log(`   ${style.bold("This prototype")}`);
  for (const line of after) console.log(`     ${style.green("+")} ${line}`);
  console.log("");
}

export function json(label, value) {
  console.log(`   ${style.dim(label)}`);
  for (const line of JSON.stringify(value, null, 2).split("\n")) {
    console.log(`     ${style.dim(line)}`);
  }
}

export function rule() {
  console.log(style.dim(`   ${"-".repeat(WIDTH - 6)}`));
}
