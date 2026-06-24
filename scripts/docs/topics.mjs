/**
 * Documentation topic hub — categories, curated "start here" links, and page membership.
 * Edit when adding a new diagram, trace, or prose chapter, then npm run docs:build.
 */

/** @typedef {{ id: string, label: string, blurb: string, startHere: string[] }} TopicDef */

/** @type {TopicDef[]} */
export const TOPICS = [
  {
    id: "start",
    label: "Getting started",
    blurb: "Architecture, workflow, and the big-picture maps — start here if you are new.",
    startHere: [
      "engine/index.html",
      "engine/01-ARCHITECTURE.html",
      "engine/workflow.html",
      "engine/00-INDEX.html",
    ],
  },
  {
    id: "physics",
    label: "Physics & collision",
    blurb: "Colliders, rigid bodies, Havok, constraints, triggers — Blender authoring through runtime bodies.",
    startHere: [
      "engine/physics.html",
      "engine/05-PHYSICS.html",
      "engine/trace-physics.html",
      "blender/trace-collider-preview.html",
    ],
  },
  {
    id: "scripting",
    label: "Scripting & behaviors",
    blurb: "Behavior classes, @exposed fields, entity refs, and the OnMessage gameplay hook.",
    startHere: [
      "engine/scripting.html",
      "engine/04-SCRIPTING.html",
      "engine/trace-exposed.html",
      "blender/trace-exposed.html",
    ],
  },
  {
    id: "export",
    label: "Export & Live Link",
    blurb: "glb + manifest export, validation, Ctrl+S iteration, and sidecar assets.",
    startHere: [
      "blender/export.html",
      "engine/blender-addon.html",
      "engine/trace-livelink.html",
      "blender/trace-export.html",
      "engine/08-WORKFLOW.html",
    ],
  },
  {
    id: "load",
    label: "Load pipeline",
    blurb: "LevelLoader.Load — manifest fetch, glb append, entity passes, and FinalizeLevel.",
    startHere: [
      "engine/load-pipeline.html",
      "engine/03-LOAD-PIPELINE.html",
      "engine/trace-load.html",
    ],
  },
  {
    id: "rendering",
    label: "Rendering & scene look",
    blurb: "Lights, cameras, shadows, environment, atmosphere, and post-processing.",
    startHere: [
      "engine/rendering.html",
      "engine/06-RENDERING.html",
      "engine/trace-atmosphere.html",
    ],
  },
  {
    id: "audio",
    label: "Audio & animation",
    blurb: "Spatial audio, NLA clips, autoplay, and the skinned-mesh armature rule.",
    startHere: [
      "engine/audio-animation.html",
      "engine/07-AUDIO-ANIMATION.html",
      "engine/trace-audio.html",
    ],
  },
  {
    id: "ui",
    label: "UI (2D / 3D / particles)",
    blurb: "GUI Editor JSON, particles, MSDF text, and Blender-authored 3D GUI controls.",
    startHere: [
      "engine/ui.html",
      "engine/10-UI.html",
      "engine/trace-gui.html",
      "engine/trace-gui3d.html",
    ],
  },
  {
    id: "input",
    label: "Input",
    blurb: "Input Actions asset, bindings, @inputMap injection, and per-frame action polling.",
    startHere: [
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
      "blender/data-model.html",
      "engine/02-BLENDER-ADDON.html",
    ],
  },
];

/**
 * Every indexed page href → topic id(s). Hrefs are relative to docs/ (e.g. engine/physics.html).
 */
export const PAGE_TOPICS = {
  // — Engine area diagrams —
  "engine/index.html": ["start"],
  "engine/workflow.html": ["start", "export"],
  "engine/blender-addon.html": ["export", "blender"],
  "engine/load-pipeline.html": ["load"],
  "engine/scripting.html": ["scripting"],
  "engine/physics.html": ["physics"],
  "engine/rendering.html": ["rendering"],
  "engine/audio-animation.html": ["audio"],
  "engine/ui.html": ["ui"],

  // — Engine traces —
  "engine/trace-physics.html": ["physics"],
  "engine/trace-exposed.html": ["scripting"],
  "engine/trace-trigger.html": ["physics", "scripting"],
  "engine/trace-constraint.html": ["physics"],
  "engine/trace-audio.html": ["audio"],
  "engine/trace-load.html": ["load"],
  "engine/trace-atmosphere.html": ["rendering"],
  "engine/trace-input.html": ["input"],
  "engine/trace-livelink.html": ["export"],
  "engine/trace-gui.html": ["ui"],
  "engine/trace-particles.html": ["ui"],
  "engine/trace-msdfText.html": ["ui"],
  "engine/trace-gui3d.html": ["ui", "scripting"],

  // — Blender area diagrams —
  "blender/index.html": ["blender", "start"],
  "blender/data-model.html": ["blender", "scripting"],
  "blender/export.html": ["export"],

  // — Blender traces —
  "blender/trace-export.html": ["export"],
  "blender/trace-guid.html": ["blender", "load"],
  "blender/trace-exposed.html": ["scripting", "blender"],
  "blender/trace-validate.html": ["export"],
  "blender/trace-input.html": ["input", "blender"],
  "blender/trace-livelink.html": ["export"],
  "blender/trace-collider-preview.html": ["physics", "blender"],
  "blender/trace-gui3d.html": ["ui", "blender"],
  "blender/trace-particles.html": ["ui", "blender"],

  // — Engine prose chapters —
  "engine/00-INDEX.html": ["start"],
  "engine/01-ARCHITECTURE.html": ["start"],
  "engine/02-BLENDER-ADDON.html": ["blender", "export"],
  "engine/03-LOAD-PIPELINE.html": ["load"],
  "engine/04-SCRIPTING.html": ["scripting"],
  "engine/05-PHYSICS.html": ["physics"],
  "engine/06-RENDERING.html": ["rendering"],
  "engine/07-AUDIO-ANIMATION.html": ["audio"],
  "engine/08-WORKFLOW.html": ["start", "export"],
  "engine/09-FEATURE-TRACES.html": ["start"],
  "engine/10-UI.html": ["ui"],

  // — Launcher prose —
  "launcher/00-INDEX.html": ["start"],
  "launcher/01-LAUNCHER.html": ["start", "export"],
};

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
