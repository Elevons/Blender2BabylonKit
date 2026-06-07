import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
} from "@babylonjs/core";

import {
  ComponentRegistry,
  LevelLoader,
  enableHavokPhysics,
  autoRegisterBehaviors,
} from "./engine";

async function main() {
  const canvas = document.getElementById("app") as HTMLCanvasElement;
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);

  // Physics must be enabled before loading anything with colliders/bodies.
  await enableHavokPhysics(scene);

  // Auto-register every behavior in ./behaviors, keyed by filename stem. This
  // matches the Blender "Open Script…" picker: selecting Rotator.ts stores the
  // key "Rotator", which maps to behaviors/Rotator.ts here.
  const registry = new ComponentRegistry();
  const behaviorModules = import.meta.glob("./behaviors/*.{ts,js}", { eager: true });
  autoRegisterBehaviors(registry, behaviorModules);
  // (You can still register manually too: registry.registerScript("Foo", Foo);)

  const loader = new LevelLoader(scene, registry);
  const level = await loader.load("/levels/Untitled.scene.json");

  // The Blender scene is authoritative for the camera too: if it exported its
  // active camera, it's already set. Only add a fallback if none came through.
  if (!scene.activeCamera) {
    const cam = new ArcRotateCamera("fallback", -Math.PI / 2, 1.1, 18, Vector3.Zero(), scene);
    cam.attachControl(canvas, true);
  }
  // To fly the Blender camera around for inspection, attach controls to it:
  //   level.activeCamera?.attachControl(canvas, true);

  // Example: query by tag set in Blender.
  console.log("Players:", level.byTag("Player").map((e) => e.name));

  // Press C to toggle collider/physics debug wireframes.
  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "c") level.showColliders();
  });

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
}

main().catch(console.error);
