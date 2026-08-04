/**
 * Blender Z-up ↔ Babylon Y-up axis conversion — MCP explainer for bjs-level-kit.
 *
 * Distills docs/engine/15-AXIS-CONVERSION.html and the coordinate-axes section
 * of LLM_SCRIPTING_CONTEXT.md. Call before writing lookAt, local offsets, or any
 * behavior that mixes node transforms with manifest physics data.
 */

export type AxisConversionTopic =
  | "overview"
  | "authoring"
  | "export-formula"
  | "manifest-vs-local"
  | "look-at"
  | "exposed-vector3"
  | "pitfalls";

export interface AxisConversionSection
{
  topic: AxisConversionTopic;
  title: string;
  summary: string;
  content: string;
}

export const AXIS_CONVERSION_SECTIONS: AxisConversionSection[] = [
  {
    topic: "overview",
    title: "Two frames — when to convert",
    summary: "Author in Blender local axes; export converts physics manifest only.",
    content: `# Axis conversion (overview)

Blender is **Z-up** on objects (+Y forward, +Z up). Babylon / glTF world is **Y-up** (+Y up, −Z forward).

## Rule of thumb

> **Author as if Blender axes are the object's axes.** The kit converts **physics/component manifest** data at export. **Script logic and mesh transforms stay Blender-local.**

## Two frames

| | Blender (object local) | Babylon (world) |
|---|------------------------|-----------------|
| Up | +Z | +Y |
| Forward | +Y | −Z |
| Right | +X | +X |

## Decision tree

1. **Collider offset, CoM, constraint pivot/axis in manifest** → already **Babylon Y-up** at runtime. Do not convert again.
2. **\`node.position\`, \`node.rotation\`, \`lookAt\`, \`@exposed\` vector3** → **Blender local**. Same frame as glTF node transforms.
3. **\`Vector3.Up()\`, \`Vector3.Forward()\`, \`getAbsolutePosition()\`** → **Babylon world**.

Never add a Babylon \`Vector3.Forward()\` offset to a Blender-local \`node.position\`.

**Topics:** \`authoring\`, \`export-formula\`, \`manifest-vs-local\`, \`look-at\`, \`exposed-vector3\`, \`pitfalls\`

**Full prose:** \`get_doc_chapter(chapter="engine/15-axis-conversion")\` · \`docs/engine/15-AXIS-CONVERSION.html\``,
  },
  {
    topic: "authoring",
    title: "What artists and behavior authors do in Blender",
    summary: "Model forward along +Y, up along +Z; no mental Y-up flip on meshes.",
    content: `# Authoring in Blender space

## On every exported object

Local axes **stay Blender's** after glTF load:

- **+X** — lateral (right)
- **+Y** — forward (tip of arrows, character facing, patrol direction)
- **+Z** — up

The Y-up flip is applied at the **scene/root** level, not by remapping each mesh's local frame.

## Mesh modeling

- Point arrow tips / character forward along **local +Y**.
- Point "up" features (antennas, masts) along **local +Z**.
- Do **not** pre-rotate meshes to "Babylon forward" (−Z) in Blender — behaviors and \`lookAt\` expect Blender axes.

## @exposed vector3 in Blender

Values you type in the Script inspector (e.g. \`[0, 1, 0]\` spin axis, \`[5, 0, 0]\` patrol offset) are stored **without axis conversion** and applied directly to behaviors in Blender local space.

## Viewport previews

Collider wireframes and CoM crosses draw **raw Blender numbers**. Export converts them for Havok — what you see in the viewport matches what you authored.`,
  },
  {
    topic: "export-formula",
    title: "Export math (component_serializers.py)",
    summary: "(x,y,z)_Blender → (x,z,−y)_Babylon for physics manifest fields.",
    content: `# Export formula

Implemented in \`blender_addon/export/component_serializers.py\`.

## Vectors

\`\`\`
(x, y, z)_Blender  →  (x, z, −y)_Babylon
\`\`\`

Examples:
- Blender forward \`[0, 1, 0]\` → Babylon \`[0, 0, −1]\`
- Blender up \`[0, 0, 1]\` → Babylon \`[0, 1, 0]\`

## Collider extents

Size components swap Y/Z: \`[sx, sy, sz] → [sx, sz, sy]\`.

## Quaternions

\`w\` unchanged; vector part uses the same map: \`[qx, qy, qz, w] → [qx, qz, −qy, w]\`.

## Constraint preset axes

Blender X/Y/Z enum → Babylon unit vectors via \`_CONSTRAINT_AXIS_TO_BABYLON\` (e.g. Blender Y → \`[0, 0, −1]\`).

## glTF

Blender's glTF exporter applies root **Y-up**; node TRS is exported with **local axes preserved**.

Runtime reads converted manifest values as Babylon space — **do not** re-apply the formula in behaviors.`,
  },
  {
    topic: "manifest-vs-local",
    title: "What gets converted vs what stays Blender-local",
    summary: "Physics manifest yes; SCRIPT vars and node transforms no.",
    content: `# Manifest vs node local

| Data | Converted at export? | Runtime frame |
|------|----------------------|---------------|
| Collider \`center\`, \`size\`, \`rotation\` | **Yes** | Babylon |
| Rigid-body \`centerOfMass\` | **Yes** | Babylon |
| Constraint \`pivot\`, \`axis\` | **Yes** | Babylon |
| **SCRIPT \`@exposed\` vector3** | **No** | Blender local |
| **SCRIPT \`@exposed\` vector3 lists** | **No** | Blender local |
| glTF \`node.position\` / rotation | Root Y-up only | Blender local per node |

## Why @exposed vector3 is not converted

\`_serialize_vars\` writes \`list(v.v_val)\` unchanged. \`ApplyExposedVars\` uses \`Vector3.FromArray\` directly.

Behaviors combine these with \`node.position\` / \`node.rotate(axis)\` — both Blender local:

- **Rotator** — \`axis: [0, 1, 0]\` → spin around Blender forward
- **Patrol** — \`offset\` added to \`node.position\`
- **Waypoints** — points assigned to \`node.position\`

Converting only the manifest var would mix frames and break these behaviors.

For **world-space** targets, use \`@exposed({ type: "entity" })\` or \`getAbsolutePosition()\` — not a converted vector3.`,
  },
  {
    topic: "look-at",
    title: "lookAt / setDirection in behaviors",
    summary: "Aligns local +Y (Blender forward); parented nodes need Space.WORLD.",
    content: `# lookAt / setDirection

\`TransformNode.lookAt(target)\` calls \`setDirection\`, which aligns the node's **local +Y axis** toward the target — **not +Z** (despite some Babylon doc wording).

## Authoring

Model tip/forward along **Blender +Y** so the visible tip faces the target.

## Space parameter

Default: \`Space.LOCAL\`. Fine for unparented nodes.

When the node has a **rotated parent** (e.g. HUD arrow parented to the camera), LOCAL space mis-computes direction — the mesh **appears not to rotate**. Pass \`Space.WORLD\`:

\`\`\`ts
import { Space } from "@babylonjs/core";

this.arrow.lookAt(
  this.target.node.getAbsolutePosition(),
  0,
  0,
  0,
  Space.WORLD,
);
\`\`\`

Reference: \`apps/playground/src/behaviors/ObjectiveArrow.ts\`

## Do not confuse with Babylon world forward

\`Vector3.Forward()\` is world **−Z** (Babylon). \`lookAt\` aligns **local +Y** (Blender forward on loaded nodes).`,
  },
  {
    topic: "exposed-vector3",
    title: "@exposed vector3 and vector3 lists",
    summary: "Blender-local offsets and directions — never re-convert in behavior code.",
    content: `# @exposed vector3

## Contract

- Values are authored and stored in **Blender local space**.
- Export does **not** apply \`(x,y,z) → (x,z,−y)\`.
- Runtime assigns them before \`OnStart\` via \`ApplyExposedVars\`.

## Safe uses

- Rotation axis (\`Rotator\`)
- Patrol / waypoint offsets relative to the node's rest pose
- Direction vectors passed to \`node.rotate(axis, …)\` in local space

## Unsafe uses

- World-space "move 5 units up" expecting Babylon +Y — \`[0, 0, 5]\` in Blender means **local +Z** (Blender up), not world up.
- Mixing with \`Vector3.Forward()\` or \`Vector3.Up()\` without transforming frames.

## Alternative for world targets

\`@exposed({ type: "entity" }) target: Entity | null\` + \`target.node.getAbsolutePosition()\`.`,
  },
  {
    topic: "pitfalls",
    title: "Common mistakes (symptom → fix)",
    summary: "Silent wrong rotations and 90° offsets.",
    content: `# Axis conversion pitfalls

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| HUD arrow never rotates | \`lookAt\` without \`Space.WORLD\` on camera-child | \`lookAt(..., Space.WORLD)\` |
| Mesh rotates but tip sideways | Modeled forward on +Z; \`lookAt\` aligns +Y | Model tip along Blender **+Y** |
| Patrol / waypoint motion 90° off | Re-converted \`@exposed\` offset in code | Leave vars Blender-local |
| Spin on wrong axis | Used \`Vector3.Forward()\` as rotate axis | Use Blender-local axis e.g. \`[0, 1, 0]\` |
| Assumed all manifest is Blender space | Collider data already Babylon | Read component fields as exported |
| Assumed \`lookAt\` uses +Z | Babylon docs vs \`setDirection\` impl | Align **local +Y** toward target |

Also in \`get_do_not_list\`.

**MCP:** \`get_axis_conversion(topic="look-at")\` · \`get_doc_chapter(chapter="engine/15-axis-conversion")\``,
  },
];

