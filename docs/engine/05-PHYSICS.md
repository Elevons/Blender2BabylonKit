# 05 — Physics: bodies, constraints, triggers

[← Index](00-INDEX.md) · Prev: [Scripting](04-SCRIPTING.md) · Next: [Rendering →](06-RENDERING.md)

All in `subsystems/physics.ts`, `constraints.ts`, `triggers.ts`. Havok **V2**.
`EnableHavokPhysics(scene)` must run before `Load`.

## Bodies (`BuildPhysics`)

One or more COLLIDER components and/or one RIGIDBODY → one node-attached
`PhysicsBody`: collider-only = static/trigger; rigidbody-only = dynamic +
auto-fit box; both = shape from collider(s), dynamics from body.

### Multiple colliders (compound body)

An entity may carry **more than one** enabled COLLIDER component. Export writes
each as its own manifest row; at load time `ClassifyComponents` collects them
all and `BuildPhysics` builds a **`PhysicsShapeContainer`** (Havok compound
shape): each collider becomes a child shape with its own center/size/rotation,
material, and trigger flag. One `PhysicsBody`, one `entity.body`; each collider
still gets its own `RegisterAttachment` row (same `body` ref).

Authoring tips (the N-panel shows a compound-body notice when count > 1):

- Prefer **manual** offsets/sizes per shape — auto-fit colliders each fit the
  **full** mesh bounds, which is rarely what you want for head+body volumes.
- Trigger events from every trigger collider are **merged** onto the one body;
  entering any child shape can fire any authored reaction.
- Mixed trigger/non-trigger colliders on one entity are allowed (per-child
  flags); the validator warns because it can be surprising.

Single-collider paths below are unchanged.

### Motion types

| Manifest `bodyType` | Havok `PhysicsMotionType` | Role |
|---|---|---|
| `STATIC` | `STATIC` | Never moves; still collides (terrain, walls). |
| `DYNAMIC` | `DYNAMIC` | Fully simulated — forces, collisions, mass. |
| `ANIMATED` | `ANIMATED` | Driven by animation or code; pushes dynamic bodies and constraints but is not pushed by collisions. Use for elevators, moving platforms, or behaviors that set `node` transforms each frame. |

Mass applies only to `DYNAMIC` bodies. Dynamic bodies may also enable **Start Asleep**.

### Center of mass

For **Dynamic** rigid bodies only. The collision shape defines contact; center of
mass defines how the body tips under gravity and impulses. After the shape is
built, `ApplyMassProperties` calls Havok `setMassProperties` with the authored
mass and an optional `centerOfMass` override in the entity's local space.

| Blender | Manifest | Runtime |
|---|---|---|
| **Auto-Fit Center of Mass** (default on) | `centerOfMassAutoFit: true` | `ComputeLocalBounds(node).center` — same owned-mesh AABB rule as collider auto-fit |
| **Center of Mass** (when auto-fit off) | `centerOfMassAutoFit: false`, `centerOfMass: [x,z,−y]` | Custom offset, axis-converted at export like collider `center` |
| *(field omitted — older levels)* | — | Mass only; Havok derives CoM from the collision shape geometry |

**Fit CoM to Bounds** snapshots the mesh AABB center into the custom field and
turns off auto-fit (same workflow as **Fit to Bounds** on colliders). Auto-fit
CoM tracks visible mesh geometry, which can differ from a hand-tuned collider —
useful when tipping behavior should follow visuals, not collider volume.

### Start asleep

Dynamic rigid bodies may set `startAsleep: true` (**Start Asleep** in Blender). The loader passes this to `PhysicsBody`'s `startsAsleep` constructor argument (and `PhysicsAggregate.startAsleep` on auto-fit mesh paths). Bodies begin with physics calculations skipped until a collision or applied force wakes them — a **performance hint** for scenes where bodies are at rest on load, not a guarantee (nearby awake bodies can wake them). The engine also puts resting bodies to sleep automatically when appropriate.

Three shape paths for **one** collider (each its own builder); **two or more**
colliders always use the compound container (`BuildCompoundBody` →
`BuildColliderShape` per row):

- **Auto-fit primitive** (`BuildAutoFitBody`): real mesh → `PhysicsAggregate`
  sizes it; multi-material **wrapper** (TransformNode, one child mesh per
  material) → `FitColliderShape` fits box/sphere/capsule/cylinder to the local
  bounds, because an aggregate would call `getTotalVertices` on the non-mesh
  node and crash.
