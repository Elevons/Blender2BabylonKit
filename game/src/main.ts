import {
  Scene,
  ArcRotateCamera,
  Vector3,
} from "@babylonjs/core";

import {
  BehaviorRegistry,
  LevelDirector,
  AutoRegisterBehaviors,
  type Level,
} from "b2bkit";

/**
 * App bootstrap: register behaviors, own level load/restart via LevelDirector,
 * wire dev tooling, and start the render loop. Behaviors reach load/restart as
 * `this.session`.
 */

const INCLUDE_DEVELOPER_TOOLS = import.meta.env.VITE_INCLUDE_DEVELOPER_TOOLS !== "false";

/**
 * Join a path under Vite's base. Production builds use `base: './'` so the
 * published folder works at any host path; dev keeps `base: '/'`.
 */
function ManifestUrlUnderBase(relativePath: string): string
{
  const trimmed = relativePath.replace(/^\/+/, "");
  return `${import.meta.env.BASE_URL}${trimmed}`;
}

const DEFAULT_MANIFEST_URL = ManifestUrlUnderBase(
  "levels/Train Scene/Train Scene.scene.json"
);

/**
 * Pick the level to load: `?manifest=` (dev jump from the Project Control Panel), then the
 * publish-time `VITE_START_LEVEL`, then the project default.
 */
function ResolveManifestUrl(): string
{
  const fromQuery = new URLSearchParams(window.location.search).get("manifest");
  if (fromQuery !== null && fromQuery.length > 0)
  {
    return fromQuery;
  }

  const fromEnv = import.meta.env.VITE_START_LEVEL as string | undefined;
  if (fromEnv !== undefined && fromEnv.length > 0)
  {
    // Absolute `/levels/…` values (older publish / env) still resolve under BASE_URL.
    if (fromEnv.startsWith("/"))
    {
      return ManifestUrlUnderBase(fromEnv);
    }

    return fromEnv;
  }

  return DEFAULT_MANIFEST_URL;
}

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
 * Bind the dev debug keys — Shift+C for collider wireframes, Shift+I for the
 * Babylon Inspector — gated by the Blender export's "Debug Build" flag. The
 * inspector is dynamically imported so it stays out of production bundles.
 * Uses a mutable level slot so soft restarts keep working without rebinding.
 */
function BindDebugKeys(
  getScene: () => Scene | null,
  getLevel: () => Level | null
): void
{
  let inspectorVisible = false;

  async function ToggleInspector(scene: Scene): Promise<void>
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
    const level = getLevel();
    const scene = getScene();
    if (level === null || scene === null || !level.debugEnabled || !keyboardEvent.shiftKey)
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
      void ToggleInspector(scene);
    }
  });
}

/** Boot LevelDirector, load the start level, and wire per-load app hooks. */
async function Main(): Promise<void>
{
  const canvas = document.getElementById("app") as HTMLCanvasElement;
  const registry = RegisterBehaviors();
  const director = new LevelDirector({
    canvas,
    registry,
    onLoaded: ({ scene, level }) =>
    {
      CreateFallbackCameraIfNeeded(scene, canvas);

      // Unity-style fixed physics stepping: identical 1/60s integration
      // slices at any frame rate (stable constraints at low FPS).
      level.time.fixedDeltaSeconds = 1 / 60;

      console.log("Players:", level.ByTag("Player").map((entity) => entity.name));
    },
  });

  if (INCLUDE_DEVELOPER_TOOLS)
  {
    BindDebugKeys(() => director.GetScene(), () => director.GetLevel());
  }

  await director.Load(ResolveManifestUrl());
}

Main().catch(console.error);
