#!/usr/bin/env node
/**
 * Deploy-only game build. Production Vite uses `base: './'`, so dist/ is
 * portable: upload the folder to any host path without baking an absolute base.
 *
 *   node scripts/build-playground-deploy.mjs
 *   npm run deploy:playground
 *
 * Optional escape hatch (absolute asset URLs for a known subdirectory):
 *
 *   npm run deploy:playground -- --base /truck-train/
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GAME = path.join(REPO_ROOT, "game");

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

  if (base.length > 0 && (!base.startsWith("/") || !base.endsWith("/")))
  {
    console.error("Usage: build-playground-deploy.mjs [--base /your-folder/]");
    console.error("  --base is optional; when set it must start and end with /");
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

const { base } = ParseArgs(process.argv.slice(2));

if (base.length > 0)
{
  console.log(`[deploy] building game with absolute base ${base}`);
}
else
{
  console.log("[deploy] building portable game (relative base ./)");
}

Run("npx", ["tsc", "--noEmit"], { cwd: GAME });

const viteArgs = ["vite", "build"];
if (base.length > 0)
{
  viteArgs.push("--base", base);
}
Run("npx", viteArgs, { cwd: GAME });

console.log("[deploy] done → game/dist/");
console.log("[deploy] upload dist/* to any folder on your host (use a trailing slash URL)");
if (base.length > 0)
{
  console.log(`[deploy] test locally: cd game && npx vite preview --base ${base}`);
}
else
{
  console.log("[deploy] test locally: cd game && npx vite preview");
}
