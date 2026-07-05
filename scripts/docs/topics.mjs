/**
 * Documentation topic hub — categories, curated "start here" links, and page membership.
 * Edit when adding a new subsystem diagram, trace, or prose chapter, then npm run docs:build.
 */

/** @typedef {{ id: string, label: string, blurb: string, startHere: string[] }} TopicDef */

/** @type {TopicDef[]} */
export const TOPICS = [
  {
    id: "start",
    label: "Getting started",
    blurb: "Architecture, workflow, and the big-picture maps — start here if you are new.",
    startHere: [
      "QUICKSTART.html",
      "engine/index.html",
      "engine/architecture.html",
      "engine/01-ARCHITECTURE.html",
      "engine/02-RUNTIME-BASICS.html",
      "engine/13-FEATURE-LIST.html",
      "engine/14-API-GUIDE.html",
      "engine/10-FEATURE-TRACES.html",
      "engine/runtime-loop.html",
      "engine/trace-runtime-loop.html",
      "engine/workflow.html",
      "engine/00-INDEX.html",
    ],
  },
  {
    id: "runtime",
    label: "Runtime loop & Babylon hooks",
    blurb: "App bootstrap, runRenderLoop, scene.render, OnUpdate delta time, and subsystem observer timing.",
    startHere: [
      "engine/02-RUNTIME-BASICS.html",
      "engine/runtime-loop.html",
      "engine/trace-runtime-loop.html",
      "engine/trace-lifecycle.html",
    ],
  },
  {
    id: "contributor",
    label: "Contributors",
    blurb: "How docs are built, what to edit, and where source files live.",
    startHere: [
      "BUILDING-DOCS.html",
    ],
  },
  {
    id: "physics",
    label: "Physics & collision",
    blurb: "Colliders, rigid bodies, Havok, constraints, triggers — Blender authoring through runtime bodies.",
    startHere: [
      "engine/physics.html",
      "engine/06-PHYSICS.html",
      "engine/trace-physics.html",
      "blender/trace-collider-preview.html",
      "blender/trace-cog-preview.html",
    ],
  },
  {
    id: "reference",
    label: "Feature list & API",
    blurb: "Complete feature inventory and runtime API reference for behavior authors.",
    startHere: [
      "engine/13-FEATURE-LIST.html",
      "engine/14-API-GUIDE.html",
      "engine/10-FEATURE-TRACES.html",
    ],
  },
  {
    id: "scripting",
    label: "Scripting & behaviors",
    blurb: "Behavior lifecycle (OnStart/OnUpdate/OnDestroy/OnMessage), components vs behaviors, @exposed fields, and entity refs.",
    startHere: [
      "engine/14-API-GUIDE.html",
      "engine/scripting.html",
      "engine/02-RUNTIME-BASICS.html",
      "engine/05-SCRIPTING.html",
      "engine/trace-runtime-loop.html",
      "engine/trace-lifecycle.html",
      "engine/trace-components.html",
      "engine/trace-exposed.html",
      "blender/trace-exposed.html",
      "blender/trace-components.html",
    ],
  },
  {
    id: "export",
    label: "Export & Live Link",
    blurb: "glb + manifest export, validation, Ctrl+S iteration, and sidecar assets.",
    startHere: [
      "blender/export.html",
      "blender/validation.html",
      "blender/livelink.html",
      "blender/PREFABS.html",
      "engine/blender-addon.html",
      "engine/trace-livelink.html",
      "blender/trace-export.html",
      "engine/09-WORKFLOW.html",
    ],
  },
  {
    id: "load",
    label: "Load pipeline",
    blurb: "LevelLoader.Load — manifest fetch, glb append, entity passes, and FinalizeLevel.",
    startHere: [
      "engine/load-pipeline.html",
      "engine/04-LOAD-PIPELINE.html",
      "engine/trace-load.html",
    ],
  },
  {
    id: "rendering",
    label: "Rendering & scene look",
    blurb: "Lights, cameras, shadows, environment, atmosphere, and post-processing.",
    startHere: [
      "engine/rendering.html",
      "blender/scene-settings.html",
      "engine/07-RENDERING.html",
      "engine/trace-lights.html",
      "engine/trace-cameras.html",
      "engine/trace-shadows.html",
      "engine/trace-post.html",
      "engine/trace-atmosphere.html",
      "engine/trace-materials.html",
    ],
  },
  {
    id: "audio",
    label: "Audio & animation",
    blurb: "Spatial audio, NLA clips, autoplay, and the skinned-mesh armature rule.",
    startHere: [
      "engine/audio-animation.html",
      "engine/08-AUDIO-ANIMATION.html",
      "engine/trace-audio.html",
    ],
  },
  {
    id: "ui",
    label: "UI (2D / 3D / particles)",
    blurb: "GUI Editor JSON, particles, MSDF text, and Blender-authored 3D GUI controls.",
    startHere: [
      "engine/ui.html",
      "engine/11-UI.html",
      "engine/trace-gui.html",
      "engine/trace-gui3d.html",
    ],
  },
  {
    id: "input",
    label: "Input",
    blurb: "Input Actions asset, bindings, @inputMap injection, and per-frame action polling.",
    startHere: [
      "engine/input.html",
      "blender/input-actions.html",
      "engine/12-INPUT.html",
      "engine/trace-input.html",
      "blender/trace-input.html",
    ],
  },
  {
    id: "blender",
    label: "Blender add-on internals",
    blurb: "Package layout, data model, and where add-on code lives.",
    startHere: [
      "blender/index.html",
      "blender/00-INDEX.html",
      "blender/PREFABS.html",
      "blender/data-model.html",
      "blender/export.html",
      "engine/03-BLENDER-ADDON.html",
    ],
  },
];

