import {
  Scene,
  ArcRotateCamera,
  HemisphericLight,
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
 * and start the render loop. Behaviors reach load/restart as `this.session`.
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
  "levels/{{LEVEL}}/{{LEVEL}}.scene.json"
);

/**
 * Pick the level to load: `?manifest=` (control panel jump), then publish-time
 * `VITE_START_LEVEL`, then the project default.
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
  const registry = new BehaviorRegistry();
  const behaviorModules = import.meta.glob("./behaviors/*.{ts,js}", { eager: true });
  AutoRegisterBehaviors(registry, behaviorModules);
  return registry;
}

/** Add an orbit camera / key light when the Blender scene shipped none. */
function EnsureFallbackCameraAndLight(scene: Scene, canvas: HTMLCanvasElement): void
{
  if (!scene.activeCamera)
  {
    const fallbackCamera = new ArcRotateCamera(
      "fallback",
      -Math.PI / 2,
      1.1,
      6,
      Vector3.Zero(),
      scene,
    );
    fallbackCamera.attachControl(canvas, true);
    scene.activeCamera = fallbackCamera;
  }

  if (scene.lights.length === 0)
  {
    const keyLight = new HemisphericLight("fallbackLight", new Vector3(0.3, 1, 0.2), scene);
    keyLight.intensity = 1.1;
  }
}

/**
 * Bind Shift+C (colliders) and Shift+I (Inspector) when the level enables debug.
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

/** Show a clear message when the start level cannot be loaded. */
function ShowMissingLevel(manifestUrl: string, error: unknown): void
{
  const status = document.getElementById("bjs-loading-status");
  const pct = document.getElementById("bjs-loading-pct");
  if (status !== null)
  {
    status.textContent = "Could not load level";
  }
  if (pct !== null)
  {
    const message = error instanceof Error ? error.message : String(error);
    pct.textContent =
      `Expected ${manifestUrl} under game/public/levels/{{LEVEL}}/. ` +
      `Re-run npx b2bkit-create or export from Blender. ${message}`;
  }
  console.error("[b2bkit] Failed to load level", manifestUrl, error);
}

/** Boot LevelDirector, load the start level, and wire per-load app hooks. */
async function Main(): Promise<void>
{
  const canvas = document.getElementById("app") as HTMLCanvasElement;
  const registry = RegisterBehaviors();
  const director = new LevelDirector({
    canvas,
    registry,
    onLoaded: ({ scene }) =>
    {
      EnsureFallbackCameraAndLight(scene, canvas);
    },
  });

  if (INCLUDE_DEVELOPER_TOOLS)
  {
    BindDebugKeys(() => director.GetScene(), () => director.GetLevel());
  }

  const manifestUrl = ResolveManifestUrl();
  try
  {
    await director.Load(manifestUrl);
  }
  catch (error)
  {
    ShowMissingLevel(manifestUrl, error);
  }
}

Main().catch(console.error);