- **CONVEX / MESH** (`BuildGeometryShapeBody`): real hull/triangle shapes; a
  wrapper's submeshes are cloned, baked into the wrapper frame, merged
  (`MergeChildrenIntoLocalMesh`), fed to the shape, then disposed. Fitted-box
  fallback on failure. MESH shapes can't be DYNAMIC (Havok) — the validator
  warns; use CONVEX for movers.
- **Manual primitive** (`BuildManualShape`): hand-authored Babylon-space
  center/size/radius/height/rotation (converted at export; the Blender
  viewport preview matches). **Apply Object Scale** is on by default: collider
  dimensions are multiplied by this entity's **local** scale at load
  (`applyObjectScale` in the manifest; omit the field or set true). Parent scale
  is already applied through the world transform — only local scale is baked to
  avoid double-scaling child colliders under a scaled parent. Turn off in Blender
  to opt out. Manual primitives and auto-fit bounds are multiplied; CONVEX /
  MESH shapes bake local scale into mesh vertices before the hull/triangle shape
  is built.

### The owned-meshes rule <a name="owned-meshes"></a>

Two kinds of "children" look identical in the scene graph: glTF **material
submeshes** (`_primitive0…`, no GUID) and **author-parented child entities**
(have a GUID). `OwnedColliderMeshes(node)` includes a descendant only if no
node on its path up to the owner carries `bjs_id` — so a collider spans its own
multi-material geometry but never a parented child's. All three shape paths and
the `hasGeometry` check route through it (fixed v0.29.1).

### Why right-handed import <a name="right-handed"></a>

Babylon's default left-handed glTF path parents content under a `__root__`
carrying a reflection (negative-determinant) transform. Havok places bodies by
decomposing world matrices, and a reflection decomposes like a 180° rotation →
mis-oriented colliders (the original kit-breaking bug). `LevelLoader` sets
`useRightHandedSystem = true` *before* the append, so no mirror exists and one
node-attached body path is sound. `NeutralizeGltfRoot` only warns if a mirrored
root reappears.

## Constraints (`BuildConstraints`) <a name="constraints"></a>

CONSTRAINT components become joints in `FinalizeLevel` (both bodies must
exist):

| `constraintType` | Havok joint |
|---|---|
| FIXED | `LockConstraint` |
| BALL | `BallAndSocketConstraint` |
| HINGE / SLIDER / SPRING / CUSTOM | `Physics6DoFConstraint` |

For 6DoF types, the constraint frame's **X** = the authored axis; Y/Z follow
from a perpendicular pair (`ComputeConstraintFrame`). Preset mapping:

- **HINGE** — locks linear + ANGULAR_Y/Z; frees or limits **ANGULAR_X**
  (degrees→radians). Optional velocity motor.
- **SLIDER** — locks everything except **LINEAR_X** (meters). Optional motor.
- **SPRING** — locks all rotation + linear Y/Z; **LINEAR_X** sprung within
  limits (stiffness/damping on the limit row).
- **CUSTOM** — manifest `axes[]` lists each of the six DOFs as `free`,
  `locked`, `limited`, or `spring` (`BuildCustomAxisLimits`). Angular limits are
  authored in degrees, converted at runtime. Use for combined joints (e.g. trailer
  hitch: ANGULAR_X free for pitch, LINEAR_Y spring for vertical compliance) —
  stacking two preset constraints on the same body pair over-constrains rotation.

`ComputeConstraintFrame` derives the target-side pivot/axes from **live world
transforms**, pinning the as-placed relative pose — nothing snaps on load.
**Apply Object Scale** is on by default: authored pivot and linear limits are
multiplied by the owner's **local** scale (parent scale comes from the world
transform). Turn off in Blender to opt out. Angular limits stay in degrees.
Motors (`setAxisMotorType(VELOCITY)` + target + max force) apply to HINGE/SLIDER
presets only. **`collision`** (Blender **Bodies Collide**, default off) maps to
Havok's pairwise `isCollisionsEnabled` on the joint — when off, the two
connected bodies should not generate contact impulses against each other
(overlap can still cause constraint solver fighting; keep colliders separated or
use auto-fit sizes that don't intersect). Joints land in `level.constraints`,
disposed with the level.

## Trigger messaging (`WireTriggerEvents`) <a name="triggers"></a>

Trigger colliders may carry authored events (target GUID, message, optional tag
filter). One `HavokPlugin.onTriggerCollisionObservable` observer dispatches
`TRIGGER_ENTERED`: trigger body → registration; entering body →
`metadata.bjsEntity`; tag gate; then `target.SendMessage(message, enterer)` →
[`OnMessage`](04-SCRIPTING.md). Havok gotcha: MESH-shaped triggers never fire
(validator warns). Observer stored on `level.triggerObserver`, removed on
dispose.

Continue: [Rendering →](06-RENDERING.md)
