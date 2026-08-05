import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";

import {
  GameDir,
  PROJECT_MANIFEST_FILENAME,
  ProjectDir,
  ResolveProjectRoot,
  ReadProjectManifest,
  type B2BKitProjectManifest,
} from "./paths.js";

export interface ProjectSummary
{
  name: string;
  title: string;
  entryLevel?: string;
  defaultLevel?: string;
  devPort: number;
  blenderExportPath: string;
  manifest?: B2BKitProjectManifest;
  hasManifest: boolean;
  hasLevels: boolean;
}

export interface DevServerStatus
{
  app: string;
  port: number;
  running: boolean;
  /**
   * The listener on `port` answers `GET /` successfully. A stale Vite whose root
   * folder was renamed, or an unrelated project's server, listens but 404s.
   */
  healthy: boolean;
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
  const gameDir = GameDir();
  if (!fs.existsSync(path.join(gameDir, "package.json")))
  {
    return [];
  }

  const manifest = ReadProjectManifest(gameDir);
  const name = manifest?.name ?? "game";
  const entryLevel = manifest !== null
    ? ResolveConfiguredEntryLevel(name, manifest)
    : undefined;

  return [{
    name,
    title: manifest?.title ?? name,
    entryLevel,
    defaultLevel: manifest?.defaultLevel,
    devPort: manifest?.dev.port ?? 5173,
    blenderExportPath: manifest?.blenderExportPath ?? "game/public/levels/",
    manifest: manifest ?? undefined,
    hasManifest: manifest !== null,
    hasLevels: HasLevels(gameDir),
  }];
}

/**
 * Resolve the one project owned by this Project Control Panel session.
 *
 * B2BKIT_PROJECT optionally confirms the single game workspace.
 */
export function GetCurrentProject(): ProjectSummary
{
  const projects = ListProjects();
  const requestedProject = process.env.B2BKIT_PROJECT;

  if (requestedProject !== undefined && requestedProject.length > 0)
  {
    if (requestedProject !== "game")
    {
      throw new Error(
        `B2BKIT_PROJECT must be "game" for the single game/ workspace, received "${requestedProject}"`
      );
    }
  }

  const project = projects[0];
  if (project === undefined)
  {
    throw new Error("No project was found under game/");
  }

  return project;
}

