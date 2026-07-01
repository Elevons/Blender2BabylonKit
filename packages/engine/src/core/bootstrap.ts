import { Engine } from "@babylonjs/core";

import type { LevelManifest } from "./types";
import type { HavokPhysicsOptions } from "../subsystems/physics";

/** Default Havok floating-origin region radius (matches Babylon HavokPlugin). */
export const DEFAULT_FLOATING_ORIGIN_WORLD_RADIUS = 100_000;

/** Re-export for apps that prefetch the manifest before creating the engine. */
export { FetchAndValidateManifest, GetDirectory } from "./loader/manifest";

/**
 * Whether the manifest requests Babylon large-world / floating-origin rendering.
 */
export function ResolveLargeWorldRendering(manifest: LevelManifest): boolean
{
  return manifest.scene?.largeWorldRendering === true;
}

/**
 * Havok multi-region radius from the manifest, or the Babylon default.
 */
export function ResolveFloatingOriginWorldRadius(manifest: LevelManifest): number
{
  return manifest.scene?.floatingOriginWorldRadius ?? DEFAULT_FLOATING_ORIGIN_WORLD_RADIUS;
}

/**
 * Create an engine with `useLargeWorldRendering` when the manifest asks for it.
 * Call after fetching the manifest and before `new Scene(engine)`.
 */
export function CreateLevelEngine(
  canvas: HTMLCanvasElement,
  antialias: boolean,
  manifest: LevelManifest
): Engine
{
  if (ResolveLargeWorldRendering(manifest))
  {
    return new Engine(canvas, antialias, { useLargeWorldRendering: true });
  }

  return new Engine(canvas, antialias);
}

/**
 * Havok plugin options derived from the manifest scene block (region radius).
 */
export function ResolveHavokPhysicsOptions(manifest: LevelManifest): HavokPhysicsOptions
{
  return {
    floatingOriginWorldRadius: ResolveFloatingOriginWorldRadius(manifest),
  };
}
