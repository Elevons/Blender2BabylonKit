# 05 — Physics: bodies, constraints, triggers

[← Index](00-INDEX.md) · Prev: [Scripting](04-SCRIPTING.md) · Next: [Rendering →](06-RENDERING.md)

All in `subsystems/physics.ts`, `constraints.ts`, `triggers.ts`. Havok **V2**.
`EnableHavokPhysics(scene)` must run before `Load`.

## Bodies (`BuildPhysics`)

One COLLIDER and/or RIGIDBODY → one node-attached `PhysicsBody`:
collider-only = static/trigger; rigidbody-only = dynamic + auto-fit box; both =
shape from collider, dynamics from body. KINEMATIC maps to Havok `ANIMATED`.
Three shape paths (each its own builder):

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
  viewport preview matches).

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
Motors (`setAxisMotorType(VELOCITY)` + target + max force) apply to HINGE/SLIDER
presets only. Joints land in `level.constraints`, disposed with the level.

## Trigger messaging (`WireTriggerEvents`) <a name="triggers"></a>

Trigger colliders may carry authored events (target GUID, message, optional tag
filter). One `HavokPlugin.onTriggerCollisionObservable` observer dispatches
`TRIGGER_ENTERED`: trigger body → registration; entering body →
`metadata.bjsEntity`; tag gate; then `target.SendMessage(message, enterer)` →
[`OnMessage`](04-SCRIPTING.md). Havok gotcha: MESH-shaped triggers never fire
(validator warns). Observer stored on `level.triggerObserver`, removed on
dispose.

Continue: [Rendering →](06-RENDERING.md)
