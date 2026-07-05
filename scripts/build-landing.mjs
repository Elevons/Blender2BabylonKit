#!/usr/bin/env node
/**
 * Build docs/index.html — the searchable documentation landing page.
 *
 *   npm run docs:build   (runs this last)  ·  node scripts/build-landing.mjs
 *
 * Indexes engine + Blender subsystem diagrams, code traces, and prose chapters;
 * emits a topic hub + search page. The index is derived from build data so it
 * stays in sync with the diagrams.
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
import { TOPICS, TopicsForHref } from "./docs/topics.mjs";
import { PROSE_CHAPTERS } from "./docs/prose/manifest.mjs";
import { KEPT_META_MD } from "./docs/prose-config.mjs";
import { ReadProseFragment, StripHtml } from "./build-prose-docs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Query-side synonyms
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
  nme: ["node material", "shader", "materials"],
  shader: ["nme", "node material", "materials"],
  materials: ["nme", "node material", "shader"],
  msdf: ["text", "label", "font", "bmfont", "signed distance"],
  text: ["msdf", "label", "gui"],
  export: ["glb", "manifest", "serialize", "scene.json"],
  import: ["loader", "glb", "append"],
  script: ["behavior", "exposed", "scripting"],
  scripting: ["behavior", "exposed", "script"],
  behavior: ["script", "scripting", "lifecycle"],
  lifecycle: ["onstart", "onupdate", "ondestroy", "onmessage", "behavior", "runframe", "runtime"],
  onstart: ["lifecycle", "behavior", "begin", "runtime"],
  onupdate: ["lifecycle", "behavior", "runframe", "deltaseconds", "runtime"],
  ondestroy: ["lifecycle", "behavior", "dispose"],
  onmessage: ["lifecycle", "behavior", "sendmessage", "trigger"],
  runtime: ["runrenderloop", "frameloop", "onbeforerender", "deltatime", "runframe"],
  frameloop: ["runtime", "runrenderloop", "onupdate", "lifecycle"],
  runrenderloop: ["runtime", "frameloop", "scene.render"],
  deltatime: ["onupdate", "runtime", "deltaseconds"],
  deltaseconds: ["onupdate", "runtime", "deltatime"],
  onbeforerender: ["runtime", "runframe", "lifecycle"],
  component: ["components", "attachment", "tag", "collider", "script"],
  components: ["component", "attachment", "bjscomponent", "serialize"],
  attachment: ["components", "getattachment", "registerattachment"],
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
  fog: ["scene", "environment", "rendering", "skybox", "atmosphere"],
  environment: ["skybox", "ibl", "rendering", "default environment", "skyboxignorefog", "atmosphere"],
  skybox: ["environment", "rendering", "ibl", "fog", "atmosphere"],
  ibl: ["environment", "skybox", "rendering", "default environment", "atmosphere"],
  atmosphere: ["sky", "aerial perspective", "sun", "rayleigh", "scattering", "rendering", "environment"],
  rayleigh: ["atmosphere", "scattering", "sky"],
  scattering: ["atmosphere", "mie", "rayleigh", "sky"],
  scale: ["applyobjectscale", "collider_apply_scale", "object scale", "apply object scale"],
  contributor: ["building", "docs", "maintainer", "trace", "manifest"],
  building: ["contributor", "docs", "building-docs"],
  subsystem: ["diagram", "overview", "map"],
  diagram: ["subsystem", "overview", "map"],
  default: ["manifest", "property", "enabled"],
  modify: ["behavior", "export", "serialize", "change"],
  change: ["behavior", "export", "serialize", "modify"],
};

const SUGGESTIONS = [
  "collision", "export", "input", "audio", "constraints",
  "scripting", "animation", "gui", "live link", "lighting",
];

// ---------------------------------------------------------------------------
// Index extraction
// ---------------------------------------------------------------------------

function metaText(meta)
{
  if (!Array.isArray(meta)) { return ""; }
  return meta.map((row) => Array.isArray(row) ? row.join(" ") : String(row)).join(" ");
}

function withTopics(entry)
{
  return { ...entry, topics: TopicsForHref(entry.href) };
}

function diagramEntry(side, file, title, nodes)
{
  const labels = nodes.map((n) => n.label).filter(Boolean);
  const text = [
    title,
    ...nodes.flatMap((n) => [n.label, n.sub, n.desc, metaText(n.meta)]),
  ].join(" ").toLowerCase();
  return withTopics({
    side,
    kind: "diagram",
    href: `${side}/${file}`,
    title,
    summary: "Subsystem diagram · " + labels.slice(0, 8).join(" · ") + (labels.length > 8 ? " · …" : ""),
    text,
  });
}

function traceEntry(side, trace)
{
  const text = [
    trace.title,
    trace.intro,
    ...trace.steps.flatMap((s) => [s.symbol, s.title, s.file, s.note]),
  ].filter(Boolean).join(" ").toLowerCase();
  return withTopics({
    side,
    kind: "trace",
    href: `${side}/trace-${trace.id}.html`,
    title: trace.title,
    summary: trace.intro || "Step-by-step code trace.",
    text,
  });
}

function proseEntry(chapter)
{
  const html = ReadProseFragment(chapter.fragment);
  const plain = StripHtml(html);

  let title = chapter.title;
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1)
  {
    title = StripHtml(h1[1])
      .replace(/^\d+\s*[—–-]\s*/, "")
      .trim();
  }

  const summary = plain
    .replace(title, "")
    .trim()
    .slice(0, 200);

  return withTopics({
    side: chapter.side,
    kind: "prose",
    href: chapter.href,
    title,
    summary: summary || "Prose chapter.",
    text: plain.toLowerCase(),
  });
}

