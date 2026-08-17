#!/usr/bin/env node
/**
 * Thin wrapper around the published scaffold.
 *
 * Prefer: npx b2bkit-create [name]
 *
 *   node scripts/create-app.mjs [--dir path] [--name id] [--title "..."] [--level Main]
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scaffoldUrl = pathToFileURL(
  path.join(ROOT, "packages", "engine", "bin", "scaffold-game.js"),
).href;

const { EnsureRootPackageJson, ReadB2bkitVersion, ScaffoldGame } = await import(scaffoldUrl);

/**
 * @param {string[]} argv
 */
function ParseArgs(argv)
{
  /** @type {{ dir: string | null, name: string | null, title: string | null, level: string | null }} */
  const args = { dir: null, name: null, title: null, level: null };
  for (let index = 0; index < argv.length; index++)
  {
    const flag = argv[index];
    if (flag === "--dir")
    {
      args.dir = argv[++index] ?? null;
    }
    else if (flag === "--name")
    {
      args.name = argv[++index] ?? null;
    }
    else if (flag === "--title")
    {
      args.title = argv[++index] ?? null;
    }
    else if (flag === "--level")
    {
      args.level = argv[++index] ?? null;
    }
    else
    {
      console.error(`Unknown argument: ${flag}`);
      console.error("Prefer: npx b2bkit-create [project-name]");
      process.exit(1);
    }
  }
  return args;
}

const args = ParseArgs(process.argv.slice(2));
const projectRoot = path.resolve(args.dir ?? process.cwd());
const b2bkitVersion = ReadB2bkitVersion();
EnsureRootPackageJson(projectRoot, b2bkitVersion);
const result = ScaffoldGame(projectRoot, {
  name: args.name ?? undefined,
  title: args.title ?? undefined,
  level: args.level ?? undefined,
  b2bkitVersion,
});

console.log(`[create-app] Created ${result.gameDir}`);
console.log("Next: npm install && npx b2bkit-control-panel");
