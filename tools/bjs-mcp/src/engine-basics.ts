export interface EngineBasicsTopic
{
  slug: string;
  title: string;
  summary: string;
  content: string;
  humanDoc: string;
}

/** Distilled engine concepts for LLMs — mirrors docs/engine prose chapters. */
export const ENGINE_BASICS: EngineBasicsTopic[] = [
  {
    slug: "architecture",
    title: "Two artifacts + GUIDs",
    summary: "level.glb carries geometry; level.scene.json carries components.",
    humanDoc: "docs/engine/01-ARCHITECTURE.html",
    content: `# Architecture (behavior author view)

The kit splits Blender export into **two files**:

| File | Contains | You touch it via |
|------|----------|------------------|
| \`level.glb\` | Meshes, transforms, lights, cameras, clips | \`this.entity.node\`, Babylon APIs |
| \`level.scene.json\` | TAG, COLLIDER, SCRIPT, settings | Loaded into \`Entity\` + attachments |

**GUID (\`bjs_id\`)** — every Blender object with components gets a stable ID. The loader matches manifest rows to glTF nodes by GUID. Renaming objects in Blender does not break links.

**You write behaviors** — one \`.ts\` file per SCRIPT component. Everything else is either in the glb or applied by the loader from the manifest.

**Do not** duplicate mesh loading or material import in behaviors.`,
  },
  {
    slug: "frame-loop",
    title: "Frame loop and lifecycle",
    summary: "OnStart once after load; OnUpdate every frame before physics step.",
    humanDoc: "docs/engine/02-RUNTIME-BASICS.html",
    content: `# Frame loop (behavior author view)

**App** owns \`engine.runRenderLoop(() => scene.render())\`.
**Kit** registers \`Level.RunFrame\` on \`onBeforeRenderObservable\`.

Each frame (inside \`RunFrame\`):
1. \`InputManager.Process()\` — poll input
2. Every \`OnUpdate(deltaSeconds)\` on every behavior
3. Camera updater callbacks
4. \`InputManager.EndFrame()\` — edge buttons last one frame
5. Then Havok physics step, then GPU draw

| Hook | When |
|------|------|
| \`OnStart\` | **Once**, end of \`LevelLoader.Load\`, after all @exposed entity refs resolve |
| \`OnUpdate\` | Every \`scene.render()\` |
| \`OnDestroy\` | \`Level.Dispose\` |
| \`OnMessage\` | Trigger enter, GUI click, \`SendMessage\` — not tied to frame order |

\`deltaSeconds\` = seconds (not ms). Multiply **position changes** by it.
**Do not** multiply Babylon **velocity** by \`deltaSeconds\`.`,
  },
  {
    slug: "components-vs-behaviors",
    title: "Component vs behavior",
    summary: "Components are Blender data; behaviors are TypeScript classes from SCRIPT rows.",
    humanDoc: "docs/engine/05-SCRIPTING.html",
    content: `# Component vs behavior

| Word | Meaning |
|------|---------|
| **Component** | Data on an entity in Blender (TAG, COLLIDER, SCRIPT, …) → manifest JSON |
| **Behavior** | Runtime class \`extends Behavior\` from a **SCRIPT** component |

TAG / COLLIDER / RIGIDBODY are **not** behaviors — the loader applies them directly.
Only SCRIPT rows become \`Behavior\` instances on \`entity.behaviors\`.

Query what's on an entity: \`entity.GetAttachment("COLLIDER")\`, \`entity.attachments\`.
There is no \`entity.manifest\` at runtime.

**Runtime mutations (app code):** \`level.componentHost.AddComponent(entity, component)\` /
\`RemoveComponent(entity, type, index?)\` — SCRIPT, TAG, AUDIO, GUI, PARTICLE,
MSDF_TEXT, COLLIDER, RIGIDBODY, CONSTRAINT, GUI3D_* supported; CAMERA,
REFLECTION_PROBE, render/collision layer kinds are load-only.`,
  },
  {
    slug: "load-order",
    title: "What exists when OnStart runs",
    summary: "Physics, triggers, constraints exist before OnStart; post runs after.",
    humanDoc: "docs/engine/04-LOAD-PIPELINE.html",
    content: `# Load order (what you can assume in OnStart)

**Already done before \`OnStart\`:**
- glb appended, entities built, components applied
- Physics bodies, colliders, trigger registrations queued
- @exposed scalar values applied; entity refs resolved in second pass
- @inputMap / \`this.input\` injected
- Constraints and 3D GUI built in \`FinalizeLevel\`

**Not available in behaviors:**
- \`Level\` handle (\`level.post\`, \`level.atmosphere\`, etc.)
- Post-processing targets your behavior's camera swap timing — prefer authoring in Blender

**OnStart order across entities** is unspecified — guard null entity refs.`,
  },
  {
    slug: "blender-vs-behavior",
    title: "Author in Blender vs write in behavior",
    summary: "If it is scene-wide or a joint/collider, Blender. If it is gameplay logic, behavior.",
    humanDoc: "docs/engine/13-FEATURE-LIST.html",
    content: `# Blender vs behavior (decision table)

| Need | Blender | Behavior |
|------|---------|----------|
| Collider / mass / joint | COLLIDER, RIGIDBODY, CONSTRAINT | Read \`entity.body\`, motors, OnMessage |
| Camera type | CAMERA component on camera | Geospatial flyTo only |
| Sky / fog / bloom / SSAO | Babylon Scene panels | **Never** |
| Input bindings | Input Actions panel | \`FindAction("Name")\` |
| Tunable per-object fields | @exposed + Sync | Declare @exposed in .ts |
| Trigger → gameplay (data) | COLLIDER › Event Messages | OnMessage on target entity |
| Collision/trigger hooks | — | OnCollision* / OnTrigger* on own behaviors |
| 2D HUD / particles | GUI / PARTICLE components | GetGui / GetParticles |
| MSDF 3D labels | MSDF_TEXT component | GetTextRenderer — update text only |

When unsure: \`list_scene_entities\` shows what's already authored in the level.`,
  },
];

export function GetEngineBasics(slug?: string): string
{
  if (slug === undefined || slug.trim().length === 0 || slug === "list")
  {
    const lines = ENGINE_BASICS.map(
      (topic) => `- **${topic.slug}** — ${topic.title} (\`${topic.humanDoc}\`)`
    );
    return `# Engine basics topics\n\n${lines.join("\n")}\n\nCall get_engine_basics(topic="…") for full text.`;
  }

  const normalized = slug.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const topic = ENGINE_BASICS.find(
    (entry) => entry.slug === normalized || entry.slug.includes(normalized)
  );

  if (topic === undefined)
  {
    const available = ENGINE_BASICS.map((entry) => entry.slug).join(", ");
    return `Unknown topic "${slug}". Available: ${available}`;
  }

  return `${topic.content}\n\n---\nHuman doc: \`${topic.humanDoc}\``;
}
