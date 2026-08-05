import type { LevelManifest } from "../types";

/**
 * Manifest acquisition: fetch the `.scene.json`, fail with actionable errors
 * for the two common dev-server mistakes (404 and HTML fallback), and validate
 * the parsed shape so schema drift or hand-edits surface here — not as
 * undefined-field weirdness deep in the entity pass.
 */

/**
 * The manifest schema version this runtime understands. Must match
 * SCHEMA_VERSION in blender_addon/export/level.py — the exporter writes it,
 * the loader enforces it here.
 */
export const SUPPORTED_SCHEMA_VERSION = 5;

/** Return the directory portion of a URL (everything up to the last slash). */
export function GetDirectory(url: string): string
{
  const lastSlash = url.lastIndexOf("/");
  return lastSlash >= 0 ? url.slice(0, lastSlash + 1) : "";
}

/**
 * Build a fetch URL for a manifest-relative asset path. Encodes each path
 * segment so filenames with spaces, parentheses, etc. still resolve (the dev
 * server otherwise 404s and may return HTML, which breaks JSON.parse).
 */
export function ResolveManifestAssetUrl(baseUrl: string, manifestPath: string): string
{
  const encodedPath = manifestPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return baseUrl + encodedPath;
}

/**
 * Check the parsed manifest's version and required shape before the loader
 * spends time on it. Throws with a `[bjs]` message naming the first problem;
 * unknown component types only warn so older runtimes tolerate newer exports.
 */
export function ValidateManifest(parsed: unknown, sourceLabel = "manifest"): LevelManifest
{
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
  {
    throw new Error(`[bjs] ${sourceLabel} is not a JSON object.`);
  }

  const manifest = parsed as Record<string, unknown>;

  if (manifest.version !== SUPPORTED_SCHEMA_VERSION)
  {
    const exporterHint =
      typeof manifest.exporterVersion === "string" && manifest.exporterVersion.length > 0
        ? ` This scene was exported with Blender add-on ${manifest.exporterVersion}.`
        : "";

    throw new Error(
      `[bjs] ${sourceLabel} schema version ${String(manifest.version)} is not supported ` +
      `(expected ${SUPPORTED_SCHEMA_VERSION}).${exporterHint} ` +
      `Update the engine to a matching kit release, or re-export the level with a matching Blender add-on.`
    );
  }

  if (typeof manifest.glb !== "string" || manifest.glb.length === 0)
  {
    throw new Error(`[bjs] ${sourceLabel} is missing its "glb" path.`);
  }

  if (!Array.isArray(manifest.entities))
  {
    throw new Error(`[bjs] ${sourceLabel} "entities" must be an array.`);
  }

  for (const [index, entity] of manifest.entities.entries())
  {
    ValidateEntityShape(entity, index, sourceLabel);
  }

  return parsed as LevelManifest;
}

/** Shape-check one entity row; throws on structural problems, warns on unknown component types. */
function ValidateEntityShape(entity: unknown, index: number, sourceLabel: string): void
{
  if (typeof entity !== "object" || entity === null)
  {
    throw new Error(`[bjs] ${sourceLabel} entities[${index}] is not an object.`);
  }

  const entityRecord = entity as Record<string, unknown>;
  const label = typeof entityRecord.name === "string" ? `"${entityRecord.name}"` : `entities[${index}]`;

  if (typeof entityRecord.id !== "string" || entityRecord.id.length === 0)
  {
    throw new Error(`[bjs] ${sourceLabel} entity ${label} is missing its "id" GUID.`);
  }

  if (typeof entityRecord.name !== "string")
  {
    throw new Error(`[bjs] ${sourceLabel} entities[${index}] is missing its "name".`);
  }

  if (!Array.isArray(entityRecord.components))
  {
    throw new Error(`[bjs] ${sourceLabel} entity ${label} "components" must be an array.`);
  }

  for (const component of entityRecord.components)
  {
    const componentType = (component as Record<string, unknown> | null)?.type;
    if (typeof componentType !== "string" || componentType.length === 0)
    {
      throw new Error(`[bjs] ${sourceLabel} entity ${label} has a component without a "type".`);
    }
  }
}

/** Fetch the manifest JSON, with clear errors for the two common failures. */
export async function FetchAndValidateManifest(manifestUrl: string): Promise<LevelManifest>
{
  const response = await fetch(manifestUrl);
  if (!response.ok)
  {
    throw new Error(
      `[bjs] could not fetch manifest "${manifestUrl}" (HTTP ${response.status}). ` +
      `Check the file exists and the path/filename match exactly.`
    );
  }

  const text = await response.text();
  if (text.trimStart().startsWith("<"))
  {
    throw new Error(
      `[bjs] "${manifestUrl}" returned HTML, not JSON. The dev server likely ` +
      `served index.html because the file was not found at that path.`
    );
  }

  return ValidateManifest(JSON.parse(text), `"${manifestUrl}"`);
}