/**
 * Every indexed page href → topic id(s). Hrefs are relative to docs/ (e.g. engine/physics.html).
 */
export const PAGE_TOPICS = {
  // — Contributor / onboarding —
  "BUILDING-DOCS.html": ["contributor", "start"],
  "QUICKSTART.html": ["start", "export", "blender"],
  "STYLE_GUIDE.md": ["contributor", "scripting"],
  "LLM_PLAYBOOK.md": ["scripting", "start"],
  "LLM_SCRIPTING_CONTEXT.md": ["scripting", "start"],
  "LLM_KERNEL.md": ["scripting"],

  // — Engine subsystem diagrams —
  "engine/index.html": ["start"],
  "engine/architecture.html": ["start"],
  "engine/runtime-loop.html": ["runtime", "start", "scripting"],
  "engine/workflow.html": ["start", "export"],
  "engine/blender-addon.html": ["export", "blender"],
  "engine/load-pipeline.html": ["load"],
  "engine/scripting.html": ["scripting", "runtime"],
  "engine/input.html": ["input"],
  "engine/physics.html": ["physics"],
  "engine/rendering.html": ["rendering"],
  "engine/audio-animation.html": ["audio"],
  "engine/ui.html": ["ui"],

  // — Engine traces —
  "engine/trace-physics.html": ["physics"],
  "engine/trace-exposed.html": ["scripting"],
  "engine/trace-lifecycle.html": ["scripting", "load", "runtime"],
  "engine/trace-runtime-loop.html": ["runtime", "scripting", "start"],
  "engine/trace-components.html": ["scripting", "load", "blender"],
  "engine/trace-trigger.html": ["physics", "scripting"],
  "engine/trace-constraint.html": ["physics"],
  "engine/trace-audio.html": ["audio"],
  "engine/trace-load.html": ["load"],
  "engine/trace-atmosphere.html": ["rendering"],
  "engine/trace-lights.html": ["rendering"],
  "engine/trace-cameras.html": ["rendering"],
  "engine/trace-shadows.html": ["rendering"],
  "engine/trace-post.html": ["rendering"],
  "engine/trace-materials.html": ["rendering"],
  "engine/trace-input.html": ["input"],
  "engine/trace-livelink.html": ["export"],
  "engine/trace-gui.html": ["ui"],
  "engine/trace-particles.html": ["ui"],
  "engine/trace-msdfText.html": ["ui"],
  "engine/trace-gui3d.html": ["ui", "scripting"],

  // — Blender subsystem diagrams —
  "blender/index.html": ["blender", "start"],
  "blender/data-model.html": ["blender", "scripting"],
  "blender/export.html": ["export"],
  "blender/input-actions.html": ["input", "blender"],
  "blender/scene-settings.html": ["rendering", "blender"],
  "blender/validation.html": ["export", "blender"],
  "blender/livelink.html": ["export", "blender"],

  // — Blender traces —
  "blender/trace-export.html": ["export"],
  "blender/trace-guid.html": ["blender", "load"],
  "blender/trace-exposed.html": ["scripting", "blender"],
  "blender/trace-components.html": ["scripting", "blender", "export"],
  "blender/trace-validate.html": ["export"],
  "blender/trace-input.html": ["input", "blender"],
  "blender/trace-livelink.html": ["export"],
  "blender/trace-collider-preview.html": ["physics", "blender"],
  "blender/trace-cog-preview.html": ["physics", "blender"],
  "blender/trace-gui3d.html": ["ui", "blender"],
  "blender/trace-particles.html": ["ui", "blender"],
  "blender/trace-materials.html": ["rendering", "blender"],

  // — Engine prose chapters —
  "engine/00-INDEX.html": ["start"],
  "engine/01-ARCHITECTURE.html": ["start"],
  "engine/02-RUNTIME-BASICS.html": ["runtime", "start", "scripting"],
  "engine/03-BLENDER-ADDON.html": ["blender", "export"],
  "engine/04-LOAD-PIPELINE.html": ["load", "runtime"],
  "engine/05-SCRIPTING.html": ["scripting", "runtime"],
  "engine/06-PHYSICS.html": ["physics", "runtime"],
  "engine/07-RENDERING.html": ["rendering"],
  "engine/08-AUDIO-ANIMATION.html": ["audio"],
  "engine/09-WORKFLOW.html": ["start", "export"],
  "engine/10-FEATURE-TRACES.html": ["start"],
  "engine/11-UI.html": ["ui", "runtime"],
  "engine/12-INPUT.html": ["input", "runtime"],
  "engine/13-FEATURE-LIST.html": ["start", "reference"],
  "engine/14-API-GUIDE.html": ["start", "reference", "scripting"],

  // — Blender prose —
  "blender/00-INDEX.html": ["blender", "start"],
  "blender/01-EXPORT.html": ["blender", "export", "start"],
  "blender/02-COMPONENTS.html": ["blender", "scripting"],
  "blender/03-SCENE-SETTINGS.html": ["blender", "rendering"],
  "blender/04-WORKFLOW.html": ["blender", "export", "start"],
  "blender/PREFABS.html": ["blender", "export", "start"],

  // — Launcher prose —
  "launcher/00-INDEX.html": ["start"],
  "launcher/01-LAUNCHER.html": ["start", "export"],
};

