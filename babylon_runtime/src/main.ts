import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
} from "@babylonjs/core";

import {
  BehaviorRegistry,
  LevelLoader,
  EnableHavokPhysics,
  AutoRegisterBehaviors,
} from "./engine";

/** Boot the engine, enable physics, load a level, and start the render loop. */
async function Main(): Promise<void>
{
  const canvas = document.getElementById("app") as HTMLCanvasElement;
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);

  // Physics must be enabled before loading anything with colliders/bodies.
  await EnableHavokPhysics(scene);

  // Auto-register every behavior in ./behaviors, keyed by filename stem. This
  // matches the Blender "Open Script..." picker: selecting Rotator.ts stores the
  // key "Rotator", which maps to behaviors/Rotator.ts here.
  const registry = new BehaviorRegistry();
  const behaviorModules = import.meta.glob("./behaviors/*.{ts,js}", { eager: true });
  AutoRegisterBehaviors(registry, behaviorModules);

  const loader = new LevelLoader(scene, registry);
  const level = await loader.Load("/levels/Untitled.scene.json");

  // The Blender scene is authoritative for the camera too: if it exported its
  // active camera, it's already set. Only add a fallback if none came through.
  // NOTE: scene.activeCamera is a Babylon "Nullable" that can be undefined at
  // runtime (not just null), so test truthiness rather than `=== null`.
  if (!scene.activeCamera)
  {
    const fallbackCamera = new ArcRotateCamera("fallback", -Math.PI / 2, 1.1, 18, Vector3.Zero(), scene);
    fallbackCamera.attachControl(canvas, true);
  }

  // Example: query by tag set in Blender.
  console.log("Players:", level.ByTag("Player").map((entity) => entity.name));

  // Press C to toggle collider/physics debug wireframes.
  window.addEventListener("keydown", (keyboardEvent) =>
  {
    if (keyboardEvent.key.toLowerCase() === "c")
    {
      level.ShowColliders();
    }
  });

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
}

Main().catch(console.error);