function buildingDocsEntry()
{
  const chapter = PROSE_CHAPTERS.find((ch) => ch.href === "BUILDING-DOCS.html");
  const html = ReadProseFragment(chapter.fragment);
  const plain = StripHtml(html);
  return withTopics({
    side: "engine",
    kind: "meta",
    href: "BUILDING-DOCS.html",
    title: "Building the documentation",
    summary: "Contributor guide — source map, build commands, adding traces and chapters.",
    text: plain.toLowerCase(),
  });
}

function metaMdEntries()
{
  /** @type {Record<string, string>} */
  const summaries = {
    "STYLE_GUIDE.md": "C#-style TypeScript conventions for engine code and behaviors.",
    "LLM_PLAYBOOK.md": "Task playbooks for LLM / MCP behavior authoring.",
    "LLM_SCRIPTING_CONTEXT.md": "Behavior authoring contract for LLM script generation.",
    "LLM_KERNEL.md": "Minimal behavior authoring kernel for LLM script generation.",
  };

  return [...KEPT_META_MD].map((file) =>
  {
    const filePath = path.join(ROOT, "docs", file);
    const plain = fs.readFileSync(filePath, "utf8");
    const title = path.basename(file, ".md").replaceAll("_", " ");

    return withTopics({
      side: "engine",
      kind: "meta",
      href: file,
      title,
      summary: summaries[file] ?? "Contributor meta documentation.",
      text: plain.toLowerCase(),
    });
  });
}

function metaProseEntries()
{
  return PROSE_CHAPTERS
    .filter((chapter) => chapter.layout === "meta" && chapter.href !== "BUILDING-DOCS.html")
    .map((chapter) =>
    {
      const html = ReadProseFragment(chapter.fragment);
      const plain = StripHtml(html);
      let title = chapter.title;
      const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      if (h1)
      {
        title = StripHtml(h1[1]).trim();
      }

      const summary = plain.replace(title, "").trim().slice(0, 200);

      return withTopics({
        side: chapter.side,
        kind: "meta",
        href: chapter.href,
        title,
        summary: summary || "Meta guide.",
        text: plain.toLowerCase(),
      });
    });
}

