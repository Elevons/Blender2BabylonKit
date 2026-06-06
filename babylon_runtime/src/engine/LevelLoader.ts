import {
  Scene,
  TransformNode,
  appendSceneAsync,
  HavokPlugin,
  Vector3,
  Color3,
  Color4,
  type Camera,
  type ShadowGenerator,
} from "@babylonjs/core";
// Registers the glTF loader so .glb files can be loaded. (In Babylon 9 the old
// SceneLoader.AppendAsync statics are deprecated in favour of appendSceneAsync.)
import "@babylonjs/loaders/glTF";
// Copies each glTF node's `extras` to node.metadata.gltf.extras. REQUIRED for
// GUID matching: the Blender exporter writes obj["bjs_id"] into node extras, and
// without this extension Babylon leaves node.metadata empty.
import "@babylonjs/loaders/glTF/2.0/Extensions/ExtrasAsMetadata";
import HavokPhysics from "@babylonjs/havok";

import {
  Entity,
  LevelManifest,
  Component,
  ColliderComponent,
  RigidBodyComponent,
  ScriptComponent,
  ID_KEY,
} from "./types";
import { ComponentRegistry } from "./ComponentRegistry";
import { buildPhysics } from "./physics";
import { applyBlenderLight } from "./lights";
import { applyBlenderCamera, buildTypedCamera, deriveFollowFromPosition } from "./cameras";
import { setupShadows, type ShadowCaster } from "./shadows";
import { applyEnvironment } from "./environment";
import { applyFog } from "./fog";
import { applyPostProcessing, type PostProcessingHandles } from "./postprocess";
import { applyAnimation } from "./animation";
import type { SceneInfo, AnimationInfo, CameraComponent } from "./types";
import type { FollowCamera, ArcRotateCamera, UniversalCamera, Vector3 } from "@babylonjs/core";
import { applyExposedVars, type PendingRef } from "./exposed";

/** Enable Havok physics V2 on a scene. Call once before loading levels. */
export async function enableHavokPhysics(
  scene: Scene,
  gravity = new Vector3(0, -9.81, 0)
): Promise<void> {
  const havok = await HavokPhysics();
  scene.enablePhysics(gravity, new HavokPlugin(true, havok));
}

function dirname(url: string): string {
  const i = url.lastIndexOf("/");
  return i >= 0 ? url.slice(0, i + 1) : "";
}

export class Level {
  readonly entities = new Map<string, Entity>();
  /** The Blender scene's active camera, if one was exported. */
  activeCamera?: Camera;
  /** Shadow generators created for shadow-casting lights (one per light). */
  shadowGenerators: ShadowGenerator[] = [];
  /** Post-processing pipelines, if the manifest enabled them. */
  post?: PostProcessingHandles;
  private disposed = false;
  private observer?: ReturnType<Scene["onBeforeRenderObservable"]["add"]>;
  private updaters: ((dt: number) => void)[] = [];

  constructor(private scene: Scene) {}

  /** Register a per-frame callback (used e.g. by offset-follow cameras). */
  addUpdater(fn: (dt: number) => void): void {
    this.updaters.push(fn);
  }

  byTag(tag: string): Entity[] {
    return [...this.entities.values()].filter((e) => e.tag === tag);
  }

