import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

/** Walk upward from this module until the kit monorepo root, when present. */
export function FindRepoRoot(): string | null
{
  let directory = resolve(moduleDirectory, "..");

  while (directory !== dirname(directory))
  {
    const packageJsonPath = join(directory, "package.json");
    if (existsSync(packageJsonPath))
    {
      try
      {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as { name?: string };

        if (packageJson.name === "bjs-level-kit")
        {
          return directory;
        }
      }
      catch
      {
        // keep walking
      }
    }

    directory = dirname(directory);
  }

  return null;
}

/**
 * Resolve the user project that owns game/. The control panel and direct MCP
 * CLI both run with the project root as their working directory.
 */
export function FindProjectRoot(): string
{
  const configuredRoot = process.env.B2BKIT_PROJECT_ROOT;
  if (configuredRoot !== undefined && configuredRoot.length > 0)
  {
    return resolve(configuredRoot);
  }

  let directory = process.cwd();
  while (directory !== dirname(directory))
  {
    if (existsSync(join(directory, "game", "package.json")))
    {
      return directory;
    }
    directory = dirname(directory);
  }

  return process.cwd();
}

export const REPO_ROOT = FindRepoRoot();
export const PROJECT_ROOT = FindProjectRoot();

// In a published package, mcp/dist/ sits two levels below the package root.
const PACKAGE_ROOT = resolve(moduleDirectory, "../..");
const CONTENT_ROOT = REPO_ROOT ?? PACKAGE_ROOT;

export const DOCS = {
  kernel: join(CONTENT_ROOT, "docs/LLM_KERNEL.md"),
  scriptingContext: join(CONTENT_ROOT, "docs/LLM_SCRIPTING_CONTEXT.md"),
  playbook: join(CONTENT_ROOT, "docs/LLM_PLAYBOOK.md"),
  styleGuide: join(CONTENT_ROOT, "docs/STYLE_GUIDE.md"),
} as const;

/** Prose chapter HTML fragments — the source the built docs/ pages are generated from. */
export const PROSE_CONTENT = REPO_ROOT !== null
  ? join(REPO_ROOT, "scripts/docs/prose/content")
  : join(PACKAGE_ROOT, "mcp/prose");

export const GAME_BEHAVIORS = join(PROJECT_ROOT, "game/src/behaviors");
export const GAME_LEVELS = join(PROJECT_ROOT, "game/public/levels");
export const INPUT_ACTIONS_TS = join(PROJECT_ROOT, "game/src/InputActions.ts");
export const INPUT_ACTIONS_JSON = join(PROJECT_ROOT, "game/input.inputactions.json");
