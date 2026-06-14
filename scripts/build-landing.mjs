#!/usr/bin/env node
/**
 * Build docs/index.html — the searchable documentation landing page.
 *
 *   npm run docs:build   (runs this last)  ·  node scripts/build-landing.mjs
 *
 * Indexes every engine + Blender area diagram and code trace, then emits a
 * self-contained search page. Typing a term (e.g. "collision", "export")
 * ranks the pages from BOTH sides by relevance. The index is derived from the
 * same data the diagrams are built from, so it never goes stale.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ENGINE_AREA_PAGES } from "./docs/engine-areas.mjs";
import { TRACES as ENGINE_TRACES } from "./build-trace-docs.mjs";
import {
  AREA_PAGES as BLENDER_AREA_PAGES,
  TRACES as BLENDER_TRACES,
} from "./build-blender-docs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Query-side synonyms — so a search term surfaces the right pages even when
// the page uses different vocabulary ("collision" → collider/physics, etc.).
// Multi-word values are matched as substrings against each page's search text.
// ---------------------------------------------------------------------------

const SYNONYMS = {
  collision: ["collider", "physics", "rigidbody", "body", "havok"],
  collide: ["collider", "physics"],
  collider: ["physics", "rigidbody", "havok", "shape"],
  physics: ["collider", "rigidbody", "havok", "body"],
  rigidbody: ["physics", "body", "dynamic"],
  sound: ["audio", "spatial"],
  audio: ["sound", "spatial"],
  joint: ["constraint", "hinge", "spring", "6dof"],
  joints: ["constraint"],
  constraint: ["joint", "hinge", "spring", "6dof", "motor"],
  ui: ["gui", "button", "panel", "hud"],
  gui: ["ui", "button", "panel", "hud"],
  hud: ["gui", "ui"],
  button: ["gui", "gui3d", "control"],
  key: ["input", "keyboard", "binding"],
  keyboard: ["input", "binding"],
  gamepad: ["input", "controller", "binding"],
  controller: ["input", "gamepad"],
  input: ["action", "binding", "inputmap", "keyboard", "gamepad"],
  save: ["live link", "livelink", "reload", "ctrl+s"],
  reload: ["live link", "livelink", "hot reload"],
  light: ["lights", "shadow", "rendering", "lamp"],
  lighting: ["lights", "shadow", "rendering"],
  shadow: ["shadows", "lights"],
  camera: ["cameras", "view"],
  animation: ["nla", "clip", "animationgroup", "armature"],
  animate: ["animation", "clip"],
  particle: ["particles", "emitter"],
  particles: ["particle", "emitter"],
  export: ["glb", "manifest", "serialize", "scene.json"],
  import: ["loader", "glb", "append"],
  script: ["behavior", "exposed", "scripting"],
  scripting: ["behavior", "exposed", "script"],
  behavior: ["script", "scripting", "lifecycle"],
  exposed: ["script", "behavior", "field", "vars"],
  trigger: ["onmessage", "event", "collision"],
  message: ["onmessage", "trigger", "sendmessage"],
  guid: ["id", "identity", "entity", "bjs_id"],
  identity: ["guid", "id", "entity"],
  load: ["loader", "levelloader", "pipeline"],
  loading: ["loader", "pipeline"],
  validate: ["validation", "validator", "warning", "checks"],
  validation: ["validate", "validator", "checks"],
  tag: ["tag", "bytag"],
  fog: ["scene", "environment", "rendering"],
  environment: ["skybox", "ibl", "rendering"],
  skybox: ["environment", "rendering"],
};

// Suggested chips shown under the search box (term + what it surfaces).
const SUGGESTIONS = [
  "collision", "export", "input", "audio", "constraints",
  "scripting", "animation", "gui", "live link", "lighting",
];

// ---------------------------------------------------------------------------
// Index extraction — every page becomes one search entry.
// ---------------------------------------------------------------------------

function metaText(meta)
{
  if (!Array.isArray(meta)) { return ""; }
  return meta.map((row) => Array.isArray(row) ? row.join(" ") : String(row)).join(" ");
}

function areaEntry(side, file, title, nodes)
{
  const labels = nodes.map((n) => n.label).filter(Boolean);
  const text = [
    title,
    ...nodes.flatMap((n) => [n.label, n.sub, n.desc, metaText(n.meta)]),
  ].join(" ").toLowerCase();
  return {
    side,
    kind: "area",
    href: `${side}/${file}`,
    title,
    summary: "Diagram · " + labels.join(" · "),
    text,
  };
}

function traceEntry(side, trace)
{
  const text = [
    trace.title,
    trace.intro,
    ...trace.steps.flatMap((s) => [s.symbol, s.title, s.file, s.note]),
  ].filter(Boolean).join(" ").toLowerCase();
  return {
    side,
    kind: "trace",
    href: `${side}/trace-${trace.id}.html`,
    title: trace.title,
    summary: trace.intro || "Step-by-step code trace.",
    text,
  };
}

function BuildIndex()
{
  const entries = [];

  for (const [file, page] of Object.entries(ENGINE_AREA_PAGES))
  {
    const title = page.diagram.title.replace(/^Babylon Level Kit — /, "");
    entries.push(areaEntry("engine", file, title, page.diagram.nodes));
  }
  for (const trace of ENGINE_TRACES)
  {
    entries.push(traceEntry("engine", trace));
  }
  for (const [file, page] of Object.entries(BLENDER_AREA_PAGES))
  {
    entries.push(areaEntry("blender", file, page.title, page.nodes));
  }
  for (const trace of BLENDER_TRACES)
  {
    entries.push(traceEntry("blender", trace));
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Client search script. Plain string (no backticks / ${}) so it can be safely
// embedded inside the page template literal below.
// ---------------------------------------------------------------------------

const CLIENT_JS = [
  "(function () {",
  "  var box = document.getElementById('q');",
  "  var out = document.getElementById('results');",
  "  var count = document.getElementById('count');",
  "",
  "  function expand(tokens) {",
  "    var terms = [];",
  "    tokens.forEach(function (t) {",
  "      terms.push({ term: t, w: 1 });",
  "      var syn = SYN[t];",
  "      if (syn) { syn.forEach(function (s) { terms.push({ term: s, w: 0.5 }); }); }",
  "    });",
  "    return terms;",
  "  }",
  "",
  "  function score(entry, terms) {",
  "    var title = entry.title.toLowerCase();",
  "    var summary = entry.summary.toLowerCase();",
  "    var total = 0;",
  "    terms.forEach(function (t) {",
  "      var hit = 0;",
  "      if (title.indexOf(t.term) !== -1) { hit += 10; }",
  "      else if (summary.indexOf(t.term) !== -1) { hit += 4; }",
  "      else if (entry.text.indexOf(t.term) !== -1) { hit += 1; }",
  "      total += hit * t.w;",
  "    });",
  "    return total;",
  "  }",
  "",
  "  function badge(entry) {",
  "    var side = '<span class=\"badge ' + entry.side + '\">' + entry.side + '</span>';",
  "    var kind = '<span class=\"badge kind\">' + entry.kind + '</span>';",
  "    return side + kind;",
  "  }",
  "",
  "  function card(entry) {",
  "    return '<a class=\"card ' + entry.side + '\" href=\"' + entry.href + '\">' +",
  "      '<div class=\"card-head\">' + badge(entry) +",
  "      '<span class=\"card-title\">' + entry.title + '</span></div>' +",
  "      '<div class=\"card-sum\">' + entry.summary + '</div></a>';",
  "  }",
  "",
  "  function group(title, items) {",
  "    if (!items.length) { return ''; }",
  "    return '<h2 class=\"group\">' + title + '</h2>' + items.map(card).join('');",
  "  }",
  "",
  "  function browse() {",
  "    count.textContent = INDEX.length + ' pages';",
  "    var eng = INDEX.filter(function (e) { return e.side === 'engine'; });",
  "    var bl = INDEX.filter(function (e) { return e.side === 'blender'; });",
  "    out.innerHTML = group('Engine (runtime)', eng) + group('Blender (add-on)', bl);",
  "  }",
  "",
  "  function search(query) {",
  "    var tokens = query.toLowerCase().split(/[^a-z0-9+]+/).filter(Boolean);",
  "    if (!tokens.length) { browse(); return; }",
  "    var terms = expand(tokens);",
  "    var ranked = INDEX.map(function (e) { return { e: e, s: score(e, terms) }; })",
  "      .filter(function (r) { return r.s > 0; })",
  "      .sort(function (a, b) { return b.s - a.s; });",
  "    count.textContent = ranked.length + (ranked.length === 1 ? ' match' : ' matches');",
  "    if (!ranked.length) {",
  "      out.innerHTML = '<p class=\"empty\">No pages matched \"' + query + '\". Try a broader term like \"physics\" or \"input\".</p>';",
  "      return;",
  "    }",
  "    out.innerHTML = ranked.map(function (r) { return card(r.e); }).join('');",
  "  }",
  "",
  "  function run() { search(box.value); }",
  "  box.addEventListener('input', run);",
  "  box.addEventListener('keydown', function (e) {",
  "    if (e.key === 'Enter') {",
  "      var first = out.querySelector('a.card');",
  "      if (first) { window.location.href = first.getAttribute('href'); }",
  "    }",
  "  });",
  "",
  "  Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (chip) {",
  "    chip.addEventListener('click', function () {",
  "      box.value = chip.getAttribute('data-term');",
  "      run();",
  "      box.focus();",
  "    });",
  "  });",
  "",
  "  var params = new URLSearchParams(window.location.search);",
  "  if (params.get('q')) { box.value = params.get('q'); }",
  "  run();",
  "  box.focus();",
  "})();",
].join("\n");

// ---------------------------------------------------------------------------
// Page template.
// ---------------------------------------------------------------------------

function Page(index)
{
  const chips = SUGGESTIONS
    .map((s) => `<button class="chip" data-term="${s}">${s}</button>`)
    .join("");

  return `<!DOCTYPE html>
<!-- Generated by scripts/build-landing.mjs — edit there, then npm run docs:build. -->
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Babylon Level Kit — Documentation</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0c0c0a; color: #d8dae6;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    min-height: 100vh; padding: 48px 20px 80px;
  }
  .wrap { max-width: 860px; margin: 0 auto; }
  header { text-align: center; margin-bottom: 28px; }
  h1 { font-size: 26px; font-weight: 700; letter-spacing: .01em; color: #f0ead8; }
  .tag { margin-top: 8px; color: #6c7396; font-size: 13px; line-height: 1.5; }
  .tag b.eng { color: #8fa3ff; } .tag b.bl { color: #f0cda8; }
  .search { margin: 26px 0 14px; }
  #q {
    width: 100%; padding: 16px 18px; font-size: 17px; font-family: inherit;
    color: #f0ead8; background: #15151b; border: 1px solid #2e2c3f;
    border-radius: 12px; outline: none; transition: border-color .15s, box-shadow .15s;
  }
  #q:focus { border-color: #4f6df5; box-shadow: 0 0 0 3px #4f6df533; }
  #q::placeholder { color: #565d7a; }
  .chips { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 6px; }
  .chip {
    background: #17171f; border: 1px solid #2a2838; color: #9aa0c0;
    font: 12px ui-monospace, monospace; padding: 5px 11px; border-radius: 999px;
    cursor: pointer; transition: all .12s;
  }
  .chip:hover { border-color: #4f6df5; color: #cdd5ff; }
  #count { color: #565d7a; font-size: 12px; margin: 14px 2px 6px; display: block; }
  .group {
    font-size: 12px; text-transform: uppercase; letter-spacing: .12em;
    color: #6c7396; margin: 22px 2px 10px; font-weight: 600;
  }
  .card {
    display: block; text-decoration: none; color: inherit;
    background: #131319; border: 1px solid #24222f; border-left-width: 3px;
    border-radius: 10px; padding: 13px 15px; margin-bottom: 9px;
    transition: border-color .12s, background .12s, transform .06s;
  }
  .card:hover { background: #181822; transform: translateX(2px); }
  .card.engine { border-left-color: #4f6df5; }
  .card.engine:hover { border-color: #4f6df5; }
  .card.blender { border-left-color: #e08a3c; }
  .card.blender:hover { border-color: #e08a3c; }
  .card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
  .card-title { font-size: 15px; font-weight: 600; color: #f0ead8; }
  .card-sum { color: #8b91ad; font-size: 12.5px; line-height: 1.5; }
  .badge {
    font-size: 10px; text-transform: uppercase; letter-spacing: .06em;
    padding: 2px 7px; border-radius: 5px; font-weight: 600;
  }
  .badge.engine { background: #4f6df5; color: #fff; }
  .badge.blender { background: #e08a3c; color: #2a1c0e; }
  .badge.kind { background: #23222e; color: #8b91ad; }
  .empty { color: #8b91ad; padding: 20px 2px; font-size: 14px; }
  footer {
    text-align: center; margin-top: 40px; padding-top: 22px;
    border-top: 1px solid #1d1b27; color: #565d7a; font-size: 12px; line-height: 1.7;
  }
  footer a { color: #8fa3ff; text-decoration: none; }
  footer a.bl { color: #f0cda8; }
  footer a:hover { text-decoration: underline; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Babylon Level Kit — Documentation</h1>
    <p class="tag">Search across <b class="eng">Engine (runtime)</b> and
      <b class="bl">Blender (add-on)</b> docs. Try a feature, a concept, or a symbol.</p>
  </header>

  <div class="search">
    <input id="q" type="search" autocomplete="off" spellcheck="false"
      placeholder="Search the docs — e.g. collision, export, input…">
  </div>
  <div class="chips">${chips}</div>

  <span id="count"></span>
  <div id="results"></div>

  <footer>
    Browse directly: <a href="engine/index.html">Engine overview →</a> ·
    <a class="bl" href="blender/index.html">Blender overview →</a><br>
    Regenerate with <code>npm run docs:build</code>.
  </footer>
</div>

<script>
const INDEX = ${JSON.stringify(index)};
const SYN = ${JSON.stringify(SYNONYMS)};
${CLIENT_JS}
</script>
</body>
</html>
`;
}

export function BuildLandingPage()
{
  const index = BuildIndex();
  const outPath = path.join(ROOT, "docs", "index.html");
  fs.writeFileSync(outPath, Page(index));
  console.log(`landing page: docs/index.html (${index.length} pages indexed)`);
}

if (import.meta.url === new URL(process.argv[1], "file:").href)
{
  BuildLandingPage();
}
