# Prefab System — Design Spec (v1, short)

## The idea in one paragraph

A **prefab is a separate .blend file** (e.g. `assets/torch.blend`) containing a
collection of objects with components authored as usual. Level files **link** that
collection (Blender: File → Link) and place it as many times as needed — each
placement is just an empty with a transform. On export, the prefab becomes its own
small `torch.glb` + `torch.prefab.json`, and the level manifest stores only
*references*: "torch at this transform". At load, the runtime loads each prefab
**once** as a template and stamps out a copy per placement. Spawning at runtime
(`level.Spawn("torch", position)`) is the same stamp operation, so prefabs and a
spawn API are one system.

Editing `torch.blend` updates every torch in every level on next export — single
source of truth, like a Unity prefab.

## Blender ↔ Babylon translation (two layers, not a choice)

| Layer | Blender | Babylon |
|---|---|---|
| Structure (lights, scripts, physics, hierarchy) | linked collection instance | `AssetContainer.instantiateModelsToScene()` — a real clone per placement |
| Rendering (repeated meshes drawn cheaply) | (automatic) | the same call GPU-instances meshes via `InstancedMesh` (`doNotInstantiate: false`) |

Pure-mesh prefabs therefore translate "directly to Babylon instanced objects"
automatically. Prefabs that also contain lights/scripts/bodies get those parts
properly cloned per placement — which plain mesh instancing alone cannot express.

## Artifacts

```
assets/torch.blend     ──export──►  levels/prefabs/torch.glb
                                    levels/prefabs/torch.prefab.json   (components, same schema as entities)
level.blend            ──export──►  levels/level.glb                  (placements are NOT baked in)
                                    levels/level.scene.json
```

Level manifest additions (schema v4):

```json
{
  "version": 4,
  "prefabs": { "torch": "prefabs/torch.prefab.json" },
  "instances": [
    { "prefab": "torch", "id": "instance-guid",
      "position": [..], "rotation": [..], "scale": [..],
      "components": [ /* optional: TAG/SCRIPT on the placement empty itself */ ] }
  ]
}
```

## Identity (GUID) rule

Every torch contains the same internal GUIDs, so runtime identity becomes
composite: **`instanceGuid/localGuid`**. `level.ById()` keys on the composite.
Entity references *inside* a prefab resolve within their own instance (torch A's
script points at torch A's bulb, not torch B's). References from the level into a
specific instance use the composite id.

## Per-placement overrides (kept simple for v1)

- Component defaults live **in the prefab file** (the Unity model).
- A placement may **add** components on its instance empty (a TAG, a SCRIPT with
  its own `@exposed` values).
- Deep overrides of objects *inside* a linked prefab need Blender library
  overrides — deferred to v2.

## Export flow

"Export Level" walks placements → for each linked library, export its prefab
artifacts if missing or stale (content hash), then write the level files. A
local (non-linked) collection instance is treated identically — it's just a
prefab whose source lives in the same .blend.

## Runtime flow

1. Load level glb + manifest as today.
2. For each unique prefab named in `instances`: `loadAssetContainerAsync(glb)` once.
3. For each placement: `instantiateModelsToScene()` at its transform, then apply
   the prefab manifest's components to the cloned nodes (existing
   `ApplyComponents`, scoped to the instance) and any placement components.
4. `level.Spawn(prefabName, position, rotation?)` = step 3 on demand. Returns the
   root `Entity`. `level.Despawn(entity)` disposes the clone tree + bodies +
   behaviors.

## Out of scope (v1)

Nested prefabs (prefab linking another prefab), deep per-placement overrides,
prefab variants, cross-level shared caching.
