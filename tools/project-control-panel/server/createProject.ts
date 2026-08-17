import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  CONTROL_PANEL_DIR,
  GameDir,
  ResolveKitRepoRoot,
  ResolveProjectRoot,
} from "./paths.js";

export interface CreateProjectOptions
{
  name: string;
  title?: string;
  level?: string;
}

export interface CreateProjectResult
{
  name: string;
  path: string;
}

/**
 * Locate packages/engine/bin/scaffold-game.js for the running panel.
 */
function ResolveScaffoldModulePath(): string
{
  const kitRoot = ResolveKitRepoRoot();
  if (kitRoot !== null)
  {
    return path.join(kitRoot, "packages", "engine", "bin", "scaffold-game.js");
  }

  // Installed kit: control-panel/ sits next to bin/ and templates/.
  const installed = path.resolve(CONTROL_PANEL_DIR, "../bin/scaffold-game.js");
  if (fs.existsSync(installed))
  {
    return installed;
  }

  throw new Error(
    "Could not find b2bkit game scaffold. Reinstall b2bkit or run from the kit monorepo.",
  );
}

/**
 * Create game/ under the current project root (cwd when no game exists yet).
 */
export async function CreateProject(options: CreateProjectOptions): Promise<CreateProjectResult>
{
  const name = options.name.trim();
  if (name.length === 0)
  {
    throw new Error("Project name is required");
  }

  const projectRoot = ResolveProjectRoot();
  const existingGamePackage = path.join(GameDir(), "package.json");
  if (fs.existsSync(existingGamePackage))
  {
    throw new Error(
      `A game app already exists at ${GameDir()}. Use a new folder or remove game/ first.`,
    );
  }

  const scaffoldPath = ResolveScaffoldModulePath();
  const scaffold = await import(pathToFileURL(scaffoldPath).href) as {
    ScaffoldGame: (
      projectRoot: string,
      options: {
        name?: string;
        title?: string;
        level?: string;
        b2bkitVersion?: string;
      },
    ) => {
      name: string;
      gameDir: string;
    };
    EnsureRootPackageJson: (projectRoot: string, b2bkitVersion: string) => boolean;
    ReadB2bkitVersion: () => string;
  };

  const b2bkitVersion = scaffold.ReadB2bkitVersion();
  scaffold.EnsureRootPackageJson(projectRoot, b2bkitVersion);

  const result = scaffold.ScaffoldGame(projectRoot, {
    name,
    title: options.title,
    level: options.level,
    b2bkitVersion,
  });

  return {
    name: result.name,
    path: result.gameDir,
  };
}
