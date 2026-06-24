/**
 * Kit version strings for docs — read from engine package.json and blender_manifest.toml.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** @returns {{ engine: string, blender: string, proseLabel: string }} */
export function ReadKitVersions()
{
  const enginePkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, "packages/engine/package.json"), "utf8"),
  );
  const manifestToml = fs.readFileSync(
    path.join(ROOT, "blender_addon/blender_manifest.toml"),
    "utf8",
  );
  const blenderMatch = manifestToml.match(/^version\s*=\s*"([^"]+)"/m);
  const engine = enginePkg.version;
  const blender = blenderMatch ? blenderMatch[1] : "unknown";
  return {
    engine,
    blender,
    proseLabel: `engine v${engine} · Blender add-on v${blender}`,
  };
}

/** Replace __KIT_VERSION__ in prose / meta HTML fragments. */
export function ApplyKitVersionPlaceholders(text)
{
  return text.replaceAll("__KIT_VERSION__", ReadKitVersions().proseLabel);
}
