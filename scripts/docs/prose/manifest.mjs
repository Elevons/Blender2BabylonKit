/**
 * Prose chapter registry — HTML body fragments + output paths.
 * Edit scripts/docs/prose/content/*.html, then npm run docs:build.
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
    next: "02-BLENDER-ADDON.html",
  },
  {
    href: "engine/02-BLENDER-ADDON.html",
    side: "engine",
    title: "02 — Blender Add-on",
    fragment: "engine/02-BLENDER-ADDON.html",
    prev: "01-ARCHITECTURE.html",
    next: "03-LOAD-PIPELINE.html",
  },
  {
    href: "engine/03-LOAD-PIPELINE.html",
    side: "engine",
    title: "03 — Load Pipeline",
    fragment: "engine/03-LOAD-PIPELINE.html",
    prev: "02-BLENDER-ADDON.html",
    next: "04-SCRIPTING.html",
  },
  {
    href: "engine/04-SCRIPTING.html",
    side: "engine",
    title: "04 — Scripting",
    fragment: "engine/04-SCRIPTING.html",
    prev: "03-LOAD-PIPELINE.html",
    next: "05-PHYSICS.html",
  },
  {
    href: "engine/05-PHYSICS.html",
    side: "engine",
    title: "05 — Physics",
    fragment: "engine/05-PHYSICS.html",
    prev: "04-SCRIPTING.html",
    next: "06-RENDERING.html",
  },
  {
    href: "engine/06-RENDERING.html",
    side: "engine",
    title: "06 — Rendering",
    fragment: "engine/06-RENDERING.html",
    prev: "05-PHYSICS.html",
    next: "07-AUDIO-ANIMATION.html",
  },
  {
    href: "engine/07-AUDIO-ANIMATION.html",
    side: "engine",
    title: "07 — Audio & Animation",
    fragment: "engine/07-AUDIO-ANIMATION.html",
    prev: "06-RENDERING.html",
    next: "08-WORKFLOW.html",
  },
  {
    href: "engine/08-WORKFLOW.html",
    side: "engine",
    title: "08 — Workflow",
    fragment: "engine/08-WORKFLOW.html",
    prev: "07-AUDIO-ANIMATION.html",
    next: "09-FEATURE-TRACES.html",
  },
  {
    href: "engine/09-FEATURE-TRACES.html",
    side: "engine",
    title: "09 — Feature Traces",
    fragment: "engine/09-FEATURE-TRACES.html",
    prev: "08-WORKFLOW.html",
    next: "10-UI.html",
  },
  {
    href: "engine/10-UI.html",
    side: "engine",
    title: "10 — UI",
    fragment: "engine/10-UI.html",
    prev: "09-FEATURE-TRACES.html",
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
      '<a href="index.html">← Search</a>',
      '<span class="sep">|</span>',
      '<a href="engine/00-INDEX.html">Engine docs</a>',
      '<span class="sep">|</span>',
      '<a href="blender/index.html">Blender docs</a>',
    ].join("\n    ");
  }

  const isLauncher = chapter.href.startsWith("launcher/");
  if (isLauncher)
  {
    return [
      '<a href="../index.html">← Search</a>',
      '<span class="sep">|</span>',
      '<a href="00-INDEX.html">Launcher index</a>',
      '<span class="sep">|</span>',
      '<a href="../engine/00-INDEX.html">Runtime docs</a>',
    ].join("\n    ");
  }
  return [
    '<a href="../index.html">← Search</a>',
    '<span class="sep">|</span>',
    '<a href="00-INDEX.html">Engine index</a>',
    '<span class="sep">|</span>',
    '<a href="index.html">Diagrams</a>',
    '<span class="sep">|</span>',
    '<a href="../blender/index.html">Blender docs</a>',
  ].join("\n    ");
}
