#!/usr/bin/env node
/**
 * Scaffold a new Babylon Level Kit runtime from this one as a template.
 *
 *   npm run create -- --name my-game
 *   npm run create -- --name "My Game" --dir ../MyGame --title "My Game" --level Arena --install
 *
 * It copies the runtime (engine, behaviors, config) into a new folder, rewrites
 * the project name/title, and skips generated/heavy files (node_modules, dist,
 * the scaffolder itself, and any exported level assets).
 *
 * NOTE: this is a *template copy* — each project gets its own frozen copy of
 * src/engine/. The clean long-term path is to publish the engine as a package
 * and have projects depend on it; this script is the pragmatic stand-in.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const TEMPLATE_ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const DEFAULT_LEVEL_TOKEN = "/levels/Untitled.scene.json";

function parseArgs(argv) {
  const args = { install: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--name": args.name = next(); break;
      case "--dir": args.dir = next(); break;
      case "--title": args.title = next(); break;
      case "--level": args.level = next(); break;
      case "--install": args.install = true; break;
      case "--force": args.force = true; break;
      case "-h":
      case "--help": args.help = true; break;
      default:
        console.error(`Unknown argument: ${a}`);
        args.help = true;
    }
  }
  return args;
}

function usage() {
  console.log(`
Create a new Babylon Level Kit project.

Usage:
  npm run create -- --name <name> [options]

Options:
  --name <name>     Project name (required). Used for the folder + package name.
  --dir <path>      Target directory (default: ../<slug> next to this runtime).
  --title <text>    Browser tab title (default: the name).
  --level <name>    Level file main.ts should load: /levels/<name>.scene.json.
  --install         Run "npm install" in the new project when done.
  --force           Allow creating into a non-empty directory.
  -h, --help        Show this help.
`);
}

/** npm package names: lowercase, url-safe; no spaces or leading dot/underscore. */
function slugify(name) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-._~]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "");
  return slug;
}

/** Decide whether a template path should be copied into the new project. */
function shouldCopy(src) {
  const rel = path.relative(TEMPLATE_ROOT, src);
  if (rel === "") return true; // the root itself
  const segments = rel.split(path.sep);
  const top = segments[0];
  const base = path.basename(src);

  // Prune heavy / generated / tooling directories entirely.
  if (["node_modules", "dist", "dist-ssr", ".vite"].includes(top)) return false;
  if (top === "scripts") return false; // don't ship the scaffolder into new projects
  if (base.endsWith(".tsbuildinfo")) return false;

  // Keep the public/levels folder but not previously exported level assets.
  if (segments[0] === "public" && segments[1] === "levels") {
    if (base.endsWith(".glb") || base.endsWith(".scene.json")) return false;
  }
  return true;
}

function rewriteFile(file, fn) {
  if (!fs.existsSync(file)) return;
  fs.writeFileSync(file, fn(fs.readFileSync(file, "utf8")));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.name) {
    if (!args.name && !args.help) console.error("Error: --name is required.\n");
    usage();
    process.exit(args.name ? 0 : 1);
  }

  const slug = slugify(args.name);
  if (!slug) {
    console.error(`Error: "${args.name}" doesn't reduce to a valid project name.`);
    process.exit(1);
  }
  const title = args.title ?? args.name;
  const targetDir = path.resolve(process.cwd(), args.dir ?? path.join("..", slug));

  // Guard against clobbering an existing project.
  if (fs.existsSync(targetDir)) {
    const entries = fs.readdirSync(targetDir);
    if (entries.length > 0 && !args.force) {
      console.error(
        `Error: "${targetDir}" exists and isn't empty. Use --force to override.`
      );
      process.exit(1);
    }
  }
  if (path.resolve(targetDir) === TEMPLATE_ROOT) {
    console.error("Error: target directory is the template itself.");
    process.exit(1);
  }

  console.log(`Creating "${args.name}" -> ${targetDir}`);
  fs.cpSync(TEMPLATE_ROOT, targetDir, { recursive: true, filter: shouldCopy });

  // --- rewrite package.json ---
  rewriteFile(path.join(targetDir, "package.json"), (txt) => {
    const pkg = JSON.parse(txt);
    pkg.name = slug;
    pkg.version = "0.1.0";
    if (pkg.scripts) delete pkg.scripts.create; // scaffolder isn't copied
    return JSON.stringify(pkg, null, 2) + "\n";
  });

  // --- rewrite index.html <title> ---
  rewriteFile(path.join(targetDir, "index.html"), (txt) =>
    txt.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
  );

  // --- optionally point main.ts at a specific level file ---
  if (args.level) {
    const levelSlug = args.level.replace(/\.scene\.json$/i, "");
    rewriteFile(path.join(targetDir, "src", "main.ts"), (txt) =>
      txt.replace(DEFAULT_LEVEL_TOKEN, `/levels/${levelSlug}.scene.json`)
    );
  }

  // --- ensure an empty public/levels with a keep file ---
  const levelsDir = path.join(targetDir, "public", "levels");
  fs.mkdirSync(levelsDir, { recursive: true });
  const keep = path.join(levelsDir, ".gitkeep");
  if (!fs.existsSync(keep)) fs.writeFileSync(keep, "");

  // --- a starter README for the new project ---
  const wantedLevel = args.level
    ? `${args.level.replace(/\.scene\.json$/i, "")}.scene.json`
    : "Untitled.scene.json";
  fs.writeFileSync(
    path.join(targetDir, "README.md"),
    `# ${title}

A Babylon Level Kit runtime.

## Run

\`\`\`
npm install
# export your level from Blender, then drop both files here:
#   public/levels/${wantedLevel}   (+ the matching .glb)
npm run dev
\`\`\`

Add behaviors under \`src/behaviors/\` (one class per file, default-exported);
they auto-register by filename. The engine lives in \`src/engine/\`.
`
  );

  if (args.install) {
    console.log("Installing dependencies...");
    const r = spawnSync("npm", ["install"], { cwd: targetDir, stdio: "inherit" });
    if (r.status !== 0) console.error("npm install failed; run it manually.");
  }

  console.log(`
Done. Next steps:
  cd ${path.relative(process.cwd(), targetDir) || "."}${args.install ? "" : "\n  npm install"}
  npm run dev

Export a level from Blender into public/levels/ (${wantedLevel} + its .glb).
`);
}

main();
