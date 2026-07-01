/**
 * Prose chapter registry — HTML body fragments + output paths.
 *
 * New chapter checklist:
 *   1. Copy _FRAGMENT-TEMPLATE.html → engine/NN-TITLE.html (or blender/launcher/)
 *   2. Append entry below with prev/next wired into the chain
 *   3. Add href → topics in scripts/docs/topics.mjs (PAGE_TOPICS)
 *   4. Link from the side's 00-INDEX.html
 *   5. npm run docs:validate && npm run docs:build
 *
 * Edit fragments under scripts/docs/prose/content/, then npm run docs:build.
 */

/** @typedef {{ href: string, side: "engine"|"blender", title: string, fragment: string, layout?: "chapter"|"meta", prev?: string|null, next?: string|null }} ProseChapter */

/** @type {ProseChapter[]} */
export const PROSE_CHAPTERS = [
  // — Meta (docs root) —
  {
    href: "BUILDING-DOCS.html",
    side: "engine",
    title: "Building the documentation",
    fragment: "meta/BUILDING-DOCS.html",
    layout: "meta",
  },
  // — Engine —
  {
    href: "engine/00-INDEX.html",
    side: "engine",
    title: "Engine (Runtime) Documentation",
    fragment: "engine/00-INDEX.html",
    next: "01-ARCHITECTURE.html",
  },
  {
    href: "engine/01-ARCHITECTURE.html",
    side: "engine",
    title: "01 — Architecture",
    fragment: "engine/01-ARCHITECTURE.html",
    prev: "00-INDEX.html",
    next: "02-RUNTIME-BASICS.html",
  },
  {
    href: "engine/02-RUNTIME-BASICS.html",
    side: "engine",
    title: "02 — Runtime Basics",
    fragment: "engine/02-RUNTIME-BASICS.html",
    prev: "01-ARCHITECTURE.html",
    next: "03-BLENDER-ADDON.html",
  },
  {
    href: "engine/03-BLENDER-ADDON.html",
    side: "engine",
    title: "03 — Blender Add-on",
    fragment: "engine/03-BLENDER-ADDON.html",
    prev: "02-RUNTIME-BASICS.html",
    next: "04-LOAD-PIPELINE.html",
  },
  {
    href: "engine/04-LOAD-PIPELINE.html",
    side: "engine",
    title: "04 — Load Pipeline",
    fragment: "engine/04-LOAD-PIPELINE.html",
    prev: "03-BLENDER-ADDON.html",
    next: "05-SCRIPTING.html",
  },
  {
    href: "engine/05-SCRIPTING.html",
    side: "engine",
    title: "05 — Scripting",
    fragment: "engine/05-SCRIPTING.html",
    prev: "04-LOAD-PIPELINE.html",
    next: "06-PHYSICS.html",
  },
  {
    href: "engine/06-PHYSICS.html",
    side: "engine",
    title: "06 — Physics",
    fragment: "engine/06-PHYSICS.html",
    prev: "05-SCRIPTING.html",
    next: "07-RENDERING.html",
  },
  {
    href: "engine/07-RENDERING.html",
    side: "engine",
    title: "07 — Rendering",
    fragment: "engine/07-RENDERING.html",
    prev: "06-PHYSICS.html",
    next: "08-AUDIO-ANIMATION.html",
  },
  {
    href: "engine/08-AUDIO-ANIMATION.html",
    side: "engine",
    title: "08 — Audio & Animation",
    fragment: "engine/08-AUDIO-ANIMATION.html",
    prev: "07-RENDERING.html",
    next: "09-WORKFLOW.html",
  },
  {
    href: "engine/09-WORKFLOW.html",
    side: "engine",
    title: "09 — Workflow",
    fragment: "engine/09-WORKFLOW.html",
    prev: "08-AUDIO-ANIMATION.html",
    next: "10-FEATURE-TRACES.html",
  },
  {
    href: "engine/10-FEATURE-TRACES.html",
    side: "engine",
    title: "10 — Feature Traces",
    fragment: "engine/10-FEATURE-TRACES.html",
    prev: "09-WORKFLOW.html",
    next: "11-UI.html",
  },
  {
    href: "engine/11-UI.html",
    side: "engine",
    title: "11 — UI",
    fragment: "engine/11-UI.html",
    prev: "10-FEATURE-TRACES.html",
    next: "12-INPUT.html",
  },
  {
    href: "engine/12-INPUT.html",
    side: "engine",
    title: "12 — Input",
    fragment: "engine/12-INPUT.html",
    prev: "11-UI.html",
    next: "13-FEATURE-LIST.html",
  },
  {
    href: "engine/13-FEATURE-LIST.html",
    side: "engine",
    title: "13 — Feature List",
    fragment: "engine/13-FEATURE-LIST.html",
    prev: "12-INPUT.html",
    next: "14-API-GUIDE.html",
  },
  {
    href: "engine/14-API-GUIDE.html",
    side: "engine",
    title: "14 — API Guide",
    fragment: "engine/14-API-GUIDE.html",
    prev: "13-FEATURE-LIST.html",
  },
  // — Blender —
  {
    href: "blender/00-INDEX.html",
    side: "blender",
    title: "Blender Add-on Documentation",
    fragment: "blender/00-INDEX.html",
    next: "PREFABS.html",
  },
  {
    href: "blender/PREFABS.html",
    side: "blender",
    title: "Prefabs (linked .blend files)",
    fragment: "blender/PREFABS.html",
    prev: "00-INDEX.html",
  },
  // — Launcher —
  {
    href: "launcher/00-INDEX.html",
    side: "engine",
    title: "Babylon Launcher",
    fragment: "launcher/00-INDEX.html",
    next: "01-LAUNCHER.html",
  },
  {
    href: "launcher/01-LAUNCHER.html",
    side: "engine",
    title: "01 — Launcher",
    fragment: "launcher/01-LAUNCHER.html",
    prev: "00-INDEX.html",
  },
];