export function ListLevels(appName: string): string[]
{
  const levelsDir = path.join(ProjectDir(appName), "public", "levels");
  if (!fs.existsSync(levelsDir))
  {
    return [];
  }

  return fs.readdirSync(levelsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

export interface LevelManifestEntry
{
  level: string;
  file: string;
  /** Absolute URL path used by the runtime, e.g. /levels/Train Scene/Train Scene.scene.json */
  url: string;
}

/**
 * Enumerate every `.scene.json` under the app's public/levels folders.
 * Used by the Project tab (dev level jump) and the Publish tab (start level).
 */
export function ListLevelManifests(appName: string): LevelManifestEntry[]
{
  const levelsDir = path.join(ProjectDir(appName), "public", "levels");
  if (!fs.existsSync(levelsDir))
  {
    return [];
  }

  const entries: LevelManifestEntry[] = [];
  for (const level of ListLevels(appName))
  {
    const levelDir = path.join(levelsDir, level);
    for (const fileName of fs.readdirSync(levelDir))
    {
      if (!fileName.endsWith(".scene.json"))
      {
        continue;
      }
      const fullPath = path.join(levelDir, fileName);
      if (!fs.statSync(fullPath).isFile())
      {
        continue;
      }
      entries.push({
        level,
        file: fileName,
        url: `/levels/${level}/${fileName}`,
      });
    }
  }

  return entries.sort((a, b) => a.url.localeCompare(b.url));
}

/**
 * Resolve the entry manifest from the new entryLevel URL or the legacy
 * defaultLevel folder setting.
 */
function ResolveConfiguredEntryLevel(
  appName: string,
  manifest: B2BKitProjectManifest,
): string | undefined
{
  const manifests = ListLevelManifests(appName);
  if (
    manifest.entryLevel !== undefined
    && manifests.some((entry) => entry.url === manifest.entryLevel)
  )
  {
    return manifest.entryLevel;
  }

  if (manifest.defaultLevel === undefined)
  {
    return undefined;
  }

  const levelManifests = manifests.filter(
    (entry) => entry.level === manifest.defaultLevel
  );
  return levelManifests.find(
    (entry) => entry.file === `${manifest.defaultLevel}.scene.json`
  )?.url ?? levelManifests[0]?.url;
}

/**
 * Persist one validated scene manifest as the project's shared entry level.
 */
export function SetProjectEntryLevel(
  appName: string,
  manifestUrl: string,
): ProjectSummary
{
  const entry = ListLevelManifests(appName).find(
    (candidate) => candidate.url === manifestUrl
  );
  if (entry === undefined)
  {
    throw new Error(`Unknown entry level "${manifestUrl}"`);
  }

  const appDir = ProjectDir(appName);
  const manifest = ReadProjectManifest(appDir);
  if (manifest === null)
  {
    throw new Error(`Project "${appName}" has no ${PROJECT_MANIFEST_FILENAME}`);
  }

  manifest.entryLevel = entry.url;
  manifest.defaultLevel = entry.level;
  fs.writeFileSync(
    path.join(appDir, PROJECT_MANIFEST_FILENAME),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );

  return GetCurrentProject();
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

/**
 * Ask the listener for the app shell. Vite keeps listening after its root folder
 * is renamed or deleted, so an open port alone does not mean a usable server.
 */
async function ServesAppShell(port: number): Promise<boolean>
{
  try
  {
    const response = await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.status < 400;
  }
  catch
  {
    return false;
  }
}

/**
 * Describe the process listening on a port so a collision message can name the
 * culprit. Linux/macOS only; returns an empty description elsewhere.
 */
async function DescribePortHolder(port: number): Promise<string>
{
  if (process.platform === "win32")
  {
    return "";
  }

  const pid = await new Promise<number | undefined>((resolve) =>
  {
    const child = spawn("lsof", ["-tiTCP:" + String(port), "-sTCP:LISTEN"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.on("close", () =>
    {
      const parsed = parseInt(stdout.trim().split("\n")[0] ?? "", 10);
      resolve(Number.isFinite(parsed) ? parsed : undefined);
    });
    child.on("error", () => resolve(undefined));
  });

  if (pid === undefined)
  {
    return "";
  }

  let workingDirectory = "";
  try
  {
    workingDirectory = fs.readlinkSync(`/proc/${pid}/cwd`);
  }
  catch
  {
    // Not readable on macOS or across users — the pid alone is still useful.
  }

  return workingDirectory.length > 0
    ? ` (pid ${pid}, running in ${workingDirectory})`
    : ` (pid ${pid})`;
}

export async function GetDevServerStatus(appName: string): Promise<DevServerStatus>
{
  const project = ListProjects().find((p) => p.name === appName);
  const port = project?.devPort ?? 5173;
  const running = await IsPortOpen(port);
  const healthy = running ? await ServesAppShell(port) : false;
  const child = devProcesses.get(appName);

  let error: string | undefined = undefined;
  if (running && !healthy)
  {
    const holder = await DescribePortHolder(port);
    error =
      `Port ${port} is held by a server that does not serve this project${holder}. `
      + "It is most likely a stale dev server from another project or an earlier folder layout. "
      + `Use Stop to free the port, or change dev.port in ${PROJECT_MANIFEST_FILENAME}.`;
  }

  return {
    app: appName,
    port,
    running,
    healthy,
    pid: child?.pid,
    url: healthy ? `http://localhost:${port}` : undefined,
    managed: Boolean(child?.pid),
    error,
  };
}

export async function StartDevServer(appName: string): Promise<DevServerStatus>
{
  const status = await GetDevServerStatus(appName);
  if (status.running)
  {
    // Healthy: nothing to do. Unhealthy: starting a second Vite would silently
    // land on the next free port, so surface the collision instead.
    return status;
  }

  if (devProcesses.has(appName))
  {
    devProcesses.delete(appName);
  }

  const child = spawn(
    "npm",
    ["run", "dev", "--workspace", "game"],
    {
      cwd: ResolveProjectRoot(),
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
    if (next.healthy)
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
  if (failed.healthy)
  {
    return failed;
  }
  return {
    ...failed,
    error: failed.error
      ?? `Dev server did not start on port ${failed.port} within 10s — check Project Control Panel terminal output`,
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
