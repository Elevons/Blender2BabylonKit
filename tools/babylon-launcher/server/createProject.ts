import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import { REPO_ROOT } from "./paths.js";

export interface CreateProjectOptions
{
  name: string;
  title?: string;
  level?: string;
  template?: "empty" | "minimal" | "sample";
}

export interface CreateProjectResult
{
  name: string;
  path: string;
  blenderExportPath: string;
}

export async function CreateProject(options: CreateProjectOptions): Promise<CreateProjectResult>
{
  const scriptPath = path.join(REPO_ROOT, "scripts", "create-app.mjs");
  const args = ["node", scriptPath, "--name", options.name];
  if (options.title)
  {
    args.push("--title", options.title);
  }
  if (options.level)
  {
    args.push("--level", options.level);
  }

  await new Promise<void>((resolve, reject) =>
  {
    const child = spawn(args[0], args.slice(1), {
      cwd: REPO_ROOT,
      stdio: "pipe",
      shell: process.platform === "win32",
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("close", (code) =>
    {
      if (code === 0) { resolve(); }
      else { reject(new Error(stderr || `create-app failed (${code})`)); }
    });
  });

  const appName = options.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  const appDir = path.join(REPO_ROOT, "apps", appName);
  const blenderExportPath = `apps/${appName}/public/levels/`;

  if (options.template === "sample")
  {
    const playgroundBehaviors = path.join(REPO_ROOT, "apps", "playground", "src", "behaviors");
    const destBehaviors = path.join(appDir, "src", "behaviors");
    if (fs.existsSync(playgroundBehaviors))
    {
      for (const file of fs.readdirSync(playgroundBehaviors))
      {
        if (file.endsWith(".ts"))
        {
          fs.copyFileSync(
            path.join(playgroundBehaviors, file),
            path.join(destBehaviors, file),
          );
        }
      }
    }
  }

  return { name: appName, path: appDir, blenderExportPath };
}