export function GetAxisConversionSection(topic: string): AxisConversionSection | undefined
{
  const normalized = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-") as AxisConversionTopic;
  return AXIS_CONVERSION_SECTIONS.find(
    (section) => section.topic === normalized || section.topic.includes(normalized)
  );
}

export function FormatAxisConversionOverview(): string
{
  const decisionTree = [
    "# Axis conversion",
    "",
    "Call this **before** writing `lookAt`, camera-child HUD markers, `@exposed` vector3 offsets, or any code that mixes `node.position` with manifest physics data.",
    "",
    "## Quick decision",
    "",
    "1. **Collider / CoM / constraint numbers from manifest** → Babylon Y-up already. Use as-is.",
    "2. **`node.position`, `node.rotation`, `@exposed` vector3, `lookAt`** → Blender local (+Y forward, +Z up).",
    "3. **`Vector3.Up()`, `Vector3.Forward()`, `getAbsolutePosition()`** → Babylon world.",
    "",
    "Golden rules:",
    "- Author meshes with forward along **Blender +Y**.",
    "- **`lookAt` aligns local +Y**, not +Z.",
    "- **Parented nodes** (camera HUD): `lookAt(..., Space.WORLD)`.",
    "- **Do not convert `@exposed` vector3** in the manifest — they must match `node` local space.",
    "",
    "---",
    "",
  ].join("\n");

  const topicList = AXIS_CONVERSION_SECTIONS.filter((section) => section.topic !== "overview")
    .map((section) => `- **${section.topic}** — ${section.title}`)
    .join("\n");

  return `${decisionTree}Topics (request one with \`topic="…"\`):\n\n${topicList}\n\nFull prose: \`get_doc_chapter(chapter="engine/15-axis-conversion")\``;
}

export function FormatAxisConversionSection(section: AxisConversionSection): string
{
  return `${section.content}\n\n---\n**Topic:** ${section.topic} · **Summary:** ${section.summary}\n**Full prose:** \`docs/engine/15-AXIS-CONVERSION.html\``;
}

export function FormatAxisConversion(topic?: string): string
{
  if (topic === undefined || topic.trim().length === 0 || topic === "list")
  {
    return FormatAxisConversionOverview();
  }

  const section = GetAxisConversionSection(topic);
  if (section === undefined)
  {
    const available = AXIS_CONVERSION_SECTIONS.map((entry) => entry.topic).join(", ");
    return `Unknown topic "${topic}". Available: ${available}\n\nOmit topic for overview + topic list.`;
  }

  if (section.topic === "overview")
  {
    return FormatAxisConversionOverview();
  }

  return FormatAxisConversionSection(section);
}