function proseEntries()
{
  return PROSE_CHAPTERS.filter((ch) => ch.layout !== "meta").map(proseEntry);
}

function BuildIndex()
{
  const entries = [];

  for (const [file, page] of Object.entries(ENGINE_AREA_PAGES))
  {
    const title = page.diagram.title.replace(/^Babylon Level Kit — /, "");
    entries.push(diagramEntry("engine", file, title, page.diagram.nodes));
  }
  for (const trace of ENGINE_TRACES)
  {
    entries.push(traceEntry("engine", trace));
  }
  for (const [file, page] of Object.entries(BLENDER_AREA_PAGES))
  {
    entries.push(diagramEntry("blender", file, page.title, page.nodes));
  }
  for (const trace of BLENDER_TRACES)
  {
    entries.push(traceEntry("blender", trace));
  }
  entries.push(...proseEntries());
  entries.push(buildingDocsEntry());
  entries.push(...metaProseEntries());
  entries.push(...metaMdEntries());

  return entries;
}

// ---------------------------------------------------------------------------
// Client script — plain string (no backticks) for safe embedding.
// ---------------------------------------------------------------------------

const CLIENT_JS = [
  "(function () {",
  "  var box = document.getElementById('q');",
  "  var out = document.getElementById('results');",
  "  var count = document.getElementById('count');",
  "  var topicSelect = document.getElementById('topic-select');",
  "  var topicBlurb = document.getElementById('topic-blurb');",
  "  var activeTopic = null;",
  "",
  "  function topicDef(id) {",
  "    for (var i = 0; i < TOPICS.length; i++) { if (TOPICS[i].id === id) { return TOPICS[i]; } }",
  "    return null;",
  "  }",
  "",
  "  function syncUrl() {",
  "    var params = new URLSearchParams(window.location.search);",
  "    if (activeTopic) { params.set('topic', activeTopic); } else { params.delete('topic'); }",
  "    var q = box.value.trim();",
  "    if (q) { params.set('q', q); } else { params.delete('q'); }",
  "    var qs = params.toString();",
  "    history.replaceState(null, '', qs ? ('?' + qs) : window.location.pathname);",
  "  }",
  "",
  "  function setTopic(id) {",
  "    activeTopic = id || null;",
  "    if (topicSelect) { topicSelect.value = activeTopic || ''; }",
  "    if (topicBlurb) {",
  "      var def = activeTopic ? topicDef(activeTopic) : null;",
  "      topicBlurb.textContent = def ? def.blurb : '';",
  "      topicBlurb.style.display = def ? 'block' : 'none';",
  "    }",
  "    syncUrl();",
  "    run();",
  "  }",
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
  "  function inTopic(entry) {",
  "    if (!activeTopic) { return true; }",
  "    return entry.topics && entry.topics.indexOf(activeTopic) !== -1;",
  "  }",
  "",
  "  function kindLabel(entry) {",
  "    if (entry.kind === 'diagram') { return 'subsystem'; }",
  "    if (entry.kind === 'meta') { return 'contributor'; }",
  "    return entry.kind;",
  "  }",
  "",
  "  function badge(entry) {",
  "    var side = '<span class=\"badge ' + entry.side + '\">' + entry.side + '</span>';",
  "    var kind = '<span class=\"badge kind-' + entry.kind + '\">' + kindLabel(entry) + '</span>';",
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
  "  function byHref(href) {",
  "    for (var i = 0; i < INDEX.length; i++) { if (INDEX[i].href === href) { return INDEX[i]; } }",
  "    return null;",
  "  }",
  "",
  "  function startHereSection(def) {",
  "    if (!def || !def.startHere || !def.startHere.length) { return ''; }",
  "    var html = '<h2 class=\"group\">Start here</h2>';",
  "    def.startHere.forEach(function (href) {",
  "      var e = byHref(href);",
  "      if (e) { html += card(e); }",
  "    });",
  "    return html;",
  "  }",
  "",
  "  function browsePool() {",
  "    return INDEX.filter(inTopic);",
  "  }",
  "",
  "  function browse() {",
  "    var pool = browsePool();",
  "    var def = activeTopic ? topicDef(activeTopic) : null;",
  "    var startHrefs = def ? def.startHere : [];",
  "    var rest = pool.filter(function (e) { return startHrefs.indexOf(e.href) === -1; });",
  "",
  "    if (activeTopic) {",
  "      count.textContent = pool.length + ' pages in this topic';",
  "      var diagrams = rest.filter(function (e) { return e.kind !== 'prose'; });",
  "      var prose = rest.filter(function (e) { return e.kind === 'prose'; });",
  "      out.innerHTML = startHereSection(def)",
  "        + group('Diagrams & traces', diagrams)",
  "        + group('Chapters', prose);",
  "      return;",
  "    }",
  "",
  "    count.textContent = '';",
  "    var tpl = document.getElementById('getting-started-tpl');",
  "    out.innerHTML = tpl ? tpl.innerHTML : '';",
  "  }",
  "",
  "  function search(query) {",
  "    var tokens = query.toLowerCase().split(/[^a-z0-9+]+/).filter(Boolean);",
  "    if (!tokens.length) { browse(); return; }",
  "    var terms = expand(tokens);",
  "    var ranked = INDEX.filter(inTopic).map(function (e) { return { e: e, s: score(e, terms) }; })",
  "      .filter(function (r) { return r.s > 0; })",
  "      .sort(function (a, b) { return b.s - a.s; });",
  "    count.textContent = ranked.length + (ranked.length === 1 ? ' match' : ' matches')",
  "      + (activeTopic ? ' in topic' : '');",
  "    if (!ranked.length) {",
  "      out.innerHTML = '<p class=\"empty\">No pages matched \"' + query + '\"' +",
  "        (activeTopic ? ' in this topic' : '') + '. Try a broader term or clear the topic filter.</p>';",
  "      return;",
  "    }",
  "    var def = activeTopic ? topicDef(activeTopic) : null;",
  "    out.innerHTML = (def ? startHereSection(def) : '')",
  "      + ranked.map(function (r) { return card(r.e); }).join('');",
  "  }",
  "",
  "  function run() { syncUrl(); search(box.value); }",
  "  box.addEventListener('input', run);",
  "  box.addEventListener('keydown', function (e) {",
  "    if (e.key === 'Enter') {",
  "      var first = out.querySelector('a.card');",
  "      if (first) { window.location.href = first.getAttribute('href'); }",
  "    }",
  "  });",
  "",
  "  if (topicSelect) {",
  "    topicSelect.addEventListener('change', function () {",
  "      setTopic(topicSelect.value || null);",
  "    });",
  "  }",
  "",
  "  var params = new URLSearchParams(window.location.search);",
  "  if (params.get('q')) { box.value = params.get('q'); }",
  "  if (params.get('topic')) { activeTopic = params.get('topic'); }",
  "  if (topicSelect) { topicSelect.value = activeTopic || ''; }",
  "  if (topicBlurb) {",
  "    var initDef = activeTopic ? topicDef(activeTopic) : null;",
  "    topicBlurb.textContent = initDef ? initDef.blurb : '';",
  "    topicBlurb.style.display = initDef ? 'block' : 'none';",
  "  }",
  "  run();",
  "})();",
].join("\n");