/** Topic ids that do not imply a subsystem ↔ trace pairing. */
const META_TOPICS = new Set(["start", "contributor"]);

/** Overview subsystem diagrams — show every trace when no topic overlap. */
export const OVERVIEW_DIAGRAMS = new Set([
  "engine/index.html",
  "engine/architecture.html",
  "blender/index.html",
]);

/** Strip meta topics before matching diagrams to traces. */
export function ContentTopics(topicIds)
{
  return (topicIds ?? []).filter((id) => !META_TOPICS.has(id));
}

/** True when two pages share at least one content topic. */
export function TopicsOverlap(a, b)
{
  const left = new Set(ContentTopics(a));
  return ContentTopics(b).some((id) => left.has(id));
}

/** Subsystem diagram pages (not traces, not numbered prose chapters). */
export function IsSubsystemDiagramHref(href)
{
  const file = href.split("/").pop() ?? "";
  if (file.startsWith("trace-")) { return false; }
  if (/^\d{2}-/.test(file)) { return false; }
  const side = href.split("/")[0];
  return side === "engine" || side === "blender";
}

/**
 * Trace hrefs (relative to docs/) related to a subsystem diagram via PAGE_TOPICS.
 * Overview diagrams fall back to every trace on the same side.
 */
export function TracesForDiagram(diagramHref)
{
  const side = diagramHref.split("/")[0];
  const diagramTopics = PAGE_TOPICS[diagramHref] ?? [];
  const matches = Object.keys(PAGE_TOPICS)
    .filter((href) => href.startsWith(`${side}/trace-`) && TopicsOverlap(diagramTopics, PAGE_TOPICS[href]))
    .sort();

  if (matches.length === 0 && OVERVIEW_DIAGRAMS.has(diagramHref))
  {
    return Object.keys(PAGE_TOPICS).filter((href) => href.startsWith(`${side}/trace-`)).sort();
  }
  return matches;
}

/** Subsystem diagram hrefs related to a trace page via PAGE_TOPICS. */
export function DiagramsForTrace(traceHref)
{
  const side = traceHref.split("/")[0];
  const traceTopics = PAGE_TOPICS[traceHref] ?? [];
  return Object.keys(PAGE_TOPICS)
    .filter((href) => href.startsWith(`${side}/`) && IsSubsystemDiagramHref(href)
      && TopicsOverlap(traceTopics, PAGE_TOPICS[href]))
    .sort();
}

/** Subsystem diagram hrefs related to a trace page via PAGE_TOPICS. */
export function TracesForTrace(traceHref)
{
  const side = traceHref.split("/")[0];
  const traceTopics = PAGE_TOPICS[traceHref] ?? [];
  return Object.keys(PAGE_TOPICS)
    .filter((href) => href.startsWith(`${side}/trace-`)
      && href !== traceHref
      && TopicsOverlap(traceTopics, PAGE_TOPICS[href]))
    .sort();
}

/** Filter [[file, label], …] nav rows to hrefs in `allowed` (docs-relative paths). */
export function FilterNavByHrefs(navRows, side, allowedHrefs)
{
  const allowed = new Set(allowedHrefs);
  const filtered = navRows.filter(([file]) => allowed.has(`${side}/${file}`));
  return filtered.length > 0 ? filtered : navRows;
}

/** Attach topic ids to a search index entry from its href. */
export function TopicsForHref(href)
{
  return PAGE_TOPICS[href] ?? [];
}

/** Lookup topic definition by id. */
export function TopicById(id)
{
  return TOPICS.find((t) => t.id === id);
}
