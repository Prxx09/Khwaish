import fs from "node:fs";
const css = fs.readFileSync(
  new URL("../src/app/styles/tokens.css", import.meta.url),
  "utf8",
);
const blocks = [
  ...css.matchAll(/(:root|\[data-theme="light"\])\s*\{([^}]+)\}/g),
];
const read = (body) =>
  Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [
      m[1],
      m[2].trim(),
    ]),
  );
const luminance = (hex) => {
  const channels = hex
    .match(/[a-f\d]{2}/gi)
    .slice(0, 3)
    .map((n) => parseInt(n, 16) / 255)
    .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};
const ratio = (a, b) => {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const dark = read(blocks[0][2]);
const results = [];
for (const theme of ["dark", "light"]) {
  const tokens = theme === "dark" ? dark : { ...dark, ...read(blocks[1][2]) };
  const resolve = (key) =>
    tokens[key].startsWith("var(")
      ? resolve(tokens[key].slice(4, -1))
      : tokens[key];
  const check = (fg, bg, min) =>
    results.push({
      theme,
      foreground: fg,
      background: bg,
      ratio: Number(ratio(resolve(fg), resolve(bg)).toFixed(2)),
      required: min,
      pass: ratio(resolve(fg), resolve(bg)) >= min,
    });
  for (const bg of ["--bg", "--panel", "--panel-2", "--panel-hover"]) {
    for (const fg of [
      "--text",
      "--muted",
      "--accent-ink",
      "--success",
      "--danger",
      "--info",
      "--warning",
    ])
      check(fg, bg, 4.5);
    check("--line", bg, 3);
  }
  for (const kind of ["success", "warning", "danger", "info"])
    check("--" + kind, "--" + kind + "-soft", 4.5);
  check("--accent-text", "--accent", 4.5);
  check("--on-danger", "--danger-fill", 4.5);
  check("--image-text", "--image-bg", 4.5);
  check("--hero-text", "--hero", 4.5);
}
console.log(
  JSON.stringify(
    {
      checked: results.length,
      failed: results.filter((x) => !x.pass),
      results,
    },
    null,
    2,
  ),
);
if (results.some((x) => !x.pass)) process.exitCode = 1;
