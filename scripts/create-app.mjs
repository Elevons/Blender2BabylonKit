#!/usr/bin/env node
/**
 * Scaffold a new game app inside the monorepo:
 *
 *   npm run create -- --name my-game
 *   npm run create -- --name my-game --title "My Game" --level Arena
 *
 * Copies apps/playground as the template into apps/<name>, rewrites the
 * package name/title/level, and wires "@bjs/engine" as a workspace dependency
 * — the engine itself is NOT copied; every app shares packages/engine via the
 * npm workspace symlink, so engine fixes reach all apps instantly.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const TEMPLATE = path.join(REPO_ROOT, "apps", "playground");
const SKIP = new Set(["node_modules", "dist", ".vite"]);
const DEFAULT_ASSET_FOLDERS = [
  "gui",
  "particles",
  "materials",
  "geometry",
  "filters",
  "render-graphs",
];

function ParseArgs(argv)
{
  const args = {};
  for (let i = 0; i < argv.length; i++)
  {
    const flag = argv[i];
    if (flag === "--name") { args.name = argv[++i]; }
    else if (flag === "--title") { args.title = argv[++i]; }
    else if (flag === "--level") { args.level = argv[++i]; }
    else if (flag === "--force") { args.force = true; }
    else { console.error(`Unknown argument: ${flag}`); process.exit(1); }
  }
  return args;
}

function CopyTemplate(sourceDir, destinationDir, relativeDir = "")
{
  fs.mkdirSync(destinationDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true }))
  {
    if (SKIP.has(entry.name)) { continue; }
    const relativePath = path.join(relativeDir, entry.name);
    if (relativePath === path.join("public", "levels")) { continue; }
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);
    if (entry.isDirectory())
    {
      CopyTemplate(sourcePath, destinationPath, relativePath);
    }
    else
    {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

const args = ParseArgs(process.argv.slice(2));
if (!args.name)
{
  console.error('Usage: npm run create -- --name <app-name> [--title "Title"] [--level Name]');
  process.exit(1);
}

const appName = args.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
const destination = path.join(REPO_ROOT, "apps", appName);

if (fs.existsSync(destination) && !args.force)
{
  console.error(`apps/${appName} already exists (use --force to overwrite)`);
  process.exit(1);
}

CopyTemplate(TEMPLATE, destination);

// public/levels/ is gitignored in the playground so the template doesn't have it;
// create it unconditionally so Blender exports have somewhere to land.
fs.mkdirSync(path.join(destination, "public", "levels"), { recursive: true });
if (args.level)
{
  fs.mkdirSync(path.join(destination, "public", "levels", args.level), { recursive: true });
}

// package.json: new name (dependencies already include "@bjs/engine": "*").
const packagePath = path.join(destination, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
packageJson.name = appName;
fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + "\n");

// index.html title.
const htmlPath = path.join(destination, "index.html");
let html = fs.readFileSync(htmlPath, "utf8");
html = html.replace(/<title>.*<\/title>/, `<title>${args.title ?? appName}</title>`);
fs.writeFileSync(htmlPath, html);

// main.ts level name.
if (args.level)
{
  const mainPath = path.join(destination, "src", "main.ts");
  let main = fs.readFileSync(mainPath, "utf8");
  main = main.replace(
    /\/levels\/[^"]+\.scene\.json/,
    `/levels/${args.level}/${args.level}.scene.json`
  );
  fs.writeFileSync(mainPath, main);
}

// Workspace staging folder for pre-export editor assets.
fs.mkdirSync(path.join(destination, "public", "workspace"), { recursive: true });
for (const folder of DEFAULT_ASSET_FOLDERS)
{
  fs.mkdirSync(path.join(destination, "public", "workspace", folder), { recursive: true });
}

// Project manifest consumed by the Project Control Panel.
const manifest = {
  name: appName,
  title: args.title ?? appName,
  entryLevel: args.level
    ? `/levels/${args.level}/${args.level}.scene.json`
    : undefined,
  defaultLevel: args.level ?? undefined,
  assetFolders: DEFAULT_ASSET_FOLDERS,
  dev: { port: 5173 },
  blenderExportPath: `apps/${appName}/public/levels/`,
};
fs.writeFileSync(
  path.join(destination, "babylon-project.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);

console.log(`Created apps/${appName}`);
console.log(`  1. npm install          (links @bjs/engine into the new app)`);
console.log(`  2. Export a level from Blender into apps/${appName}/public/levels/`);
console.log(`  3. npm run dev --workspace apps/${appName}`);