  /** Look up an entity by its Blender GUID. */
  byId(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  /** Start the per-frame update loop after entities/behaviors are built. */
  _begin() {
    for (const e of this.entities.values()) {
      for (const b of e.behaviors) {
        try { b.onStart(); } catch (err) { console.error(`[bjs] onStart "${e.name}"`, err); }
      }
    }
    this.observer = this.scene.onBeforeRenderObservable.add(() => {
      const dt = this.scene.getEngine().getDeltaTime() / 1000;
      for (const e of this.entities.values()) {
        for (const b of e.behaviors) {
          try { b.onUpdate(dt); } catch (err) { console.error(`[bjs] onUpdate "${e.name}"`, err); }
        }
      }
      for (const u of this.updaters) {
        try { u(dt); } catch (err) { console.error("[bjs] camera updater", err); }
      }
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.observer) this.scene.onBeforeRenderObservable.remove(this.observer);
    for (const e of this.entities.values()) {
      for (const b of e.behaviors) {
        try { b.onDestroy(); } catch { /* ignore */ }
      }
    }
  }
}

export interface LevelLoaderOptions {
  /** Create shadow generators for lights flagged to cast shadows. Default true. */
  shadows?: boolean;
  /** Shadow map resolution per light. Default 1024. */
  shadowMapSize?: number;
}

export class LevelLoader {
  constructor(
    private scene: Scene,
    private registry: ComponentRegistry,
    private options: LevelLoaderOptions = {}
  ) {}

  /** Load a `.scene.json` manifest (the glb path is resolved relative to it). */
  async load(manifestUrl: string): Promise<Level> {
    const res = await fetch(manifestUrl);
    if (!res.ok) {
      throw new Error(
        `[bjs] could not fetch manifest "${manifestUrl}" (HTTP ${res.status}). ` +
        `Check the file exists and the path/filename match exactly.`
      );
    }
    const text = await res.text();
    if (text.trimStart().startsWith("<")) {
      throw new Error(
        `[bjs] "${manifestUrl}" returned HTML, not JSON. The dev server likely ` +
        `served index.html because the file was not found at that path.`
      );
    }
    const manifest = JSON.parse(text) as LevelManifest;
    const base = dirname(manifestUrl);

    // 1) Load geometry / lights / cameras / transforms from the glb.
    //    Babylon 9: appendSceneAsync takes one URL (rootUrl + filename combined).
    await appendSceneAsync(base + manifest.glb, this.scene);

    // 2) Index nodes by their Blender GUID (read from glTF extras), then build
    //    entities. GUID match is authoritative and survives renames; we fall
    //    back to name match for entities without a GUID (e.g. older v1 exports).
    const idIndex = this.buildIdIndex();
    const level = new Level(this.scene);
    const pendingRefs: PendingRef[] = [];
    const shadowLights: ShadowCaster[] = [];
    const animated: { entity: Entity; info: AnimationInfo }[] = [];
    const followCams: { cam: FollowCamera; guid: string; eye: Vector3; derive: boolean }[] = [];
    const arcCams: { cam: ArcRotateCamera; guid: string; eye: Vector3 }[] = [];
    const offsetCams: { cam: UniversalCamera; guid: string; eye: Vector3 }[] = [];

    for (const data of manifest.entities) {
      const node =
        (data.id ? idIndex.get(data.id) : undefined) ??
        this.findNode(data.name);
      if (!node) {
        console.warn(
          `[bjs] could not resolve entity "${data.name}" ` +
          `(id=${data.id ?? "none"}) to a glTF node - skipping`
        );
        continue;
      }
      const entity = new Entity(data.id, data.name, node);
      level.entities.set(data.id || data.name, entity);
      node.metadata = { ...(node.metadata ?? {}), bjsEntity: entity };
      pendingRefs.push(...this.applyComponents(entity, data.components));
      if (data.animation) animated.push({ entity, info: data.animation });
      if (data.light) {
        const light = applyBlenderLight(this.scene, node, data.light);
        if (light && data.light.castShadows)
          shadowLights.push({ light, settings: data.light.shadow });
      }
      if (data.camera) {
        let cam = applyBlenderCamera(this.scene, node, data.camera);
        const camComp = data.components.find((c) => c.type === "CAMERA") as
          | CameraComponent
          | undefined;
        if (cam && camComp) {
          const built = buildTypedCamera(this.scene, cam, camComp);
          cam = built.camera;
          if (built.followTarget) {
            followCams.push({
              cam: cam as FollowCamera,
              guid: built.followTarget.guid,
              eye: built.followTarget.eye,
              derive: camComp.useBlenderTransform,
            });
          }
          if (built.arcTarget) {
            arcCams.push({
              cam: cam as ArcRotateCamera,
              guid: built.arcTarget.guid,
              eye: built.arcTarget.eye,
            });
          }
          if (built.offsetFollow) {
            offsetCams.push({
              cam: cam as UniversalCamera,
              guid: built.offsetFollow.guid,
              eye: built.offsetFollow.eye,
            });
          }
        }
        if (cam && data.camera.active) {
          this.scene.activeCamera = cam;
          level.activeCamera = cam;
        }
      }
    }

    // Second pass: now that every entity exists, resolve object references.
    for (const ref of pendingRefs) {
      const target = level.entities.get(ref.guid) ?? null;
      if (!target) {
        console.warn(`[bjs] object reference "${ref.field}" -> ${ref.guid} not found`);
      }
      const inst = ref.instance as Record<string, unknown>;
      if (ref.index === undefined) {
        inst[ref.field] = target;
      } else {
        const arr = inst[ref.field];
        if (Array.isArray(arr)) arr[ref.index] = target;
      }
    }

    // Resolve FollowCamera targets now that every entity exists.
    for (const fc of followCams) {
      const target = level.entities.get(fc.guid);
      if (!target) {
        console.warn(`[bjs] follow camera target ${fc.guid} not found`);
        continue;
      }
      fc.cam.lockedTarget = target.node as never;
      // Start where Blender framed it (relative to the target) unless overridden.
      if (fc.derive) deriveFollowFromPosition(fc.cam, target.node, fc.eye);
    }

    // Re-pivot ArcRotate cameras onto their orbit-target object, if any.
    for (const ac of arcCams) {
      const target = level.entities.get(ac.guid);
      if (target) {
        target.node.computeWorldMatrix(true);
        ac.cam.setTarget(target.node.getAbsolutePosition().clone());
        ac.cam.setPosition(ac.eye); // keep the Blender framing, new pivot
      } else {
        console.warn(`[bjs] arc camera target ${ac.guid} not found`);
      }
    }

    // Offset-follow cameras: keep a constant world-space offset from the target,
    // looking at it. The offset is exactly where Blender placed the camera.
    for (const oc of offsetCams) {
      const target = level.entities.get(oc.guid);
      if (!target) {
        console.warn(`[bjs] offset follow target ${oc.guid} not found`);
        continue;
      }
      const node = target.node;
      node.computeWorldMatrix(true);
      const offset = oc.eye.subtract(node.getAbsolutePosition());
      level.addUpdater(() => {
        const tp = node.getAbsolutePosition();
        oc.cam.position.copyFrom(tp).addInPlace(offset);
        oc.cam.setTarget(tp);
      });
    }

    // Shadows: now that all meshes and lights exist, wire up generators for any
    // light flagged to cast shadows (every mesh casts and receives by default).
    if (this.options.shadows !== false && shadowLights.length) {
      level.shadowGenerators = setupShadows(this.scene, shadowLights, {
        mapSize: this.options.shadowMapSize,
      });
    }

    // Scene-wide render settings (environment, fog, post-processing).
    if (manifest.scene) this.applyScene(manifest.scene, base, level);

    // Animations: the glb's AnimationGroups may auto-start (glTF loader default).
    // Neutralize that so playback is explicit, then honor per-entity autoplay.
    if (this.scene.animationGroups.length) {
      for (const g of this.scene.animationGroups) g.stop();
      for (const a of animated) applyAnimation(this.scene, a.entity, a.info);
    }

    level._begin();
    return level;
  }

  /** Apply the optional scene-wide render block from the manifest. */
  private applyScene(info: SceneInfo, base: string, level: Level): void {
    if (info.clearColor) this.scene.clearColor = Color4.FromArray(info.clearColor);
    if (info.ambientColor) this.scene.ambientColor = Color3.FromArray(info.ambientColor);
    if (info.environment) applyEnvironment(this.scene, info.environment, base);
    if (info.fog) applyFog(this.scene, info.fog);
    if (info.postProcessing) {
      level.post = applyPostProcessing(
        this.scene,
        this.scene.activeCamera,
        info.postProcessing
      );
    }
  }

  /** Map every loaded node's GUID (node.metadata.gltf.extras.bjs_id) to the node. */
  private buildIdIndex(): Map<string, TransformNode> {
    const map = new Map<string, TransformNode>();
    const consider = (n: TransformNode) => {
      const id = n.metadata?.gltf?.extras?.[ID_KEY];
      if (typeof id === "string" && id && !map.has(id)) map.set(id, n);
    };
    this.scene.transformNodes.forEach(consider);
    this.scene.meshes.forEach((m) => consider(m as unknown as TransformNode));
    return map;
  }

  private findNode(name: string): TransformNode | null {
    return (
      this.scene.getMeshByName(name) ??
      this.scene.getTransformNodeByName(name) ??
      (this.scene.getNodeByName(name) as TransformNode | null) ??
      null
    );
  }

  private applyComponents(entity: Entity, components: Component[]): PendingRef[] {
    let collider: ColliderComponent | undefined;
    let body: RigidBodyComponent | undefined;
    const scripts: ScriptComponent[] = [];

    for (const c of components) {
      switch (c.type) {
        case "TAG":
          entity.tag = c.tag;
          break;
        case "COLLIDER":
          collider = c;
          break;
        case "RIGIDBODY":
          body = c;
          break;
        case "SCRIPT":
          scripts.push(c);
          break;
      }
    }

    if (collider || body) {
      entity.body = buildPhysics(entity.node, collider, body, this.scene);
    }

    const pending: PendingRef[] = [];
    for (const s of scripts) {
      const behavior = this.registry.create(s.script);
      if (!behavior) continue;
      behavior.entity = entity;
      behavior.scene = this.scene;
      pending.push(...applyExposedVars(behavior, s.vars));
      entity.behaviors.push(behavior);
    }
    return pending;
  }
}
