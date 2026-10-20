const fs = require("node:fs"),
  path = require("node:path");
const base =
  process.env.UI_REVIEW_BASELINE_OUTPUT ||
  "/tmp/khwaish-ui-review/baseline-full";
const after = process.env.UI_REVIEW_OUTPUT || "/tmp/khwaish-ui-review/final";
const smoke =
  process.env.UI_REVIEW_SMOKE_OUTPUT || "/tmp/khwaish-ui-review/smoke";
const target =
  process.env.UI_REVIEW_BUNDLE || path.resolve("../Khwaish_UI_Review");
fs.mkdirSync(target, { recursive: true });
const beforeReport = JSON.parse(
  fs.readFileSync(path.join(base, "report.json")),
);
const afterReport = JSON.parse(
  fs.readFileSync(path.join(after, "report.json")),
);
const smokeReport = JSON.parse(
  fs.readFileSync(path.join(smoke, "report.json")),
);
for (const [dir, source, report] of [
  ["before", base, beforeReport],
  ["after", after, afterReport],
  ["after", smoke, smokeReport],
]) {
  fs.mkdirSync(path.join(target, dir), { recursive: true });
  for (const file of report.screenshots)
    fs.copyFileSync(path.join(source, file), path.join(target, dir, file));
}
fs.mkdirSync(path.join(target, "checks"), { recursive: true });
for (const [name, report] of [
  ["baseline", beforeReport],
  ["matrix", afterReport],
  ["interactions", smokeReport],
])
  fs.writeFileSync(
    path.join(target, "checks", name + ".json"),
    JSON.stringify(report, null, 2),
  );
