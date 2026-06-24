import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";

import {
  APPS_DIR,
  ReadProjectManifest,
  type BabylonProjectManifest,
} from "./paths.js";

export interface ProjectSummary
{
  name: string;
  title: string;
  defaultLevel?: string;
  devPort: number;
  blenderExportPath: string;
  manifest?: BabylonProjectManifest;
  hasLevels: boolean;
}

export interface DevServerStatus
{
  app: string;
  port: number;
  running: boolean;
  pid?: number;
  url?: string;
  managed: boolean;
  error?: string;
}

const devProcesses = new Map<string, ChildProcess>();

function AttachDevServerLogs(appName: string, child: ChildProcess): void
{
  const prefix = `[${appName}:dev]`;
  child.stdout?.on("data", (chunk: Buffer) =>
  {
    for (const line of chunk.toString().split("\n").filter(Boolean))
    {
      console.log(`${prefix} ${line}`);
    }
  });
  child.stderr?.on("data", (chunk: Buffer) =>
  {
    for (const line of chunk.toString().split("\n").filter(Boolean))
    {
      console.error(`${prefix} ${line}`);
    }
  });
  child.on("exit", (code, signal) =>
  {
    devProcesses.delete(appName);
    if (code !== null && code !== 0)
    {
      console.error(`${prefix} exited with code ${code}${signal ? ` (${signal})` : ""}`);
    }
  });
  child.on("error", (error) =>
  {
    devProcesses.delete(appName);
    console.error(`${prefix} failed to start: ${error.message}`);
  });
}

async function KillProcessOnPort(port: number): Promise<void>
{
  if (process.platform === "win32")
  {
    return;
  }
  await new Promise<void>((resolve) =>
  {
    const child = spawn("fuser", ["-k", `${port}/tcp`], { stdio: "ignore" });
    child.on("close", () => resolve());
    child.on("error", () => resolve());
  });
}

function ReadPackageName(appDir: string): string | null
{
  const packagePath = path.join(appDir, "package.json");
  if (!fs.existsSync(packagePath))
  {
    return null;
  }
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { name?: string };
  return pkg.name ?? path.basename(appDir);
}

function HasLevels(appDir: string): boolean
{
  const levelsDir = path.join(appDir, "public", "levels");
  if (!fs.existsSync(levelsDir))
  {
    return false;
  }
  return fs.readdirSync(levelsDir).some((entry) =>
  {
    const full = path.join(levelsDir, entry);
    return fs.statSync(full).isDirectory();
  });
}

export function ListProjects(): ProjectSummary[]
{
  if (!fs.existsSync(APPS_DIR))
  {
    return [];
  }

  return fs.readdirSync(APPS_DIR, { withFileTypes: true })
    .filter((entry) =>
    {
      if (!entry.isDirectory())
      {
        return false;
      }
      return fs.existsSync(path.join(APPS_DIR, entry.name, "package.json"));
    })
    .map((entry) =>
    {
      const appDir = path.join(APPS_DIR, entry.name);
      const manifest = ReadProjectManifest(appDir);
      const name = manifest?.name ?? ReadPackageName(appDir) ?? entry.name;
      const devPort = manifest?.dev.port ?? 5173;
      return {
        name,
        title: manifest?.title ?? name,
        defaultLevel: manifest?.defaultLevel,
        devPort,
        blenderExportPath: manifest?.blenderExportPath ?? `apps/${name}/public/levels/`,
        manifest: manifest ?? undefined,
        hasLevels: HasLevels(appDir),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function ListLevels(appName: string): string[]
{
  const levelsDir = path.join(APPS_DIR, appName, "public", "levels");
  if (!fs.existsSync(levelsDir))
  {
    return [];
  }

  return fs.readdirSync(levelsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

export async function IsPortOpen(port: number): Promise<boolean>
{
  return new Promise((resolve) =>
  {
    const socket = net.createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () =>
    {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

export async function GetDevServerStatus(appName: string): Promise<DevServerStatus>
{
  const project = ListProjects().find((p) => p.name === appName);
  const port = project?.devPort ?? 5173;
  const running = await IsPortOpen(port);
  const child = devProcesses.get(appName);
  return {
    app: appName,
    port,
    running,
    pid: child?.pid,
    url: running ? `http://localhost:${port}` : undefined,
    managed: Boolean(child?.pid),
  };
}

export async function StartDevServer(appName: string): Promise<DevServerStatus>
{
  const status = await GetDevServerStatus(appName);
  if (status.running)
  {
    return status;
  }

  if (devProcesses.has(appName))
  {
    devProcesses.delete(appName);
  }

  const child = spawn(
    "npm",
    ["run", "dev", "--workspace", `apps/${appName}`],
    {
      cwd: path.resolve(APPS_DIR, ".."),
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      shell: process.platform === "win32",
    },
  );
  AttachDevServerLogs(appName, child);
  child.unref();
  devProcesses.set(appName, child);

  for (let attempt = 0; attempt < 40; attempt++)
  {
    await new Promise((r) => setTimeout(r, 250));
    const next = await GetDevServerStatus(appName);
    if (next.running)
    {
      return next;
    }
    if (child.exitCode !== null)
    {
      return {
        ...next,
        error: `Dev server exited before port ${next.port} opened (code ${child.exitCode})`,
      };
    }
  }

  const failed = await GetDevServerStatus(appName);
  return {
    ...failed,
    error: failed.running
      ? undefined
      : `Dev server did not start on port ${failed.port} within 10s — check launcher terminal output`,
  };
}

export async function StopDevServer(appName: string): Promise<DevServerStatus>
{
  const child = devProcesses.get(appName);
  if (child?.pid)
  {
    try
    {
      process.kill(-child.pid, "SIGTERM");
    }
    catch
    {
      try { child.kill("SIGTERM"); } catch { /* already stopped */ }
    }
    devProcesses.delete(appName);
  }

  const status = await GetDevServerStatus(appName);
  if (status.running)
  {
    await KillProcessOnPort(status.port);
    await new Promise((r) => setTimeout(r, 300));
  }

  return GetDevServerStatus(appName);
}
