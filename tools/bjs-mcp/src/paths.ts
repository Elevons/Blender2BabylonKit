import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

/** Walk upward from this package until the monorepo root (bjs-level-kit). */
export function FindRepoRoot(): string
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

  // Fallback: two levels up from tools/bjs-mcp/dist or src
  return resolve(moduleDirectory, "../..");
}

export const REPO_ROOT = FindRepoRoot();

export const DOCS = {
  kernel: join(REPO_ROOT, "docs/LLM_KERNEL.md"),
  scriptingContext: join(REPO_ROOT, "docs/LLM_SCRIPTING_CONTEXT.md"),
  playbook: join(REPO_ROOT, "docs/LLM_PLAYBOOK.md"),
  styleGuide: join(REPO_ROOT, "docs/STYLE_GUIDE.md"),
} as const;

/** Prose chapter HTML fragments — the source the built docs/ pages are generated from. */
export const PROSE_CONTENT = join(REPO_ROOT, "scripts/docs/prose/content");

export const GAME_BEHAVIORS = join(REPO_ROOT, "game/src/behaviors");
export const GAME_LEVELS = join(REPO_ROOT, "game/public/levels");
export const INPUT_ACTIONS_TS = join(REPO_ROOT, "game/src/InputActions.ts");
export const INPUT_ACTIONS_JSON = join(REPO_ROOT, "game/input.inputactions.json");