fs.copyFileSync(
  path.resolve("docs/ui-review/contrast.json"),
  path.join(target, "checks/contrast.json"),
);
fs.cpSync(path.resolve("docs/ui-review"), path.join(target, "ui-review"), {
  recursive: true,
});
const md = fs.readFileSync(
  path.resolve("docs/ui-refinement-report.md"),
  "utf8",
);
fs.writeFileSync(path.join(target, "report.md"), md);
const escape = (s) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const inline = (s) =>
  escape(s)
    .replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      '<img loading="lazy" alt="$1" src="$2">',
    )
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\x60([^\x60]+)\x60/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
function markdown(lines) {
  let html = "",
    table = false,
    list = false,
    code = false;
  const close = () => {
    if (table) {
      html += "</tbody></table></div>";
      table = false;
    }
    if (list) {
      html += "</ul>";
      list = false;
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("\x60\x60\x60")) {
      close();
      html += code ? "</code></pre>" : "<pre><code>";
      code = !code;
      continue;
    }
    if (code) {
      html += escape(line) + "\n";
      continue;
    }
    if (line.startsWith("|")) {
      if (!table) {
        close();
        html += '<div class="table-wrap"><table><tbody>';
        table = true;
      }
      if (!/^\|[\s:|-]+\|$/.test(line)) {
        html +=
          "<tr>" +
          line
            .slice(1, -1)
            .split("|")
            .map((s) => "<td>" + inline(s.trim()) + "</td>")
            .join("") +
          "</tr>";
      }
      continue;
    }
    if (line.startsWith("- ")) {
      if (table) {
        html += "</tbody></table></div>";
        table = false;
      }
      if (!list) {
        html += "<ul>";
        list = true;
      }
      html += "<li>" + inline(line.slice(2)) + "</li>";
      continue;
    }
    close();
    if (!line.trim()) continue;
    const heading = line.match(/^(#{1,3}) (.*)$/);
    if (heading) {
      const n = heading[1].length;
      html += "<h" + n + ">" + inline(heading[2]) + "</h" + n + ">";
      continue;
    }
    let paragraph = line;
    while (
      i + 1 < lines.length &&
      lines[i + 1].trim() &&
      !/^(#|- |\||\x60\x60\x60)/.test(lines[i + 1])
    )
      paragraph += " " + lines[++i];
    html += "<p>" + inline(paragraph) + "</p>";
  }
  close();
  return html;
}
const files = {
  before: beforeReport.screenshots,
  after: [...new Set([...afterReport.screenshots, ...smokeReport.screenshots])],
};
const content = markdown(md.split("\n"));
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Khwaish · UI refinement review</title>
<style>
:root{color-scheme:light;--ink:#202919;--muted:#515e44;--line:#76836a;--lime:#d7fa78;--bg:#f6f7ef}*{box-sizing:border-box}body{margin:0;color:var(--ink);background:var(--bg);font:16px/1.6 system-ui,sans-serif}header{padding:32px max(24px,calc((100vw - 1440px)/2));background:var(--ink);color:white}header b{font-size:28px;letter-spacing:-1px}header span{color:var(--lime)}main{max-width:1488px;margin:auto;padding:24px}h1,h2,h3{line-height:1.2;letter-spacing:-.03em}h1{font-size:36px}h2{margin-top:36px;font-size:28px}h3{margin-top:28px;font-size:22px}p{max-width:1000px}a{color:#405b17;text-underline-offset:4px}code{background:#e6efce;padding:2px 4px;border-radius:4px;font-size:14px}pre{overflow:auto;padding:20px;background:#e6efce}select,button{font:inherit;min-height:44px;border:1px solid var(--line);border-radius:8px;padding:8px 12px;background:white;color:var(--ink)}:focus-visible{outline:3px solid #405b17;outline-offset:3px}.controls{display:flex;flex-wrap:wrap;gap:16px;padding:20px;background:white;border:1px solid var(--line);border-radius:12px;position:sticky;top:0;z-index:1}.controls label{display:flex;flex-direction:column;gap:4px;font-size:14px}.compare{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:24px}.compare section{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:white}.compare h3{margin:0;padding:16px;border-bottom:1px solid var(--line)}.compare img{display:block;width:100%;height:auto}.compare .missing{padding:24px;color:var(--muted)}article{margin-top:48px;padding-top:24px;border-top:1px solid var(--line)}article img{display:block;max-width:100%;margin:20px 0}table{width:100%;border-collapse:collapse;min-width:600px}td{padding:12px;border:1px solid var(--line);vertical-align:top}tr:first-child{font-weight:700;background:#e6efce}.table-wrap{overflow:auto}summary{cursor:pointer;padding:16px;background:#e6efce;border:1px solid var(--line);border-radius:8px;font-weight:600}li{margin-bottom:8px}@media(max-width:800px){.compare{grid-template-columns:1fr}header,main{padding:20px}.controls{position:relative}}
</style><header><b>Khwaish<span>.</span></b><p>Seven-phase UI/UX review · 20 October 2026</p></header><main>
<h1>Before / after, every view.</h1><p>The captures use synthetic review data. External service operations are fixtures; no live account was modified. Choose a viewport, theme, and view/state. Click an image to open it at its captured resolution.</p>
<div class="controls"><label>Viewport<select id="width"><option>320</option><option>375</option><option>768</option><option selected>1280</option><option>1920</option></select></label><label>Theme<select id="theme"><option value="dark">After hours</option><option value="light">Daydream</option></select></label><label>View / state<select id="state"></select></label></div>
<div class="compare"><section><h3>Before</h3><div id="before"></div></section><section><h3>After</h3><div id="after"></div></section></div>
<p><a href="#report">Read the complete phase report and feature checklist</a> · <a href="checks/matrix.json">Browser matrix JSON</a> · <a href="checks/interactions.json">Interaction checks JSON</a> · <a href="checks/contrast.json">Contrast JSON</a></p>
<article id="report">${content}</article></main>
<script>const files=${JSON.stringify(files)};const widths=document.getElementById("width"),themes=document.getElementById("theme"),states=document.getElementById("state");
function render(){const file=widths.value+"-"+themes.value+"-"+states.value+".png";for(const kind of ["before","after"]){const target=document.getElementById(kind);target.replaceChildren();if(!files[kind].includes(file)){const p=document.createElement("p");p.className="missing";p.textContent="This state was not present in this version or is a supplemental capture at another size/theme.";target.append(p);continue}const a=document.createElement("a");a.href=kind+"/"+file;a.target="_blank";const img=document.createElement("img");img.alt=kind+" — "+states.value+" at "+widths.value+"px";img.src=a.href;a.append(img);target.append(a)}}
function refresh(){const prefix=widths.value+"-"+themes.value+"-";const previous=states.value;states.replaceChildren();const names=[...new Set([...files.before,...files.after].filter(f=>f.startsWith(prefix)).map(f=>f.slice(prefix.length,-4)))].sort();for(const name of names){const option=document.createElement("option");option.value=name;option.textContent=name.replaceAll("-"," ");states.append(option)}states.value=names.includes(previous)?previous:names.includes("shelf")?"shelf":names[0]||"";render()}widths.onchange=themes.onchange=refresh;states.onchange=render;refresh();</script></html>`;
fs.writeFileSync(path.join(target, "index.html"), html);
fs.writeFileSync(
  path.join(target, "README.txt"),
  "Khwaish UI/UX review\nUnzip the whole archive, then open index.html.\nAll captures use synthetic data.\nRead report.md or the report section in index.html for live-service limits.\n",
);
console.log(
  JSON.stringify({
    directory: target,
    before: files.before.length,
    after: files.after.length,
  }),
);