export function ChapterNavHtml(chapter)
{
  if (chapter.layout === "meta") { return ""; }

  const parts = [`<a href="00-INDEX.html">← Index</a>`];
  if (chapter.prev)
  {
    parts.push(`<span class="dim">·</span> <a href="${chapter.prev}">Prev</a>`);
  }
  if (chapter.next)
  {
    parts.push(`<span class="dim">·</span> <a href="${chapter.next}">Next →</a>`);
  }
  return `<p class="chapter-nav">${parts.join(" ")}</p>`;
}

export function ToolbarHtml(chapter)
{
  if (chapter.layout === "meta")
  {
    return [
    '<a href="index.html" class="site">Docs</a>',
    '<span class="sep">/</span>',
    '<a href="engine/00-INDEX.html">Engine</a>',
    '<span class="sep">/</span>',
    '<a href="blender/00-INDEX.html">Blender</a>',
  ].join("\n    ");
  }

  const isLauncher = chapter.href.startsWith("launcher/");
  if (isLauncher)
  {
    return [
      '<a href="../index.html" class="site">Docs</a>',
      '<span class="sep">/</span>',
      '<a href="00-INDEX.html">Launcher</a>',
      '<span class="sep">/</span>',
      '<a href="../engine/00-INDEX.html">Engine</a>',
    ].join("\n    ");
  }
  if (chapter.side === "blender")
  {
    return [
      '<a href="../index.html" class="site">Docs</a>',
      '<span class="sep">/</span>',
      '<a href="00-INDEX.html">Blender</a>',
      '<span class="sep">/</span>',
      '<a href="../engine/00-INDEX.html">Engine</a>',
    ].join("\n    ");
  }
  return [
    '<a href="../index.html" class="site">Docs</a>',
    '<span class="sep">/</span>',
    '<a href="00-INDEX.html">Engine</a>',
    '<span class="sep">/</span>',
    '<a href="../blender/00-INDEX.html">Blender</a>',
  ].join("\n    ");
}
