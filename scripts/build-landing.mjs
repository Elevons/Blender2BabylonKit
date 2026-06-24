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
  "  var topicBar = document.getElementById('topic-bar');",
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
  "    Array.prototype.forEach.call(document.querySelectorAll('.topic-card'), function (el) {",
  "      el.classList.toggle('on', el.getAttribute('data-topic') === activeTopic);",
  "    });",
  "    if (topicBlurb) {",
  "      var def = activeTopic ? topicDef(activeTopic) : null;",
  "      topicBlurb.innerHTML = def",
  "        ? '<strong>' + def.label + '</strong> — ' + def.blurb",
  "        : 'Pick a topic above, or search across all docs.';",
  "      topicBlurb.style.display = 'block';",
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
  "        + group('Subsystem diagrams & traces', diagrams)",
  "        + group('Prose chapters', prose);",
  "      return;",
  "    }",
  "",
  "    count.textContent = 'Pick a topic above, or search — ' + INDEX.length + ' pages indexed';",
  "    out.innerHTML = '<p class=\"hint\">Select a topic to see curated starting points, or type in the search box.</p>';",
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
  "  Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (chip) {",
  "    chip.addEventListener('click', function () {",
  "      box.value = chip.getAttribute('data-term');",
  "      run();",
  "      box.focus();",
  "    });",
  "  });",
  "",
  "  Array.prototype.forEach.call(document.querySelectorAll('.topic-card'), function (el) {",
  "    el.addEventListener('click', function () {",
  "      var id = el.getAttribute('data-topic');",
  "      setTopic(activeTopic === id ? null : id);",
  "    });",
  "  });",
  "",
  "  var clearBtn = document.getElementById('topic-clear');",
  "  if (clearBtn) {",
  "    clearBtn.addEventListener('click', function () { setTopic(null); });",
  "  }",
  "",
  "  var params = new URLSearchParams(window.location.search);",
  "  if (params.get('q')) { box.value = params.get('q'); }",
  "  if (params.get('topic')) { activeTopic = params.get('topic'); }",
  "  Array.prototype.forEach.call(document.querySelectorAll('.topic-card'), function (el) {",
  "    el.classList.toggle('on', el.getAttribute('data-topic') === activeTopic);",
  "  });",
  "  if (topicBlurb) {",
  "    var initDef = activeTopic ? topicDef(activeTopic) : null;",
  "    topicBlurb.innerHTML = initDef",
  "      ? '<strong>' + initDef.label + '</strong> — ' + initDef.blurb",
  "      : 'Pick a topic above, or search across all docs.';",
  "  }",
  "  run();",
  "  box.focus();",
  "})();",
].join("\n");

// ---------------------------------------------------------------------------
// Page template
// ---------------------------------------------------------------------------

function topicCardsHtml()
{
  return TOPICS.map((t) =>
    `<button type="button" class="topic-card" data-topic="${t.id}">${t.label}</button>`
  ).join("");
}

function subsystemDiagramsHtml()
{
  const engineLinks = Object.entries(ENGINE_AREA_PAGES).map(([file, page]) => {
    const label = page.navLabel
      ?? page.diagram.title.replace(/^Babylon Level Kit — /, "");
    return `<a class="diagram-link engine" href="engine/${file}">${label}</a>`;
  }).join("");

  const blenderLinks = Object.entries(BLENDER_AREA_PAGES).map(([file, page]) =>
    `<a class="diagram-link blender" href="blender/${file}">${page.title}</a>`
  ).join("");

  return `
  <section class="diagram-index" aria-label="Subsystem diagrams">
    <h2 class="diagram-index-title">Subsystem diagrams</h2>
    <p class="diagram-index-blurb">Clickable node maps — jump straight to a topic without searching.</p>
    <div class="diagram-group">
      <h3 class="diagram-side eng">Engine <span class="diagram-count">${Object.keys(ENGINE_AREA_PAGES).length}</span></h3>
      <div class="diagram-links">${engineLinks}</div>
      <p class="diagram-more"><a href="engine/00-INDEX.html">Engine prose index →</a></p>
    </div>
    <div class="diagram-group">
      <h3 class="diagram-side bl">Blender <span class="diagram-count">${Object.keys(BLENDER_AREA_PAGES).length}</span></h3>
      <div class="diagram-links">${blenderLinks}</div>
      <p class="diagram-more"><a class="bl" href="blender/00-INDEX.html">Blender prose index →</a></p>
    </div>
  </section>`;
}

