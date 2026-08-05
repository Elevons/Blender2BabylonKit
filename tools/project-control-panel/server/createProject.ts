import path from "node:path";
import { spawn } from "node:child_process";

import { REPO_ROOT } from "./paths.js";

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
 * Create the first app from the repository template and write its
 * babylon-project.json through scripts/create-app.mjs.
 */
export function CreateProject(options: CreateProjectOptions): Promise<CreateProjectResult>
{
  const name = options.name.trim();
  if (name.length === 0)
  {
    throw new Error("Project name is required");
  }

  const argumentsList = [
    path.join(REPO_ROOT, "scripts", "create-app.mjs"),
    "--name",
    name,
  ];
  if (options.title !== undefined && options.title.trim().length > 0)
  {
    argumentsList.push("--title", options.title.trim());
  }
  if (options.level !== undefined && options.level.trim().length > 0)
  {
    argumentsList.push("--level", options.level.trim());
  }

  return new Promise((resolve, reject) =>
  {
    const child = spawn(process.execPath, argumentsList, {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let standardError = "";

    child.stderr?.on("data", (chunk: Buffer) =>
    {
      standardError += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) =>
    {
      if (code !== 0)
      {
        reject(new Error(standardError.trim() || `Project creation exited with code ${code}`));
        return;
      }

      const safeName = name.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
      resolve({
        name: safeName,
        path: path.join(REPO_ROOT, "apps", safeName),
      });
    });
  });
}