// ---------------------------------------------------------------------------
// Page template
// ---------------------------------------------------------------------------

function topicSelectHtml()
{
  const options = ['<option value="">All topics</option>']
    .concat(TOPICS.filter((t) => t.id !== "contributor").map((t) =>
      `<option value="${t.id}">${t.label}</option>`));
  return `<label class="topic-filter" for="topic-select">Topic</label>`
    + `<select id="topic-select" aria-label="Filter by topic">${options.join("")}</select>`;
}

function gettingStartedInnerHtml()
{
  return `
    <section class="getting-started">
      <h2 class="section-title">Install &amp; first run</h2>
      <ul class="ref-links">
        <li><a href="QUICKSTART.html">Quickstart</a> — first level in ~15 minutes</li>
        <li><a href="../README.md">README</a> — install the add-on zip and run the playground</li>
      </ul>
      <h2 class="section-title">Engine — choose your path</h2>
      <table class="path-table">
        <thead><tr><th>Goal</th><th>Start here</th></tr></thead>
        <tbody>
          <tr><td>Write behavior scripts</td><td><a href="engine/02-RUNTIME-BASICS.html">Runtime basics</a> → <a href="engine/14-API-GUIDE.html">API guide</a> → <a href="engine/05-SCRIPTING.html">Scripting</a></td></tr>
          <tr><td>How a level loads and runs</td><td><a href="engine/01-ARCHITECTURE.html">Architecture</a> → <a href="engine/04-LOAD-PIPELINE.html">Load pipeline</a> → <a href="engine/02-RUNTIME-BASICS.html">Runtime basics</a></td></tr>
          <tr><td>Does the kit support X?</td><td><a href="engine/13-FEATURE-LIST.html">Feature list</a> · <a href="engine/10-FEATURE-TRACES.html">Feature traces</a></td></tr>
        </tbody>
      </table>
      <p class="path-more"><a href="engine/00-INDEX.html">Full engine index</a> — all chapters, diagrams, and traces</p>
      <h2 class="section-title">Blender — choose your path</h2>
      <table class="path-table">
        <thead><tr><th>Goal</th><th>Start here</th></tr></thead>
        <tbody>
          <tr><td>Export my first level</td><td><a href="blender/export.html">Export diagram</a> → <a href="blender/trace-export.html">trace-export</a></td></tr>
          <tr><td>Fix export warnings</td><td><a href="blender/validation.html">Validation</a> → <a href="blender/trace-validate.html">trace-validate</a></td></tr>
          <tr><td>Iterate with Ctrl+S</td><td><a href="blender/livelink.html">Live Link</a> → <a href="blender/trace-livelink.html">trace-livelink</a></td></tr>
          <tr><td>Set up input actions</td><td><a href="blender/input-actions.html">Input Actions</a> → <a href="blender/trace-input.html">trace-input</a></td></tr>
          <tr><td>Reuse props across scenes</td><td><a href="blender/PREFABS.html">Prefabs</a></td></tr>
        </tbody>
      </table>
      <p class="path-more"><a href="blender/00-INDEX.html">Full Blender index</a> — diagrams, traces, and prose</p>
      <h2 class="section-title">Reference</h2>
      <ul class="ref-links">
        <li><a href="engine/13-FEATURE-LIST.html">Feature list</a> — every component and scene setting</li>
        <li><a href="engine/14-API-GUIDE.html">API guide</a> — Entity, Level, Behavior, input</li>
        <li><a href="engine/10-FEATURE-TRACES.html">Feature traces</a> — Blender → runtime step chains</li>
        <li><a href="engine/index.html">Engine subsystem diagrams</a> · <a href="blender/index.html">Blender diagrams</a></li>
        <li><a href="BUILDING-DOCS.html">Building the documentation</a> — for contributors</li>
      </ul>
    </section>`;
}

