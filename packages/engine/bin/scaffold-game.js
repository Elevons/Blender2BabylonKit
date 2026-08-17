#!/usr/bin/env node
/**
 * Copy the starter game/ template into a project root and apply placeholders.
 *
 * Used by `b2bkit-create` and the Project Control Panel Create Project flow.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TEMPLATE_DIR = path.resolve(THIS_DIR, "../templates/game");
const DEFAULT_STARTER_LEVEL_DIR = path.resolve(THIS_DIR, "../templates/starter-level");

/**
 * @typedef {object} ScaffoldGameOptions
 * @property {string} [name] Package / project id (default "game")
 * @property {string} [title] Display title
 * @property {string} [level] First level folder name (default "Main")
 * @property {string} [b2bkitVersion] Semver range written into game/package.json
 * @property {string} [templateDir] Override template path
 */

/**
 * @typedef {object} ScaffoldGameResult
 * @property {string} projectRoot
 * @property {string} gameDir
 * @property {string} name
 * @property {string} title
 * @property {string} level
 */

/**
 * Sanitize a project / package name to npm-safe kebab-case.
 * @param {string} value
 * @returns {string}
 */
export function SanitizeProjectName(value)
{
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "game";
}

/**
 * Read the installed / local b2bkit version for template dependency pins.
 * @returns {string}
 */
export function ReadB2bkitVersion()
{
  try
  {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(THIS_DIR, "../package.json"), "utf8"),
    );
    if (typeof packageJson.version === "string" && packageJson.version.length > 0)
    {
      return `^${packageJson.version}`;
    }
  }
  catch
  {
    // Fall through.
  }

  return "^1.0.0";
}

/**
 * Replace {{PLACEHOLDER}} tokens in a UTF-8 text file.
 * @param {string} filePath
 * @param {Record<string, string>} replacements
 * @returns {void}
 */
function ApplyPlaceholders(filePath, replacements)
{
  let text = fs.readFileSync(filePath, "utf8");
  for (const [token, value] of Object.entries(replacements))
  {
    text = text.split(`{{${token}}}`).join(value);
  }
  fs.writeFileSync(filePath, text, "utf8");
}

/**
 * Recursively list files under a directory.
 * @param {string} rootDir
 * @returns {string[]}
 */
function ListFilesRecursive(rootDir)
{
  /** @type {string[]} */
  const results = [];

  /**
   * @param {string} directory
   * @returns {void}
   */
  function Walk(directory)
  {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }))
    {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory())
      {
        Walk(fullPath);
      }
      else if (entry.isFile())
      {
        results.push(fullPath);
      }
    }
  }

  Walk(rootDir);
  return results;
}

/**
 * Scaffold `game/` under projectRoot from the kit template.
 * @param {string} projectRoot
 * @param {ScaffoldGameOptions} [options]
 * @returns {ScaffoldGameResult}
 */
export function ScaffoldGame(projectRoot, options = {})
{
  const resolvedRoot = path.resolve(projectRoot);
  const name = SanitizeProjectName(options.name ?? path.basename(resolvedRoot) ?? "game");
  const title = (options.title ?? name).trim() || name;
  const level = (options.level ?? "Main").trim() || "Main";
  const b2bkitVersion = options.b2bkitVersion ?? ReadB2bkitVersion();
  const templateDir = options.templateDir ?? DEFAULT_TEMPLATE_DIR;
  const gameDir = path.join(resolvedRoot, "game");

  if (!fs.existsSync(templateDir))
  {
    throw new Error(`Game template not found at ${templateDir}`);
  }

  if (fs.existsSync(path.join(gameDir, "package.json")))
  {
    throw new Error(`Refusing to overwrite existing game app at ${gameDir}`);
  }

  fs.mkdirSync(resolvedRoot, { recursive: true });
  fs.cpSync(templateDir, gameDir, { recursive: true });

  const replacements = {
    PACKAGE_NAME: name,
    TITLE: title,
    LEVEL: level,
    B2BKIT_VERSION: b2bkitVersion,
  };

  const textExtensions = new Set([
    ".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".html", ".md", ".css", ".txt",
  ]);

  for (const filePath of ListFilesRecursive(gameDir))
  {
    const extension = path.extname(filePath).toLowerCase();
    if (!textExtensions.has(extension) && path.basename(filePath) !== ".gitkeep")
    {
      continue;
    }
    if (path.basename(filePath) === ".gitkeep")
    {
      continue;
    }
    ApplyPlaceholders(filePath, replacements);
  }

  fs.mkdirSync(path.join(gameDir, "public", "levels", level), { recursive: true });
  InstallStarterLevel(gameDir, level, options.starterLevelDir ?? DEFAULT_STARTER_LEVEL_DIR);

  // Drop the empty levels/.gitkeep once a real level folder exists.
  const levelsGitkeep = path.join(gameDir, "public", "levels", ".gitkeep");
  if (fs.existsSync(levelsGitkeep))
  {
    fs.unlinkSync(levelsGitkeep);
  }

  return {
    projectRoot: resolvedRoot,
    gameDir,
    name,
    title,
    level,
  };
}

