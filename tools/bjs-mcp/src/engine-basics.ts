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
    summary: "OnStart once after load; OnPostReady once after post attach; OnUpdate every frame before physics step.",
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
| \`OnPostReady\` | **Once**, after NME compile + \`ApplyPostProcessing\` (\`level.postReady\`) |
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
| **Component** | Data on an entity in Blender (TAG, COLLIDER, SCRIPT, ANIMATOR, …) → manifest JSON |
| **Behavior** | Runtime class \`extends Behavior\` from a **SCRIPT** component (ANIMATOR also mounts a built-in \`AnimatorController\`) |

TAG / COLLIDER / RIGIDBODY are **not** behaviors — the loader applies them directly.
SCRIPT rows become \`Behavior\` instances; ANIMATOR rows become \`AnimatorController\`
instances — both appear on \`entity.behaviors\`. Animator State clips use **Action**
names (glTF ACTIONS export), not NLA strip labels.

Query what's on an entity: \`entity.GetAttachment("COLLIDER")\`, \`entity.GetAttachment("ANIMATOR")\`, \`entity.attachments\`.
Multiple rows of the same type: Blender header **Name** → manifest \`name\` → \`GetNamedAttachment(type, name)\` or \`GetScript(name)\` for SCRIPT rows (\`GetBehavior(Ctor)\` returns only the first instance).
There is no \`entity.manifest\` at runtime.

**Runtime mutations (app code):** \`level.componentHost.AddComponent(entity, component)\` /
\`RemoveComponent(entity, type, index?)\` — SCRIPT, TAG, AUDIO, GUI, PARTICLE,
MSDF_TEXT, COLLIDER, RIGIDBODY, CONSTRAINT, GUI3D_* supported; CAMERA,
ANIMATOR, REFLECTION_PROBE, render/collision layer kinds are load-only.`,
  },
  {
    slug: "load-order",
    title: "What exists when OnStart runs",
    summary: "Physics, triggers, constraints exist before OnStart; post and OnPostReady run after.",
    humanDoc: "docs/engine/04-LOAD-PIPELINE.html",
    content: `# Load order (what you can assume in OnStart vs OnPostReady)

**Already done before \`OnStart\`:**
- glb appended, entities built, components applied
- glTF \`COLOR_1+\` preserved on meshes (\`bjs_extra_vertex_colors\` — stock Babylon only loads \`COLOR_0\`)
- Physics bodies, colliders, trigger registrations queued
- @exposed scalar values applied; entity refs resolved in second pass
- @inputMap / \`this.input\` injected
- Constraints and 3D GUI built in \`FinalizeLevel\`

**Not available in \`OnStart\`:**
- \`level.post\` / Default Rendering Pipeline (\`level.postReady\` is false)
- Zone LUT swaps — use \`OnPostReady\` instead

**After \`Begin()\` → your \`OnStart\` (runtime cameras, probes, etc.):**
- \`ApplyLateRendering\`: \`BuildNodeMaterials\` + \`ApplyPostProcessing\` on \`scene.activeCamera\`
- \`NotifyPostReady()\`: every behavior's \`OnPostReady\` once (\`level.postReady = true\`)
- Color grading LUTs (\`.3dl\`, Adobe \`.cube\`, strip \`.png\`) run in the pipeline image-processing pass; \`.cube\` loads via \`CubeColorGradingTexture\` (\`subsystems/postprocess/cubeLutTexture.ts\`). Zone behaviors call exported \`ApplyColorGradingLut\` on \`level.post.pipeline.imageProcessing\` in **\`OnPostReady\`** — cast \`this.spawner as Level\` for \`componentHost.baseUrl\` (see \`FogChanger.ts\`, fragment \`zone-lut-swap\`).
- Zone overlap (fog, underwater toggles): poll \`IsEntityInsideColliderVolume(probe, volume)\` in \`OnStart\`/\`OnUpdate\` — fragment \`poll-trigger-volume\`; manual colliders use manifest dimensions, auto-fit colliders resolve owned-mesh bounds like Havok body build; assign explicit probe entity when script host ≠ sample point (\`FogChanger.ts\`, \`ToggleInWater.ts\`). Underwater FX targets: \`SetEntityActive(target, inside)\` — fragment \`set-entity-active\`.

**Spawn / runtime SCRIPT add:** when \`level.postReady\` is already true, \`OnPostReady\` runs immediately after \`OnStart\`.

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
| Camera type | CAMERA component on camera | Geospatial flyTo; if you must \`new\` a camera, \`FindCameraForNode\` + \`CopyLens\` |
| Sky / fog / bloom / SSAO | Babylon Scene panels | **Never** |
| Color grading LUT (scene-wide) | Post-Processing › Color Grading | **Rare** — zone swap via \`ApplyColorGradingLut\` |
| Zone LUT file on behavior | \`@exposed({ type: "file" })\` + Sync | Pick in Blender; export → \`post/\`; runtime path in \`vars\` |
| Input bindings | Input Actions panel | \`FindAction("Name")\` |
| Tunable per-object fields | @exposed + Sync | Declare @exposed in .ts |
| Trigger → gameplay (data) | COLLIDER › Event Messages | OnMessage on target entity |
| Collision/trigger hooks | — | OnCollision* / OnTrigger* on own behaviors |
| 2D HUD / particles | GUI / PARTICLE components | GetGui / GetParticles |
| MSDF 3D labels | MSDF_TEXT component | GetTextRenderer — update text only |

When unsure: \`list_scene_entities\` shows what's already authored in the level.`,
  },
  {
    slug: "lights",
    title: "Runtime lights and clustering",
    summary: "Use FindLightForNode — clustered lamps leave scene.lights but stay drivable.",
    humanDoc: "docs/engine/07-RENDERING.html",
    content: `# Runtime lights (behavior author view)

Lamps are exported in the glb; the loader copies manifest \`energy\` → \`light.intensity\`.

**To change intensity at runtime:**

\`\`\`ts
import { FindLightForNode } from "@bjs/engine";

const light = FindLightForNode(this.scene, lampEntity.node);
if (light !== null) { light.intensity = brightness; }
\`\`\`

**Clustering:** when enabled light count exceeds the budget (default 8, **Babylon Scene › Export › Light Budget**), the loader
moves eligible point/spot lamps into \`ClusteredLightContainer\` and removes them from \`scene.lights\`.
They are still the same \`Light\` instances — \`FindLightForNode\` searches the cluster.

**Per-lamp opt-out:** **Babylon Object › Light › Cluster When Over Budget** (point/spot) — uncheck for hero lamps that must stay forward (\`entities[].light.cluster: false\`). Suns are never clustered.

**Scene toggles (Export panel):** \`lightBudget\`, \`clusterPunctualLights\` in the manifest \`scene\` block. \`LevelLoader\` options override when set.

**Do not** rely on \`scene.lights\` or \`getLightByName\` alone on large rigs
(\`increaselights\` silently no-ops if resolution fails).

**IBL pair:** \`reducelight\` may write \`scene.environmentTexture.level\`;
\`increaselights\` maps that level to lamp brightness — align authored A/B ranges.`,
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