function gettingStartedHtml()
{
  const inner = gettingStartedInnerHtml();
  return `<template id="getting-started-tpl">${inner}</template>`;
}

function Page(index)
{
  const startHtml = gettingStartedInnerHtml();

  const topicPayload = TOPICS.map((t) => ({
    id: t.id,
    label: t.label,
    blurb: t.blurb,
    startHere: t.startHere,
  }));

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
    background: #0c0c0a; color: #d4d6e4;
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
    font-size: 15px; line-height: 1.6;
    min-height: 100vh; padding: 32px 20px 64px;
  }
  .wrap { max-width: 720px; margin: 0 auto; }
  header { margin-bottom: 28px; }
  h1 { font-size: 28px; font-weight: 700; letter-spacing: -.01em; color: #f0ead8; margin-bottom: 8px; }
  .tag { color: #8b91ad; font-size: 15px; line-height: 1.55; max-width: 540px; }
  .guide-cards {
    display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 28px;
  }
  @media (max-width: 620px) { .guide-cards { grid-template-columns: 1fr; } }
  .guide-card {
    display: block; text-decoration: none; color: inherit;
    background: #131319; border: 1px solid #24222f; border-radius: 10px;
    padding: 18px 18px 16px; transition: border-color .12s, background .12s;
  }
  .guide-card:hover { background: #181822; }
  .guide-card.engine { border-top: 3px solid #4f6df5; }
  .guide-card.engine:hover { border-color: #4f6df5; }
  .guide-card.blender { border-top: 3px solid #e08a3c; }
  .guide-card.blender:hover { border-color: #e08a3c; }
  .guide-card h2 { font-size: 17px; font-weight: 650; color: #f0ead8; margin-bottom: 6px; }
  .guide-card p { font-size: 13.5px; color: #8b91ad; line-height: 1.5; margin-bottom: 10px; }
  .guide-cta { font-size: 13px; font-weight: 500; }
  .guide-card.engine .guide-cta { color: #9aa8e8; }
  .guide-card.blender .guide-cta { color: #d4a870; }
  .section-title {
    font-size: 13px; text-transform: uppercase; letter-spacing: .08em;
    color: #6c7396; font-weight: 600; margin: 24px 0 10px;
  }
  .reading-path, .ref-links {
    margin: 0 0 8px 1.2em; color: #b8bdd8; font-size: 14px;
  }
  .reading-path li, .ref-links li { margin: 6px 0; }
  .reading-path a, .ref-links a { color: #9aa8e8; text-decoration: none; }
  .reading-path a:hover, .ref-links a:hover { text-decoration: underline; }
  .path-table {
    width: 100%; border-collapse: collapse; font-size: 13.5px; margin: 0 0 10px;
  }
  .path-table th, .path-table td {
    text-align: left; padding: 8px 10px; border-bottom: 1px solid #1e1c28;
    vertical-align: top;
  }
  .path-table th { color: #6c7396; font-weight: 600; font-size: 12px; }
  .path-table td:first-child { color: #b8bdd8; white-space: nowrap; width: 38%; }
  .path-table a { color: #9aa8e8; text-decoration: none; }
  .path-table a:hover { text-decoration: underline; }
  .path-more { font-size: 13px; color: #8b91ad; margin: 0 0 4px; }
  .path-more a { color: #9aa8e8; text-decoration: none; }
  .path-more a:hover { text-decoration: underline; }
  .search-tools {
    display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px;
    margin: 0 0 20px;
  }
  .search { flex: 1 1 220px; margin: 0; }
  .topic-filter { font-size: 13px; color: #6c7396; margin-right: 6px; }
  #topic-select {
    font: 13px ui-sans-serif, system-ui, sans-serif; color: #d4d6e4;
    background: #15151b; border: 1px solid #2e2c3f; border-radius: 8px;
    padding: 8px 10px; min-width: 180px;
  }
  #topic-blurb {
    color: #8b91ad; font-size: 13px; line-height: 1.55; margin: 0 0 12px;
  }
  #q {
    width: 100%; padding: 12px 14px; font-size: 15px; font-family: inherit;
    color: #f0ead8; background: #15151b; border: 1px solid #2e2c3f;
    border-radius: 8px; outline: none; transition: border-color .15s;
  }
  #q:focus { border-color: #4f6df5; }
  #q::placeholder { color: #565d7a; }
  #count { color: #565d7a; font-size: 12px; margin: 0 0 8px; display: block; }
  .group {
    font-size: 12px; text-transform: uppercase; letter-spacing: .1em;
    color: #6c7396; margin: 22px 0 10px; font-weight: 600;
  }
  .card {
    display: block; text-decoration: none; color: inherit;
    background: #131319; border: 1px solid #24222f; border-left-width: 3px;
    border-radius: 8px; padding: 12px 14px; margin-bottom: 8px;
    transition: background .12s;
  }
  .card:hover { background: #181822; }
  .card.engine { border-left-color: #4f6df5; }
  .card.blender { border-left-color: #e08a3c; }
  .card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap; }
  .card-title { font-size: 14px; font-weight: 600; color: #f0ead8; }
  .card-sum { color: #8b91ad; font-size: 13px; line-height: 1.45; }
  .badge {
    font-size: 10px; text-transform: uppercase; letter-spacing: .05em;
    padding: 2px 6px; border-radius: 4px; font-weight: 600;
  }
  .badge.engine { background: #4f6df5; color: #fff; }
  .badge.blender { background: #e08a3c; color: #2a1c0e; }
  .badge.kind-diagram { background: #23222e; color: #8b91ad; }
  .badge.kind-trace { background: #1e2a1e; color: #8aad8b; }
  .badge.kind-prose { background: #2a2420; color: #c0a878; }
  .badge.kind-meta { background: #1e2430; color: #9ab0e0; }
  .empty { color: #8b91ad; padding: 16px 0; font-size: 14px; }
  footer {
    margin-top: 48px; padding-top: 20px;
    border-top: 1px solid #1d1b27; color: #565d7a; font-size: 12px; line-height: 1.7;
  }
  footer a { color: #9aa8e8; text-decoration: none; }
  footer a:hover { text-decoration: underline; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Babylon Level Kit — Documentation</h1>
    <p class="tag">Guides for the runtime engine and Blender add-on.</p>
  </header>

  <div class="guide-cards">
    <a class="guide-card engine" href="engine/00-INDEX.html">
      <h2>Engine (runtime)</h2>
      <p>Load pipeline, behaviors, physics, rendering — start with the prose guide.</p>
      <span class="guide-cta">Read the guide →</span>
    </a>
    <a class="guide-card blender" href="blender/00-INDEX.html">
      <h2>Blender add-on</h2>
      <p>Export, components, validation, Live Link — the editor half of the kit.</p>
      <span class="guide-cta">Read the guide →</span>
    </a>
  </div>

  ${gettingStartedHtml()}

  <div class="search-tools">
    <div class="search">
      <input id="q" type="search" autocomplete="off" spellcheck="false"
        placeholder="Search docs… collision, OnUpdate, export">
    </div>
    ${topicSelectHtml()}
  </div>
  <p id="topic-blurb" style="display:none"></p>

  <span id="count"></span>
  <div id="results">${startHtml}</div>

  <footer>
    Contributor docs:
    <a href="BUILDING-DOCS.html">Building the docs</a> ·
    <a href="STYLE_GUIDE.md">Style guide</a> ·
    <a href="LLM_PLAYBOOK.md">Playbooks (LLM)</a>
    · <a href="LLM_SCRIPTING_CONTEXT.md">Behavior contract</a>
    · <a href="LLM_KERNEL.md">Kernel</a>
    · Regenerate with <code>npm run docs:build</code>.
  </footer>
</div>

<script>
const INDEX = ${JSON.stringify(index)};
const SYN = ${JSON.stringify(SYNONYMS)};
const TOPICS = ${JSON.stringify(topicPayload)};
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
  const prose = index.filter((e) => e.kind === "prose").length;
  console.log(`landing page: docs/index.html (${index.length} pages indexed, ${prose} prose)`);
}

if (import.meta.url === new URL(process.argv[1], "file:").href)
{
  BuildLandingPage();
}
