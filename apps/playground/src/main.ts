import {
  Scene,
  ArcRotateCamera,
  Vector3,
} from "@babylonjs/core";

import {
  BehaviorRegistry,
  LevelLoader,
  EnableHavokPhysics,
  AutoRegisterBehaviors,
  FetchAndValidateManifest,
  CreateLevelEngine,
  ResolveHavokPhysicsOptions,
  type Level,
} from "@bjs/engine";

/**
 * App bootstrap: create the engine, enable physics, register behaviors, load a
 * level, wire dev tooling, and start the render loop. Everything level-related
 * lives in the engine — this file is only the wiring.
 */

const MANIFEST_URL = "/levels/Train Scene/Train Scene.scene.json";

/** Register every behavior in ./behaviors by filename stem (the Blender key). */
function RegisterBehaviors(): BehaviorRegistry
{
  // This matches the Blender "Open Script..." picker: selecting Rotator.ts
  // stores the key "Rotator", which maps to behaviors/Rotator.ts here.
  const registry = new BehaviorRegistry();
  const behaviorModules = import.meta.glob("./behaviors/*.{ts,js}", { eager: true });
  AutoRegisterBehaviors(registry, behaviorModules);
  return registry;
}

/** Add an orbit camera only when the Blender scene shipped no camera at all. */
function CreateFallbackCameraIfNeeded(scene: Scene, canvas: HTMLCanvasElement): void
{
  // The Blender scene is authoritative for the camera: if it exported its active
  // camera, it's already set. NOTE: scene.activeCamera is a Babylon "Nullable"
  // that can be undefined at runtime (not just null), so test truthiness.
  if (!scene.activeCamera)
  {
    const fallbackCamera = new ArcRotateCamera("fallback", -Math.PI / 2, 1.1, 18, Vector3.Zero(), scene);
    fallbackCamera.attachControl(canvas, true);
  }
}

/**
 * Bind the dev debug keys — C for collider wireframes, I for the Babylon
 * Inspector — gated by the Blender export's "Debug Build" flag. The inspector
 * is dynamically imported so it stays out of production bundles.
 */
function BindDebugKeys(scene: Scene, level: Level): void
{
  let inspectorVisible = false;

  async function ToggleInspector(): Promise<void>
  {
    const { Inspector } = await import("@babylonjs/inspector");

    if (inspectorVisible)
    {
      Inspector.Hide();
    }
    else
    {
      Inspector.Show(scene, { embedMode: true });
    }

    inspectorVisible = !inspectorVisible;
  }

  window.addEventListener("keydown", (keyboardEvent) =>
  {
    if (!level.debugEnabled)
    {
      return;
    }

    const key = keyboardEvent.key.toLowerCase();

    if (key === "c")
    {
      level.ShowColliders();
    }
    else if (key === "i")
    {
      void ToggleInspector();
    }
  });
}

/** Boot the engine, enable physics, load a level, and start the render loop. */
async function Main(): Promise<void>
{
  const canvas = document.getElementById("app") as HTMLCanvasElement;

  // Large-world rendering is an engine option — read the manifest before
  // creating the Engine/Scene (Blender Scene › Rendering › Large World Rendering).
  const manifest = await FetchAndValidateManifest(MANIFEST_URL);
  const engine = CreateLevelEngine(canvas, true, manifest);
  const scene = new Scene(engine);

  // Physics must be enabled before loading anything with colliders/bodies.
  await EnableHavokPhysics(scene, ResolveHavokPhysicsOptions(manifest));

  const registry = RegisterBehaviors();
  const loader = new LevelLoader(scene, registry);
  const level = await loader.Load(MANIFEST_URL, manifest);

  CreateFallbackCameraIfNeeded(scene, canvas);
  BindDebugKeys(scene, level);

  // Example: query by tag set in Blender.
  console.log("Players:", level.ByTag("Player").map((entity) => entity.name));

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
}

Main().catch(console.error);