/**
 * Write the spinning-cube starter level so Start works before any Blender export.
 * @param {string} gameDir
 * @param {string} level
 * @param {string} starterLevelDir
 * @returns {void}
 */
function InstallStarterLevel(gameDir, level, starterLevelDir)
{
  const glbSource = path.join(starterLevelDir, "cube.glb");
  const sceneSource = path.join(starterLevelDir, "level.scene.json");
  if (!fs.existsSync(glbSource) || !fs.existsSync(sceneSource))
  {
    throw new Error(`Starter level assets missing under ${starterLevelDir}`);
  }

  const levelDir = path.join(gameDir, "public", "levels", level);
  fs.mkdirSync(levelDir, { recursive: true });
  fs.copyFileSync(glbSource, path.join(levelDir, `${level}.glb`));

  const sceneDestination = path.join(levelDir, `${level}.scene.json`);
  fs.copyFileSync(sceneSource, sceneDestination);
  ApplyPlaceholders(sceneDestination, { LEVEL: level });
}

/**
 * Root scripts so `npm start` opens the Project Control Panel.
 * @returns {Record<string, string>}
 */
function RootScripts()
{
  return {
    start: "b2bkit-control-panel",
    "control-panel": "b2bkit-control-panel",
    create: "b2bkit-create",
  };
}

/**
 * Ensure a thin root package.json exists so `npx b2bkit-*` / `npm start` work
 * from the project root. Merges scripts/workspaces into an existing package.json
 * when needed. The control panel starts Vite via `npm run … --prefix game`, so
 * npm workspaces are optional — still declared so root `npm install` covers game/.
 * @param {string} projectRoot
 * @param {string} b2bkitVersion
 * @returns {boolean} true when the file was created or updated
 */
export function EnsureRootPackageJson(projectRoot, b2bkitVersion)
{
  const packageJsonPath = path.join(projectRoot, "package.json");
  const rootScripts = RootScripts();

  if (fs.existsSync(packageJsonPath))
  {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    let changed = false;

    if (packageJson.private !== true)
    {
      packageJson.private = true;
      changed = true;
    }

    if (!Array.isArray(packageJson.workspaces))
    {
      packageJson.workspaces = ["game"];
      changed = true;
    }
    else if (!packageJson.workspaces.includes("game"))
    {
      packageJson.workspaces.push("game");
      changed = true;
    }

    if (packageJson.scripts === undefined || typeof packageJson.scripts !== "object")
    {
      packageJson.scripts = {};
      changed = true;
    }

    for (const [scriptName, command] of Object.entries(rootScripts))
    {
      if (packageJson.scripts[scriptName] === undefined)
      {
        packageJson.scripts[scriptName] = command;
        changed = true;
      }
    }

    if (
      packageJson.dependencies === undefined
      || typeof packageJson.dependencies !== "object"
    )
    {
      packageJson.dependencies = {};
      changed = true;
    }

    if (packageJson.dependencies.b2bkit === undefined)
    {
      packageJson.dependencies.b2bkit = b2bkitVersion;
      changed = true;
    }

    if (changed)
    {
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n", "utf8");
    }

    return changed;
  }

  const packageJson = {
    private: true,
    name: path.basename(projectRoot),
    workspaces: ["game"],
    scripts: rootScripts,
    dependencies: {
      b2bkit: b2bkitVersion,
    },
  };
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n", "utf8");
  return true;
}
