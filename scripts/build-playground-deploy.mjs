#!/usr/bin/env node
/**
 * Deploy-only playground build for a URL subdirectory (e.g. elevons.design/demo/).
 *
 * Leaves dev untouched: npm run dev and npm run build behave exactly as before.
 * This script only writes to apps/playground/dist/.
 *
 *   node scripts/build-playground-deploy.mjs --base /truck-train/
 *   npm run deploy:playground -- --base /truck-train/
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLAYGROUND = path.join(REPO_ROOT, "apps", "playground");
const DIST = path.join(PLAYGROUND, "dist");

function ParseArgs(argv)
{
  let base = "";
  for (let index = 0; index < argv.length; index++)
  {
    const arg = argv[index];
    if (arg === "--base")
    {
      base = argv[index + 1] ?? "";
      index++;
    }
    else if (arg.startsWith("--base="))
    {
      base = arg.slice("--base=".length);
    }
  }

  if (!base.startsWith("/") || !base.endsWith("/"))
  {
    console.error("Usage: build-playground-deploy.mjs --base /your-folder/");
    console.error("  --base must start and end with / (e.g. /truck-train/)");
    process.exit(1);
  }

  return { base };
}

function Run(command, args, options = {})
{
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? REPO_ROOT,
    stdio: "inherit",
  });
  if (result.status !== 0)
  {
    process.exit(result.status ?? 1);
  }
}

/** Patch hardcoded root-absolute level URLs in built chunks (main.ts stays dev-friendly). */
function PatchLevelUrls(base)
{
  const assetsDir = path.join(DIST, "assets");
  if (!fs.existsSync(assetsDir))
  {
    console.error("dist/assets missing — build failed?");
    process.exit(1);
  }

  const from = '"/levels/';
  const to = `"${base}levels/`;
  let patchedFiles = 0;

  for (const fileName of fs.readdirSync(assetsDir))
  {
    if (!fileName.endsWith(".js"))
    {
      continue;
    }

    const filePath = path.join(assetsDir, fileName);
    const source = fs.readFileSync(filePath, "utf8");
    if (!source.includes(from))
    {
      continue;
    }

    fs.writeFileSync(filePath, source.replaceAll(from, to));
    patchedFiles++;
  }

  if (patchedFiles === 0)
  {
    console.warn(
      "[deploy] warning: no /levels/ URLs found in dist/assets — " +
        "if the level fails to load, check main.ts manifest path"
    );
  }
  else
  {
    console.log(`[deploy] patched level URLs in ${patchedFiles} chunk(s) → ${base}levels/…`);
  }
}

const { base } = ParseArgs(process.argv.slice(2));

console.log(`[deploy] building playground for subdirectory ${base}`);

Run("npx", ["tsc", "--noEmit"], { cwd: PLAYGROUND });
Run("npx", ["vite", "build", "--base", base], { cwd: PLAYGROUND });
PatchLevelUrls(base);

console.log(`[deploy] done → apps/playground/dist/`);
console.log(`[deploy] upload dist/* to public_html${base.slice(0, -1)}/ on your host`);
console.log(`[deploy] test locally: cd apps/playground && npx vite preview --base ${base}`);
