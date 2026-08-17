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

  return {
    projectRoot: resolvedRoot,
    gameDir,
    name,
    title,
    level,
  };
}

/**
 * Ensure a thin root package.json exists so `npx b2bkit-*` works from the project root.
 * @param {string} projectRoot
 * @param {string} b2bkitVersion
 * @returns {boolean} true when a new file was written
 */
export function EnsureRootPackageJson(projectRoot, b2bkitVersion)
{
  const packageJsonPath = path.join(projectRoot, "package.json");
  if (fs.existsSync(packageJsonPath))
  {
    return false;
  }

  const packageJson = {
    private: true,
    name: path.basename(projectRoot),
    dependencies: {
      b2bkit: b2bkitVersion,
    },
  };
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n", "utf8");
  return true;
}
