// Temporary headless test page: load a level given by ?level=<folder> and
// signal readiness on window so a screenshot can be captured deterministically.
import { Scene, DirectionalLight } from "@babylonjs/core";
import {
  BehaviorRegistry,
  LevelLoader,
  EnableHavokPhysics,
  AutoRegisterBehaviors,
  FetchAndValidateManifest,
  CreateLevelEngine,
  ResolveHavokPhysicsOptions,
} from "@bjs/engine";

declare global
{
  interface Window
  {
    __levelReady?: boolean;
    __sunInfo?: unknown;
  }
}

async function Main(): Promise<void>
{
  const params = new URLSearchParams(location.search);
  const levelFolder = params.get("level") ?? "Train Scene";
  const manifestUrl = `/levels/${levelFolder}/Train Scene.scene.json`;

  const canvas = document.getElementById("app") as HTMLCanvasElement;
  const manifest = await FetchAndValidateManifest(manifestUrl);
  const engine = CreateLevelEngine(canvas, true, manifest);
  const scene = new Scene(engine);

  await EnableHavokPhysics(scene, ResolveHavokPhysicsOptions(manifest));

  const registry = new BehaviorRegistry();
  const behaviorModules = import.meta.glob("./src/behaviors/*.{ts,js}", { eager: true });
  AutoRegisterBehaviors(registry, behaviorModules);

  const loader = new LevelLoader(scene, registry);
  await loader.Load(manifestUrl, manifest);

  // Render a fixed number of frames, then expose sun/frustum state and flag ready.
  let frames = 0;
  engine.runRenderLoop(() =>
  {
    scene.render();
    frames++;
    if (frames === 30)
    {
      const sun = scene.lights.find((light) => light instanceof DirectionalLight) as DirectionalLight | undefined;
      window.__sunInfo = sun === undefined ? null : {
        position: sun.position.asArray(),
        direction: sun.direction.asArray(),
        parent: sun.parent?.name ?? null,
        shadowMinZ: sun.shadowMinZ,
        shadowMaxZ: sun.shadowMaxZ,
        orthoLeft: sun.orthoLeft,
        orthoRight: sun.orthoRight,
        orthoTop: sun.orthoTop,
        orthoBottom: sun.orthoBottom,
        autoCalcShadowZBounds: sun.autoCalcShadowZBounds,
        intensity: sun.intensity,
      };
      window.__levelReady = true;
      engine.stopRenderLoop();
    }
  });
}

Main().catch((error) =>
{
  console.error(error);
  window.__sunInfo = { error: String(error) };
  window.__levelReady = true;
});