function Page(index)
{
  const chips = SUGGESTIONS
    .map((s) => `<button type="button" class="chip" data-term="${s}">${s}</button>`)
    .join("");

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
    background: #0c0c0a; color: #d8dae6;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    min-height: 100vh; padding: 48px 20px 80px;
  }
  .wrap { max-width: 860px; margin: 0 auto; }
  header { text-align: center; margin-bottom: 22px; }
  h1 { font-size: 26px; font-weight: 700; letter-spacing: .01em; color: #f0ead8; }
  .tag { margin-top: 8px; color: #6c7396; font-size: 13px; line-height: 1.5; }
  .tag b.eng { color: #8fa3ff; } .tag b.bl { color: #f0cda8; }
  #topic-bar {
    display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;
    margin: 20px 0 10px;
  }
  .topic-card {
    background: #131319; border: 1px solid #2a2838; color: #9aa0c0;
    font: 12px ui-monospace, monospace; padding: 8px 12px; border-radius: 8px;
    cursor: pointer; transition: all .12s;
  }
  .topic-card:hover { border-color: #4f6df5; color: #cdd5ff; }
  .topic-card.on {
    background: #1a2040; border-color: #4f6df5; color: #e8ecff;
    box-shadow: 0 0 0 2px #4f6df533;
  }
  #topic-blurb {
    text-align: center; color: #8b91ad; font-size: 12.5px; line-height: 1.55;
    margin: 8px 4px 4px; min-height: 1.4em;
  }
  #topic-blurb strong { color: #c8d0f0; font-weight: 600; }
  #topic-clear {
    display: block; margin: 4px auto 0; background: none; border: none;
    color: #565d7a; font: 11px inherit; cursor: pointer; text-decoration: underline;
  }
  #topic-clear:hover { color: #8b91ad; }
  .search { margin: 20px 0 14px; }
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
  .hint { color: #6c7396; font-size: 13px; padding: 12px 2px 8px; line-height: 1.5; }
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
  .card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; flex-wrap: wrap; }
  .card-title { font-size: 15px; font-weight: 600; color: #f0ead8; }
  .card-sum { color: #8b91ad; font-size: 12.5px; line-height: 1.5; }
  .badge {
    font-size: 10px; text-transform: uppercase; letter-spacing: .06em;
    padding: 2px 7px; border-radius: 5px; font-weight: 600;
  }
  .badge.engine { background: #4f6df5; color: #fff; }
  .badge.blender { background: #e08a3c; color: #2a1c0e; }
  .badge.kind-diagram { background: #23222e; color: #8b91ad; }
  .badge.kind-trace { background: #1e2a1e; color: #8aad8b; }
  .badge.kind-prose { background: #2a2420; color: #c0a878; }
  .badge.kind-meta { background: #1e2430; color: #9ab0e0; }
  .glossary {
    background: #12111a; border: 1px solid #1e1c28; border-radius: 10px;
    padding: 14px 18px; margin: 0 0 18px; font-size: 13px; line-height: 1.55; color: #a8adc4;
  }
  .glossary dt { color: #cdd5ff; font-weight: 600; margin-top: 8px; }
  .glossary dt:first-child { margin-top: 0; }
  .glossary dd { margin: 2px 0 0 0; }
  .diagram-index {
    background: #101018; border: 1px solid #1e1c28; border-radius: 12px;
    padding: 16px 18px 14px; margin: 0 0 20px;
  }
  .diagram-index-title {
    font-size: 13px; text-transform: uppercase; letter-spacing: .1em;
    color: #9aa0c0; font-weight: 600; margin-bottom: 6px;
  }
  .diagram-index-blurb {
    font-size: 12.5px; color: #6c7396; line-height: 1.5; margin-bottom: 14px;
  }
  .diagram-group { margin-bottom: 14px; }
  .diagram-group:last-child { margin-bottom: 0; }
  .diagram-side {
    font-size: 12px; font-weight: 600; margin: 0 0 8px;
    display: flex; align-items: center; gap: 8px;
  }
  .diagram-side.eng { color: #8fa3ff; }
  .diagram-side.bl { color: #f0cda8; }
  .diagram-count {
    font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 999px;
    background: #1a1a24; color: #6c7396;
  }
  .diagram-links { display: flex; flex-wrap: wrap; gap: 7px; }
  .diagram-link {
    display: inline-block; text-decoration: none; font-size: 12px;
    padding: 6px 11px; border-radius: 8px; border: 1px solid #2a2838;
    background: #131319; color: #b8bdd8; transition: all .12s;
  }
  .diagram-link:hover { transform: translateY(-1px); }
  .diagram-link.engine:hover { border-color: #4f6df5; color: #e8ecff; }
  .diagram-link.blender:hover { border-color: #e08a3c; color: #ffe8d0; }
  .diagram-more { margin: 8px 0 0; font-size: 11.5px; }
  .diagram-more a { color: #8fa3ff; text-decoration: none; }
  .diagram-more a.bl { color: #f0cda8; }
  .diagram-more a:hover { text-decoration: underline; }
  .contrib-panel {
    margin-top: 12px; padding-top: 12px; border-top: 1px solid #1d1b27;
    font-size: 12px; line-height: 1.7;
  }
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
    <p class="tag">Browse by topic or search across <b class="eng">Engine</b>,
      <b class="bl">Blender</b>, <b>prose chapters</b>, and <b>contributor docs</b>.</p>
    <dl class="glossary">
      <dt>Subsystem diagram</dt>
      <dd>Clickable node graph for one slice of the engine or add-on (e.g. <code>physics.html</code>). Not Blender <em>AREA</em> lights.</dd>
      <dt>Code trace</dt>
      <dd>Step-by-step walkthrough with live source extracted at build time (<code>trace-*.html</code>).</dd>
      <dt>Prose chapter</dt>
      <dd>Longer narrative pages (<code>01-ARCHITECTURE.html</code>, …).</dd>
    </dl>
  </header>

  ${subsystemDiagramsHtml()}

  <div id="topic-bar">${topicCardsHtml()}</div>
  <p id="topic-blurb">Pick a topic above, or search across all docs.</p>
  <button type="button" id="topic-clear">Clear topic filter</button>

  <div class="search">
    <input id="q" type="search" autocomplete="off" spellcheck="false"
      placeholder="Search the docs — e.g. collision, scale, export…">
  </div>
  <div class="chips">${chips}</div>

  <span id="count"></span>
  <div id="results"></div>

  <footer>
    Browse directly: <a href="engine/index.html">Engine overview →</a> ·
    <a class="bl" href="blender/index.html">Blender overview →</a> ·
    <a href="BUILDING-DOCS.html">Building the docs →</a><br>
    <div class="contrib-panel">
      <strong>Contributor docs</strong> (markdown, not prose HTML):
      <a href="BUILDING-DOCS.html">BUILDING-DOCS</a> ·
      <a href="STYLE_GUIDE.md">STYLE_GUIDE</a> ·
      <a href="LLM_KERNEL.md">LLM_KERNEL</a> ·
      <a href="LLM_SCRIPTING_CONTEXT.md">LLM_SCRIPTING_CONTEXT</a>
    </div>
    Regenerate with <code>npm run docs:build</code>.
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
