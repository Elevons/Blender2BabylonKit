#!/usr/bin/env node
/**
 * Scaffold a Babylon Level Kit game app.
 *
 *   npx b2bkit-create                 # create ./game in the current folder
 *   npx b2bkit-create my-game         # create ./my-game with game/ inside
 *   npx b2bkit-create my-game --title "My Game" --level Main
 *
 * Then: npm install && npx b2bkit-control-panel
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  EnsureRootPackageJson,
  ReadB2bkitVersion,
  SanitizeProjectName,
  ScaffoldGame,
} from "./scaffold-game.js";

/**
 * @param {string[]} argv
 * @returns {{ target: string | null, title: string | null, level: string | null, install: boolean, help: boolean }}
 */
function ParseArgs(argv)
{
  /** @type {{ target: string | null, title: string | null, level: string | null, install: boolean, help: boolean }} */
  const args = {
    target: null,
    title: null,
    level: null,
    install: true,
    help: false,
  };

  for (let index = 0; index < argv.length; index++)
  {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h")
    {
      args.help = true;
    }
    else if (flag === "--title")
    {
      args.title = argv[++index] ?? null;
    }
    else if (flag === "--level")
    {
      args.level = argv[++index] ?? null;
    }
    else if (flag === "--no-install")
    {
      args.install = false;
    }
    else if (flag.startsWith("-"))
    {
      console.error(`Unknown argument: ${flag}`);
      process.exit(1);
    }
    else if (args.target === null)
    {
      args.target = flag;
    }
    else
    {
      console.error(`Unexpected argument: ${flag}`);
      process.exit(1);
    }
  }

  return args;
}

function PrintHelp()
{
  console.log(`Usage:
  npx b2bkit-create [project-name] [--title "My Game"] [--level Main] [--no-install]

Creates a game/ app (Vite + b2bkit) with a spinning-cube starter level
you can open immediately via npx b2bkit-control-panel / npm start.

Examples:
  npx b2bkit-create
      Scaffold ./game in the current directory.

  npx b2bkit-create society-sim --title "Society Sim"
      Create ./society-sim with package.json + game/, then npm install.
`);
}

/**
 * @returns {void}
 */
function Main()
{
  const args = ParseArgs(process.argv.slice(2));
  if (args.help)
  {
    PrintHelp();
    return;
  }

  const b2bkitVersion = ReadB2bkitVersion();
  const cwd = process.cwd();

  let projectRoot = cwd;
  let projectName = SanitizeProjectName(path.basename(cwd));

  if (args.target !== null)
  {
    projectName = SanitizeProjectName(args.target);
    projectRoot = path.resolve(cwd, args.target);
    if (fs.existsSync(projectRoot) && fs.readdirSync(projectRoot).length > 0)
    {
      const hasGame = fs.existsSync(path.join(projectRoot, "game", "package.json"));
      if (hasGame)
      {
        console.error(`[b2bkit-create] ${projectRoot} already has a game/ app.`);
        process.exit(1);
      }
    }
  }

  EnsureRootPackageJson(projectRoot, b2bkitVersion);

  const result = ScaffoldGame(projectRoot, {
    name: projectName,
    title: args.title ?? projectName,
    level: args.level ?? "Main",
    b2bkitVersion,
  });

  console.log(`[b2bkit-create] Created ${result.gameDir}`);
  console.log(`[b2bkit-create] First level folder: public/levels/${result.level}/`);

  if (args.install)
  {
    console.log("[b2bkit-create] Running npm install…");
    const install = spawnSync("npm", ["install"], {
      cwd: projectRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (install.status !== 0)
    {
      console.error("[b2bkit-create] npm install failed — run it manually from the project root.");
      process.exit(install.status ?? 1);
    }
  }

  console.log(`
Next:
  cd ${path.relative(cwd, projectRoot) || "."}
  npm start                  # control panel — Start shows a spinning cube
  npx b2bkit-addon-path      # install that zip in Blender when ready to author
`);
}

Main();
